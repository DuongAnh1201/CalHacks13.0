import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { api, internal } from "../_generated/api";
import * as anthropic from "../agent/anthropic";
import type { ClaudeResponse } from "../agent/anthropic";
import { MODEL } from "../agent/loop";
import { generateFinal, NOTES_MODEL } from "../agent/scribe";
import { buildMarkdown } from "../lib/exportMarkdown";
import { allowedNumbers } from "../lib/finalSummary";
import { readExportReport } from "../lib/exportReport";
import schema from "../schema";

const finalize = makeFunctionReference<"action">("notes:finalizeSession");

const reply = (value: string): ClaudeResponse => ({
  content: [{ type: "text", text: value, citations: null }],
  stop_reason: "end_turn",
});
const json = (timeline: string[], actions: string[] = []) => JSON.stringify({ timeline, action_items: actions });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllTimers();
  vi.useRealTimers();
});

type T = ReturnType<typeof convexTest>;
const tick = (ms = 1000) => vi.advanceTimersByTime(ms);

/** A meeting with transcript, chat, annotation and one verified agent run. Transcription is switched on before any key exists, so no tick chain starts. */
async function meeting(t: T) {
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Dr Host" });
  const viewer = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Judge" });
  const cap = (x: { sessionId: typeof host.sessionId; participantToken: string }) => ({ sessionId: x.sessionId, participantToken: x.participantToken });
  await t.mutation(api.transcript.setEnabled, { ...cap(host), enabled: true });
  await t.mutation(api.transcript.append, { ...cap(host), text: "The margin looks irregular to me.", durationMs: 2000 });
  tick();
  await t.mutation(api.transcript.append, { ...cap(viewer), text: "Can we compare it with the other side?", durationMs: 1500 });
  tick();
  await t.mutation(api.messages.send, { ...cap(viewer), text: "What does the enhancing part show?" });
  await t.mutation(api.annotations.create, { ...cap(viewer), text: "Look here", anchor: { kind: "tumor" } });
  tick();
  await t.run((ctx) => ctx.db.insert("agentRuns", {
    clientId: "c-judge", sessionId: host.sessionId, jobId: "sample", text: "how big is the tumor?", source: "chat", page: "3d",
    status: "done", steps: [], reply: "See the report.", agent: "Router", error: null, createdAt: Date.now(), availableTools: [],
    sessionVerified: true, sessionParticipantId: viewer.participantId,
  } as never));
  tick();
  return { host, viewer, cap };
}
const summaries = (t: T) => t.run((ctx) => ctx.db.query("sessionSummaries").collect());
const exportsOf = (t: T) => t.run((ctx) => ctx.db.query("exports").collect());
const exportText = (t: T, id: unknown) => t.run(async (ctx) => {
  const row = await ctx.db.get(id as never) as { fileId: never } | null;
  return (await ctx.storage.get(row!.fileId))!.text();
});
const fake = (...texts: string[]) => {
  const complete = vi.fn();
  texts.forEach((x) => complete.mockResolvedValueOnce(reply(x)));
  complete.mockResolvedValue(reply(json([])));
  return { complete };
};

describe("final meeting summary (#138)", () => {
  it("assembles attendees, findings from report.json, questions; the model only adds a guarded timeline and action items", async () => {
    const t = convexTest(schema);
    const { host, viewer, cap } = await meeting(t);
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const client = fake(json(
      ["Dr Host opened the discussion.", "The scan is healthy.", "The volume reached 99 cm3.", 'Dr Host said "the margin looks irregular".', 'Dr Host said "it is malignant".'],
      ["Judge to compare the other side.", "Follow up in 7 days."],
    ));
    vi.spyOn(anthropic, "createClaudeClient").mockReturnValue(client);
    await t.mutation(api.sessions.end, cap(host));
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());

    const rows = await summaries(t);
    expect(rows).toHaveLength(1);
    const text = rows[0].text;
    expect(text).toContain("## Attendees\n- Dr Host (host)\n- Judge (viewer)");
    expect(text).toContain("## Key findings");
    expect(text).toContain("report.json");
    expect(text).toContain("136.28"); // from report.json
    expect(text).toContain('- Judge: "how big is the tumor?"');
    expect(text).toContain('- Judge: "What does the enhancing part show?"');
    expect(text).toContain("- Dr Host opened the discussion.");
    expect(text).toContain('Dr Host said "the margin looks irregular".'); // verbatim human quote
    expect(text).toContain("- Judge to compare the other side.");
    // Dropped: AI judgement, a number the report does not have, an invented quote, a number in an action item.
    for (const bad of ["healthy", "99", "malignant", "7 days"]) expect(text).not.toContain(bad);

    // Opus (the shared MODEL) writes it, not the live-notes Haiku.
    const request = client.complete.mock.calls[0][0];
    expect(request.model).toBe(MODEL);
    expect(request.model).not.toBe(NOTES_MODEL);
    expect(request.messages[0].content).toContain("The margin looks irregular to me.");
    expect(request.system[0].text).toMatch(/untrusted/i);

    const view = await t.query(api.notes.forSession, cap(viewer));
    expect(view).toMatchObject({ isFinal: true, version: 1 });
  });

  it("writes one final summary and one auto export per ended session, even when finalize runs again", async () => {
    const t = convexTest(schema);
    const { host, viewer, cap } = await meeting(t);
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const client = fake(json(["Dr Host opened the discussion."]));
    vi.spyOn(anthropic, "createClaudeClient").mockReturnValue(client);
    await t.mutation(api.sessions.end, cap(host));
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    await t.action(finalize, { sessionId: host.sessionId });
    await t.action(finalize, { sessionId: host.sessionId });
    expect(await summaries(t)).toHaveLength(1);
    expect(client.complete).toHaveBeenCalledTimes(1);
    const exports = await exportsOf(t);
    expect(exports).toHaveLength(1);
    expect(exports[0]).toMatchObject({ trigger: "auto", reason: "checkpoint", status: "ready", format: "md", sessionId: host.sessionId, jobId: "sample", authorName: "Scribe", author: "agent" });
    const md = await exportText(t, exports[0]._id);
    expect(md).toContain("## Meeting summary");
    expect(md).toContain("Dr Host opened the discussion.");
    expect(md).toContain("## Transcript");
    expect(md).toContain("**Dr Host**: The margin looks irregular to me.");
    expect(md).toContain("**Judge**: Can we compare it with the other side?");
    expect(md).toContain("## Screenshots");
    expect(md).toContain("No screenshots were taken.");

    // Members get the link; outsiders and other rooms' members do not.
    const view = await t.query(api.notes.forSession, cap(viewer));
    expect(view?.export).toMatchObject({ status: "ready", version: 1 });
    expect(view?.export?.url).toMatch(/^https?:\/\//);
    expect(view?.screenshots).toEqual([]);
    const other = await meeting(t);
    await expect(t.query(api.notes.forSession, { sessionId: host.sessionId, participantToken: other.host.participantToken })).rejects.toThrow();
  });

  it("with no API key the export still has the transcript and a 'summary unavailable' line, and nothing else is written", async () => {
    const t = convexTest(schema);
    const { host, viewer, cap } = await meeting(t);
    const factory = vi.spyOn(anthropic, "createClaudeClient");
    await t.mutation(api.sessions.end, cap(host));
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(factory).not.toHaveBeenCalled();
    expect(await summaries(t)).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("agentDailyUsage").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("scribeNotesState").collect())).toHaveLength(0);
    const exports = await exportsOf(t);
    expect(exports).toHaveLength(1);
    const md = await exportText(t, exports[0]._id);
    expect(md).toContain("Summary unavailable");
    expect(md).toContain("**Dr Host**: The margin looks irregular to me.");
    expect(md).toContain("## Screenshots");
    expect(await t.query(api.notes.forSession, cap(viewer))).toMatchObject({ text: null, isFinal: false, export: { status: "ready" } });
  });

  it("an unusable model answer writes no final row and the export says so", async () => {
    const t = convexTest(schema);
    const { host, cap } = await meeting(t);
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    vi.spyOn(anthropic, "createClaudeClient").mockReturnValue(fake("not json at all"));
    await t.mutation(api.sessions.end, cap(host));
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect(await summaries(t)).toHaveLength(0);
    const exports = await exportsOf(t);
    expect(await exportText(t, exports[0]._id)).toContain("Summary unavailable");
  });

  it("a session that never ends gets no export; an empty meeting still gets a summary and export", async () => {
    const t = convexTest(schema);
    const scanId = await t.mutation(internal.seed.seedSampleScan, {});
    const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Dr Host" });
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const client = fake();
    vi.spyOn(anthropic, "createClaudeClient").mockReturnValue(client);
    await t.action(finalize, { sessionId: host.sessionId }); // not ended: nothing
    expect(await exportsOf(t)).toHaveLength(0);
    expect(await summaries(t)).toHaveLength(0);
    tick();
    await t.mutation(api.sessions.end, { sessionId: host.sessionId, participantToken: host.participantToken });
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const rows = await summaries(t);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toContain("- Nothing was recorded.");
    expect(client.complete).not.toHaveBeenCalled(); // nothing new, so no model call
    expect(await exportsOf(t)).toHaveLength(1);
  });
});

describe("generateFinal and the export builder", () => {
  const input = { previous: null, events: {}, humanText: ["The margin looks irregular."], allowedNumbers: ["136.28"] };
  it("keeps only guarded, number-checked, single-line items and tolerates fenced JSON", async () => {
    const out = await generateFinal(
      { complete: async () => reply('```json\n' + json(["A  b\nc", "Volume 136.28 as reported", "Volume 5 now"], ["Dr said \"the margin looks irregular\""]) + '\n```') },
      input,
    );
    expect(out).toEqual({ timeline: ["A b c", "Volume 136.28 as reported"], actionItems: ['Dr said "the margin looks irregular"'] });
    expect(await generateFinal({ complete: async () => reply(json(["The tumor is benign."])) }, input)).toBeNull();
    expect(await generateFinal({ complete: async () => reply("{bad") }, input)).toBeNull();
  });

  it("allowed numbers come from the report only", async () => {
    const report = await readExportReport("sample");
    expect(allowedNumbers(report)).toContain("136.28");
    expect(allowedNumbers(null)).toEqual([]);
  });

  it("embeds screenshots in order with captions, only over http(s), and the transcript with offsets; both opt-in", () => {
    const base = { annotations: [], messages: [], summary: null, startedAt: 1_000_000 };
    const shots = [
      { caption: "Axial **view**", takenAt: 1_065_000, url: "https://files.example/a.png" },
      { caption: "Second", takenAt: 1_120_000, url: "javascript:alert(1)" },
    ];
    const md = buildMarkdown("sample", ["screenshots"], null, { ...base, screenshots: shots });
    expect(md).toContain("1. **Axial \\*\\*view\\*\\***");
    expect(md).toContain("+01:05");
    expect(md).toContain("![Axial \\*\\*view\\*\\*](https://files.example/a.png)");
    expect(md.indexOf("Axial")).toBeLessThan(md.indexOf("Second"));
    expect(md).toContain("(image unavailable)");
    expect(md).not.toContain("javascript:");
    const plain = buildMarkdown("sample", ["case"], null, { ...base, screenshots: shots });
    expect(plain).not.toContain("Screenshots");
    expect(plain).not.toContain("Transcript");
  });
});
