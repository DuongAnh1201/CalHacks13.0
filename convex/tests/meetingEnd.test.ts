import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../_generated/api";
import * as anthropic from "../agent/anthropic";
import type { ClaudeResponse } from "../agent/anthropic";
import schema from "../schema";

const reply = (value: string): ClaudeResponse => ({ content: [{ type: "text", text: value, citations: null }], stop_reason: "end_turn" });
const json = (timeline: string[]) => JSON.stringify({ timeline, action_items: [] });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.clearAllTimers(); vi.useRealTimers(); });

type T = ReturnType<typeof convexTest>;
const tick = (ms = 1000) => vi.advanceTimersByTime(ms);
const summaries = (t: T) => t.run((ctx) => ctx.db.query("sessionSummaries").collect());
const exportsOf = (t: T) => t.run((ctx) => ctx.db.query("exports").collect());
const settle = async (t: T) => { await t.finishAllScheduledFunctions(() => vi.runAllTimers()); };

async function meeting(t: T) {
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Dr Host" });
  const viewer = await t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: host.inviteCode, displayName: "Judge" });
  const cap = (x: { sessionId: typeof host.sessionId; participantToken: string }) => ({ sessionId: x.sessionId, participantToken: x.participantToken });
  await t.mutation(api.transcript.setEnabled, { ...cap(host), enabled: true });
  tick();
  await t.mutation(api.transcript.append, { ...cap(host), text: "The margin looks irregular to me.", durationMs: 2000 });
  tick();
  return { host, viewer, cap };
}
const withKey = () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "k");
  const complete = vi.fn().mockResolvedValue(reply(json(["Dr Host opened the discussion."])));
  vi.spyOn(anthropic, "createClaudeClient").mockReturnValue({ complete });
  return complete;
};

describe("notes.endMeeting: the host ends the meeting, the session goes on", () => {
  it("writes the final summary and one auto export, and the session stays active", async () => {
    const t = convexTest(schema);
    const { host, viewer, cap } = await meeting(t);
    const complete = withKey();
    expect(await t.mutation(api.notes.endMeeting, cap(host))).toEqual({ scheduled: true });
    await settle(t);
    expect(await summaries(t)).toHaveLength(1);
    expect(complete).toHaveBeenCalledTimes(1);
    const exports = await exportsOf(t);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ trigger: "auto", status: "ready", authorName: "Scribe" });
    const view = await t.query(api.notes.forSession, cap(viewer));
    expect(view).toMatchObject({ isFinal: true, export: { status: "ready", trigger: "auto" } });
    expect(view?.text).toContain("Dr Host opened the discussion.");
    const session = await t.run((ctx) => ctx.db.get(host.sessionId));
    expect(session?.status).toBe("active");
  });

  it("is idempotent per meeting, and sessions.end afterwards adds no second export", async () => {
    const t = convexTest(schema);
    const { host, cap } = await meeting(t);
    withKey();
    await t.mutation(api.notes.endMeeting, cap(host));
    expect(await t.mutation(api.notes.endMeeting, cap(host))).toEqual({ scheduled: false });
    await settle(t);
    await t.mutation(api.sessions.end, cap(host));
    await settle(t);
    expect(await exportsOf(t)).toHaveLength(1);
  });

  it("a new meeting (notes switched on again) can be ended again", async () => {
    const t = convexTest(schema);
    const { host, cap } = await meeting(t);
    withKey();
    await t.mutation(api.notes.endMeeting, cap(host));
    await settle(t);
    vi.stubEnv("ANTHROPIC_API_KEY", ""); // no live tick chain while toggling
    tick();
    await t.mutation(api.transcript.setEnabled, { ...cap(host), enabled: false });
    tick();
    await t.mutation(api.transcript.setEnabled, { ...cap(host), enabled: true });
    tick();
    await t.mutation(api.transcript.append, { ...cap(host), text: "Second meeting, new finding.", durationMs: 1000 });
    tick();
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const live = await t.query(api.notes.forSession, cap(host));
    expect(live?.isFinal).toBe(false);
    expect(await t.mutation(api.notes.endMeeting, cap(host))).toEqual({ scheduled: true });
    await settle(t);
    expect(await exportsOf(t)).toHaveLength(2);
  });

  it("works without an API key: the export still arrives", async () => {
    const t = convexTest(schema);
    const { host, cap } = await meeting(t);
    await t.mutation(api.notes.endMeeting, cap(host));
    await settle(t);
    expect(await summaries(t)).toHaveLength(0);
    expect(await exportsOf(t)).toHaveLength(1);
  });

  it("is host only, members only, and a no-op when transcription was never on or the session ended", async () => {
    const t = convexTest(schema);
    const { host, viewer, cap } = await meeting(t);
    await expect(t.mutation(api.notes.endMeeting, cap(viewer))).rejects.toThrow();
    await expect(t.mutation(api.notes.endMeeting, { sessionId: host.sessionId, participantToken: "nope" })).rejects.toThrow();
    const scanId = await t.mutation(internal.seed.seedSampleScan, {});
    const quiet = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Quiet" });
    expect(await t.mutation(api.notes.endMeeting, { sessionId: quiet.sessionId, participantToken: quiet.participantToken })).toEqual({ scheduled: false });
    await t.mutation(api.sessions.end, cap(host));
    expect(await t.mutation(api.notes.endMeeting, cap(host))).toEqual({ scheduled: false });
    await settle(t);
    expect(await exportsOf(t)).toHaveLength(1); // only from sessions.end
  });

  it("sessions.end alone still finalizes as before", async () => {
    const t = convexTest(schema);
    const { host, viewer, cap } = await meeting(t);
    withKey();
    await t.mutation(api.sessions.end, cap(host));
    await settle(t);
    expect(await exportsOf(t)).toHaveLength(1);
    expect((await t.query(api.notes.forSession, cap(viewer)))?.isFinal).toBe(true);
  });
});
