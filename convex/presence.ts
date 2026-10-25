/**
 * Online presence (Phase 3): who has a tab open in a review session right now.
 *
 * WHAT LIVES HERE
 * ---------------
 *   presence.heartbeat    public mutation  "I am still here" (every ~10 s)
 *   presence.list         public query     who is online, reactive
 *   presence.disconnect   public mutation  "I closed the tab"
 *
 * These are thin, authorized wrappers around the official Convex Presence
 * component (@convex-dev/presence). The component keeps presence in its own
 * tables and only notifies subscribers when someone comes online or drops off,
 * not on every heartbeat. A hand-rolled `lastSeenAt` write on the participant
 * row would instead re-run `sessions.get` (which reads the roster) for every
 * client on every heartbeat.
 *
 * MEMBERSHIP IS NOT PRESENCE (docs/CONVEX_BACKEND.md §3.7)
 * --------------------------------------------------------
 * `sessionParticipants` says who joined; this says who is online. The roster
 * from `sessions.get` / `sessionParticipants.list` is unchanged, and the
 * frontend joins the two on `participantId`.
 *
 * FRONTEND USAGE — the argument mapping is deliberate
 * ---------------------------------------------------
 *   usePresence(api.presence, sessionId, participantToken)
 *
 * The component's React hook has a fixed signature: (roomId, userId). We pass
 * the session id as the room and the participant TOKEN as the "userId", because
 * the hook offers no other channel for a credential. `heartbeat` resolves that
 * token on the server and registers the participant under their public
 * `participantId`, so the token is never stored in, or returned from, the
 * component. `list` therefore reports `userId: participantId`.
 *
 * File name and `disconnect` are fixed by the hook: on tab close it posts
 * `presence:disconnect` with `navigator.sendBeacon`.
 */

import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireActiveSession, requireParticipant } from "./lib/auth";
import { appError } from "./lib/errors";

const presence = new Presence(components.presence);

/**
 * Bounds on the client-chosen heartbeat interval. The component times a client
 * out after 2.5x its interval, so an unbounded value would let a client stay
 * "online" for hours after leaving. The hook's default is 10 000 ms.
 */
export const MIN_HEARTBEAT_INTERVAL_MS = 2_000;
export const MAX_HEARTBEAT_INTERVAL_MS = 60_000;

/** The hook's per-tab id is a short JSON string; this only stops abuse. */
const MAX_CLIENT_SESSION_ID_LENGTH = 512;

/**
 * Marks the caller online in the session's room and keeps them there.
 *
 * Argument names are the hook's: `roomId` is our `sessionId`, `userId` is the
 * participant token, and `sessionId` is the HOOK's per-tab id (not ours).
 */
export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, args): Promise<{ roomToken: string; sessionToken: string }> => {
    const participant = await requireParticipant(ctx, args.userId);

    // Compared as strings, so a malformed room id is simply "not your room".
    if (participant.sessionId !== args.roomId) {
      throw appError("NOT_A_MEMBER", "You are not a member of that review session.");
    }
    // An ended room accepts no heartbeats, so its members drop offline.
    await requireActiveSession(ctx, participant.sessionId);

    if (
      !Number.isFinite(args.interval) ||
      args.interval < MIN_HEARTBEAT_INTERVAL_MS ||
      args.interval > MAX_HEARTBEAT_INTERVAL_MS
    ) {
      throw appError(
        "INVALID_ARGUMENT",
        `Heartbeat interval must be ${MIN_HEARTBEAT_INTERVAL_MS}-${MAX_HEARTBEAT_INTERVAL_MS} ms.`,
      );
    }
    if (args.sessionId.length === 0 || args.sessionId.length > MAX_CLIENT_SESSION_ID_LENGTH) {
      throw appError("INVALID_ARGUMENT", "Invalid presence session id.");
    }

    // The hook builds its per-tab id as JSON [instanceId, roomId, userId], so it
    // embeds the token. Swap the token for the participant id before the
    // component stores it: still unique per tab, no longer a credential.
    const clientSessionId = args.sessionId.split(args.userId).join(participant._id);

    return await presence.heartbeat(
      ctx,
      participant.sessionId,
      participant._id,
      clientSessionId,
      args.interval,
    );
  },
});

/**
 * Everyone who has been in the room, with `online` true for open tabs.
 *
 * Authorized by `roomToken`, an unguessable capability the component returns
 * only from `heartbeat`, i.e. only to callers who passed the membership check
 * above. Deliberately no per-user reads here, so every subscriber in a room
 * shares one cached result (component README).
 */
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    return await presence.list(ctx, roomToken);
  },
});

/**
 * Graceful "tab closed". Unauthenticated by design: the hook calls it via
 * `navigator.sendBeacon`, which cannot attach anything but the body. The
 * `sessionToken` is itself an unguessable capability for one tab's presence.
 */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    return await presence.disconnect(ctx, sessionToken);
  },
});
