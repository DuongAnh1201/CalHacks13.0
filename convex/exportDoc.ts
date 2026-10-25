import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireParticipant, requireSessionMember } from "./lib/auth";
import { authorFor, type ResolvedCaller } from "./lib/author";
import { appError } from "./lib/errors";
import { buildMarkdown, EXPORT_SECTIONS, OPTIONAL_EXPORT_SECTIONS, PRIVATE_SECTIONS, type ExportSnapshot } from "./lib/exportMarkdown";
import { loadExportScreenshots } from "./lib/exportScreenshots";
import { readExportReport } from "./lib/exportReport";

const sectionsValidator = v.array(v.string());
const suggested = "suggested_annotations";
function checkedSections(sections: string[]) {
  const selected = sections.length ? [...new Set(sections)] : [...EXPORT_SECTIONS];
  if (selected.some((part) => ![...EXPORT_SECTIONS, ...OPTIONAL_EXPORT_SECTIONS, suggested].includes(part))) {
    throw appError("INVALID_ARGUMENT", "Unknown export section.");
  }
  if (selected.includes(suggested) && !selected.includes("annotations")) selected.push("annotations");
  return selected;
}
function needsPrivate(sections: string[]) { return sections.some((part) => [...PRIVATE_SECTIONS, suggested].includes(part)); }

export async function snapshot(ctx: QueryCtx, jobId: string, sections: string[], sessionId?: Id<"sessions">, auto = false): Promise<ExportSnapshot> {
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
  const wantsShots = sections.includes("screenshots");
  const wantsTranscript = sections.includes("transcript");
  if (wantsShots || wantsTranscript || sections.includes("summary")) {
    const session = await ctx.db.get(sessionId);
    data.startedAt = session?._creationTime;
    if (sections.includes("summary") && data.summary && session)
      data.summaryState = session.status === "ended" && data.summary.coversUpTo >= session.updatedAt ? "final" : "interim";
    else if (auto && sections.includes("summary")) data.summaryState = "unavailable";
  }
  if (wantsShots) data.screenshots = await loadExportScreenshots(ctx, sessionId, jobId);
  if (wantsTranscript) {
    data.transcript = await ctx.db.query("transcriptSegments").withIndex("by_session_time", (q) => q.eq("sessionId", sessionId))
      .filter((q) => q.and(q.eq(q.field("jobId"), jobId), q.neq(q.field("final"), false))).take(5000);
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
  handler: async (ctx, args) => reserveRow(ctx, { ...args, trigger: "manual", caller: { kind: "agent", name: args.agentName, source: "mcp" } }),
});

async function reserveRow(
  ctx: MutationCtx,
  args: { jobId: string; sessionId?: Id<"sessions">; sections: string[]; trigger: "manual" | "auto"; caller: ResolvedCaller },
) {
  const previous = await ctx.db.query("exports").withIndex("by_job", (q) => q.eq("jobId", args.jobId)).order("desc").first();
  return ctx.db.insert("exports", {
    jobId: args.jobId, sessionId: args.sessionId, sections: args.sections,
    format: "md", trigger: args.trigger, ...(args.trigger === "auto" ? { reason: "checkpoint" as const } : {}),
    status: "pending", version: (previous?.version ?? 0) + 1,
    ...authorFor(args.caller),
  });
}

/** Sections of the automatic end-of-meeting export (T4a). */
export const AUTO_EXPORT_SECTIONS = ["case", "report", "annotations", "summary", "conversation", "screenshots", "transcript"];

/**
 * End-of-meeting auto export (#138): one per ended session. Returns the new
 * pending export id, or null when the session is not ended or an auto export
 * already exists (pending or ready). A failed one may be retried.
 */
export const autoReserve = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session || session.status !== "ended") return null;
    const scan = await ctx.db.get(session.scanId);
    if (!scan) return null;
    const existing = await ctx.db.query("exports").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
    if (existing.some((row) => row.trigger === "auto" && row.status !== "failed")) return null;
    return reserveRow(ctx, { jobId: scan.jobId, sessionId, sections: AUTO_EXPORT_SECTIONS, trigger: "auto", caller: { kind: "agent", name: "Scribe", source: "agent" } });
  },
});

const MANUAL_EXPORT_CAP = 20;
const PENDING_REUSE_MS = 120_000;

/**
 * A session member asks for a Markdown export of the meeting so far (notes,
 * transcript, screenshots, annotations, chat) from the panel: a manual export
 * through the same builder, labelled with the member's name. Also the "Try
 * again" after a failed export, and works after the session ended. Members only.
 * A fresh pending export is reused instead of starting another.
 */
export const requestMember = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string() },
  handler: async (ctx, args): Promise<{ exportId: Id<"exports"> }> => {
    const participant = await requireParticipant(ctx, args.participantToken);
    if (participant.sessionId !== args.sessionId) throw appError("NOT_A_MEMBER", "You are not a member of that review session.");
    const session = await ctx.db.get(args.sessionId);
    const scan = session ? await ctx.db.get(session.scanId) : null;
    if (!session || !scan) throw appError("NOT_FOUND", "That review session does not exist.");
    const rows = await ctx.db.query("exports").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).order("desc").take(50);
    const pending = rows.find((r) => r.status === "pending" && Date.now() - r._creationTime < PENDING_REUSE_MS);
    if (pending) return { exportId: pending._id };
    if (rows.filter((r) => r.trigger === "manual").length >= MANUAL_EXPORT_CAP)
      throw appError("INVALID_ARGUMENT", "This session has reached its export limit.");
    const exportId = await reserveRow(ctx, {
      jobId: scan.jobId, sessionId: args.sessionId, sections: AUTO_EXPORT_SECTIONS, trigger: "manual",
      caller: { kind: "human", displayName: participant.displayName, source: "ui" },
    });
    await ctx.scheduler.runAfter(0, internal.exportDoc.build, { exportId });
    return { exportId };
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
    return { row, data: row.status === "pending" ? await snapshot(ctx, row.jobId, checkedSections(row.sections), row.sessionId, row.trigger === "auto") : null };
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
