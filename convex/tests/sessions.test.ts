/**
 * End-to-end tests for Phase 1: two clients, one session, one shared view.
 *
 * WHAT `convexTest` IS
 * --------------------
 * An in-memory implementation of the Convex backend. It runs YOUR REAL handler
 * code — the same `sessions.create` the browser calls — against a real
 * transaction manager, real argument validators and real indexes. It is not a
 * mock of your code; it is a mock of the server your code runs on.
 *
 * Java analogy: `@SpringBootTest` with an embedded H2 database, except the
 * "database" also enforces the validators and the index requirements.
 *
 * WHAT IT CANNOT DO, AND HOW WE WORK AROUND IT
 * --------------------------------------------
 * There are no open websockets, so a test cannot observe "the second tab
 * re-rendered by itself". What it CAN do is prove the thing that re-render
 * depends on: that a second participant, querying with their OWN credentials,
 * reads back exactly the state the presenter wrote.
 *
 * So each "two clients" test below does:
 *     presenter mutates  ->  viewer queries with the viewer's token  ->  assert
 *
 * In a browser that second step is the automatic re-run Convex performs. Here it
 * is an explicit call. The data contract is identical; only the transport is not
 * under test. The push itself is verified by hand on a real deployment — the
 * two-tab checklist is in docs/CONVEX_BACKEND.md and is the real Phase 1 gate.
 */

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import schema from "../schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Asserts that a promise rejects with a `ConvexError` carrying a given code.
 *
 * We assert on `code`, not on the message, so wording can be improved without
 * breaking tests — the code is the part the frontend branches on.
 */
async function expectAppError(
  promise: Promise<unknown>,
  code: AppErrorCode,
): Promise<AppErrorData> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    const data = (error as ConvexError<AppErrorData>).data;
    expect(data.code).toBe(code);
    return data;
  }
  throw new Error(`expected a ConvexError with code ${code}, but the call succeeded`);
}

/**
 * Sets up the standard Phase 1 scenario: seeded fixture scan, a presenter who
 * created a room, and a viewer who joined it with the invite code.
 *
 * This is the demo in four lines, and almost every test below starts from it.
 */
async function setUpRoom() {
  const t = convexTest({ schema });

  // Internal mutations are callable from a test (they are not callable from a
  // browser). This is the same entry point `npx convex run seed:seedSampleScan`
  // uses.
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});

  const host = await t.mutation(api.sessions.create, {
    scanId,
    hostDisplayName: "Presenter",
  });

  const viewer = await t.mutation(api.sessions.join, { email: "guest@example.com",
    inviteCode: host.inviteCode,
    displayName: "Judge",
  });

  return { t, scanId, host, viewer };
}

// ---------------------------------------------------------------------------
// The fixture scan
// ---------------------------------------------------------------------------

describe("the seeded fixture scan", () => {
  it("is idempotent — seeding twice leaves one row", () => {
    // A retried webhook is a normal event, and two rows for one job would split
    // a session from its own annotations.
    return (async () => {
      const t = convexTest({ schema });
      const first = await t.mutation(internal.seed.seedSampleScan, {});
      const second = await t.mutation(internal.seed.seedSampleScan, {});
      expect(second).toBe(first);
      expect(await t.query(api.scans.list, {})).toHaveLength(1);
    })();
  });

  it("is labelled as a fixture and carries only the real model report's tumor numbers", async () => {
    const t = convexTest({ schema });
    await t.mutation(internal.seed.seedSampleScan, {});
    const scan = await t.query(api.scans.getByJobId, { jobId: "sample" });

    expect(scan).not.toBeNull();
    // Guardrail 12: the UI must be able to tell a fixture from a real result.
    expect(scan!.isFixture).toBe(true);
    expect(scan!.segmentationSource).toBe("model");
    expect(scan!.tumor).toEqual({ detected: true, volumesCm3: { whole: 136.28, core: 61.56, enhancing: 34.26 } });
    expect(scan!.brain).toBeUndefined();
  });

  it("derives per-plane slice counts from the affine", async () => {
    const t = convexTest({ schema });
    await t.mutation(internal.seed.seedSampleScan, {});
    const scan = (await t.query(api.scans.getByJobId, { jobId: "sample" }))!;

    expect(scan.dimensions).toEqual({ i: 240, j: 240, k: 155 });
    expect(scan.sliceCounts).toEqual({ axial: 155, coronal: 240, sagittal: 240 });
    // Computed by the server from the affine, never supplied by a caller.
    expect(scan.volumeExtentMm.min[2]).toBeCloseTo(-77, 9);
    expect(scan.volumeExtentMm.max[2]).toBeCloseTo(77, 9);
  });

  it("exposes asset paths relative to VITE_API_URL, matching the contract routes", async () => {
    const t = convexTest({ schema });
    await t.mutation(internal.seed.seedSampleScan, {});
    const scan = (await t.query(api.scans.getByJobId, { jobId: "sample" }))!;

    // BACKEND_CONTRACT §2. Relative, so the same Convex deployment works against
    // localhost and a tunnelled backend without a data migration.
    expect(scan.assets.modelGlbPath).toBe("/jobs/sample/model.glb");
    expect(scan.assets.flairNiftiPath).toBe("/jobs/sample/flair.nii.gz");
    expect(scan.assets.segNiftiPath).toBe("/jobs/sample/seg.nii.gz");
  });

  it("rejects a scan whose affine cannot support slice indexing", async () => {
    const t = convexTest({ schema });
    // A 45-degree oblique affine: voxel axes i and j both point equally along
    // RAS x and y, so "which slice am I on" has no answer. Better to refuse the
    // registration than to serve a plausible wrong number during a demo.
    const s = Math.SQRT1_2;
    await expectAppError(
      t.mutation(internal.scans.register, {
        jobId: "oblique",
        displayName: "Oblique",
        isFixture: true,
        modalityNames: ["flair"],
        dimensions: { i: 10, j: 10, k: 10 },
        voxelSpacingMm: [1, 1, 1],
        // prettier-ignore
        affineRowMajor: [
          s, -s, 0, 0,
          s,  s, 0, 0,
          0,  0, 1, 0,
          0,  0, 0, 1,
        ],
        segmentationSource: "none",
        assets: {},
      }),
      "BAD_SCAN_GEOMETRY",
    );
  });

  it("rejects non-integer dimensions", async () => {
    const t = convexTest({ schema });
    await expectAppError(
      t.mutation(internal.scans.register, {
        jobId: "bad-dims",
        displayName: "Bad dims",
        isFixture: true,
        modalityNames: ["flair"],
        dimensions: { i: 10.5, j: 10, k: 10 },
        voxelSpacingMm: [1, 1, 1],
        affineRowMajor: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        segmentationSource: "none",
        assets: {},
      }),
      "BAD_SCAN_GEOMETRY",
    );
  });
});

// ---------------------------------------------------------------------------
// Create and join
// ---------------------------------------------------------------------------

describe("creating and joining a session", () => {
  it("gives the host a session, an invite code and a token", async () => {
    const { host } = await setUpRoom();
    expect(host.role).toBe("host");
    expect(host.inviteCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    // 32 base32 characters = 160 bits.
    expect(host.participantToken).toHaveLength(32);
  });

  it("mints distinct secrets for every room and participant", async () => {
    const a = await setUpRoom();
    const b = await setUpRoom();
    const tokens = new Set([
      a.host.participantToken,
      a.viewer.participantToken,
      b.host.participantToken,
      b.viewer.participantToken,
    ]);
    expect(tokens.size).toBe(4);
    expect(a.host.inviteCode).not.toBe(b.host.inviteCode);
  });

  it("joins a viewer, never a host", async () => {
    const { viewer } = await setUpRoom();
    // There is no argument that can request the host role. Role escalation would
    // need a hand-over mutation, which does not exist yet.
    expect(viewer.role).toBe("viewer");
  });

  it("refuses an unknown invite code", async () => {
    const { t } = await setUpRoom();
    await expectAppError(
      t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: "ZZZZ-ZZZZ-ZZZZ-ZZZZ", displayName: "Nobody" }),
      "INVALID_INVITE",
    );
  });

  it("refuses an empty or whitespace display name", async () => {
    const { t, host } = await setUpRoom();
    await expectAppError(
      t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: host.inviteCode, displayName: "   " }),
      "INVALID_ARGUMENT",
    );
  });

  it("refuses to open a room on a case that does not exist", async () => {
    const { t, scanId } = await setUpRoom();
    // Build a syntactically valid but unused id by deleting the real scan.
    await t.run(async (ctx) => {
      await ctx.db.delete(scanId);
    });
    await expectAppError(
      t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" }),
      "NOT_FOUND",
    );
  });
});

// ---------------------------------------------------------------------------
// THE PHASE 1 ACCEPTANCE TEST — two clients, one shared view
// ---------------------------------------------------------------------------

describe("two clients share one view", () => {
  it("both read identical state immediately after joining", async () => {
    const { t, host, viewer } = await setUpRoom();

    const asHost = await t.query(api.sessions.get, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
    });
    const asViewer = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });

    // Same room, same case, same view.
    expect(asViewer.sessionId).toBe(asHost.sessionId);
    expect(asViewer.scan.jobId).toBe(asHost.scan.jobId);
    expect(asViewer.view).toEqual(asHost.view);

    // Different identities and different capabilities.
    expect(asHost.isPresenter).toBe(true);
    expect(asViewer.isPresenter).toBe(false);
    expect(asViewer.me.displayName).toBe("Judge");

    // Both see the full roster.
    expect(asHost.participants.map((p) => p.role)).toEqual(["host", "viewer"]);
  });

  it("propagates a plane change from the presenter to the viewer", async () => {
    const { t, host, viewer } = await setUpRoom();

    const result = await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "setPlane", plane: "coronal" },
    });
    expect(result.applied).toBe(true);

    const asViewer = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });
    expect(asViewer.view.plane).toBe("coronal");
    // The slice index the 2D panel labels itself with follows the plane.
    expect(asViewer.view.sliceCount).toBe(240);
  });

  it("propagates a slice change, and the viewer sees the derived index", async () => {
    const { t, host, viewer } = await setUpRoom();

    await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "setSlice", index: 42 },
    });

    const asViewer = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });

    // The stored value is millimetres (SPEC §5.2); the index is derived on read.
    expect(asViewer.view.sliceIndex).toBe(42);
    expect(asViewer.view.sliceIndices.axial).toBe(42);
    // The other two planes keep their own indices — the cursor is 3D, so moving
    // the axial slice does not disturb them.
    //
    // Why 120 and not 119: the opening cursor sits at the centre of the grid,
    // and 240 voxels is an even count, so the centre is voxel 119.5 — exactly
    // between two slices. `Math.round` takes the upper one. The k axis has 155
    // voxels (odd), so its centre is the whole number 77 with no such ambiguity.
    expect(asViewer.view.sliceIndices.coronal).toBe(120);
    expect(asViewer.view.sliceIndices.sagittal).toBe(120);
  });

  it("propagates a stepSlice, the command voice and gestures will use", async () => {
    const { t, host, viewer } = await setUpRoom();

    const before = (
      await t.query(api.sessions.get, {
        sessionId: viewer.sessionId,
        participantToken: viewer.participantToken,
      })
    ).view.sliceIndex;

    // This is exactly what `/jarvis next slice` will call in Phase 4 — the
    // parser produces a command, and gets no privileges of its own.
    await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "stepSlice", delta: 3 },
    });

    const after = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });
    expect(after.view.sliceIndex).toBe(before + 3);
  });

  it("propagates tumour visibility once a tumour exists", async () => {
    const { t, host, viewer, scanId } = await setUpRoom();

    // Clear the model result to exercise an unsegmented case.
    await t.run(async (ctx) => {
      await ctx.db.patch(scanId, { segmentationSource: "none", tumor: undefined });
    });

    // An unsegmented case refuses revealing with a distinct
    // message. (The reducer's wording rules are covered in viewCommands.test.ts;
    // this asserts the mutation enforces them too.)
    await expectAppError(
      t.mutation(api.sessions.updateView, {
        sessionId: host.sessionId,
        participantToken: host.participantToken,
        command: { type: "setTumorVisible", visible: true },
      }),
      "INVALID_ARGUMENT",
    );

    // Simulate the imaging service publishing a result that found a tumour.
    await t.run(async (ctx) => {
      await ctx.db.patch(scanId, { segmentationSource: "expert", tumor: { detected: true } });
    });

    await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "setTumorVisible", visible: true },
    });

    const asViewer = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });
    expect(asViewer.view.tumorVisible).toBe(true);
    // The scan change reaches the viewer through the same subscription: in a
    // browser this is the reactive re-run that updates the source badge.
    expect(asViewer.scan.segmentationSource).toBe("expert");
  });

  it("survives a reset back to the opening view", async () => {
    const { t, host, viewer } = await setUpRoom();

    const opening = (
      await t.query(api.sessions.get, {
        sessionId: viewer.sessionId,
        participantToken: viewer.participantToken,
      })
    ).view;

    await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "setPlane", plane: "sagittal" },
    });
    await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "setSlice", index: 7 },
    });
    await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "resetView" },
    });

    const after = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });
    expect(after.view.plane).toBe(opening.plane);
    expect(after.view.sliceIndices).toEqual(opening.sliceIndices);
    // `viewVersion` still advanced — it counts changes, it is not a state hash.
    expect(after.view.viewVersion).toBeGreaterThan(opening.viewVersion);
  });

  it("persists the shared view across a fresh read, i.e. a page refresh", async () => {
    const { t, host, viewer } = await setUpRoom();

    await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "setSlice", index: 100 },
    });

    // A refresh is just another query with the same stored token. Nothing is
    // held in memory on the server.
    const reread = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });
    expect(reread.view.sliceIndex).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// viewVersion and the no-op short circuit
// ---------------------------------------------------------------------------

describe("viewVersion", () => {
  it("increments exactly once per real change", async () => {
    const { t, host } = await setUpRoom();
    const start = (
      await t.query(api.sessions.get, {
        sessionId: host.sessionId,
        participantToken: host.participantToken,
      })
    ).view.viewVersion;

    const first = await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "stepSlice", delta: 1 },
    });
    expect(first.viewVersion).toBe(start + 1);
  });

  it("does not write, or bump the version, for a command that changes nothing", async () => {
    const { t, host } = await setUpRoom();

    // Already axial, so this resolves to a no-op.
    const noop = await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "setPlane", plane: "axial" },
    });

    // A success, not an error — the UI must not flash a message.
    expect(noop.applied).toBe(false);
    expect(noop.viewVersion).toBe(1);
  });

  it("absorbs a gesture held against the end of the volume", async () => {
    const { t, host } = await setUpRoom();

    await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "setSlice", index: 154 },
    });
    const atEnd = (
      await t.query(api.sessions.get, {
        sessionId: host.sessionId,
        participantToken: host.participantToken,
      })
    ).view.viewVersion;

    // Ten more frames of "next slice" while already on the last slice.
    for (let n = 0; n < 10; n++) {
      const result = await t.mutation(api.sessions.updateView, {
        sessionId: host.sessionId,
        participantToken: host.participantToken,
        command: { type: "stepSlice", delta: 1 },
      });
      expect(result.applied).toBe(false);
    }

    // Zero writes, so zero subscriber wake-ups. This is the mechanism that keeps
    // continuous input from flooding the room (guardrail 7).
    const after = await t.query(api.sessions.get, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
    });
    expect(after.view.viewVersion).toBe(atEnd);
  });
});

// ---------------------------------------------------------------------------
// Authorization — the tests from BACKEND_CONTEXT §13
// ---------------------------------------------------------------------------

describe("authorization", () => {
  it("rejects a viewer trying to move the shared view", async () => {
    const { t, viewer } = await setUpRoom();
    // BACKEND_CONTEXT §13: "Guest attempts presenter-only mutation -> Rejected
    // server-side." Not hidden in the UI — refused by the server.
    await expectAppError(
      t.mutation(api.sessions.updateView, {
        sessionId: viewer.sessionId,
        participantToken: viewer.participantToken,
        command: { type: "setPlane", plane: "coronal" },
      }),
      "NOT_PRESENTER",
    );
  });

  it("rejects a made-up participant token", async () => {
    const { t, host } = await setUpRoom();
    await expectAppError(
      t.query(api.sessions.get, {
        sessionId: host.sessionId,
        participantToken: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      }),
      "NOT_AUTHENTICATED",
    );
  });

  it("rejects an empty token without touching the index", async () => {
    const { t, host } = await setUpRoom();
    await expectAppError(
      t.query(api.sessions.get, { sessionId: host.sessionId, participantToken: "" }),
      "NOT_AUTHENTICATED",
    );
  });

  it("refuses a valid token from a DIFFERENT session", async () => {
    // The cross-tenant case: authentication without authorization. A token that
    // is perfectly valid for room A must do nothing in room B.
    const roomA = await setUpRoom();
    const roomB = await setUpRoom();

    await expectAppError(
      roomA.t.query(api.sessions.get, {
        sessionId: roomA.host.sessionId,
        participantToken: roomB.host.participantToken,
      }),
      "NOT_AUTHENTICATED", // different `convexTest` instance: the token does not exist here at all
    );

    // And within one backend instance, with two real rooms:
    const t = convexTest({ schema });
    const scanId = await t.mutation(internal.seed.seedSampleScan, {});
    const a = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "A" });
    const b = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "B" });

    await expectAppError(
      t.query(api.sessions.get, {
        sessionId: a.sessionId,
        participantToken: b.participantToken,
      }),
      "NOT_A_MEMBER",
    );
    await expectAppError(
      t.mutation(api.sessions.updateView, {
        sessionId: a.sessionId,
        participantToken: b.participantToken,
        command: { type: "resetView" },
      }),
      "NOT_A_MEMBER",
    );
  });

  it("requires membership to read the roster", async () => {
    const { t, host } = await setUpRoom();
    await expectAppError(
      t.query(api.sessionParticipants.list, {
        sessionId: host.sessionId,
        participantToken: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      }),
      "NOT_AUTHENTICATED",
    );
  });
});

// ---------------------------------------------------------------------------
// Secret handling
// ---------------------------------------------------------------------------

describe("secrets never leak through queries", () => {
  it("sessions.get returns no invite code and no participant tokens", async () => {
    const { t, host, viewer } = await setUpRoom();

    const asViewer = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });

    // Serialise the whole payload and search it. Blunt, but it catches a field
    // added later to any nested DTO — which is exactly how this kind of leak
    // happens (guardrail 5: "Don't leak invite secrets in query results").
    const serialised = JSON.stringify(asViewer);
    expect(serialised).not.toContain(host.inviteCode);
    expect(serialised).not.toContain(host.participantToken);
    expect(serialised).not.toContain(viewer.participantToken);

    // And structurally, so a token that happened to be re-minted still fails.
    for (const participant of asViewer.participants) {
      expect(participant).not.toHaveProperty("token");
    }
  });

  it("the roster query also strips tokens", async () => {
    const { t, host, viewer } = await setUpRoom();
    const roster = await t.query(api.sessionParticipants.list, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });
    const serialised = JSON.stringify(roster);
    expect(serialised).not.toContain(host.participantToken);
    expect(serialised).not.toContain(viewer.participantToken);
  });

  it("gives the invite code to the presenter only", async () => {
    const { t, host, viewer } = await setUpRoom();

    const forHost = await t.query(api.sessions.getInviteCode, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
    });
    expect(forHost.inviteCode).toBe(host.inviteCode);

    // A viewer must not be able to re-share the room.
    await expectAppError(
      t.query(api.sessions.getInviteCode, {
        sessionId: viewer.sessionId,
        participantToken: viewer.participantToken,
      }),
      "NOT_PRESENTER",
    );
  });
});

// ---------------------------------------------------------------------------
// Follow mode
// ---------------------------------------------------------------------------

describe("follow mode", () => {
  it("defaults to following, so a QR joiner sees the presenter immediately", async () => {
    const { t, viewer } = await setUpRoom();
    const state = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });
    expect(state.me.following).toBe(true);
  });

  it("changes only the caller's own flag", async () => {
    const { t, host, viewer } = await setUpRoom();

    await t.mutation(api.sessions.setFollowMode, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
      following: false,
    });

    const asViewer = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });
    const asHost = await t.query(api.sessions.get, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
    });

    expect(asViewer.me.following).toBe(false);
    expect(asHost.me.following).toBe(true);
    // There is no `participantId` argument on `setFollowMode`, which is what
    // makes "only your own flag" structurally true rather than merely checked.
  });

  it("does not stop the shared view being written while unfollowed", async () => {
    const { t, host, viewer } = await setUpRoom();

    await t.mutation(api.sessions.setFollowMode, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
      following: false,
    });
    await t.mutation(api.sessions.updateView, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      command: { type: "setSlice", index: 33 },
    });

    // The server keeps one authoritative shared view regardless. The flag only
    // tells the viewer's own client whether to apply it — so resuming follow
    // snaps straight to the current view with no catch-up logic.
    const asViewer = await t.query(api.sessions.get, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
    });
    expect(asViewer.view.sliceIndex).toBe(33);
  });
});

// ---------------------------------------------------------------------------
// Ending a session
// ---------------------------------------------------------------------------

describe("ending a session", () => {
  it("is presenter-only", async () => {
    const { t, viewer } = await setUpRoom();
    await expectAppError(
      t.mutation(api.sessions.end, {
        sessionId: viewer.sessionId,
        participantToken: viewer.participantToken,
      }),
      "NOT_PRESENTER",
    );
  });

  it("locks the room for everyone and kills the invite code", async () => {
    const { t, host, viewer } = await setUpRoom();

    await t.mutation(api.sessions.end, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
    });

    await expectAppError(
      t.query(api.sessions.get, {
        sessionId: viewer.sessionId,
        participantToken: viewer.participantToken,
      }),
      "SESSION_ENDED",
    );
    await expectAppError(
      t.mutation(api.sessions.updateView, {
        sessionId: host.sessionId,
        participantToken: host.participantToken,
        command: { type: "resetView" },
      }),
      "SESSION_ENDED",
    );
    // A dead invite reports as invalid, so probing cannot tell "no such room"
    // from "room is over".
    await expectAppError(
      t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: host.inviteCode, displayName: "Late" }),
      "INVALID_INVITE",
    );
  });

  it("keeps the row, so Phase 2 chat and annotations are not destroyed", async () => {
    const { t, host } = await setUpRoom();
    await t.mutation(api.sessions.end, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
    });
    const row = await t.run(async (ctx) => await ctx.db.get(host.sessionId));
    expect(row).not.toBeNull();
    expect(row!.status).toBe("ended");
  });
});

// ---------------------------------------------------------------------------
// Validator enforcement at the edge
// ---------------------------------------------------------------------------

describe("argument validators", () => {
  it("rejects a command type that is not in the union, before any handler runs", async () => {
    const { t, host } = await setUpRoom();
    await expect(
      t.mutation(api.sessions.updateView, {
        sessionId: host.sessionId,
        participantToken: host.participantToken,
        // `as never` defeats the compiler on purpose: this test is about the
        // RUNTIME validator, which is the only thing standing between a hostile
        // client and the handler. TypeScript is not a security boundary.
        command: { type: "deleteEverything" } as never,
      }),
    ).rejects.toThrow();
  });
});

describe("W2 scene sync", () => {
  it("a host scene change reaches the guest", async () => {
    const { t, host, viewer } = await setUpRoom();
    await t.mutation(api.sessions.updateView, { sessionId: host.sessionId, participantToken: host.participantToken, command: { type: "setExplosion", value: 0.6 } });
    const seen = await t.query(api.sessions.get, { sessionId: viewer.sessionId, participantToken: viewer.participantToken });
    expect(seen.view.scene.explodeAmount).toBe(0.6);
  });
  it("a guest cannot change the scene", async () => {
    const { t, viewer } = await setUpRoom();
    await expectAppError(
      t.mutation(api.sessions.updateView, { sessionId: viewer.sessionId, participantToken: viewer.participantToken, command: { type: "setPage", page: "3d" } }),
      "NOT_PRESENTER",
    );
  });
});

describe("join email (session report)", () => {
  async function hosted() {
    const t = convexTest({ schema });
    const scanId = await t.mutation(internal.seed.seedSampleScan, {});
    const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Host" });
    return { t, host };
  }
  it("rejects a malformed email", async () => {
    const { t, host } = await hosted();
    await expectAppError(t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Tom", email: "not-an-email" }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Tom", email: `${"a".repeat(250)}@x.io` }), "INVALID_ARGUMENT");
  });
  it("rejects a join without an email", async () => {
    const { t, host } = await hosted();
    await expect(t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Tom" } as never)).rejects.toThrow();
  });
  it("stores a trimmed address as a pending recipient", async () => {
    const { t, host } = await hosted();
    const guest = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Tom", email: "  tom@example.com " });
    const rows = await t.run((ctx) => ctx.db.query("reportRecipients").collect());
    expect(rows).toMatchObject([{ participantId: guest.participantId, email: "tom@example.com", status: "pending" }]);
  });
});

describe("moving a room to another case (setScan)", () => {
  /** A second registered case: the sample's geometry under an upload's jobId. */
  async function addUpload(t: Awaited<ReturnType<typeof setUpRoom>>["t"], scanId: Id<"scans">) {
    return await t.run(async (ctx) => {
      const { _id, _creationTime, ...row } = (await ctx.db.get(scanId))!;
      return await ctx.db.insert("scans", { ...row, jobId: "upload-1", displayName: "Uploaded case upload-1" });
    });
  }

  it("moves guests to the new case with the same invite, on the host's page", async () => {
    const { t, scanId, host, viewer } = await setUpRoom();
    const uploadId = await addUpload(t, scanId);
    await t.mutation(api.sessions.updateView, { sessionId: host.sessionId, participantToken: host.participantToken, command: { type: "setExplosion", value: 0.6 } });

    const r = await t.mutation(api.sessions.setScan, { sessionId: host.sessionId, participantToken: host.participantToken, scanId: uploadId, page: "3d" });
    expect(r).toMatchObject({ applied: true, jobId: "upload-1" });

    const seen = await t.query(api.sessions.get, { sessionId: viewer.sessionId, participantToken: viewer.participantToken });
    expect(seen.scan.jobId).toBe("upload-1");
    expect(seen.view.scene).toMatchObject({ page: "3d", explodeAmount: 0 });
    expect(seen.view.viewVersion).toBe(r.viewVersion);
    // The old invite still works and lands on the new case.
    const late = await t.mutation(api.sessions.join, { email: "late@example.com", inviteCode: host.inviteCode, displayName: "Late" });
    expect(late.jobId).toBe("upload-1");
  });

  it("is a no-op for the case already open", async () => {
    const { t, scanId, host } = await setUpRoom();
    const before = await t.query(api.sessions.get, { sessionId: host.sessionId, participantToken: host.participantToken });
    const r = await t.mutation(api.sessions.setScan, { sessionId: host.sessionId, participantToken: host.participantToken, scanId, page: "mri" });
    expect(r).toEqual({ applied: false, viewVersion: before.view.viewVersion, jobId: "sample" });
  });

  it("shows only the open case's notes, and clears live cursors", async () => {
    const { t, scanId, host, viewer } = await setUpRoom();
    const uploadId = await addUpload(t, scanId);
    const asHost = { sessionId: host.sessionId, participantToken: host.participantToken };
    await t.mutation(api.annotations.create, { ...asHost, text: "on the sample", anchor: { kind: "structure", id: "x" } });
    await t.mutation(api.cursors.move, { sessionId: viewer.sessionId, participantToken: viewer.participantToken, cursor: { node: "brain_left", localMm: [1, 2, 3] } });

    await t.mutation(api.sessions.setScan, { ...asHost, scanId: uploadId, page: "mri" });
    expect(await t.query(api.annotations.list, asHost)).toEqual([]);
    expect(await t.query(api.cursors.list, asHost)).toEqual([]);

    await t.mutation(api.sessions.setScan, { ...asHost, scanId, page: "mri" });
    expect((await t.query(api.annotations.list, asHost)).map((n) => n.text)).toEqual(["on the sample"]);
  });

  it("is presenter-only", async () => {
    const { t, scanId, viewer } = await setUpRoom();
    const uploadId = await addUpload(t, scanId);
    await expectAppError(
      t.mutation(api.sessions.setScan, { sessionId: viewer.sessionId, participantToken: viewer.participantToken, scanId: uploadId, page: "mri" }),
      "NOT_PRESENTER",
    );
  });

  it("refuses a playground and an unknown scan", async () => {
    const { t, scanId, host } = await setUpRoom();
    const uploadId = await addUpload(t, scanId);
    const play = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Host", kind: "play" });
    await expectAppError(
      t.mutation(api.sessions.setScan, { sessionId: play.sessionId, participantToken: play.participantToken, scanId: uploadId, page: "mri" }),
      "INVALID_ARGUMENT",
    );
    await t.run((ctx) => ctx.db.delete(uploadId));
    await expectAppError(
      t.mutation(api.sessions.setScan, { sessionId: host.sessionId, participantToken: host.participantToken, scanId: uploadId, page: "mri" }),
      "NOT_FOUND",
    );
  });
});

describe("setDisplayName", () => {
  it("renames only the caller; the other roster row is unchanged", async () => {
    const { t, host, viewer } = await setUpRoom();
    const renamed = await t.mutation(api.sessions.setDisplayName, {
      sessionId: host.sessionId, participantToken: host.participantToken, displayName: "  Dr Ada  ",
    });
    expect(renamed.displayName).toBe("Dr Ada");
    const seen = await t.query(api.sessions.get, { sessionId: viewer.sessionId, participantToken: viewer.participantToken });
    expect(seen.participants.map((p) => [p.role, p.displayName])).toEqual([["host", "Dr Ada"], ["viewer", "Judge"]]);
    expect(seen.me.displayName).toBe("Judge");
  });

  it("lets a guest rename themselves", async () => {
    const { t, viewer } = await setUpRoom();
    await t.mutation(api.sessions.setDisplayName, {
      sessionId: viewer.sessionId, participantToken: viewer.participantToken, displayName: "Sage",
    });
    const seen = await t.query(api.sessions.get, { sessionId: viewer.sessionId, participantToken: viewer.participantToken });
    expect(seen.me.displayName).toBe("Sage");
  });

  it("rejects a blank name, a name over 64 characters, and an ended room", async () => {
    const { t, host } = await setUpRoom();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken };
    await expectAppError(t.mutation(api.sessions.setDisplayName, { ...auth, displayName: "   " }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.sessions.setDisplayName, { ...auth, displayName: "a".repeat(65) }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.sessions.setDisplayName, { ...auth, participantToken: "nope", displayName: "Later" }), "NOT_AUTHENTICATED");
    await t.mutation(api.sessions.end, auth);
    await expectAppError(t.mutation(api.sessions.setDisplayName, { ...auth, displayName: "Later" }), "SESSION_ENDED");
  });
});
