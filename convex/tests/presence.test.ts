import presenceTest from "@convex-dev/presence/test";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { AppErrorData } from "../lib/errors";
import schema from "../schema";

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ConvexError);
  await promise.catch((e: ConvexError<AppErrorData>) => expect(e.data.code).toBe(code));
}

async function room() {
  const t = convexTest({ schema });
  presenceTest.register(t);
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Judge" });
  return { t, host, viewer };
}

afterEach(() => vi.useRealTimers());

describe("presence", () => {
  it("room and user come from the token; list shows the caller online", async () => {
    const { t, viewer } = await room();
    const r = await t.mutation(api.presence.heartbeat, { sessionId: viewer.sessionId, participantToken: viewer.participantToken, clientId: "tab-1", interval: 10_000 });
    const rows = await t.query(api.presence.list, { roomToken: r.roomToken });
    expect(rows).toEqual([expect.objectContaining({ userId: viewer.participantId, online: true })]);
  });

  it("refuses a bad token and an ended session", async () => {
    const { t, host } = await room();
    await expectCode(t.mutation(api.presence.heartbeat, { sessionId: host.sessionId, participantToken: "nope", clientId: "tab", interval: 10_000 }), "NOT_AUTHENTICATED");
    await t.mutation(api.sessions.end, { sessionId: host.sessionId, participantToken: host.participantToken });
    await expectCode(t.mutation(api.presence.heartbeat, { sessionId: host.sessionId, participantToken: host.participantToken, clientId: "tab", interval: 10_000 }), "SESSION_ENDED");
  });

  it("rejects an empty or oversized clientId", async () => {
    const { t, host } = await room();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken, interval: 10_000 };
    await expectCode(t.mutation(api.presence.heartbeat, { ...auth, clientId: "" }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.presence.heartbeat, { ...auth, clientId: "x".repeat(65) }), "INVALID_ARGUMENT");
  });

  it("disconnect takes the tab offline", async () => {
    vi.useFakeTimers();
    const { t, host } = await room();
    const r = await t.mutation(api.presence.heartbeat, { sessionId: host.sessionId, participantToken: host.participantToken, clientId: "tab-1", interval: 10_000 });
    await t.mutation(api.presence.disconnect, { sessionToken: r.sessionToken });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await t.query(api.presence.list, { roomToken: r.roomToken });
    expect(rows).toEqual([expect.objectContaining({ userId: host.participantId, online: false })]);
  });
});
