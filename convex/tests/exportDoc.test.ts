import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import schema from "../schema";
import { authorFor, annotationFor } from "../lib/author";
import { BANNED_EXPORT_WORDS, buildMarkdown, type ExportSnapshot } from "../lib/exportMarkdown";
import { registerExportTools, type ExportDependencies } from "../mcp/exportTools";
import sample from "../../backend/seed/sample/report.json";
import sample2 from "../../backend/seed/sample-2/report.json";
import { exportReportSchema } from "../lib/exportReport";

const human = { kind: "human", displayName: "Guest", source: "ui" } as const;
const agent = { kind: "agent", name: "Scribe", source: "agent" } as const;
const allSections = ["case", "report", "annotations", "summary", "conversation", "tool_steps"];
const empty: ExportSnapshot = { annotations: [], messages: [], summary: null };

async function setup() {
  const t = convexTest({ schema });
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const room = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const other = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Other" });
  await t.run(async (ctx) => {
    await ctx.db.insert("annotations", { jobId: "sample", sessionId: room.sessionId, text: "Human accepted note", anchor: { kind: "tumor" }, ...annotationFor(human) });
    await ctx.db.insert("annotations", { jobId: "sample", sessionId: room.sessionId, text: "AI suggested note", anchor: { kind: "structure", id: "lh_hippocampus" }, ...annotationFor(agent) });
    await ctx.db.insert("annotations", { jobId: "sample", sessionId: room.sessionId, text: "Dismissed note", anchor: { kind: "tumor" }, ...annotationFor(agent), status: "dismissed" });
    await ctx.db.insert("annotations", { jobId: "sample", sessionId: other.sessionId, text: "OTHER PRIVATE ANNOTATION", anchor: { kind: "tumor" }, ...annotationFor(human) });
    await ctx.db.insert("sessionSummaries", { jobId: "sample", sessionId: room.sessionId, text: "Old summary", coversUpTo: 1, version: 1, ...authorFor(agent) });
    await ctx.db.insert("sessionSummaries", { jobId: "sample", sessionId: room.sessionId, text: "Latest summary", coversUpTo: 2, version: 2, ...authorFor(agent) });
    await ctx.db.insert("messages", { jobId: "sample", sessionId: room.sessionId, role: "user", text: "Human question", ...authorFor(human), createdAt: 1 });
    await ctx.db.insert("messages", { jobId: "sample", sessionId: room.sessionId, role: "assistant", text: "AI reply", ...authorFor(agent), createdAt: 2,
      toolSteps: [{ id: "step", tool: "get_report", args: { job_id: "sample" }, ok: true, message: "Read report", ms: 12 }] });
    await ctx.db.insert("messages", { jobId: "sample", sessionId: other.sessionId, role: "user", text: "OTHER PRIVATE MESSAGE", ...authorFor(human) });
    await ctx.db.insert("messages", { jobId: "sample", clientId: "unpaired-browser", role: "user", text: "UNPAIRED PRIVATE MESSAGE", ...authorFor(human) });
  });
  return { t, room, other };
}
async function storedText(t: ReturnType<typeof convexTest>, exportId: Id<"exports">) {
  return t.run(async (ctx) => {
    const row = await ctx.db.get(exportId);
    expect(row?.status).toBe("ready");
    const blob = await ctx.storage.get(row!.fileId!);
    return blob!.text();
  });
}
beforeEach(() => { vi.unstubAllGlobals(); });

describe("shared export builder", () => {
  it("exports exact seed metrics, accepted notes, latest summary and scoped conversation", async () => {
    const { t, room } = await setup();
    const result = await t.action(internal.exportDoc.request, { jobId: "sample", format: "md", sections: allSections,
      sessionId: room.sessionId, participantToken: room.participantToken, agentName: "Scribe" });
    expect(result.url).toMatch(/^https?:\/\//);
    const text = await storedText(t, result.exportId);
    for (const [region, volume] of Object.entries(sample.volumesCm3)) {
      const key = region as keyof typeof sample.certainty;
      expect(text).toContain(`${region} | ${volume} | ${sample.certainty[key]} | ${sample.expertDice[key]}`);
    }
    expect(text).toContain(`Side: ${sample.side}.`);
    expect(text).toContain(`Lesions: ${sample.lesionCount}.`);
    for (const included of ["Human accepted note", "Latest summary", "Human question", "AI reply", "get\\_report", "Human: Guest", "AI: Scribe", "Educational visualization; not clinically validated"]) expect(text).toContain(included);
    for (const excluded of ["AI suggested note", "Dismissed note", "Old summary", "OTHER PRIVATE", "UNPAIRED PRIVATE"]) expect(text).not.toContain(excluded);
    expect(text).not.toMatch(BANNED_EXPORT_WORDS);
    const row = await t.run((ctx) => ctx.db.get(result.exportId));
    expect(row).toMatchObject({ author: "agent", authorName: "Scribe", source: "mcp", trigger: "manual", version: 1 });
    expect(JSON.stringify(row)).not.toContain(room.participantToken);
  });

  it("uses the identical builder for a human button reservation and MCP", async () => {
    const { t, room } = await setup();
    const sections = ["case", "report"];
    const exportId = await t.run((ctx) => ctx.db.insert("exports", {
      jobId: "sample", format: "md", sections, sessionId: room.sessionId, trigger: "manual", status: "pending", version: 1, ...authorFor(human),
    }));
    await t.action(internal.exportDoc.build, { exportId });
    const result = await t.action(internal.exportDoc.request, { jobId: "sample", format: "md", sections, agentName: "Scribe" });
    expect(result.version).toBe(2);
    expect(await storedText(t, exportId)).toBe(await storedText(t, result.exportId));
    const first = await t.action(internal.exportDoc.build, { exportId });
    const again = await t.action(internal.exportDoc.build, { exportId });
    expect(first).toEqual(again);
  });

  it("includes suggested notes only when explicitly requested and never dismissed ones", async () => {
    const { t, room } = await setup();
    const result = await t.action(internal.exportDoc.request, { jobId: "sample", format: "md", sections: ["suggested_annotations"],
      sessionId: room.sessionId, participantToken: room.participantToken, agentName: "Scribe" });
    const text = await storedText(t, result.exportId);
    expect(text).toContain("AI suggested note");
    expect(text).toContain("suggested");
    expect(text).not.toContain("Dismissed note");
  });

  it("requires a matching participant capability for each private section", async () => {
    const { t, room, other } = await setup();
    for (const section of ["annotations", "summary", "conversation", "tool_steps", "suggested_annotations"]) {
      await expect(t.action(internal.exportDoc.request, { jobId: "sample", format: "md", sections: [section], agentName: "Scribe" })).rejects.toThrow(/session_id/);
    }
    await expect(t.action(internal.exportDoc.request, { jobId: "sample", format: "md", sections: ["conversation"], sessionId: room.sessionId,
      participantToken: other.participantToken, agentName: "Scribe" })).rejects.toThrow();
    await expect(t.action(internal.exportDoc.request, { jobId: "sample-2", format: "md", sections: ["conversation"], sessionId: room.sessionId,
      participantToken: room.participantToken, agentName: "Scribe" })).rejects.toThrow(/session/);
    expect(await t.run((ctx) => ctx.db.query("exports").collect())).toHaveLength(0);
  });

  it("supports Atlas and missing reports without inventing case numbers", async () => {
    const t = convexTest({ schema });
    const result = await t.action(internal.exportDoc.request, { jobId: "atlas", format: "md", sections: ["case", "report"], agentName: "Scribe" });
    const text = await storedText(t, result.exportId);
    expect(text).toContain("Atlas (template brain, not a patient)");
    expect(text).toContain("No patient report");
    expect(text).not.toContain("Volume");
  });

  it("rejects PDF and unsupported sections before creating a row", async () => {
    const t = convexTest({ schema });
    await expect(t.action(internal.exportDoc.request, { jobId: "sample", format: "pdf", sections: [], agentName: "Scribe" })).rejects.toThrow(/Markdown/);
    await expect(t.action(internal.exportDoc.request, { jobId: "sample", format: "md", sections: ["unknown"], agentName: "Scribe" })).rejects.toThrow(/section/);
    expect(await t.run((ctx) => ctx.db.query("exports").collect())).toHaveLength(0);
  });

  it("marks a failed build and never exposes a file or a secret in its error", async () => {
    const t = convexTest({ schema });
    const fetcher = vi.fn().mockRejectedValue(new Error("secret-backend-credential"));
    vi.stubGlobal("fetch", fetcher);
    vi.stubEnv("IMAGING_API_URL", "https://imaging.invalid/");
    try {
      await expect(t.action(internal.exportDoc.request, { jobId: "sample", format: "md", sections: ["report"], agentName: "Scribe" })).rejects.toThrow();
      const rows = await t.run((ctx) => ctx.db.query("exports").collect());
      expect(rows).toHaveLength(1);
      expect(rows[0].status).toBe("failed");
      expect(rows[0].fileId).toBeUndefined();
      expect(rows[0].error).not.toContain("secret");
    } finally { vi.unstubAllEnvs(); }
  });
});

describe("Markdown safety and provenance", () => {
  it.each([sample, sample2])("preserves report.json metrics for $jobId", (raw) => {
    const report = exportReportSchema.parse(raw);
    const text = buildMarkdown(raw.jobId, ["case", "report"], report, empty);
    for (const key of ["whole", "core", "enhancing"] as const) expect(text).toContain(`${key} | ${raw.volumesCm3[key]} | ${raw.certainty[key]} | ${raw.expertDice[key]}`);
    expect(text).not.toMatch(BANNED_EXPORT_WORDS);
  });

  it("redacts every banned word in author names, notes, chat, summaries and tool args", async () => {
    const { t, room } = await setup();
    const forbidden = "Diagnosis PROGNOSIS survival malignant benign healthy";
    await t.run(async (ctx) => {
      await ctx.db.insert("messages", { jobId: "sample", sessionId: room.sessionId, role: "user", text: forbidden + "\n<script>untrusted</script>",
        ...authorFor(human), authorName: forbidden,
        toolSteps: [{ id: "redact", tool: forbidden, args: { text: forbidden }, ok: false, message: forbidden, ms: 0 }] });
      await ctx.db.insert("sessionSummaries", { jobId: "sample", sessionId: room.sessionId, text: forbidden, coversUpTo: 3, version: 3, ...authorFor(agent) });
      await ctx.db.insert("annotations", { jobId: "sample", sessionId: room.sessionId, text: forbidden, anchor: { kind: "structure", id: forbidden }, ...annotationFor(human) });
    });
    const result = await t.action(internal.exportDoc.request, { jobId: "sample", format: "md", sections: allSections,
      sessionId: room.sessionId, participantToken: room.participantToken, agentName: "Scribe" });
    const text = await storedText(t, result.exportId);
    expect(text).not.toMatch(BANNED_EXPORT_WORDS);
    expect(text).not.toContain("<script>");
    expect(text).toContain("redacted");
  });
});

async function connected(deps: ExportDependencies) {
  const server = new McpServer({ name: "exports-test", version: "test" });
  registerExportTools(server, deps);
  const client = new Client({ name: "desktop-test", version: "test" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

describe("MCP export_document", () => {
  it("lists its capability rule and returns a stored Markdown download link", async () => {
    const t = convexTest({ schema });
    const ctx = { runAction: t.action } as unknown as NonNullable<ExportDependencies["ctx"]>;
    const connection = await connected({ caller: { kind: "service", tokenHash: "test-hash", authorName: "Claude Desktop" }, ctx });
    try {
      const { tools } = await connection.client.listTools();
      const tool = tools.find((entry) => entry.name === "export_document")!;
      expect(tool.description).toContain("session_id AND participant_token");
      expect(tool.inputSchema.properties).not.toHaveProperty("authorName");
      const result = await connection.client.callTool({ name: "export_document", arguments: { job_id: "sample", format: "md", sections: ["case", "report"] } });
      expect(result.isError).not.toBe(true);
      const data = JSON.parse((result.content as { text: string }[])[0].text);
      expect(data.url).toMatch(/^https?:\/\//);
      expect(await storedText(t, data.exportId)).toContain("136.28");
      expect(await t.run((context) => context.db.get(data.exportId))).toMatchObject({ authorName: "Claude Desktop", source: "mcp" });
    } finally { await connection.close(); }
  });

  it("does not treat a service token as permission to read private conversation", async () => {
    const t = convexTest({ schema });
    const ctx = { runAction: t.action } as unknown as NonNullable<ExportDependencies["ctx"]>;
    const connection = await connected({ caller: { kind: "service", tokenHash: "test-hash" }, ctx });
    try {
      const result = await connection.client.callTool({ name: "export_document", arguments: { job_id: "sample", sections: ["conversation"] } });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("participant_token");
      expect(await t.run((context) => context.db.query("exports").collect())).toHaveLength(0);
    } finally { await connection.close(); }
  });
});
