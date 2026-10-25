/**
 * Phase 2 annotations: two participants, one session, one shared set of notes.
 *
 * Same shape as sessions.test.ts: one participant writes, the OTHER reads back
 * with their own token (in a browser, the automatic re-run of `useQuery`).
 *
 * Geometry used below: the seeded sample is 240 x 240 x 155 at 1 mm with a
 * centred, axis-aligned affine, so RAS z maps to voxel k with voxel centres at
 * z = -77 .. +77. A point is accepted when it rounds into that range, i.e.
 * |z| < 77.5 on that axis.
 */

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MAX_ANNOTATION_LENGTH, MAX_ANNOTATIONS_PER_SESSION } from "../annotations";
import { annotationFor, authorFor } from "../lib/author";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import schema from "../schema";

// ---------------------------------------------------------------------------
// Helpers (same as sessions.test.ts)
// ---------------------------------------------------------------------------

async function expectAppError(promise: Promise<unknown>, code: AppErrorCode): Promise<AppErrorData> {
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

/** Seeded scan, a host who created a room, and a viewer who joined it. */
async function setUpRoom() {
  const t = convexTest({ schema });
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { email: "guest@example.com",
    inviteCode: host.inviteCode,
    displayName: "Judge",
  });
  const asHost = { sessionId: host.sessionId, participantToken: host.participantToken };
  const asViewer = { sessionId: viewer.sessionId, participantToken: viewer.participantToken };
  return { t, scanId, host, viewer, asHost, asViewer };
}

const point = (x: number, y: number, z: number) => ({ kind: "point" as const, ras_mm: [x, y, z] });

// ---------------------------------------------------------------------------
// Two clients, one set of notes
// ---------------------------------------------------------------------------

describe("annotations: two participants share one set", () => {
  it("a viewer's note appears for the host at the same RAS point", async () => {
    const { t, asHost, asViewer } = await setUpRoom();

    await t.mutation(api.annotations.create, {
      ...asViewer,
      text: "Enhancing rim here",
      anchor: point(12.5, -30, 8),
    });

    const forHost = await t.query(api.annotations.list, asHost);
    const forViewer = await t.query(api.annotations.list, asViewer);

    expect(forHost).toHaveLength(1);
    expect(forHost[0]).toMatchObject({
      text: "Enhancing rim here",
      anchor: { kind: "point", ras_mm: [12.5, -30, 8] },
      status: "accepted",
      author: "human",
      authorName: "Judge",
    });
    // Same note, differing only in what each caller may do with it.
    expect(forViewer.map(({ canRemove: _, ...a }) => a)).toEqual(
      forHost.map(({ canRemove: _, ...a }) => a),
    );
  });

  it("stamps author, participant, job and session on the server", async () => {
    const { t, host, viewer, asViewer } = await setUpRoom();

    const { annotationId } = await t.mutation(api.annotations.create, {
      ...asViewer,
      text: "  check this  ",
      anchor: { kind: "structure", id: " left-hippocampus " },
    });

    const row = await t.run((ctx) => ctx.db.get(annotationId));
    expect(row).toMatchObject({
      author: "human",
      authorName: "Judge",
      source: "ui",
      status: "accepted",
      jobId: "sample",
      sessionId: host.sessionId,
      authorParticipantId: viewer.participantId,
      text: "check this",
      anchor: { kind: "structure", id: "left-hippocampus" },
    });
  });

  it("lists oldest first and hides dismissed agent suggestions", async () => {
    const { t, host, asHost } = await setUpRoom();
    const agent = { kind: "agent" as const, name: "Navigator", source: "agent" as const };

    await t.mutation(api.annotations.create, { ...asHost, text: "first", anchor: point(0, 0, 0) });
    await t.run(async (ctx) => {
      const base = { jobId: "sample", sessionId: host.sessionId, anchor: point(1, 1, 1) };
      await ctx.db.insert("annotations", { ...base, ...annotationFor(agent), text: "suggested by agent" });
      await ctx.db.insert("annotations", {
        ...base,
        ...authorFor(agent),
        status: "dismissed",
        text: "dismissed by a human",
      });
    });

    const notes = await t.query(api.annotations.list, asHost);
    expect(notes.map((n) => [n.text, n.status])).toEqual([
      ["first", "accepted"],
      ["suggested by agent", "suggested"],
    ]);
  });
});

// ---------------------------------------------------------------------------
// Anchor and text validation
// ---------------------------------------------------------------------------

describe("annotations: validation", () => {
  it("accepts points up to half a voxel past the outermost voxel centres", async () => {
    const { t, asHost } = await setUpRoom();
    for (const z of [77.4, -77.4]) {
      await t.mutation(api.annotations.create, { ...asHost, text: "edge", anchor: point(0, 0, z) });
    }
  });

  it("rejects points outside the volume", async () => {
    const { t, asHost } = await setUpRoom();
    for (const z of [77.6, -77.6, 500]) {
      await expectAppError(
        t.mutation(api.annotations.create, { ...asHost, text: "outside", anchor: point(0, 0, z) }),
        "INVALID_ARGUMENT",
      );
    }
  });

  it("rejects points that are not three finite numbers", async () => {
    const { t, asHost } = await setUpRoom();
    const bad = [[0, 0], [0, 0, 0, 0], [0, Number.NaN, 0], [Infinity, 0, 0]];
    for (const ras_mm of bad) {
      await expectAppError(
        t.mutation(api.annotations.create, { ...asHost, text: "bad", anchor: { kind: "point", ras_mm } }),
        "INVALID_ARGUMENT",
      );
    }
  });

  it("rejects empty and over-long structure ids", async () => {
    const { t, asHost } = await setUpRoom();
    for (const id of ["", "   ", "x".repeat(65)]) {
      await expectAppError(
        t.mutation(api.annotations.create, { ...asHost, text: "bad", anchor: { kind: "structure", id } }),
        "INVALID_ARGUMENT",
      );
    }
  });

  it("allows a tumor anchor only when the scan has a detected tumor", async () => {
    const { t, scanId, asHost } = await setUpRoom();
    const tumorNote = { ...asHost, text: "tumor", anchor: { kind: "tumor" as const } };

    // Set each state explicitly rather than relying on what the seed holds.
    await t.run((ctx) => ctx.db.patch(scanId, { tumor: undefined }));
    const unsegmented = await expectAppError(t.mutation(api.annotations.create, tumorNote), "INVALID_ARGUMENT");
    expect(unsegmented.message).toBe("This scan has not been segmented yet.");

    await t.run((ctx) => ctx.db.patch(scanId, { tumor: { detected: false } }));
    const data = await expectAppError(t.mutation(api.annotations.create, tumorNote), "INVALID_ARGUMENT");
    expect(data.message).toBe("No tumor detected in this scan.");

    await t.run((ctx) => ctx.db.patch(scanId, { tumor: { detected: true } }));
    await t.mutation(api.annotations.create, tumorNote);
  });

  it(`trims text, rejects empty, and caps it at ${MAX_ANNOTATION_LENGTH} characters`, async () => {
    const { t, asHost } = await setUpRoom();
    const at = point(0, 0, 0);

    await expectAppError(t.mutation(api.annotations.create, { ...asHost, text: "  ", anchor: at }), "INVALID_ARGUMENT");
    await t.mutation(api.annotations.create, { ...asHost, text: "a".repeat(MAX_ANNOTATION_LENGTH), anchor: at });
    await expectAppError(
      t.mutation(api.annotations.create, { ...asHost, text: "a".repeat(MAX_ANNOTATION_LENGTH + 1), anchor: at }),
      "INVALID_ARGUMENT",
    );
  });

  it(`caps a session at ${MAX_ANNOTATIONS_PER_SESSION} annotations`, async () => {
    const { t, host, asHost } = await setUpRoom();
    await t.run(async (ctx) => {
      for (let n = 0; n < MAX_ANNOTATIONS_PER_SESSION; n++) {
        await ctx.db.insert("annotations", {
          ...annotationFor({ kind: "human", displayName: "Presenter", source: "ui" }),
          jobId: "sample",
          sessionId: host.sessionId,
          text: `note ${n}`,
          anchor: { kind: "point", ras_mm: [0, 0, 0] },
        });
      }
    });

    await expectAppError(
      t.mutation(api.annotations.create, { ...asHost, text: "one too many", anchor: point(0, 0, 0) }),
      "INVALID_ARGUMENT",
    );
  });
});

// ---------------------------------------------------------------------------
// Removal and authorization
// ---------------------------------------------------------------------------

describe("annotations: removal and authorization", () => {
  it("the author can remove their own note, and it disappears for everyone", async () => {
    const { t, asHost, asViewer } = await setUpRoom();
    const { annotationId } = await t.mutation(api.annotations.create, {
      ...asViewer,
      text: "mine",
      anchor: point(0, 0, 0),
    });

    expect((await t.query(api.annotations.list, asViewer))[0].canRemove).toBe(true);
    await t.mutation(api.annotations.remove, { ...asViewer, annotationId });
    expect(await t.query(api.annotations.list, asHost)).toEqual([]);
  });

  it("the host can remove anyone's note, a viewer cannot remove the host's", async () => {
    const { t, asHost, asViewer } = await setUpRoom();
    const hostNote = await t.mutation(api.annotations.create, { ...asHost, text: "host", anchor: point(0, 0, 0) });
    const viewerNote = await t.mutation(api.annotations.create, { ...asViewer, text: "viewer", anchor: point(1, 0, 0) });

    const forViewer = await t.query(api.annotations.list, asViewer);
    expect(forViewer.map((n) => [n.text, n.canRemove])).toEqual([
      ["host", false],
      ["viewer", true],
    ]);
    const forHost = await t.query(api.annotations.list, asHost);
    expect(forHost.every((n) => n.canRemove)).toBe(true);

    await expectAppError(
      t.mutation(api.annotations.remove, { ...asViewer, annotationId: hostNote.annotationId }),
      "NOT_ALLOWED",
    );
    await t.mutation(api.annotations.remove, { ...asHost, annotationId: viewerNote.annotationId });
    expect((await t.query(api.annotations.list, asHost)).map((n) => n.text)).toEqual(["host"]);
  });

  it("only the host can remove an agent-authored note", async () => {
    const { t, host, asHost, asViewer } = await setUpRoom();
    const annotationId = await t.run((ctx) =>
      ctx.db.insert("annotations", {
        ...annotationFor({ kind: "agent", name: "Navigator", source: "agent" }),
        jobId: "sample",
        sessionId: host.sessionId,
        text: "agent note",
        anchor: { kind: "point", ras_mm: [0, 0, 0] },
      }),
    );

    await expectAppError(t.mutation(api.annotations.remove, { ...asViewer, annotationId }), "NOT_ALLOWED");
    await t.mutation(api.annotations.remove, { ...asHost, annotationId });
  });

  it("keeps two rooms' notes apart, even on the same scan", async () => {
    const { t, scanId, asHost } = await setUpRoom();
    const other = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Other room" });
    const asOther = { sessionId: other.sessionId, participantToken: other.participantToken };

    const { annotationId } = await t.mutation(api.annotations.create, {
      ...asHost,
      text: "room A only",
      anchor: point(0, 0, 0),
    });

    expect(await t.query(api.annotations.list, asOther)).toEqual([]);
    // Another room's host cannot remove it by id; it reads as missing.
    await expectAppError(t.mutation(api.annotations.remove, { ...asOther, annotationId }), "NOT_FOUND");
    // Nor reach into room A by swapping the session id.
    await expectAppError(
      t.query(api.annotations.list, { ...asOther, sessionId: asHost.sessionId }),
      "NOT_A_MEMBER",
    );
  });

  it("rejects an unknown token, and creating after the session ends", async () => {
    const { t, asHost, asViewer } = await setUpRoom();

    await expectAppError(
      t.query(api.annotations.list, { ...asHost, participantToken: "not-a-real-token" }),
      "NOT_AUTHENTICATED",
    );

    await t.mutation(api.sessions.end, asHost);
    await expectAppError(
      t.mutation(api.annotations.create, { ...asViewer, text: "late", anchor: point(0, 0, 0) }),
      "SESSION_ENDED",
    );
  });
});
