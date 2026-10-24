/**
 * Phase 3 presence: who is online, kept separate from who joined.
 *
 * Runs the real @convex-dev/presence component in-process (its own `register`
 * helper), wrapped by our authorized functions in convex/presence.ts. Each
 * client heartbeats the way `usePresence(api.presence, sessionId, token)` does.
 */

import presenceTest from "@convex-dev/presence/test";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import { MAX_HEARTBEAT_INTERVAL_MS, MIN_HEARTBEAT_INTERVAL_MS } from "../presence";
import schema from "../schema";

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

const INTERVAL = 10_000;

/** Seeded scan, a host who created a room, and a viewer who joined it. */
async function setUpRoom() {
  const t = convexTest({ schema });
  presenceTest.register(t);
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Judge" });
  return { t, scanId, host, viewer };
}

/** What the hook sends: roomId = our sessionId, userId = the participant token. */
function beat(
  t: ReturnType<typeof convexTest>,
  who: { sessionId: string; participantToken: string },
  tab = "tab-1",
  interval = INTERVAL,
) {
  return t.mutation(api.presence.heartbeat, {
    roomId: who.sessionId,
    userId: who.participantToken,
    sessionId: JSON.stringify([tab, who.sessionId, who.participantToken]),
    interval,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Online status
// ---------------------------------------------------------------------------

describe("presence: who is online", () => {
  it("lists both participants online, by participantId, never by token", async () => {
    const { t, host, viewer } = await setUpRoom();

    const fromHost = await beat(t, host);
    const fromViewer = await beat(t, viewer);
    // One room, one shared room token.
    expect(fromViewer.roomToken).toBe(fromHost.roomToken);

    const online = await t.query(api.presence.list, { roomToken: fromHost.roomToken });
    expect(online.map((p) => [p.userId, p.online]).sort()).toEqual(
      [
        [host.participantId, true],
        [viewer.participantId, true],
      ].sort(),
    );

    const payload = JSON.stringify(online);
    expect(payload).not.toContain(host.participantToken);
    expect(payload).not.toContain(viewer.participantToken);
  });

  it("keeps membership and presence separate", async () => {
    const { t, host, viewer } = await setUpRoom();
    const { roomToken } = await beat(t, host);

    // The viewer joined (membership) but never opened a tab (presence).
    const roster = await t.query(api.sessionParticipants.list, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
    });
    expect(roster.map((p) => p.participantId)).toContain(viewer.participantId);

    const online = await t.query(api.presence.list, { roomToken });
    expect(online.map((p) => p.userId)).toEqual([host.participantId]);
  });

  it("a graceful disconnect marks the participant offline", async () => {
    const { t, host, viewer } = await setUpRoom();
    const { roomToken } = await beat(t, host);
    const { sessionToken } = await beat(t, viewer);

    await t.mutation(api.presence.disconnect, { sessionToken });

    const online = await t.query(api.presence.list, { roomToken });
    const byId = Object.fromEntries(online.map((p) => [p.userId, p.online]));
    expect(byId).toEqual({ [host.participantId]: true, [viewer.participantId]: false });
  });

  it("a silent tab expires after 2.5x its interval", async () => {
    vi.useFakeTimers();
    const { t, host, viewer } = await setUpRoom();
    const { roomToken } = await beat(t, host);
    await beat(t, viewer);

    // The host keeps beating; the viewer's laptop lid closes. Step one interval
    // at a time and let the component's worker run what came due. (Jumping
    // with runAllTimers would pass the host's deadline too.)
    for (let step = 0; step < 3; step++) {
      vi.advanceTimersByTime(INTERVAL);
      await t.finishInProgressScheduledFunctions();
      await beat(t, host);
    }

    const online = await t.query(api.presence.list, { roomToken });
    const byId = Object.fromEntries(online.map((p) => [p.userId, p.online]));
    expect(byId).toEqual({ [host.participantId]: true, [viewer.participantId]: false });
  });
});

// ---------------------------------------------------------------------------
// Authorization and validation
// ---------------------------------------------------------------------------

describe("presence: authorization", () => {
  it("rejects unknown, empty and oversized tokens", async () => {
    const { t, host } = await setUpRoom();
    for (const participantToken of ["not-a-real-token", "", "A".repeat(129)]) {
      await expectAppError(beat(t, { ...host, participantToken }), "NOT_AUTHENTICATED");
    }
  });

  it("rejects a valid token aimed at another room", async () => {
    const { t, scanId, host } = await setUpRoom();
    const other = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Other room" });

    await expectAppError(
      beat(t, { sessionId: host.sessionId, participantToken: other.participantToken }),
      "NOT_A_MEMBER",
    );
    // A malformed room id is just "not your room", not a crash.
    await expectAppError(
      beat(t, { sessionId: "not-an-id", participantToken: host.participantToken }),
      "NOT_A_MEMBER",
    );
  });

  it("refuses heartbeats once the session has ended", async () => {
    const { t, host, viewer } = await setUpRoom();
    await t.mutation(api.sessions.end, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
    });
    await expectAppError(beat(t, viewer), "SESSION_ENDED");
  });

  it(`bounds the interval to ${MIN_HEARTBEAT_INTERVAL_MS}-${MAX_HEARTBEAT_INTERVAL_MS} ms`, async () => {
    const { t, host } = await setUpRoom();
    await beat(t, host, "tab-1", MIN_HEARTBEAT_INTERVAL_MS);
    await beat(t, host, "tab-1", MAX_HEARTBEAT_INTERVAL_MS);
    for (const interval of [MIN_HEARTBEAT_INTERVAL_MS - 1, MAX_HEARTBEAT_INTERVAL_MS + 1, 24 * 3600_000]) {
      await expectAppError(beat(t, host, "tab-1", interval), "INVALID_ARGUMENT");
    }
  });
});
