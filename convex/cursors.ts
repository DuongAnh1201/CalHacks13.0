/**
 * cursors — live 3D pointers (spec §1.2). Any member may send its own;
 * the NOT_PRESENTER gate on the shared view is unrelated.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";
import { vVec3 } from "./schema";

const MAX_NODE = 128;
const vCursor = v.union(v.null(), v.object({ node: v.string(), localMm: vVec3 }));
type CursorValue = null | { node: string; localMm: number[] };

export const move = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), cursor: vCursor },
  handler: async (ctx, args): Promise<null> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const c = args.cursor;
    if (c && (c.node.length === 0 || c.node.length > MAX_NODE)) {
      throw appError("INVALID_ARGUMENT", `Node names are 1–${MAX_NODE} characters.`);
    }
    if (c && (c.localMm.length !== 3 || !c.localMm.every(Number.isFinite))) {
      throw appError("INVALID_ARGUMENT", "A cursor point is three finite numbers.");
    }
    const row = await ctx.db
      .query("cursors")
      .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
      .unique();
    const doc = { cursor: c, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, doc);
    else await ctx.db.insert("cursors", { sessionId: session._id, participantId: participant._id, ...doc });
    return null;
  },
});

export const list = query({
  args: { sessionId: v.id("sessions"), participantToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ participantId: Id<"sessionParticipants">; displayName: string; cursor: CursorValue }[]> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const rows = await ctx.db
      .query("cursors")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const out: { participantId: Id<"sessionParticipants">; displayName: string; cursor: CursorValue }[] = [];
    for (const r of rows) {
      if (r.participantId === participant._id) continue;
      const p = await ctx.db.get(r.participantId);
      if (p) out.push({ participantId: r.participantId, displayName: p.displayName, cursor: r.cursor });
    }
    return out;
  },
});
