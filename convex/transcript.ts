/**
 * Live meeting transcript (#135).
 *
 * Speech-to-text runs in each member's browser (Web Speech API); no audio
 * leaves the device. Only final text segments arrive here. The host switches
 * transcription on or off (one agent-owned settings row per session); nothing
 * is appended while it is off. Segments live in the agent-owned
 * `transcriptSegments` table and are kept until the session is deleted.
 *
 * Capability model as everywhere else: session_id + participant_token is
 * membership. Segment text and speaker names are untrusted data.
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { env, internalQuery, mutation, query, type QueryCtx } from "./_generated/server";
import { makeFunctionReference } from "convex/server";
import { requireParticipant, requirePresenter, requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";
import { loadScan } from "./scans";

export const MAX_SEGMENT_LENGTH = 500;
export const MAX_SEGMENT_MS = 60_000;
export const RATE_LIMIT_PER_MINUTE = 30;
export const DEFAULT_LIST_LIMIT = 100;
export const MAX_LIST_LIMIT = 200;

/** Cadence of the live note updates while transcription is on (#136); same as the debounce. */
export const TICK_MS = 60_000;
const tickRef = makeFunctionReference<"mutation", { sessionId: Id<"sessions">; at: number }, null>("notes:tick");
const hasKey = () => Boolean((env as typeof env & { ANTHROPIC_API_KEY?: string }).ANTHROPIC_API_KEY);

export type PublicSegment = {
  segmentId: Id<"transcriptSegments">;
  participantId: Id<"sessionParticipants">;
  speakerName: string;
  text: string;
  startedAt: number;
  endedAt: number;
};

const toPublic = (d: Doc<"transcriptSegments">): PublicSegment => ({
  segmentId: d._id,
  participantId: d.participantId,
  speakerName: d.speakerName,
  text: d.text,
  startedAt: d.startedAt,
  endedAt: d.endedAt,
});

async function isEnabled(ctx: QueryCtx, sessionId: Id<"sessions">): Promise<boolean> {
  const row = await ctx.db
    .query("transcriptSettings")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .unique();
  return row?.enabled === true;
}

/** Member read that also works after the session ended (the transcript outlives it). */
async function requireMemberRead(ctx: QueryCtx, sessionId: Id<"sessions">, participantToken: string) {
  const participant = await requireParticipant(ctx, participantToken);
  if (participant.sessionId !== sessionId)
    throw appError("NOT_A_MEMBER", "You are not a member of that review session.");
  const session = await ctx.db.get(sessionId);
  if (!session) throw appError("NOT_FOUND", "That review session does not exist.");
  return { session, participant };
}

/** Oldest first, strictly after `after`. Shared by the public query and the MCP tool. */
export async function readSegments(
  ctx: QueryCtx,
  sessionId: Id<"sessions">,
  after: number | undefined,
  limit: number | undefined,
): Promise<{ segments: PublicSegment[]; hasMore: boolean }> {
  const n = Math.max(1, Math.min(Math.floor(limit ?? DEFAULT_LIST_LIMIT), MAX_LIST_LIMIT));
  const rows = await ctx.db
    .query("transcriptSegments")
    .withIndex("by_session_time", (q) =>
      after === undefined ? q.eq("sessionId", sessionId) : q.eq("sessionId", sessionId).gt("startedAt", after),
    )
    .take(n + 1);
  return { segments: rows.slice(0, n).map(toPublic), hasMore: rows.length > n };
}

/**
 * Host only: turn transcription on or off for the session. Turning it on also
 * starts the live Scribe tick (about every 60 s, #136) when an API key exists.
 */
export const setEnabled = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), enabled: v.boolean() },
  handler: async (ctx, args) => {
    await requirePresenter(ctx, args);
    const row = await ctx.db
      .query("transcriptSettings")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .unique();
    const now = Date.now();
    const start = args.enabled && hasKey() && !(row?.enabled && row.tickAt !== undefined);
    const tickAt = start ? now + TICK_MS : args.enabled ? row?.tickAt : undefined;
    const fields = { enabled: args.enabled, updatedAt: now, tickAt };
    if (row) await ctx.db.patch(row._id, fields);
    else await ctx.db.insert("transcriptSettings", { sessionId: args.sessionId, ...fields });
    if (start) await ctx.scheduler.runAfter(TICK_MS, tickRef, { sessionId: args.sessionId, at: tickAt! });
    return { enabled: args.enabled };
  },
});

/** Reactive switch state, so every member's browser knows whether to listen. */
export const state = query({
  args: { sessionId: v.id("sessions"), participantToken: v.string() },
  handler: async (ctx, args) => {
    await requireMemberRead(ctx, args.sessionId, args.participantToken);
    return { enabled: await isEnabled(ctx, args.sessionId) };
  },
});

/**
 * A member posts one final segment of their own speech. The speaker is the
 * token's participant, never an argument. Times are server-stamped (the client
 * only reports how long the utterance lasted), so clock skew cannot matter and
 * `startedAt` stays unique and increasing per session.
 */
export const append = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    text: v.string(),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ segmentId: Id<"transcriptSegments"> }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    if (!(await isEnabled(ctx, session._id)))
      throw appError("NOT_ALLOWED", "Transcription is off. Ask the host to turn it on.");

    const text = args.text.trim();
    if (text.length === 0) throw appError("INVALID_ARGUMENT", "A transcript segment cannot be empty.");
    if (text.length > MAX_SEGMENT_LENGTH)
      throw appError("INVALID_ARGUMENT", `A transcript segment can be at most ${MAX_SEGMENT_LENGTH} characters.`);

    const now = Date.now();
    const recent = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
      .order("desc")
      .take(RATE_LIMIT_PER_MINUTE);
    if (recent.length >= RATE_LIMIT_PER_MINUTE && recent[RATE_LIMIT_PER_MINUTE - 1]._creationTime > now - 60_000)
      throw appError("NOT_ALLOWED", "Too many transcript segments. Slow down.");

    const duration = Number.isFinite(args.durationMs) ? Math.min(Math.max(args.durationMs ?? 0, 0), MAX_SEGMENT_MS) : 0;
    const last = await ctx.db
      .query("transcriptSegments")
      .withIndex("by_session_time", (q) => q.eq("sessionId", session._id))
      .order("desc")
      .first();
    const startedAt = Math.max(now - duration, last ? last.startedAt + 1 : 0);
    const scan = await loadScan(ctx, session.scanId);
    const segmentId = await ctx.db.insert("transcriptSegments", {
      sessionId: session._id,
      jobId: scan.jobId,
      participantId: participant._id,
      speakerName: participant.displayName,
      text,
      startedAt,
      endedAt: Math.max(now, startedAt),
    });
    return { segmentId };
  },
});

/** Live query for the Transcript tab: oldest first, strictly after `after` (a startedAt). */
export const list = query({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    after: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireMemberRead(ctx, args.sessionId, args.participantToken);
    return await readSegments(ctx, args.sessionId, args.after, args.limit);
  },
});

/** Capability check + read for the MCP tool: member of a session that reviews `jobId`. */
export const readForMcp = internalQuery({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    jobId: v.string(),
    after: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { session } = await requireMemberRead(ctx, args.sessionId, args.participantToken);
    const scan = await ctx.db.get(session.scanId);
    if (!scan || scan.jobId !== args.jobId) throw appError("NOT_A_MEMBER", "The session does not review this case.");
    return { ...(await readSegments(ctx, args.sessionId, args.after, args.limit)), enabled: await isEnabled(ctx, args.sessionId) };
  },
});
