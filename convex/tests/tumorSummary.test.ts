import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { createServer } from "../mcp/server";
import { fileData, reportSchema, NO_TUMOR, type Report } from "../mcp/data";
import { buildTumorCard, tumorSummaryIntent } from "../lib/tumorSummary";
import { checkReply } from "../agent/guard";
import { toolRegistry } from "../agent/viewerTools";
import * as anthropic from "../agent/anthropic";
import schema from "../schema";
import sample from "../../backend/seed/sample/report.json";

const sampleReport = reportSchema.parse(sample);
const noTumor: Report = { ...sampleReport, jobId: "no-tumor", tumorDetected: false, lesionCount: 0, side: null, centroidMm: null, bboxMm: null,
  volumesCm3: { whole: 0, core: 0, enhancing: 0 }, certainty: null };

describe("buildTumorCard", () => {
  it("copies exact numbers from report.json, with the source and the 3D layer names", () => {
    const card = buildTumorCard(sampleReport);
    expect(card).toMatchObject({ tumorDetected: true, message: null, side: "right", lesionCount: 1, source: "AI segmentation; report.json.", layers: ["edema", "core", "enhancing"] });
    expect(card.regions.map((r) => [r.region, r.layer, r.volumeCm3, r.certainty])).toEqual([
      ["whole", "edema", 136.28, 0.94], ["core", "core", 61.56, 0.97], ["enhancing", "enhancing", 34.26, 0.92],
    ]);
    for (const needle of ["136.28", "61.56", "34.26", "0.94", "0.97", "0.92", "Side: right", "Lesions: 1", "edema, core, enhancing", "AI segmentation; report.json."])
      expect(card.text).toContain(needle);
    // Every number in the text comes from the report (plus the lesion count).
    const allowed = new Set(["136.28", "61.56", "34.26", "0.94", "0.97", "0.92", "1", "3"]);
    for (const n of card.text.replace(/cm³/g, "").match(/\d+(?:\.\d+)?/g) ?? []) expect(allowed.has(n), n).toBe(true);
    expect(checkReply(card.text).ok).toBe(true);
  });

  it("names expert segmentation, and never invents certainty", () => {
    const card = buildTumorCard({ ...sampleReport, segmentationSource: "expert", certainty: null });
    expect(card.source).toBe("Human expert segmentation; report.json.");
    expect(card.regions.every((r) => r.certainty === null)).toBe(true);
    expect(card.text).toContain("outline certainty not available");
  });

  it("says no tumor was detected and lists no numbers or layers", () => {
    const card = buildTumorCard(noTumor);
    expect(card).toMatchObject({ tumorDetected: false, message: NO_TUMOR, regions: [], layers: [] });
    expect(card.text).toContain(NO_TUMOR);
    expect(card.text).not.toMatch(/cm³/);
    expect(checkReply(card.text).ok).toBe(true);
  });
});

describe("tumorSummaryIntent", () => {
  it.each(["Summarize tumor", "summarize the tumor", "Summarise the tumour!", "please summarize this lesion", "Give me a tumor summary", "tumor summary", "Can you sum up the tumor", "recap the tumor"])("%s -> fast path", (text) => {
    expect(tumorSummaryIntent(text)).toBe(true);
  });
  it.each(["summarize the tumor and zoom in", "summarize the meeting", "how big is the tumor", "is the tumor malignant", "summarize", "tumor"])("%s -> normal agent", (text) => {
    expect(tumorSummaryIntent(text)).toBe(false);
  });
});

async function mcp() {
  const server = createServer({
    data: fileData(),
    caller: { kind: "service", tokenHash: "t", agentName: "Navigator", authorName: "Navigator" },
  });
  const client = new Client({ name: "summary-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const body = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);

describe("summarize_tumor MCP tool", () => {
  it("is read-only and returns the sample card with exact numbers", async () => {
    const client = await mcp();
    const tool = (await client.listTools()).tools.find((x) => x.name === "summarize_tumor")!;
    expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
    const out = body(await client.callTool({ name: "summarize_tumor", arguments: { job_id: "sample" } }));
    expect(out.source).toBe("report://sample");
    expect(out.card.regions.map((r: { volumeCm3: number; certainty: number }) => [r.volumeCm3, r.certainty])).toEqual([[136.28, 0.94], [61.56, 0.97], [34.26, 0.92]]);
    expect(out.card.text).toContain("136.28 cm³");
    expect(out.notice).toMatch(/educational/i);
    await client.close();
  });

  it("answers no report for atlas/learn pages, no job and unknown jobs", async () => {
    const client = await mcp();
    for (const args of [{ job_id: "sample", page: "learn" }, { job_id: "sample", page: "/learn" }, {}, { job_id: "does-not-exist" }]) {
      const out = body(await client.callTool({ name: "summarize_tumor", arguments: args }));
      expect(out.card, JSON.stringify(args)).toBeNull();
      expect(out.message).toMatch(/no (patient )?report/i);
    }
    expect((await client.callTool({ name: "summarize_tumor", arguments: { job_id: "sample", extra: 1 } })).isError).toBe(true);
    await client.close();
  });

  it("is in the agent registry for mri and 3d", () => {
    expect(toolRegistry.summarize_tumor.pages).toEqual(["mri", "3d"]);
  });
});

describe("fast path in agent.run (no Claude, no key needed)", () => {
  const refs = {
    ask: makeFunctionReference<"mutation">("agent:ask"),
    run: makeFunctionReference<"action">("agent:run"),
    get: makeFunctionReference<"query">("agent:getRun"),
    chat: makeFunctionReference<"query">("agent:listChat"),
  };
  const base = { clientId: "client-summary-0001", source: "chat" as const, page: "3d" as const, jobId: "sample" };
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-24T12:00:00Z")); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.clearAllTimers(); vi.useRealTimers(); });

  it("returns the card instantly without an API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const t = convexTest(schema);
    const runId = await t.mutation(refs.ask, { ...base, text: "Summarize tumor" });
    await t.action(refs.run, { runId });
    const row = await t.query(refs.get, { runId, clientId: base.clientId });
    expect(row).toMatchObject({ status: "done", error: null, agent: "Router" });
    expect(row.reply).toContain("136.28 cm³");
    expect(row.reply).toContain("AI segmentation; report.json.");
    expect(row.steps).toMatchObject([{ tool: "summarize_tumor", ok: true, kind: "mcp" }]);
    const chat = await t.query(refs.chat, { clientId: base.clientId, jobId: "sample", limit: 10 });
    expect(chat.map((m: { role: string }) => m.role).sort()).toEqual(["assistant", "user"]);
  });

  it("with a key it still skips Claude and takes no daily run", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k");
    const factory = vi.spyOn(anthropic, "createClaudeClient");
    const t = convexTest(schema);
    const runId = await t.mutation(refs.ask, { ...base, text: "Give me a tumor summary" });
    await t.action(refs.run, { runId });
    expect((await t.query(refs.get, { runId, clientId: base.clientId })).reply).toContain("61.56");
    expect(factory).not.toHaveBeenCalled();
    expect(await t.run((ctx) => ctx.db.query("agentDailyUsage").collect())).toHaveLength(0);
    expect(((await t.run((ctx) => ctx.db.get(runId))) as { spendDay?: string } | null)?.spendDay).toBeUndefined();
  });

  it("states a missing report, and anything beyond the exact ask goes to the normal agent", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const t = convexTest(schema);
    const missing = await t.mutation(refs.ask, { ...base, jobId: "no-such-case", text: "Summarize the tumor" });
    await t.action(refs.run, { runId: missing });
    expect((await t.query(refs.get, { runId: missing, clientId: base.clientId })).reply).toBe("There is no report for this case.");
    vi.advanceTimersByTime(61_000);
    const compound = await t.mutation(refs.ask, { ...base, text: "Summarize the tumor and zoom in" });
    await t.action(refs.run, { runId: compound });
    const row = await t.query(refs.get, { runId: compound, clientId: base.clientId });
    expect(row.steps).toEqual([]);
    expect(row.reply).not.toContain("136.28"); // no key: the normal loop answers "unavailable"
  });
});
