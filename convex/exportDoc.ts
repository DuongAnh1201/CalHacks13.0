import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { authorFor } from "./lib/author";
import { appError } from "./lib/errors";
import { buildMarkdown, EXPORT_SECTIONS, PRIVATE_SECTIONS, type ExportSnapshot } from "./lib/exportMarkdown";
import { readExportReport } from "./lib/exportReport";

const sectionsValidator = v.array(v.string());
const suggested = "suggested_annotations";
function checkedSections(sections: string[]) {
  const selected = sections.length ? [...new Set(sections)] : [...EXPORT_SECTIONS];
  if (selected.some((part) => ![...EXPORT_SECTIONS, suggested].includes(part))) {
    throw appError("INVALID_ARGUMENT", "Unknown export section.");
  }
  if (selected.includes(suggested) && !selected.includes("annotations")) selected.push("annotations");
  return selected;
}
function needsPrivate(sections: string[]) { return sections.some((part) => [...PRIVATE_SECTIONS, suggested].includes(part)); }

async function snapshot(ctx: QueryCtx, jobId: string, sections: string[], sessionId?: Id<"sessions">): Promise<ExportSnapshot> {
  const data: ExportSnapshot = { annotations: [], messages: [], summary: null };
  if (!needsPrivate(sections)) return data;
  if (!sessionId) throw appError("NOT_AUTHENTICATED", "Private export sections require session_id and participant_token.");
  if (sections.includes("annotations")) {
    data.annotations = await ctx.db.query("annotations").withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.and(q.eq(q.field("jobId"), jobId), (sections.includes(suggested) ? q.or(q.eq(q.field("status"), "accepted"), q.eq(q.field("status"), "suggested")) : q.eq(q.field("status"), "accepted")))).collect();
  }
  if (sections.includes("summary")) {
    data.summary = await ctx.db.query("sessionSummaries").withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.eq(q.field("jobId"), jobId)).order("desc").first();
  }
  if (sections.includes("conversation") || sections.includes("tool_steps")) {
    data.messages = await ctx.db.query("messages").withIndex("by_job_time", (q) => q.eq("jobId", jobId))
      .filter((q) => q.eq(q.field("sessionId"), sessionId)).collect();
  }
  return data;
}
export const authorize = internalQuery({
  args: { jobId: v.string(), sections: sectionsValidator, sessionId: v.optional(v.id("sessions")), participantToken: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const sections = checkedSections(args.sections);
    if (needsPrivate(sections) || args.sessionId) {
      if (!args.sessionId || !args.participantToken) throw appError("NOT_AUTHENTICATED", "Private export sections require session_id and participant_token.");
      const { session } = await requireSessionMember(ctx, { sessionId: args.sessionId, participantToken: args.participantToken });
      const scan = await ctx.db.get(session.scanId);
      if (!scan || scan.jobId !== args.jobId) throw appError("NOT_A_MEMBER", "The session does not review this case.");
    }
    return sections;
  },
});

/** Internal reservation, after request authorization; the human mutation can use the same schema. */
export const reserve = internalMutation({
  args: { jobId: v.string(), sessionId: v.optional(v.id("sessions")), sections: sectionsValidator, agentName: v.string() },
  handler: async (ctx, args) => {
    const previous = await ctx.db.query("exports").withIndex("by_job", (q) => q.eq("jobId", args.jobId)).order("desc").first();
    return ctx.db.insert("exports", {
      jobId: args.jobId, sessionId: args.sessionId, sections: args.sections,
      format: "md", trigger: "manual", status: "pending", version: (previous?.version ?? 0) + 1,
      ...authorFor({ kind: "agent", name: args.agentName, source: "mcp" }),
    });
  },
});

export const getRecord = internalQuery({
  args: { exportId: v.id("exports") },
  handler: async (ctx, { exportId }) => ctx.db.get(exportId),
});

export const load = internalQuery({
  args: { exportId: v.id("exports") },
  handler: async (ctx, { exportId }) => {
    const row = await ctx.db.get(exportId);
    if (!row) throw appError("NOT_FOUND", "Export not found.");
    return { row, data: row.status === "pending" ? await snapshot(ctx, row.jobId, checkedSections(row.sections), row.sessionId) : null };
  },
});

type ExportResult = { exportId: Id<"exports">; url: string; version: number };

/** The one builder used by both human requests (#61) and MCP. */
export const build = internalAction({
  args: { exportId: v.id("exports") },
  handler: async (ctx, { exportId }): Promise<ExportResult> => {
    let fileId: Id<"_storage"> | undefined;
    let published = false;
    try {
      const { row, data } = await ctx.runQuery(internal.exportDoc.load, { exportId });
      if (row.status === "failed") throw new Error("Export previously failed; request a new version.");
      if (row.status === "ready") {
        const url = row.fileId && await ctx.storage.getUrl(row.fileId);
        if (!url) throw new Error("Export file is unavailable.");
        return { exportId, url, version: row.version };
      }
      if (row.format !== "md") throw new Error("Only Markdown exports are available.");
      const report = row.sections.includes("report") ? await readExportReport(row.jobId) : null;
      const markdown = buildMarkdown(row.jobId, checkedSections(row.sections), report, data!);
      fileId = await ctx.storage.store(new Blob([markdown], { type: "text/markdown; charset=utf-8" }));
      await ctx.runMutation(internal.exportRecords.setState, { exportId, status: "ready", fileId });
      published = true;
      const url = await ctx.storage.getUrl(fileId);
      if (!url) throw new Error("Export file is unavailable.");
      return { exportId, url, version: row.version };
    } catch (error) {
      if (fileId && !published) await ctx.storage.delete(fileId);
      const current = await ctx.runQuery(internal.exportDoc.getRecord, { exportId });
      if (current?.status === "pending") await ctx.runMutation(internal.exportRecords.setState, {
        exportId, status: "failed", error: "Export could not be built. Please request a new export.",
      });
      throw error;
    }
  },
});

/** MCP service identity supplies attribution, not participant/session authority. */
export const request = internalAction({
  args: {
    jobId: v.string(), format: v.union(v.literal("md"), v.literal("pdf")), sections: sectionsValidator,
    sessionId: v.optional(v.id("sessions")), participantToken: v.optional(v.string()),
    agentName: v.string(), // Internal only: resolved by the MCP transport, never a tool argument.
  },
  handler: async (ctx, args): Promise<ExportResult> => {
    if (args.format !== "md") throw appError("INVALID_ARGUMENT", "Only Markdown exports are available.");
    if (!["atlas", "learn", "/learn"].includes(args.jobId) && !/^[A-Za-z0-9_-]{1,64}$/.test(args.jobId)) {
      throw appError("INVALID_ARGUMENT", "Invalid case id.");
    }
    const sections = await ctx.runQuery(internal.exportDoc.authorize, {
      jobId: args.jobId, sections: args.sections, sessionId: args.sessionId, participantToken: args.participantToken,
    });
    const exportId = await ctx.runMutation(internal.exportDoc.reserve, {
      jobId: args.jobId, sessionId: args.sessionId, sections, agentName: args.agentName,
    });
    return ctx.runAction(internal.exportDoc.build, { exportId });
  },
});
