import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

type T = ReturnType<typeof convexTest>;
const code = async (p: Promise<unknown>) => {
  try { await p; } catch (e) { return e instanceof ConvexError ? (e.data as { code: string }).code : "OTHER"; }
  return "NO_ERROR";
};
type Who = { sessionId: Id<"sessions">; participantToken: string };
const cap = (x: Who): Who => ({ sessionId: x.sessionId, participantToken: x.participantToken });
async function room(t: T) {
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Dr Host" });
  const viewer = await t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: host.inviteCode, displayName: "Judge" });
  return { host, viewer };
}
const say = (t: T, who: Who, text: string, durationMs?: number) =>
  t.mutation(api.transcript.append, { sessionId: who.sessionId, participantToken: who.participantToken, text, durationMs });
const turnOn = (t: T, host: Who) =>
  t.mutation(api.transcript.setEnabled, { sessionId: host.sessionId, participantToken: host.participantToken, enabled: true });

describe("transcript", () => {
  it("appends nothing until the host turns transcription on", async () => {
    const t = convexTest(schema);
    const { host, viewer } = await room(t);
    expect(await code(say(t, viewer, "hello"))).toBe("NOT_ALLOWED");
    expect(await code(say(t, host, "hello"))).toBe("NOT_ALLOWED");
    expect(await t.run((c) => c.db.query("transcriptSegments").collect())).toHaveLength(0);
    expect(await t.query(api.transcript.state, cap(viewer))).toMatchObject({ enabled: false });
  });

  it("only the host can switch it, and members then append and list in order", async () => {
    const t = convexTest(schema);
    const { host, viewer } = await room(t);
    expect(await code(t.mutation(api.transcript.setEnabled, { ...cap(viewer), enabled: true }))).toBe("NOT_PRESENTER");
    await turnOn(t, host);
    expect(await t.query(api.transcript.state, cap(viewer))).toMatchObject({ enabled: true });

    await say(t, host, "  Let's look at the lesion.  ", 2000);
    await say(t, viewer, "It looks enhancing.", 1500);
    const { segments, hasMore } = await t.query(api.transcript.list, cap(viewer));
    expect(hasMore).toBe(false);
    expect(segments.map((s) => [s.speakerName, s.text])).toEqual([
      ["Dr Host", "Let's look at the lesion."],
      ["Judge", "It looks enhancing."],
    ]);
    expect(segments[0].endedAt - segments[0].startedAt).toBe(2000);
    expect(segments[1].startedAt).toBeGreaterThan(segments[0].startedAt); // unique cursor
    // Tokens and raw row ids stay server-side.
    expect(JSON.stringify(segments)).not.toContain(viewer.participantToken);
  });

  it("pages with `after` and `limit` without skipping segments that share a timestamp", async () => {
    const t = convexTest(schema);
    const { host } = await room(t);
    await turnOn(t, host);
    for (const w of ["a", "b", "c", "d"]) await say(t, host, w); // same fake-clock instant
    const first = await t.query(api.transcript.list, { ...cap(host), limit: 2 });
    expect(first.segments.map((s) => s.text)).toEqual(["a", "b"]);
    expect(first.hasMore).toBe(true);
    const next = await t.query(api.transcript.list, { ...cap(host), after: first.segments[1].startedAt });
    expect(next.segments.map((s) => s.text)).toEqual(["c", "d"]);
  });

  it("refuses non-members, other sessions, ended sessions and bad text", async () => {
    const t = convexTest(schema);
    const { host, viewer } = await room(t);
    const other = await room(t);
    await turnOn(t, host);
    expect(await code(say(t, { sessionId: host.sessionId, participantToken: "nope" }, "x"))).toBe("NOT_AUTHENTICATED");
    expect(await code(say(t, { sessionId: host.sessionId, participantToken: other.viewer.participantToken }, "x"))).toBe("NOT_A_MEMBER");
    expect(await code(t.query(api.transcript.list, { sessionId: host.sessionId, participantToken: other.viewer.participantToken }))).toBe("NOT_A_MEMBER");
    expect(await code(say(t, viewer, "   "))).toBe("INVALID_ARGUMENT");
    expect(await code(say(t, viewer, "x".repeat(501)))).toBe("INVALID_ARGUMENT");

    await say(t, viewer, "before the end");
    await t.mutation(api.sessions.end, { sessionId: host.sessionId, participantToken: host.participantToken });
    expect(await code(say(t, viewer, "after the end"))).toBe("SESSION_ENDED");
    // Members can still read the transcript after the meeting.
    const after = await t.query(api.transcript.list, cap(viewer));
    expect(after.segments.map((s) => s.text)).toEqual(["before the end"]);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it("rate limits a participant to 30 segments a minute, then recovers", async () => {
    const t = convexTest(schema);
    const { host, viewer } = await room(t);
    await turnOn(t, host);
    for (let i = 0; i < 30; i++) await say(t, viewer, `s${i}`);
    expect(await code(say(t, viewer, "one too many"))).toBe("NOT_ALLOWED");
    await say(t, host, "someone else is unaffected");
    vi.advanceTimersByTime(61_000);
    await say(t, viewer, "recovered");
  });

  it("clamps a hostile duration", async () => {
    const t = convexTest(schema);
    const { host } = await room(t);
    await turnOn(t, host);
    await say(t, host, "a", 9e15);
    await say(t, host, "b", -5);
    const { segments } = await t.query(api.transcript.list, cap(host));
    expect(segments[0].endedAt - segments[0].startedAt).toBe(60_000);
    expect(segments[1].endedAt).toBeGreaterThanOrEqual(segments[1].startedAt);
  });
});
