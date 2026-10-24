/**
 * sessionParticipants — the membership roster
 * ===========================================
 *
 * MEMBERSHIP IS NOT PRESENCE. This is the distinction BACKEND_CONTEXT §5 calls
 * out twice ("Never conflate historical membership with active presence"), so it
 * is worth being blunt about:
 *
 *   MEMBERSHIP (this table, Phase 1)
 *     "These people are members of this room and hold these permissions."
 *     Durable. Survives a refresh, a closed lid, and a flat phone battery.
 *     A row appearing here is the answer to "may this token do things?".
 *
 *   PRESENCE (Phase 3, not built)
 *     "These people have a browser tab open right now."
 *     Ephemeral, needs a heartbeat and an expiry, and is allowed to be a little
 *     wrong for a few seconds.
 *
 * Rendering this roster as a list of green "online" dots would be a lie — a
 * participant who closed their laptop is still a member. The UI should label it
 * as who has joined, until Phase 3 adds real presence on top.
 *
 * The `lastSeenAt` column on the table is the seed of that future work and is
 * untouched in Phase 1.
 */

import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  requireSessionMember,
  toPublicParticipant,
  type PublicParticipant,
} from "./lib/auth";

/**
 * The roster for a session, oldest joiner first (so the host is first).
 *
 * WHY THIS EXISTS SEPARATELY FROM `sessions.get`, which already returns the same
 * list: a component that only renders the roster can subscribe to just this,
 * and then it re-renders when somebody joins but NOT every time the presenter
 * nudges a slice. Convex re-runs a query when the rows that query read change,
 * so a narrower query means fewer re-renders. Both are correct; pick whichever
 * matches what the component actually displays.
 *
 * Tokens are stripped by `toPublicParticipant` — see the note there about why
 * every participant read goes through that one projection.
 */
export const list = query({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
  },
  handler: async (ctx, args): Promise<PublicParticipant[]> => {
    // Authorize first: the roster tells you who is in the room, which is not
    // public information. A caller must already be a member to read it.
    await requireSessionMember(ctx, args);

    const rows = await ctx.db
      .query("sessionParticipants")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    rows.sort((a, b) => a.joinedAt - b.joinedAt);
    return rows.map(toPublicParticipant);
  },
});
