import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api, internal } from "../_generated/api";
import schema from "../schema";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.clearAllTimers(); vi.useRealTimers(); });

type T = ReturnType<typeof convexTest>;
async function meeting(t: T) {
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Dr Host" });
  const viewer = await t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: host.inviteCode, displayName: "Judge" });
  const cap = (x: { sessionId: typeof host.sessionId; participantToken: string }) => ({ sessionId: x.sessionId, participantToken: x.participantToken });
  await t.mutation(api.transcript.setEnabled, { ...cap(host), enabled: true });
  await t.mutation(api.transcript.append, { ...cap(host), text: "The margin looks irregular.", durationMs: 1000 });
  return { host: cap(host), viewer: cap(viewer) };
}
const exportsOf = (t: T) => t.run((ctx) => ctx.db.query("exports").collect());
const fileText = (t: T, id: unknown) => t.run(async (ctx) => {
  const row = await ctx.db.get(id as never) as { fileId: never } | null;
  return (await ctx.storage.get(row!.fileId))!.text();
});

describe("member export from the panel", () => {
  it("goes pending -> ready through the shared builder, labelled with the member, and shows up in forSession", async () => {
    const t = convexTest(schema);
    const { viewer } = await meeting(t);
    const { exportId } = await t.mutation(api.exportDoc.requestMember, viewer);
    const [row] = await exportsOf(t);
    expect(row).toMatchObject({ _id: exportId, trigger: "manual", status: "pending", format: "md", author: "human", authorName: "Judge", source: "ui", jobId: "sample" });
    expect(row.reason).toBeUndefined();
    expect(await t.query(api.notes.forSession, viewer)).toMatchObject({ export: { exportId, status: "pending", trigger: "manual", url: null } });

    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const ready = (await exportsOf(t))[0];
    expect(ready.status).toBe("ready");
    const md = await fileText(t, exportId);
    expect(md).toContain("## Transcript");
    expect(md).toContain("**Dr Host**: The margin looks irregular.");
    expect(md).toContain("## Screenshots");
    const view = await t.query(api.notes.forSession, viewer);
    expect(view?.export).toMatchObject({ status: "ready", trigger: "manual", version: 1 });
    expect(view?.export?.url).toMatch(/^https?:\/\//);
  });

  it("is members only", async () => {
    const t = convexTest(schema);
    const a = await meeting(t);
    const b = await meeting(t);
    await expect(t.mutation(api.exportDoc.requestMember, { sessionId: a.host.sessionId, participantToken: "nope" })).rejects.toThrow();
    await expect(t.mutation(api.exportDoc.requestMember, { sessionId: a.host.sessionId, participantToken: b.viewer.participantToken })).rejects.toThrow();
    expect(await exportsOf(t)).toHaveLength(0);
  });

  it("reuses a fresh pending export instead of starting another, and caps manual exports", async () => {
    const t = convexTest(schema);
    const { host } = await meeting(t);
    const first = await t.mutation(api.exportDoc.requestMember, host);
    const again = await t.mutation(api.exportDoc.requestMember, host);
    expect(again.exportId).toBe(first.exportId);
    expect(await exportsOf(t)).toHaveLength(1);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    for (let i = 0; i < 19; i++) {
      await t.mutation(api.exportDoc.requestMember, host);
      await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    }
    expect(await exportsOf(t)).toHaveLength(20);
    await expect(t.mutation(api.exportDoc.requestMember, host)).rejects.toThrow(/limit/);
  });

  it("after the meeting: the auto export is what forSession shows; a failed one can be retried by any member", async () => {
    const t = convexTest(schema);
    const { host, viewer } = await meeting(t);
    await t.mutation(api.sessions.end, host);
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const done = await t.query(api.notes.forSession, viewer);
    expect(done?.export).toMatchObject({ status: "ready", trigger: "auto" });

    // Simulate a failure of the newest export.
    const [auto] = await exportsOf(t);
    await t.run((ctx) => ctx.db.patch(auto._id, { status: "failed", fileId: undefined, error: "Export could not be built. Please request a new export." }));
    expect((await t.query(api.notes.forSession, viewer))?.export).toMatchObject({ status: "failed", url: null });
    const retry = await t.mutation(api.exportDoc.requestMember, viewer); // works after the session ended
    expect((await t.query(api.notes.forSession, viewer))?.export).toMatchObject({ exportId: retry.exportId, status: "pending" });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await t.query(api.notes.forSession, viewer))?.export).toMatchObject({ exportId: retry.exportId, status: "ready", version: 2 });
    expect(await fileText(t, retry.exportId)).toContain("**Dr Host**: The margin looks irregular.");
  });
});
