import { v, ConvexError } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
  internalAction,
  env,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  allowedTools,
  canStartRun,
  classifyHint,
  MEDICAL_REFUSAL,
  NO_KEY,
  type Page,
} from "./agent/guard";
import { toolRegistry } from "./agent/viewerTools";
import { vAgentStep, vHistory } from "./agent/validators";
import { createClaudeClient } from "./agent/anthropic";
import { runLoop, safeReply } from "./agent/loop";
import { openAgentMcp } from "./agent/mcpClient";
import { requireSessionMember } from "./lib/auth";

const settings = env as typeof env & {
  ANTHROPIC_API_KEY?: string;
  AGENT_DAILY_RUN_LIMIT?: string;
};
const runRef = makeFunctionReference<
  "action",
  { runId: Id<"agentRuns"> },
  null
>("agent:run");
const readRef = makeFunctionReference<
  "query",
  { runId: Id<"agentRuns"> },
  Doc<"agentRuns"> | null
>("agent:read");
const claimRef = makeFunctionReference<
  "mutation",
  { runId: Id<"agentRuns"> },
  Doc<"agentRuns"> | null
>("agent:claim");
const stepRef = makeFunctionReference<
  "mutation",
  { runId: Id<"agentRuns">; step: Doc<"agentRuns">["steps"][number] },
  null
>("agent:appendStep");
const handoffRef = makeFunctionReference<
  "mutation",
  { runId: Id<"agentRuns">; agent: string },
  null
>("agent:setAgent");
type NoteScope =
  | { kind: "client"; clientId: string; jobId: string }
  | { kind: "session"; sessionId: Id<"sessions">; jobId: string };
/** Verified session runs share one note; everything else is private to the client. */
function noteScope(row: Doc<"agentRuns">): NoteScope | null {
  if (!row.jobId) return null;
  return row.sessionVerified && row.sessionId
    ? { kind: "session", sessionId: row.sessionId, jobId: row.jobId }
    : { kind: "client", clientId: row.clientId, jobId: row.jobId };
}
const scheduleNotesRef = makeFunctionReference<
  "mutation",
  { scope: NoteScope },
  null
>("notes:schedule");
const latestNotesRef = makeFunctionReference<
  "query",
  { scope: NoteScope },
  string | null
>("notes:latestText");
const finishRef = makeFunctionReference<
  "mutation",
  {
    runId: Id<"agentRuns">;
    reply: string;
    agent: string;
    error: string | null;
  },
  null
>("agent:finish");
function requireClient(clientId: string) {
  if (!clientId.trim() || clientId.length > 128)
    throw new ConvexError({
      code: "BAD_CLIENT",
      message: "A bounded client capability is required.",
    });
}

/** Counts one potentially paid call against the deployment-wide daily cap. */
export async function reserveDailyRun(ctx: MutationCtx, now: number): Promise<string> {
  const day = new Date(now).toISOString().slice(0, 10);
  const limit = Number(settings.AGENT_DAILY_RUN_LIMIT ?? 100);
  if (!Number.isInteger(limit) || limit < 0 || limit > 10000)
    throw new ConvexError({
      code: "CONFIG_ERROR",
      message: "Assistant spend limit is unavailable.",
    });
  const usage = await ctx.db
    .query("agentDailyUsage")
    .withIndex("by_day", (q) => q.eq("day", day))
    .unique();
  if ((usage?.count ?? 0) >= limit)
    throw new ConvexError({
      code: "DAILY_LIMIT",
      message: "The assistant daily run limit has been reached.",
    });
  if (usage) await ctx.db.patch(usage._id, { count: usage.count + 1 });
  else await ctx.db.insert("agentDailyUsage", { day, count: 1 });
  return day;
}
async function reserveSpend(ctx: MutationCtx, text: string, now: number) {
  if (settings.ANTHROPIC_API_KEY && classifyHint(text) === null)
    return await reserveDailyRun(ctx, now);
  return undefined;
}

export const ask = mutation({
  args: {
    clientId: v.string(),
    sessionId: v.optional(v.id("sessions")),
    jobId: v.optional(v.string()),
    text: v.string(),
    source: v.union(v.literal("chat"), v.literal("voice"), v.literal("text")),
    page: v.union(
      v.literal("learn"),
      v.literal("/learn"),
      v.literal("mri"),
      v.literal("/mri"),
      v.literal("3d"),
      v.literal("/3d"),
    ),
    availableTools: v.optional(v.array(v.string())),
    snapshot: v.optional(v.any()),
    history: v.optional(vHistory),
    // Optional proof of membership in sessionId. Without it the run is never
    // treated as part of the session (no shared notes, no session chat reads).
    participantToken: v.optional(v.string()),
  },
  handler: async (ctx, { participantToken, ...args }) => {
    requireClient(args.clientId);
    if (
      !args.text.trim() ||
      args.text.length > 2000 ||
      JSON.stringify(args.snapshot ?? null).length > 20000 ||
      (args.history?.length ?? 0) > 10 ||
      args.history?.some((m) => m.text.length > 2000) ||
      (args.availableTools?.length ?? 0) > 100
    )
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Request context is empty or too large.",
      });
    if (args.jobId && !/^[A-Za-z0-9_-]{1,128}$/.test(args.jobId))
      throw new ConvexError({
        code: "BAD_JOB",
        message: "Invalid job identifier.",
      });
    const now = Date.now();
    const previous = await ctx.db
      .query("agentRuns")
      .withIndex("by_client", (q) => q.eq("clientId", args.clientId))
      .order("desc")
      .take(100);
    const recent = previous.filter((run) => run.createdAt > now - 60000);
    const admission = canStartRun(
      previous.filter(
        (run) => run.status === "queued" || run.status === "running",
      ).length,
      recent.length,
      recent.length
        ? (now - Math.min(...recent.map((run) => run.createdAt))) / 1000
        : undefined,
    );
    if (!admission.ok)
      throw new ConvexError({
        code: "RATE_LIMIT",
        message: "Wait before starting another assistant run.",
        retryAfterSec: admission.retryAfterSec,
      });
    // Verified server-side here; only the resolved participant id is stored, never the token.
    let verified: { participantId: Id<"sessionParticipants"> } | undefined;
    if (args.sessionId && args.jobId && participantToken) {
      try {
        const { session, participant } = await requireSessionMember(ctx, {
          sessionId: args.sessionId,
          participantToken,
        });
        const scan = await ctx.db.get(session.scanId);
        // The run's job must be the session's job; a mismatch stays client-scope.
        if (scan?.jobId === args.jobId) verified = { participantId: participant._id };
      } catch {
        verified = undefined;
      }
    }
    const spendDay = await reserveSpend(ctx, args.text, now);
    const page = args.page.replace(/^\//, "") as Page;
    const runId = await ctx.db.insert("agentRuns", {
      ...args,
      page,
      ...(spendDay ? { spendDay } : {}),
      ...(verified ? { sessionVerified: true, sessionParticipantId: verified.participantId } : {}),
      availableTools: allowedTools(
        page,
        args.availableTools ?? Object.keys(toolRegistry),
        toolRegistry,
      ),
      status: "queued",
      steps: [],
      reply: "",
      agent: "Router",
      error: null,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, runRef, { runId });
    return runId;
  },
});
export const getRun = query({
  args: { runId: v.id("agentRuns"), clientId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.runId);
    return row?.clientId === args.clientId ? row : null;
  },
});
export const listRuns = query({
  args: { clientId: v.string() },
  handler: async (ctx, { clientId }) => {
    requireClient(clientId);
    return ctx.db
      .query("agentRuns")
      .withIndex("by_client", (q) => q.eq("clientId", clientId))
      .order("desc")
      .take(50);
  },
});
export const cancel = mutation({
  args: { runId: v.id("agentRuns"), clientId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.runId);
    if (!row || row.clientId !== args.clientId) return false;
    if (row.status === "queued" || row.status === "running")
      await ctx.db.patch(row._id, {
        status: "cancelled",
        reply: safeReply("Cancelled."),
        error: null,
      });
    return true;
  },
});
export const read = internalQuery({
  args: { runId: v.id("agentRuns") },
  handler: (ctx, { runId }) => ctx.db.get(runId),
});
export const claim = internalMutation({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, { runId }) => {
    const row = await ctx.db.get(runId);
    if (row?.status !== "queued") return null;
    let spendDay = row.spendDay;
    if (
      settings.ANTHROPIC_API_KEY &&
      classifyHint(row.text) === null &&
      spendDay !== new Date(Date.now()).toISOString().slice(0, 10)
    ) {
      try {
        spendDay = await reserveSpend(ctx, row.text, Date.now());
      } catch {
        await ctx.db.patch(runId, {
          status: "failed",
          reply: safeReply("The assistant daily run limit has been reached."),
          error: "DAILY_LIMIT",
        });
        return null;
      }
    }
    await ctx.db.patch(runId, {
      status: "running",
      ...(spendDay ? { spendDay } : {}),
    });
    return { ...row, status: "running" as const };
  },
});
export const appendStep = internalMutation({
  args: { runId: v.id("agentRuns"), step: vAgentStep },
  handler: async (ctx, { runId, step }) => {
    const row = await ctx.db.get(runId);
    if (row?.status === "running" && !row.steps.some((s) => s.id === step.id))
      await ctx.db.patch(runId, { steps: [...row.steps, step] });
    return null;
  },
});
export const setAgent = internalMutation({
  args: { runId: v.id("agentRuns"), agent: v.string() },
  handler: async (ctx, { runId, agent }) => {
    const row = await ctx.db.get(runId);
    if (row?.status === "running") await ctx.db.patch(runId, { agent });
    return null;
  },
});
export const finish = internalMutation({
  args: {
    runId: v.id("agentRuns"),
    reply: v.string(),
    agent: v.string(),
    error: v.union(v.string(), v.null()),
  },
  handler: async (ctx, { runId, reply, agent, error }) => {
    const row = await ctx.db.get(runId);
    // The Guard is applied at the final persistence boundary as well as the loop.
    // A fixed medical refusal must be stored verbatim, without checking it again.
    if (row?.status === "running")
      await ctx.db.patch(runId, {
        status: error === "AGENT_ERROR" ? "failed" : "done",
        reply: reply === MEDICAL_REFUSAL ? MEDICAL_REFUSAL : safeReply(reply),
        agent,
        error,
      });
    return null;
  },
});
export const run = internalAction({
  args: { runId: v.id("agentRuns") },
  handler: async (ctx, { runId }) => {
    const row = await ctx.runMutation(claimRef, { runId });
    if (!row) return null;
    try {
      const scope = noteScope(row);
      const sessionNotes = scope ? await ctx.runQuery(latestNotesRef, { scope }) : null;
      const result = await runLoop(
        {
          runId,
          sessionNotes,
          text: row.text,
          page: row.page,
          jobId: row.jobId,
          availableTools: row.availableTools,
          snapshot: row.snapshot,
          history: row.history,
        },
        {
          client: settings.ANTHROPIC_API_KEY
            ? createClaudeClient(settings.ANTHROPIC_API_KEY)
            : undefined,
          openMcp: () => openAgentMcp(ctx, row.clientId, runId),
          active: async () =>
            (await ctx.runQuery(readRef, { runId }))?.status === "running",
          step: async (step) => {
            await ctx.runMutation(stepRef, { runId, step });
          },
          handoff: async (agent) => {
            await ctx.runMutation(handoffRef, { runId, agent });
          },
        },
      );
      if (result) {
        await ctx.runMutation(finishRef, { runId, ...result });
        // Scribe note-taker (#60): debounced, never blocks or fails the run.
        if (scope && settings.ANTHROPIC_API_KEY)
          await ctx.runMutation(scheduleNotesRef, { scope }).catch(() => null);
      }
    } catch {
      await ctx.runMutation(finishRef, {
        runId,
        reply: safeReply(NO_KEY),
        agent: "Router",
        error: "AGENT_ERROR",
      });
    }
    return null;
  },
});
