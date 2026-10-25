/**
 * Scribe live note-taker (#60, agent side).
 *
 * Scope: a run verified as a session member (agent.ask got a matching
 * participantToken for a session reviewing the run's job) shares ONE note per
 * session; every other run keeps a private note per clientId+jobId and never
 * reads session chat. After each finished run `schedule` (debounced to one
 * update per 60 s per scope) queues `update`, which folds the events since the
 * last note into a new `sessionSummaries` version. When `sessions.end` runs it
 * schedules `finalizeSession`, which writes one final version covering the
 * whole meeting regardless of the debounce window. No API key means no
 * summary: nothing is read, reserved or written.
 *
 * Everything here is internal except `forSession` (member read). The same core
 * (`runNotes`) serves the MCP `summarize` tool.
 */
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  query,
  type ActionCtx,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { createClaudeClient, type ClaudeClient } from "./agent/anthropic";
import { acceptItems, generateFinal, generateNote, ITEM_MAX_CHARS, type FinalParts } from "./agent/scribe";
import { reserveDailyRun } from "./agent";
import { requireParticipant } from "./lib/auth";
import { TICK_MS } from "./transcript";
import { appError } from "./lib/errors";
import { insertSummary, latestSummary, type SummaryScope } from "./lib/summaries";
import { allowedNumbers, composeFinalSummary, type FinalFacts } from "./lib/finalSummary";
import { readExportReport } from "./lib/exportReport";
import { loadExportScreenshots } from "./lib/exportScreenshots";

export const NOTES_DEBOUNCE_MS = 60_000;
const MAX_RUNS = 20;
const MAX_MESSAGES = 50;
const MAX_ANNOTATIONS = 30;
const MAX_SEGMENTS = 60;
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

const settings = env as typeof env & { ANTHROPIC_API_KEY?: string };

const vScope = v.union(
  v.object({ kind: v.literal("client"), clientId: v.string(), jobId: v.string() }),
  v.object({ kind: v.literal("session"), sessionId: v.id("sessions"), jobId: v.string() }),
);
const scopeKey = (s: SummaryScope) =>
  s.kind === "client" ? `client:${s.clientId}:${s.jobId}` : `session:${s.sessionId}:${s.jobId}`;

type Collected = { events: unknown; coversUpTo: number; count: number; humanText: string[] };

/** Read-only gathering of everything newer than `since`, bounded and truncated. */
async function collect(
  ctx: QueryCtx,
  scope: SummaryScope,
  since: number,
  endedAt?: number,
): Promise<Collected> {
  let cap = Number.POSITIVE_INFINITY; // never cover past a run that is still going
  let latest = since;
  const seen = (t: number) => {
    if (t > latest) latest = t;
  };

  const runs: unknown[] = [];
  const rows =
    scope.kind === "client"
      ? await ctx.db
          .query("agentRuns")
          .withIndex("by_client", (q) => q.eq("clientId", scope.clientId))
          .order("desc")
          .take(100)
      : await ctx.db
          .query("agentRuns")
          .withIndex("by_session", (q) => q.eq("sessionId", scope.sessionId))
          .order("desc")
          .take(100);
  const fresh = rows
    .filter((r) => r.createdAt > since)
    .filter((r) =>
      scope.kind === "client"
        ? r.jobId === scope.jobId && !r.sessionVerified // verified runs belong to the session note
        : r.sessionVerified === true && r.jobId === scope.jobId,
    )
    .reverse();
  for (const r of fresh) {
    if (r.status === "queued" || r.status === "running") {
      cap = Math.min(cap, r.createdAt - 1);
      continue;
    }
    if (r.status === "cancelled") continue;
    if (runs.length >= MAX_RUNS) break;
    seen(r.createdAt);
    runs.push({
      at: r.createdAt,
      page: r.page,
      participant: r.sessionParticipantId ?? null,
      user_text: clip(r.text, 500),
      reply: clip(r.reply, 500),
      agent: r.agent,
      tool_steps: r.steps.slice(0, 10).map((s) => ({ tool: s.tool, ok: s.ok, message: clip(s.message, 120) })),
    });
  }

  // Human chat and notes: session scope only, read-only.
  const chat: unknown[] = [];
  const notes: unknown[] = [];
  const transcript: unknown[] = [];
  const humanText: string[] = [];
  if (scope.kind === "session") {
    const sid = scope.sessionId;
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_session_time", (q) => q.eq("sessionId", sid).gt("createdAt", since))
      .take(MAX_MESSAGES);
    for (const m of messages) {
      if (m.jobId !== scope.jobId) continue;
      seen(m.createdAt);
      chat.push({ at: m.createdAt, author: m.author, name: clip(m.authorName, 60), text: clip(m.text, 400) });
    }
    const annotations = await ctx.db
      .query("annotations")
      .withIndex("by_session", (q) => q.eq("sessionId", sid))
      .collect();
    for (const a of annotations) {
      if (a.jobId !== scope.jobId || a.status === "dismissed" || a.createdAt <= since) continue;
      if (notes.length >= MAX_ANNOTATIONS) break;
      seen(a.createdAt);
      notes.push({ at: a.createdAt, author: a.author, status: a.status, anchor: a.anchor.kind, text: clip(a.text, 280) });
    }
  }

  if (scope.kind === "session") {
    // Finalization stamps endedAt, so a long-lived interim row is never skipped by the watermark.
    const sid = scope.sessionId;
    const rows = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_session_end", (q) => q.eq("sessionId", sid).gt("endedAt", since))
      .filter((q) => q.neq(q.field("final"), false))
      .take(200);
    const fresh = rows
      .filter((x) => x.final !== false && x.jobId === scope.jobId && x.endedAt > since)
      .sort((a, b) => a.endedAt - b.endedAt)
      .slice(0, MAX_SEGMENTS);
    for (const x of fresh) {
      seen(x.endedAt);
      transcript.push({ at: x.endedAt, speaker: clip(x.speakerName, 60), text: clip(x.text, 500) });
      humanText.push(clip(x.text, 500));
    }
  }

  const count = runs.length + chat.length + notes.length + transcript.length;
  // The final summary covers the whole meeting up to the end time.
  const coversUpTo = endedAt !== undefined ? Math.max(endedAt, latest) : Math.min(latest, cap);
  return {
    events: { runs, session_chat: chat, annotations: notes, transcript },
    coversUpTo,
    count: coversUpTo > since ? count : 0,
    humanText,
  };
}

async function sessionEnd(ctx: QueryCtx, scope: SummaryScope): Promise<number | undefined> {
  if (scope.kind !== "session") return undefined;
  const session = await ctx.db.get(scope.sessionId);
  return session?.status === "ended" ? session.updatedAt : undefined;
}

/** Everything the model call needs, plus the daily reservation (taken only if useful). */
export const prepare = internalMutation({
  args: { scope: vScope, clearPending: v.boolean(), final: v.boolean() },
  handler: async (ctx, { scope, clearPending, final }) => {
    if (clearPending) {
      const state = await ctx.db
        .query("scribeNotesState")
        .withIndex("by_scope", (q) => q.eq("scopeKey", scopeKey(scope)))
        .unique();
      if (state?.pending) await ctx.db.patch(state._id, { pending: false });
    }
    const previous = await latestSummary(ctx, scope);
    const base = { previous: previous?.text ?? null, version: previous?.version ?? 0 };
    const endedAt = final ? await sessionEnd(ctx, scope) : undefined;
    if (final && endedAt === undefined) return { status: "empty" as const, ...base };
    if (final && previous && previous.coversUpTo >= endedAt!) return { status: "empty" as const, ...base }; // written once
    const { events, coversUpTo, count, humanText } = await collect(ctx, scope, previous?.coversUpTo ?? 0, endedAt);
    if (final) {
      // The final summary is composed even when nothing is new; only new events need the model.
      if (count === 0) return { status: "ready" as const, ...base, events, coversUpTo: endedAt!, humanText, modelNeeded: false };
    } else if (count === 0) return { status: "empty" as const, ...base };
    try {
      await reserveDailyRun(ctx, Date.now());
    } catch {
      return { status: "limit" as const, ...base };
    }
    return { status: "ready" as const, ...base, events, coversUpTo, humanText, modelNeeded: true };
  },
});

export const write = internalMutation({
  args: { scope: vScope, text: v.string(), coversUpTo: v.number() },
  handler: async (ctx, { scope, text, coversUpTo }) => {
    const previous = await latestSummary(ctx, scope);
    if (previous && previous.coversUpTo >= coversUpTo) return { version: previous.version, written: false };
    const { version } = await insertSummary(ctx, scope, { text, coversUpTo });
    return { version, written: true };
  },
});

export const latestText = internalQuery({
  args: { scope: vScope },
  handler: async (ctx, { scope }) => (await latestSummary(ctx, scope))?.text ?? null,
});

export const readLatest = internalQuery({
  args: { scope: vScope },
  handler: async (ctx, { scope }) => {
    const row = await latestSummary(ctx, scope);
    return row ? { text: row.text, version: row.version, coversUpTo: row.coversUpTo } : null;
  },
});

/** Capability check for the MCP tool: a member of a session that reviews `jobId` (ended sessions allowed). */
export const authorizeSession = internalQuery({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), jobId: v.string() },
  handler: async (ctx, args) => {
    const participant = await requireParticipant(ctx, args.participantToken);
    if (participant.sessionId !== args.sessionId)
      throw appError("NOT_A_MEMBER", "You are not a member of that review session.");
    const session = await ctx.db.get(args.sessionId);
    const scan = session ? await ctx.db.get(session.scanId) : null;
    if (!scan || scan.jobId !== args.jobId) throw appError("NOT_A_MEMBER", "The session does not review this case.");
    return null;
  },
});

/**
 * Latest (or final) meeting note for a member. Works after the session ended:
 * membership is the token's participant row, not an active session.
 */
export const forSession = query({
  args: { sessionId: v.id("sessions"), participantToken: v.string() },
  handler: async (ctx, args) => {
    const participant = await requireParticipant(ctx, args.participantToken);
    if (participant.sessionId !== args.sessionId)
      throw appError("NOT_A_MEMBER", "You are not a member of that review session.");
    const session = await ctx.db.get(args.sessionId);
    const scan = session ? await ctx.db.get(session.scanId) : null;
    if (!session || !scan) throw appError("NOT_FOUND", "That review session does not exist.");
    const row = await latestSummary(ctx, { kind: "session", sessionId: session._id, jobId: scan.jobId });
    // The newest export of the session (auto at the end, or a member's manual one), failed included so the panel can offer a retry.
    const latestExport = await ctx.db.query("exports").withIndex("by_session", (q) => q.eq("sessionId", session._id)).order("desc").first();
    const exportInfo = latestExport
      ? { exportId: latestExport._id, version: latestExport.version, status: latestExport.status, trigger: latestExport.trigger,
          url: latestExport.fileId ? await ctx.storage.getUrl(latestExport.fileId) : null }
      : null;
    if (!row && !exportInfo) return null;
    return {
      text: row?.text ?? null,
      version: row?.version ?? 0,
      // Derived, not stored: the final note is the one covering the session's end time.
      isFinal: !!row && session.status === "ended" && row.coversUpTo >= session.updatedAt,
      coversUpTo: row?.coversUpTo ?? 0,
      authorName: row?.authorName ?? null,
      author: row?.author ?? null,
      // Members only (this query is gated above): ordered screenshots and the auto export link.
      screenshots: await loadExportScreenshots(ctx, session._id, scan.jobId),
      export: exportInfo,
    };
  },
});

export const sessionJob = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    const scan = session ? await ctx.db.get(session.scanId) : null;
    return scan ? scan.jobId : null;
  },
});

type Ctx = Pick<ActionCtx, "runMutation" | "runQuery">;
export type NotesResult = {
  status: "updated" | "unchanged" | "no_key" | "limit" | "unusable";
  version: number;
  text: string | null;
};
type Prep = {
  status: "empty" | "limit" | "ready";
  previous: string | null;
  version: number;
  events?: unknown;
  coversUpTo?: number;
  humanText?: string[];
  modelNeeded?: boolean;
};
const prepareRef = makeFunctionReference<"mutation", { scope: SummaryScope; clearPending: boolean; final: boolean }, Prep>("notes:prepare");
const writeRef = makeFunctionReference<"mutation", { scope: SummaryScope; text: string; coversUpTo: number }, { version: number; written: boolean }>("notes:write");
const readRef = makeFunctionReference<"query", { scope: SummaryScope }, { text: string; version: number } | null>("notes:readLatest");
const updateRef = makeFunctionReference<"action", { scope: SummaryScope }, null>("notes:update");
const clearPendingRef = makeFunctionReference<"mutation", { scope: SummaryScope }, null>("notes:clearPending");

/**
 * Shared core. No client (no API key) means nothing is read, reserved or
 * written. A model failure or a Guard-rejected note leaves the old note.
 */
export async function runNotes(
  ctx: Ctx,
  scope: SummaryScope,
  client: ClaudeClient | undefined,
  opts: { clearPending?: boolean; final?: boolean } = {},
): Promise<NotesResult> {
  if (!client) {
    const cur = await ctx.runQuery(readRef, { scope });
    return { status: "no_key", version: cur?.version ?? 0, text: cur?.text ?? null };
  }
  if (opts.final && scope.kind === "session") return runFinal(ctx, scope, client);
  const prep = await ctx.runMutation(prepareRef, {
    scope,
    clearPending: opts.clearPending ?? false,
    final: false,
  });
  if (prep.status !== "ready")
    return { status: prep.status === "limit" ? "limit" : "unchanged", version: prep.version, text: prep.previous };
  let text: string | null = null;
  try {
    text = await generateNote(client, { previous: prep.previous, events: prep.events, humanText: prep.humanText });
  } catch {
    text = null;
  }
  if (!text) return { status: "unusable", version: prep.version, text: prep.previous };
  const written = await ctx.runMutation(writeRef, {
    scope,
    text,
    coversUpTo: prep.coversUpTo!,
  });
  return { status: written.written ? "updated" : "unchanged", version: written.version, text };
}

const finalFactsRef = makeFunctionReference<"query", { sessionId: Id<"sessions"> }, Omit<FinalFacts, "report"> | null>("notes:finalFacts");

/** Who attended and what was asked: plain database facts for the final summary (no model). */
export const finalFacts = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const session = await ctx.db.get(sessionId);
    const scan = session ? await ctx.db.get(session.scanId) : null;
    if (!session || !scan) return null;
    const people = await ctx.db.query("sessionParticipants").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).take(50);
    const nameOf = new Map(people.map((p) => [p._id, p.displayName]));
    const asked: { at: number; who: string; text: string }[] = [];
    const runs = await ctx.db.query("agentRuns").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).take(100);
    for (const r of runs) {
      if (!r.sessionVerified || r.jobId !== scan.jobId || r.status === "cancelled") continue;
      asked.push({ at: r.createdAt, who: (r.sessionParticipantId && nameOf.get(r.sessionParticipantId)) || "A participant", text: r.text });
    }
    const messages = await ctx.db.query("messages").withIndex("by_session_time", (q) => q.eq("sessionId", sessionId)).take(200);
    for (const m of messages) {
      if (m.jobId === scan.jobId && m.role === "user" && m.author === "human" && m.text.includes("?"))
        asked.push({ at: m.createdAt, who: m.authorName, text: m.text });
    }
    asked.sort((a, b) => a.at - b.at);
    return {
      attendees: [...people].sort((a, b) => a.joinedAt - b.joinedAt).map((p) => ({ name: p.displayName, role: p.role })),
      questions: asked.slice(0, 10).map(({ who, text }) => ({ who, text })),
    };
  },
});

/**
 * Final meeting summary (#138). Code writes attendees, key findings (report.json
 * only) and questions; Opus (MODEL) supplies only the timeline and action items,
 * each Guard-checked and number-checked. Written once (prepare refuses a second).
 */
async function runFinal(
  ctx: Ctx,
  scope: Extract<SummaryScope, { kind: "session" }>,
  client: ClaudeClient,
): Promise<NotesResult> {
  const prep = await ctx.runMutation(prepareRef, { scope, clearPending: false, final: true });
  if (prep.status !== "ready")
    return { status: prep.status === "limit" ? "limit" : "unchanged", version: prep.version, text: prep.previous };
  const facts = await ctx.runQuery(finalFactsRef, { sessionId: scope.sessionId });
  if (!facts) return { status: "unchanged", version: prep.version, text: prep.previous };
  const report = await readExportReport(scope.jobId).catch(() => null);
  const numbers = allowedNumbers(report);
  let ai: FinalParts | null;
  if (prep.modelNeeded) {
    try {
      ai = await generateFinal(client, { previous: prep.previous, events: prep.events, humanText: prep.humanText, allowedNumbers: numbers });
    } catch {
      ai = null;
    }
  } else {
    // Nothing new since the last running note: it is the timeline, if it passes the same checks.
    const kept = prep.previous
      ? acceptItems([prep.previous.slice(0, ITEM_MAX_CHARS)], { previous: prep.previous, humanText: [], events: null, allowedNumbers: numbers }, 1)
      : [];
    ai = { timeline: kept, actionItems: [] };
  }
  if (!ai) return { status: "unusable", version: prep.version, text: prep.previous };
  const text = composeFinalSummary({ ...facts, report }, ai);
  const written = await ctx.runMutation(writeRef, { scope, text, coversUpTo: prep.coversUpTo! });
  return { status: written.written ? "updated" : "unchanged", version: written.version, text };
}

/** The Claude client, or undefined without a key (tests spy on createClaudeClient). */
export const notesClient = () =>
  settings.ANTHROPIC_API_KEY ? createClaudeClient(settings.ANTHROPIC_API_KEY) : undefined;

export const update = internalAction({
  args: { scope: vScope },
  handler: async (ctx, { scope }) => {
    const client = notesClient();
    if (!client) {
      await ctx.runMutation(clearPendingRef, { scope });
      return null;
    }
    await runNotes(ctx, scope, client, { clearPending: true });
    return null;
  },
});

export const clearPending = internalMutation({
  args: { scope: vScope },
  handler: async (ctx, { scope }) => {
    const state = await ctx.db
      .query("scribeNotesState")
      .withIndex("by_scope", (q) => q.eq("scopeKey", scopeKey(scope)))
      .unique();
    if (state?.pending) await ctx.db.patch(state._id, { pending: false });
    return null;
  },
});

const autoReserveRef = makeFunctionReference<"mutation", { sessionId: Id<"sessions"> }, Id<"exports"> | null>("exportDoc:autoReserve");
const buildExportRef = makeFunctionReference<"action", { exportId: Id<"exports"> }, unknown>("exportDoc:build");

/**
 * Scheduled once by sessions.end (server-side trigger, no token). With a key it
 * writes the final summary; with or without one it then builds the automatic
 * Markdown export (T4a), once per session. Without a key the export carries the
 * transcript and screenshots plus a "summary unavailable" line.
 */
export const finalizeSession = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }) => {
    const jobId = await ctx.runQuery(sessionJobRef, { sessionId });
    if (!jobId) return null;
    const client = notesClient();
    if (client) {
      try {
        await runNotes(ctx, { kind: "session", sessionId, jobId }, client, { final: true });
      } catch {
        // The export below must still happen.
      }
    }
    const exportId = await ctx.runMutation(autoReserveRef, { sessionId });
    if (exportId) await ctx.runAction(buildExportRef, { exportId }).catch(() => null);
    return null;
  },
});
const sessionJobRef = makeFunctionReference<"query", { sessionId: Id<"sessions"> }, string | null>("notes:sessionJob");

/**
 * Debounce: at most one update per scope per 60 s. A finish inside the window
 * books a single trailing update at lastRunAt + 60 s; further finishes while
 * one is pending add nothing (that update picks them up).
 */
async function scheduleScope(ctx: MutationCtx, scope: SummaryScope): Promise<null> {
  if (!settings.ANTHROPIC_API_KEY) return null; // no key: skip silently
  const now = Date.now();
  const key = scopeKey(scope);
  const state = await ctx.db
    .query("scribeNotesState")
    .withIndex("by_scope", (q) => q.eq("scopeKey", key))
    .unique();
  if (state?.pending) return null;
  const due = Math.max(now, (state?.lastRunAt ?? 0) + NOTES_DEBOUNCE_MS);
  if (state) await ctx.db.patch(state._id, { lastRunAt: due, pending: true });
  else await ctx.db.insert("scribeNotesState", { scopeKey: key, lastRunAt: due, pending: true });
  await ctx.scheduler.runAfter(due - now, updateRef, { scope });
  return null;
}

export const schedule = internalMutation({
  args: { scope: vScope },
  handler: async (ctx, { scope }) => scheduleScope(ctx, scope),
});

const tickRef = makeFunctionReference<"mutation", { sessionId: Id<"sessions">; at: number }, null>("notes:tick");

/**
 * Live cadence (#136): while the meeting is active and the host has
 * transcription on, ask for a notes update about every minute. It goes through
 * the same debounce as every other trigger, and an update with nothing new
 * makes no model call. A tick that no longer matches the settings row (turned
 * off, restarted, session ended, no key) simply ends the chain.
 */
export const tick = internalMutation({
  args: { sessionId: v.id("sessions"), at: v.number() },
  handler: async (ctx, { sessionId, at }) => {
    const row = await ctx.db
      .query("transcriptSettings")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .unique();
    if (!row || !row.enabled || row.tickAt !== at || !settings.ANTHROPIC_API_KEY) return null;
    const session = await ctx.db.get(sessionId);
    const scan = session ? await ctx.db.get(session.scanId) : null;
    if (!session || session.status === "ended" || !scan) return null;
    await scheduleScope(ctx, { kind: "session", sessionId, jobId: scan.jobId });
    const next = Date.now() + TICK_MS;
    await ctx.db.patch(row._id, { tickAt: next });
    await ctx.scheduler.runAfter(TICK_MS, tickRef, { sessionId, at: next });
    return null;
  },
});
