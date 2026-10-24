/**
 * Session annotations (Phase 2): the human side of the shared `annotations`
 * table (#56).
 *
 * WHAT LIVES HERE
 * ---------------
 *   annotations.create   public mutation  a member pins a note to the scan
 *   annotations.list     public query     the session's notes, reactive
 *   annotations.remove   public mutation  author or host deletes a note
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
import { mutation, query, type QueryCtx } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { annotationFor } from "./lib/author";
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

    const annotationId = await ctx.db.insert("annotations", {
      ...annotationFor({ kind: "human", displayName: participant.displayName, source: "ui" }),
      jobId: scan.jobId,
      sessionId: session._id,
      authorParticipantId: participant._id,
      text,
      anchor,
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
    const isHost = isSessionHost(session, participant);

    const rows = await sessionAnnotations(ctx, session._id);
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
        canRemove: isHost || a.authorParticipantId === participant._id,
      });
    }
    out.sort((a, b) => a.createdAt - b.createdAt);
    return out;
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
function validateAnchor(scan: Doc<"scans">, anchor: Anchor): Anchor {
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
function isSessionHost(session: Doc<"sessions">, participant: Doc<"sessionParticipants">): boolean {
  return participant.role === "host" && session.hostParticipantId === participant._id;
}
