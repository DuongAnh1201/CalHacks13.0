/**
 * The session whiteboard on /3d: sticky notes, text labels and pen strokes.
 * Comments are not here: they stay in `annotations` (agent tools and export read them).
 * Any member may add or edit; only the author or the host may remove (same rule as notes).
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isSessionHost, MAX_ANNOTATION_LENGTH, validateAnchor } from "./annotations";
import { requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";
import { loadScan } from "./scans";
import { vAnnotationAnchor, vBoardItem, vStickyColor } from "./schema";

export const MAX_BOARD_ITEMS = 500;
export const MAX_STROKES = 300;
export const MAX_STROKE_POINTS = 2000;

type Item = Doc<"boardItems">["item"];
export type PublicBoardItem = {
  itemId: Id<"boardItems">; item: Item; authorName: string; mine: boolean; canRemove: boolean; createdAt: number; updatedAt: number;
};

function validateItem(scan: Doc<"scans">, item: Item): Item {
  if (item.kind === "stroke") {
    const p = item.points;
    if (p.length < 4 || p.length % 2 !== 0 || p.length > MAX_STROKE_POINTS * 2 || !p.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
      throw appError("INVALID_ARGUMENT", `A sketch needs 2 to ${MAX_STROKE_POINTS} points inside the view.`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(item.color)) throw appError("INVALID_ARGUMENT", "That color is not valid.");
    if (!(item.width >= 1 && item.width <= 32)) throw appError("INVALID_ARGUMENT", "Line width must be 1 to 32.");
    const pose = [...item.camera.position, ...item.camera.target];
    if (item.camera.position.length !== 3 || item.camera.target.length !== 3 || !pose.every(Number.isFinite)) {
      throw appError("INVALID_ARGUMENT", "That camera pose is not valid.");
    }
    return item;
  }
  const text = item.text.trim();
  if (!text) throw appError("INVALID_ARGUMENT", "Write something first.");
  if (text.length > MAX_ANNOTATION_LENGTH) throw appError("INVALID_ARGUMENT", `At most ${MAX_ANNOTATION_LENGTH} characters.`);
  return { ...item, text, anchor: validateAnchor(scan, item.anchor) };
}

async function rows(ctx: QueryCtx, sessionId: Id<"sessions">): Promise<Doc<"boardItems">[]> {
  return await ctx.db.query("boardItems").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
}

async function own(ctx: MutationCtx, sessionId: Id<"sessions">, itemId: Id<"boardItems">) {
  const row = await ctx.db.get(itemId);
  if (!row || row.sessionId !== sessionId) throw appError("NOT_FOUND", "That item is not on this board.");
  return row;
}

export const list = query({
  args: { sessionId: v.id("sessions"), participantToken: v.string() },
  handler: async (ctx, args): Promise<PublicBoardItem[]> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const host = isSessionHost(session, participant);
    return (await rows(ctx, session._id)).sort((a, b) => a.createdAt - b.createdAt).map((r) => ({
      itemId: r._id, item: r.item, authorName: r.authorName, createdAt: r.createdAt, updatedAt: r.updatedAt,
      mine: r.authorParticipantId === participant._id, canRemove: host || r.authorParticipantId === participant._id,
    }));
  },
});

export const create = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), item: vBoardItem },
  handler: async (ctx, args): Promise<{ itemId: Id<"boardItems">; updatedAt: number }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const scan = await loadScan(ctx, session.scanId);
    const item = validateItem(scan, args.item);
    const existing = await rows(ctx, session._id);
    if (existing.length >= MAX_BOARD_ITEMS) throw appError("INVALID_ARGUMENT", `Board is full (${MAX_BOARD_ITEMS} items).`);
    if (item.kind === "stroke" && existing.filter((r) => r.item.kind === "stroke").length >= MAX_STROKES) {
      throw appError("INVALID_ARGUMENT", `Too many sketches (${MAX_STROKES}).`);
    }
    const now = Date.now();
    const itemId = await ctx.db.insert("boardItems", {
      sessionId: session._id, jobId: scan.jobId, authorParticipantId: participant._id, authorName: participant.displayName,
      createdAt: now, updatedAt: now, updatedBy: participant._id, item,
    });
    return { itemId, updatedAt: now };
  },
});

export const update = mutation({
  args: {
    sessionId: v.id("sessions"), participantToken: v.string(), itemId: v.id("boardItems"), expectedUpdatedAt: v.number(),
    patch: v.object({ anchor: v.optional(vAnnotationAnchor), text: v.optional(v.string()), color: v.optional(vStickyColor) }),
  },
  handler: async (ctx, args): Promise<{ updatedAt: number }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const row = await own(ctx, session._id, args.itemId);
    if (row.updatedAt !== args.expectedUpdatedAt) throw appError("STALE", "Changed by someone else.");
    if (row.item.kind === "stroke") throw appError("INVALID_ARGUMENT", "Sketches cannot be edited.");
    if (args.patch.color !== undefined && row.item.kind !== "sticky") throw appError("INVALID_ARGUMENT", "Only sticky notes have a color.");
    const item = validateItem(await loadScan(ctx, session.scanId), { ...row.item, ...args.patch } as Item);
    // Strictly increasing, so two edits in one millisecond still look different to undo.
    const updatedAt = Math.max(Date.now(), row.updatedAt + 1);
    await ctx.db.patch(row._id, { item, updatedAt, updatedBy: participant._id });
    return { updatedAt };
  },
});

export const remove = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), itemId: v.id("boardItems"), expectedUpdatedAt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ removed: true }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const row = await own(ctx, session._id, args.itemId);
    if (row.authorParticipantId !== participant._id && !isSessionHost(session, participant)) {
      throw appError("NOT_ALLOWED", "Only the author or the host can remove this.");
    }
    if (args.expectedUpdatedAt !== undefined && row.updatedAt !== args.expectedUpdatedAt) throw appError("STALE", "Changed by someone else.");
    await ctx.db.delete(row._id);
    return { removed: true };
  },
});
