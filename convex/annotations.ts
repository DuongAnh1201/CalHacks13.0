/**
 * Session annotations (Phase 2): the human side of the shared `annotations`
 * table (#56).
 *
 * WHAT LIVES HERE
 * ---------------
 *   annotations.create   public mutation  a member pins a note to the scan
 *   annotations.list     public query     the session's notes, reactive
 *   annotations.remove   public mutation  author or host deletes a note
 *   annotations.reply / removeReply       member replies, author or host removes
 *   annotations.resolve / unresolve       author or host closes or reopens
 *
 * ANCHORS (#56 contract, not BACKEND_CONTEXT's voxel {i,j,k})
 * ------------------------------------------------------------
 *   { kind: "point", ras_mm }   a position in RAS millimetres
 *   { kind: "structure", id }   a resolved atlas structure id
 *   { kind: "tumor" }           the scan's segmented tumor
 *
 * A point is stored exactly as sent, in RAS mm, so it stays anchored to the
 * anatomy whatever camera or device views it. It is validated by mapping it
 * through the scan's affine into voxel space and bounds-checking that voxel.
 *
 * KNOWN LIMIT: the seeded sample scan has a placeholder affine (seed.ts), so
 * its RAS mm do not yet match the real NIfTI header. Points are internally
 * consistent across clients, but will shift once M4 publishes the real affine.
 *
 * Agent-authored notes and the D10 Accept/Dismiss transition are not here: the
 * agent side writes `suggested` rows itself, and Accept/Dismiss is a follow-up.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { annotationFor, authorFor, type ResolvedCaller } from "./lib/author";
import { appError } from "./lib/errors";
import { isVoxelInBounds, rasMmToVoxel, type Vec3 } from "./lib/transform";
import { vAnnotationAnchor } from "./schema";
import { loadScan } from "./scans";

/** #56 contract: the shared insert path enforces this cap (docs/CONVEX_BACKEND.md §9). */
export const MAX_ANNOTATION_LENGTH = 280;

/** Upper bound on a structure id. Atlas ids are short; this only stops abuse. */
export const MAX_STRUCTURE_ID_LENGTH = 64;

/**
 * Per-session cap. It keeps `list` a bounded read without pagination: every
 * marker has to be on screen at once, so the client wants the whole set, and
 * the cap is what makes "the whole set" safe (guardrail 8).
 */
export const MAX_ANNOTATIONS_PER_SESSION = 200;

export const MAX_REPLY_LENGTH = 1000;
export const MAX_REPLIES_PER_THREAD = 100;

export type PublicReply = { replyId: Id<"annotationReplies">; text: string; author: "human" | "agent"; authorName: string; createdAt: number; canRemove: boolean };

type Anchor = Doc<"annotations">["anchor"];

/** What a client sees for one annotation. */
export type PublicAnnotation = {
  annotationId: Id<"annotations">;
  text: string;
  anchor: Anchor;
  /** D10: agent notes arrive "suggested"; human notes are "accepted". */
  status: "accepted" | "suggested";
  author: "human" | "agent";
  /** Untrusted display label. Never use it for identity or permission. */
  authorName: string;
  createdAt: number;
  /** Whether the CALLER may remove it, so the UI can show or hide the button. */
  canRemove: boolean;
  resolvedAt: number | null;
  canResolve: boolean;
  replies: PublicReply[];
};

/**
 * Pins a note to the scan.
 *
 * Any member may annotate, host or viewer: annotating is not presenter control
 * (BACKEND_CONTEXT §7). The note is attributed to the server-resolved
 * participant and starts `accepted` because the writer is a human (D10).
 */
export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    text: v.string(),
    anchor: vAnnotationAnchor,
  },
  handler: async (ctx, args): Promise<{ annotationId: Id<"annotations"> }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const annotationId = await insertAnnotation(ctx, {
      session,
      text: args.text,
      anchor: args.anchor,
      caller: { kind: "human", displayName: participant.displayName, source: "ui" },
      authorParticipantId: participant._id,
    });
    return { annotationId };
  },
});

/**
 * Every live annotation in the session, oldest first.
 *
 * Dismissed agent suggestions are left out: D10 dismissal means "do not show".
 */
export const list = query({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
  },
  handler: async (ctx, args): Promise<PublicAnnotation[]> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    return await listLiveAnnotations(ctx, session, participant);
  },
});

/**
 * Deletes an annotation. Allowed for its author, or for the host of the room.
 *
 * Agent-authored rows have no participant author, so only the host may remove
 * them. A note from another session answers NOT_FOUND, not NOT_ALLOWED, so an
 * id from a different room is indistinguishable from a missing one.
 */
export const remove = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    annotationId: v.id("annotations"),
    ifNoReplies: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ removed: true }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const annotation = await ctx.db.get(args.annotationId);
    if (annotation === null || annotation.sessionId !== session._id) {
      throw appError("NOT_FOUND", "That annotation does not exist in this session.");
    }

    const isAuthor = annotation.authorParticipantId === participant._id;
    if (!isAuthor && !isSessionHost(session, participant)) {
      throw appError("NOT_ALLOWED", "Only the author or the host can remove this annotation.");
    }

    if (args.ifNoReplies) {
      const any = await ctx.db.query("annotationReplies").withIndex("by_annotation", (q) => q.eq("annotationId", annotation._id)).first();
      if (any) throw appError("STALE", "Others replied; delete it from the thread instead.");
    }
    await deleteReplies(ctx, annotation._id);

    await ctx.db.delete(annotation._id);
    return { removed: true };
  },
});

// ---------------------------------------------------------------------------
// Shared logic (human mutations above and the agent/MCP functions below)
// ---------------------------------------------------------------------------

/**
 * The ONLY write path for new annotation rows: validates text, anchor and the
 * per-session cap, then stamps attribution from a server-resolved caller.
 * Callers must have authenticated before calling this.
 */
export async function insertAnnotation(
  ctx: MutationCtx,
  args: {
    session: Doc<"sessions">;
    text: string;
    anchor: Anchor;
    caller: ResolvedCaller;
    authorParticipantId?: Id<"sessionParticipants">;
  },
): Promise<Id<"annotations">> {
  const { session } = args;
  const scan = await loadScan(ctx, session.scanId);

  const text = args.text.trim();
  if (text.length === 0) {
    throw appError("INVALID_ARGUMENT", "An annotation needs some text.");
  }
  if (text.length > MAX_ANNOTATION_LENGTH) {
    throw appError(
      "INVALID_ARGUMENT",
      `An annotation can be at most ${MAX_ANNOTATION_LENGTH} characters.`,
    );
  }

  const anchor = validateAnchor(scan, args.anchor);

  const existing = await sessionAnnotations(ctx, session._id);
  if (existing.length >= MAX_ANNOTATIONS_PER_SESSION) {
    throw appError(
      "INVALID_ARGUMENT",
      `A session can hold at most ${MAX_ANNOTATIONS_PER_SESSION} annotations. Remove some first.`,
    );
  }

  return await ctx.db.insert("annotations", {
    ...annotationFor(args.caller),
    jobId: scan.jobId,
    sessionId: session._id,
    ...(args.authorParticipantId ? { authorParticipantId: args.authorParticipantId } : {}),
    text,
    anchor,
  });
}

/** Live (not dismissed) notes, oldest first, with `canRemove` for the caller. */
export async function listLiveAnnotations(
  ctx: QueryCtx,
  session: Doc<"sessions">,
  participant: Doc<"sessionParticipants">,
  canRemoveRow: (a: Doc<"annotations">) => boolean = (a) =>
    isSessionHost(session, participant) || a.authorParticipantId === participant._id,
): Promise<PublicAnnotation[]> {
  const rows = await sessionAnnotations(ctx, session._id);
  const replies = await ctx.db.query("annotationReplies").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();
  const host = isSessionHost(session, participant);
  const byThread = new Map<string, PublicReply[]>();
  for (const r of replies.sort((a, b) => a.createdAt - b.createdAt)) {
    const list = byThread.get(r.annotationId) ?? [];
    list.push({ replyId: r._id, text: r.text, author: r.author, authorName: r.authorName, createdAt: r.createdAt,
      canRemove: host || r.authorParticipantId === participant._id });
    byThread.set(r.annotationId, list);
  }

  const out: PublicAnnotation[] = [];
  for (const a of rows) {
    if (a.status === "dismissed") continue;
    out.push({
      annotationId: a._id,
      text: a.text,
      anchor: a.anchor,
      status: a.status,
      author: a.author,
      authorName: a.authorName,
      createdAt: a.createdAt,
      canRemove: canRemoveRow(a),
      resolvedAt: a.resolvedAt ?? null,
      canResolve: host || a.authorParticipantId === participant._id,
      replies: byThread.get(a._id) ?? [],
    });
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

// ---------------------------------------------------------------------------
// Agent side (MCP, #54). Internal only: never callable from a client.
//
// `sessionId` + `participantToken` is the human-issued capability that lets an
// agent act in a room (same rule as export_document); the MCP service token
// alone is not membership. The agent name comes from the authenticated MCP
// adapter, never from tool arguments.
// ---------------------------------------------------------------------------

const vAgentName = v.union(
  v.literal("Claude Desktop"),
  v.literal("Navigator"),
  v.literal("Anatomy tutor"),
  v.literal("Scribe"),
);

/** An agent may only withdraw its own (same name) MCP-authored notes. */
function isOwnAgentNote(a: Doc<"annotations">, agentName: string): boolean {
  return a.author === "agent" && a.source === "mcp" && a.authorName === agentName;
}

export const agentAdd = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    agentName: vAgentName,
    text: v.string(),
    anchor: vAnnotationAnchor,
  },
  handler: async (ctx, args): Promise<{ annotationId: Id<"annotations">; status: "suggested" }> => {
    const { session } = await requireSessionMember(ctx, args);
    const annotationId = await insertAnnotation(ctx, {
      session,
      text: args.text,
      anchor: args.anchor,
      caller: { kind: "agent", name: args.agentName, source: "mcp" },
    });
    return { annotationId, status: "suggested" };
  },
});

export const agentList = internalQuery({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    agentName: vAgentName,
  },
  handler: async (ctx, args): Promise<PublicAnnotation[]> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    return await listLiveAnnotations(ctx, session, participant, (a) => isOwnAgentNote(a, args.agentName));
  },
});

export const agentRemove = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    agentName: vAgentName,
    annotationId: v.id("annotations"),
  },
  handler: async (ctx, args): Promise<{ removed: true }> => {
    const { session } = await requireSessionMember(ctx, args);
    const annotation = await ctx.db.get(args.annotationId);
    if (annotation === null || annotation.sessionId !== session._id) {
      throw appError("NOT_FOUND", "That annotation does not exist in this session.");
    }
    if (!isOwnAgentNote(annotation, args.agentName)) {
      throw appError("NOT_ALLOWED", "An agent can only remove its own notes.");
    }
    await deleteReplies(ctx, annotation._id);
    await ctx.db.delete(annotation._id);
    return { removed: true };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Semantic checks the schema validator cannot express. Returns the anchor to
 * store (a point is narrowed to exactly three numbers).
 */
export function validateAnchor(scan: Doc<"scans">, anchor: Anchor): Anchor {
  switch (anchor.kind) {
    case "point": {
      const p = anchor.ras_mm;
      if (p.length !== 3 || !p.every(Number.isFinite)) {
        throw appError("INVALID_ARGUMENT", "A point must be three finite RAS millimetre values.");
      }
      const point: Vec3 = [p[0], p[1], p[2]];
      // Round to the containing voxel, then bounds-check it. Unrounded voxel
      // coordinates are continuous, so this accepts everything within half a
      // voxel of the outermost voxel centres, i.e. the whole imaged volume.
      const voxel = rasMmToVoxel(scan, point).map(Math.round) as Vec3;
      if (!isVoxelInBounds(scan, voxel)) {
        throw appError("INVALID_ARGUMENT", "That point is outside the scan volume.");
      }
      return { kind: "point", ras_mm: point };
    }
    case "structure": {
      // No atlas registry lives in Convex, so only the shape can be checked
      // here. Resolving the id against the atlas is the caller's job (#56).
      const id = anchor.id.trim();
      if (id.length === 0 || id.length > MAX_STRUCTURE_ID_LENGTH) {
        throw appError("INVALID_ARGUMENT", "That structure id is not valid.");
      }
      return { kind: "structure", id };
    }
    case "tumor": {
      // Same rule as `setTumorVisible` in lib/viewCommands.ts; the "no tumor"
      // wording is shared (SPEC §7.3), the unsegmented one is annotation-specific.
      if (scan.tumor === undefined) {
        throw appError("INVALID_ARGUMENT", "This scan has not been segmented yet.");
      }
      if (!scan.tumor.detected) {
        throw appError("INVALID_ARGUMENT", "No tumor detected in this scan.");
      }
      return { kind: "tumor" };
    }
  }
}

/** Bounded by MAX_ANNOTATIONS_PER_SESSION, so collecting is safe. */
async function sessionAnnotations(
  ctx: QueryCtx,
  sessionId: Id<"sessions">,
): Promise<Doc<"annotations">[]> {
  return await ctx.db
    .query("annotations")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
}

/** Same double check as `requirePresenter`: role AND the session's host pointer. */
export function isSessionHost(session: Doc<"sessions">, participant: Doc<"sessionParticipants">): boolean {
  return participant.role === "host" && session.hostParticipantId === participant._id;
}

async function deleteReplies(ctx: MutationCtx, annotationId: Id<"annotations">) {
  const rows = await ctx.db.query("annotationReplies").withIndex("by_annotation", (q) => q.eq("annotationId", annotationId)).collect();
  for (const r of rows) await ctx.db.delete(r._id);
  return rows.length;
}

async function threadIn(ctx: MutationCtx, session: Doc<"sessions">, annotationId: Id<"annotations">) {
  const a = await ctx.db.get(annotationId);
  if (a === null || a.sessionId !== session._id) throw appError("NOT_FOUND", "That annotation does not exist in this session.");
  return a;
}

export const reply = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), annotationId: v.id("annotations"), text: v.string() },
  handler: async (ctx, args): Promise<{ replyId: Id<"annotationReplies"> }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const a = await threadIn(ctx, session, args.annotationId);
    const text = args.text.trim();
    if (!text) throw appError("INVALID_ARGUMENT", "A reply needs some text.");
    if (text.length > MAX_REPLY_LENGTH) throw appError("INVALID_ARGUMENT", `A reply can be at most ${MAX_REPLY_LENGTH} characters.`);
    const count = (await ctx.db.query("annotationReplies").withIndex("by_annotation", (q) => q.eq("annotationId", a._id)).collect()).length;
    if (count >= MAX_REPLIES_PER_THREAD) throw appError("INVALID_ARGUMENT", `A thread can hold at most ${MAX_REPLIES_PER_THREAD} replies.`);
    const replyId = await ctx.db.insert("annotationReplies", {
      ...authorFor({ kind: "human", displayName: participant.displayName, source: "ui" }),
      sessionId: session._id, annotationId: a._id, authorParticipantId: participant._id, text,
    });
    return { replyId };
  },
});

export const removeReply = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), replyId: v.id("annotationReplies") },
  handler: async (ctx, args): Promise<{ removed: true }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const r = await ctx.db.get(args.replyId);
    if (r === null || r.sessionId !== session._id) throw appError("NOT_FOUND", "That reply does not exist in this session.");
    if (r.authorParticipantId !== participant._id && !isSessionHost(session, participant)) throw appError("NOT_ALLOWED", "Only the author or the host can remove this reply.");
    await ctx.db.delete(r._id);
    return { removed: true };
  },
});

function resolver(resolved: boolean) {
  return mutation({
    args: { sessionId: v.id("sessions"), participantToken: v.string(), annotationId: v.id("annotations") },
    handler: async (ctx, args): Promise<null> => {
      const { session, participant } = await requireSessionMember(ctx, args);
      const a = await threadIn(ctx, session, args.annotationId);
      if (a.authorParticipantId !== participant._id && !isSessionHost(session, participant)) throw appError("NOT_ALLOWED", "Only the author or the host can resolve this.");
      await ctx.db.patch(a._id, resolved ? { resolvedAt: Date.now(), resolvedBy: participant._id } : { resolvedAt: undefined, resolvedBy: undefined });
      return null;
    },
  });
}
export const resolve = resolver(true);
export const unresolve = resolver(false);
