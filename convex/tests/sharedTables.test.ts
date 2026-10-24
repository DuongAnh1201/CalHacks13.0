import { convexTest } from "convex-test";
import { describe, expect, it, vi } from "vitest";
import { annotationFor, authorFor, type ResolvedCaller } from "../lib/author";
import type { Doc } from "../_generated/dataModel";
import schema from "../schema";
import { internal } from "../_generated/api";

const human: ResolvedCaller = { kind: "human", displayName: "Guest judge", source: "ui" };
const agent: ResolvedCaller = { kind: "agent", name: "Navigator", source: "agent" };

// Each factory omits optional fields so these are minimal, usable table rows.
const minimalRows = {
  annotations: () => ({ jobId: "sample", text: "Check this outline", anchor: { kind: "tumor" as const }, ...annotationFor(human) }),
  messages: () => ({ jobId: "sample", role: "user" as const, text: "Show the tumor", ...authorFor(human) }),
  sessionSummaries: () => ({ jobId: "sample", text: "Reviewed the outline", coversUpTo: 1, version: 1, ...authorFor(agent) }),
} as const;

async function exportRow(t: ReturnType<typeof convexTest>) {
  const fileId = await t.run((ctx) => ctx.storage.store(new Blob(["# Review"], { type: "text/markdown" })));
  return { jobId: "sample", format: "md" as const, trigger: "manual" as const,
    status: "ready" as const, fileId, version: 1, sections: ["report", "annotations"], ...authorFor(human) };
}

describe("shared tables", () => {
  for (const table of ["annotations", "messages", "sessionSummaries"] as const) {
    it(`inserts a minimal ${table} row`, async () => {
      const t = convexTest({ schema });
      const row = minimalRows[table]();
      const saved = await t.run(async (ctx) => {
        const id = await ctx.db.insert(table, row);
        return ctx.db.get(id);
      });
      expect(saved).toMatchObject(row);
    });

    it(`rejects ${table} without author`, async () => {
      const t = convexTest({ schema });
      const { author: _, ...row } = minimalRows[table]();
      // Deliberately bypass TS to exercise the actual database validator.
      await expect(t.run((ctx) => ctx.db.insert(table, row as Doc<typeof table>))).rejects.toThrow(/author/);
    });
  }

  it("inserts a minimal export with a storage id", async () => {
    const t = convexTest({ schema });
    const row = await exportRow(t);
    const saved = await t.run(async (ctx) => ctx.db.get(await ctx.db.insert("exports", row)));
    expect(saved).toMatchObject(row);
  });

  it("creates pending exports without a file and rejects ready without fileId", async () => {
    const t = convexTest({ schema });
    const exportId = await t.run((ctx) => ctx.db.insert("exports", {
      jobId: "sample", format: "md", trigger: "manual", status: "pending",
      version: 1, sections: ["report"], ...authorFor(human),
    }));
    await expect(t.mutation(internal.exportRecords.setState, { exportId, status: "ready" })).rejects.toThrow(/fileId/);
    expect((await t.run((ctx) => ctx.db.get(exportId)))?.status).toBe("pending");
    const fileId = await t.run((ctx) => ctx.storage.store(new Blob(["# Review"])));
    await t.mutation(internal.exportRecords.setState, { exportId, status: "ready", fileId });
    expect(await t.run((ctx) => ctx.db.get(exportId))).toMatchObject({ status: "ready", fileId });
  });

  it("records failed exports with an error and no file", async () => {
    const t = convexTest({ schema });
    const exportId = await t.run((ctx) => ctx.db.insert("exports", {
      jobId: "sample", format: "md", trigger: "manual", status: "pending",
      version: 1, sections: ["report"], ...authorFor(agent),
    }));
    await t.mutation(internal.exportRecords.setState, { exportId, status: "failed", error: "Report unavailable" });
    const row = await t.run((ctx) => ctx.db.get(exportId));
    expect(row).toMatchObject({ status: "failed", error: "Report unavailable" });
    expect(row?.fileId).toBeUndefined();
  });

  it("rejects exports without author", async () => {
    const t = convexTest({ schema });
    const { author: _, ...row } = await exportRow(t);
    await expect(t.run((ctx) => ctx.db.insert("exports", row as Doc<"exports">))).rejects.toThrow(/author/);
  });

  it("inserts an agent annotation through the helper path as suggested", async () => {
    const t = convexTest({ schema });
    const row = { jobId: "sample", text: "Check edema margin", anchor: { kind: "tumor" as const },
      ...annotationFor({ kind: "agent", name: "Claude Desktop", source: "mcp" }) };
    const saved = await t.run(async (ctx) => ctx.db.get(await ctx.db.insert("annotations", row)));
    expect(saved).toMatchObject({ author: "agent", authorName: "Claude Desktop", source: "mcp", status: "suggested" });
  });

  it("supports job lookups and scoped chronological chat/search", async () => {
    const t = convexTest({ schema });
    await t.run(async (ctx) => {
      await ctx.db.insert("annotations", minimalRows.annotations());
      await ctx.db.insert("messages", { ...minimalRows.messages(), clientId: "browser-1", createdAt: 20 });
      await ctx.db.insert("messages", { ...minimalRows.messages(), clientId: "browser-1", createdAt: 10 });
      await ctx.db.insert("messages", { ...minimalRows.messages(), jobId: "other", clientId: "browser-2" });
      await ctx.db.insert("sessionSummaries", { ...minimalRows.sessionSummaries(), clientId: "browser-1" });
      expect(await ctx.db.query("annotations").withIndex("by_job", (q) => q.eq("jobId", "sample")).collect()).toHaveLength(1);
      const jobMessages = await ctx.db.query("messages").withIndex("by_job_time", (q) => q.eq("jobId", "sample")).collect();
      expect(jobMessages.map((row) => row.createdAt)).toEqual([10, 20]);
      const messages = await ctx.db.query("messages").withIndex("by_client_time", (q) => q.eq("clientId", "browser-1")).collect();
      expect(messages.map((row) => row.createdAt)).toEqual([10, 20]);
      const found = await ctx.db.query("messages").withSearchIndex("search_text", (q) => q.search("text", "tumor").eq("jobId", "sample").eq("clientId", "browser-1")).collect();
      expect(found).toHaveLength(2);
      expect(await ctx.db.query("sessionSummaries").withIndex("by_client", (q) => q.eq("clientId", "browser-1")).collect()).toHaveLength(1);
    });
  });
});

describe("server-resolved attribution", () => {
  it("stamps server time and only the known attribution fields", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234);
    try {
      expect(authorFor(human)).toEqual({ author: "human", authorName: "Guest judge", source: "ui", createdAt: 1234 });
      expect(authorFor({ kind: "human", displayName: "Rest guest", source: "rest" })).toEqual({ author: "human", authorName: "Rest guest", source: "rest", createdAt: 1234 });
      expect(authorFor(agent)).toEqual({ author: "agent", authorName: "Navigator", source: "agent", createdAt: 1234 });
      expect(annotationFor(human).status).toBe("accepted");
    } finally {
      vi.restoreAllMocks();
    }
  });
});
