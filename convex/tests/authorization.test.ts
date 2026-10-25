/**
 * Phase 2 authorization matrix: every public, token-taking function, held to
 * the same rules in one place.
 *
 * Each function's own test file covers its specific rules. This file asks the
 * cross-cutting questions of ALL of them at once:
 *
 *   unknown / empty / oversized token   -> NOT_AUTHENTICATED
 *   valid token, another room's id      -> NOT_A_MEMBER
 *   viewer calling a host-only function -> NOT_PRESENTER
 *   anything after the host ends it     -> SESSION_ENDED
 *
 * The last test is a tripwire: it scans every public function's argument
 * validator, and fails if one takes `participantToken` but is missing from
 * the matrix below. A new function cannot skip this file by accident.
 */

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import * as annotations from "../annotations";
import * as games from "../games";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import { MAX_CREDENTIAL_LENGTH } from "../lib/tokens";
import * as messages from "../messages";
import schema from "../schema";
import * as sessionParticipants from "../sessionParticipants";
import * as sessions from "../sessions";

// ---------------------------------------------------------------------------
// Helpers
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

type Auth = { sessionId: Id<"sessions">; participantToken: string };
type T = ReturnType<typeof convexTest>;

/**
 * Two rooms on the same scan. Room A has a host, a viewer and one host-owned
 * annotation (so `annotations.remove` has a real target). Room B has a host,
 * whose valid token is used to probe room A.
 */
async function setUp() {
  const t = convexTest({ schema });
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});

  // Room A is a playground so the games functions run in it too; nothing else in the matrix checks the kind.
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter", kind: "play" });
  const viewer = await t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: host.inviteCode, displayName: "Judge", kind: "play" });
  const other = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Other room" });

  const asHost: Auth = { sessionId: host.sessionId, participantToken: host.participantToken };
  const asViewer: Auth = { sessionId: viewer.sessionId, participantToken: viewer.participantToken };
  const { annotationId } = await t.mutation(api.annotations.create, {
    ...asHost,
    text: "host note",
    anchor: { kind: "point", ras_mm: [0, 0, 0] },
  });

  const { roundId } = await t.mutation(api.games.start, {
    ...asHost,
    prompt: { kind: "whichSide", jobId: "sample" },
    secret: { kind: "whichSide", side: "left" },
  });

  return { t, scanId, asHost, asViewer, otherToken: other.participantToken, annotationId, roundId };
}

type Ctx = Awaited<ReturnType<typeof setUp>>;

/**
 * The matrix. `call` runs the function as whoever `auth` says; `hostOnly`
 * marks the functions a viewer must be refused by role.
 */
const MATRIX: Record<string, { hostOnly: boolean; call: (t: T, auth: Auth, ctx: Ctx) => Promise<unknown> }> = {
  "sessions.get": { hostOnly: false, call: (t, a) => t.query(api.sessions.get, a) },
  "sessions.getInviteCode": { hostOnly: true, call: (t, a) => t.query(api.sessions.getInviteCode, a) },
  "sessions.updateView": {
    hostOnly: true,
    call: (t, a) => t.mutation(api.sessions.updateView, { ...a, command: { type: "stepSlice", delta: 1 } }),
  },
  "sessions.setFollowMode": {
    hostOnly: false,
    call: (t, a) => t.mutation(api.sessions.setFollowMode, { ...a, following: false }),
  },
  // The room's own case: a no-op, so it also passes in this playground room.
  "sessions.setScan": {
    hostOnly: true,
    call: (t, a, c) => t.mutation(api.sessions.setScan, { ...a, scanId: c.scanId, page: "mri" }),
  },
  "sessions.end": { hostOnly: true, call: (t, a) => t.mutation(api.sessions.end, a) },
  "sessionParticipants.list": { hostOnly: false, call: (t, a) => t.query(api.sessionParticipants.list, a) },
  "messages.send": { hostOnly: false, call: (t, a) => t.mutation(api.messages.send, { ...a, text: "hi" }) },
  "messages.list": {
    hostOnly: false,
    call: (t, a) => t.query(api.messages.list, { ...a, paginationOpts: { numItems: 10, cursor: null } }),
  },
  "annotations.create": {
    hostOnly: false,
    call: (t, a) =>
      t.mutation(api.annotations.create, { ...a, text: "note", anchor: { kind: "point", ras_mm: [1, 1, 1] } }),
  },
  "annotations.list": { hostOnly: false, call: (t, a) => t.query(api.annotations.list, a) },
  "annotations.remove": {
    // Not host-only: an author may remove their own. But this target is the
    // HOST's note, so a viewer is refused (NOT_ALLOWED, checked separately).
    hostOnly: false,
    call: (t, a, ctx) => t.mutation(api.annotations.remove, { ...a, annotationId: ctx.annotationId }),
  },
  "games.start": {
    hostOnly: true,
    call: (t, a) => t.mutation(api.games.start, { ...a, prompt: { kind: "beatAi", jobId: "sample", slice: 70 } }),
  },
  "games.answer": {
    hostOnly: false,
    call: (t, a, ctx) => t.mutation(api.games.answer, { ...a, roundId: ctx.roundId, answer: { kind: "whichSide", side: "left" } }),
  },
  "games.reveal": { hostOnly: true, call: (t, a, ctx) => t.mutation(api.games.reveal, { ...a, roundId: ctx.roundId }) },
  "games.current": { hostOnly: false, call: (t, a) => t.query(api.games.current, a) },
};

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

describe.each(Object.entries(MATRIX))("%s", (_name, { hostOnly, call }) => {
  it("rejects unknown, empty and oversized tokens", async () => {
    const ctx = await setUp();
    for (const participantToken of ["not-a-real-token", "", "A".repeat(MAX_CREDENTIAL_LENGTH + 1)]) {
      await expectAppError(call(ctx.t, { ...ctx.asHost, participantToken }, ctx), "NOT_AUTHENTICATED");
    }
  });

  it("rejects a valid token from another room", async () => {
    const ctx = await setUp();
    await expectAppError(
      call(ctx.t, { ...ctx.asHost, participantToken: ctx.otherToken }, ctx),
      "NOT_A_MEMBER",
    );
  });

  it("rejects every call once the session has ended", async () => {
    const ctx = await setUp();
    await ctx.t.mutation(api.sessions.end, ctx.asHost);
    await expectAppError(call(ctx.t, ctx.asHost, ctx), "SESSION_ENDED");
  });

  if (hostOnly) {
    it("refuses a viewer by role", async () => {
      const ctx = await setUp();
      await expectAppError(call(ctx.t, ctx.asViewer, ctx), "NOT_PRESENTER");
    });
  }

  it("succeeds for the host", async () => {
    const ctx = await setUp();
    await call(ctx.t, ctx.asHost, ctx);
  });
});

describe("cross-cutting rules not in the matrix", () => {
  it("a viewer cannot remove the host's annotation", async () => {
    const ctx = await setUp();
    await expectAppError(MATRIX["annotations.remove"].call(ctx.t, ctx.asViewer, ctx), "NOT_ALLOWED");
  });

  it("join treats an oversized invite code like an unknown one", async () => {
    const { t } = await setUp();
    await expectAppError(
      t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: "X".repeat(MAX_CREDENTIAL_LENGTH + 1), displayName: "Judge" }),
      "INVALID_INVITE",
    );
  });
});

// ---------------------------------------------------------------------------
// Tripwire
// ---------------------------------------------------------------------------

/**
 * `exportArgs()` and the `isPublic` flag are what the Convex CLI reads to build
 * the function spec, so they describe the validator the server actually runs.
 */
type RegisteredFn = { isPublic?: boolean; exportArgs?: () => string };

const MODULES: Record<string, Record<string, unknown>> = {
  sessions,
  sessionParticipants,
  messages,
  annotations,
  games,
};

describe("tripwire", () => {
  it("every public function that takes participantToken is in the matrix", () => {
    const takesToken: string[] = [];
    for (const [moduleName, mod] of Object.entries(MODULES)) {
      for (const [exportName, value] of Object.entries(mod)) {
        const fn = value as RegisteredFn;
        if (!fn || typeof fn.exportArgs !== "function" || !fn.isPublic) continue;
        const args = JSON.parse(fn.exportArgs()) as { value?: Record<string, unknown> };
        if (args.value && "participantToken" in args.value) {
          takesToken.push(`${moduleName}.${exportName}`);
        }
      }
    }
    expect(takesToken.sort()).toEqual(Object.keys(MATRIX).sort());
  });
});
