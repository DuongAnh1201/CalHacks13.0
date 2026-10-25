/**
 * presence — who is online in a review session right now (spec §1.1).
 *
 * Wraps @convex-dev/presence. Room and user are ALWAYS derived from the
 * participant token: roomId = session id, userId = participant id. The client
 * only names its own tab (clientId), which we prefix with the participant id
 * so one participant can never address another's tab.
 */
import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";

const presence = new Presence(components.presence);

const MIN_INTERVAL_MS = 2_000;
const MAX_INTERVAL_MS = 60_000;

export const heartbeat = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    clientId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, args): Promise<{ roomToken: string; sessionToken: string }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    if (args.clientId.length === 0 || args.clientId.length > 64) {
      throw appError("INVALID_ARGUMENT", "clientId must be 1–64 characters.");
    }
    if (!Number.isFinite(args.interval)) throw appError("INVALID_ARGUMENT", "interval must be a number.");
    const interval = Math.min(Math.max(args.interval, MIN_INTERVAL_MS), MAX_INTERVAL_MS);
    return await presence.heartbeat(ctx, session._id, participant._id, `${participant._id}:${args.clientId}`, interval);
  },
});

/** No per-user reads, so every subscriber in a room shares one cached result (component README). */
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => await presence.list(ctx, roomToken),
});

/** Unauthenticated by necessity: it is called from navigator.sendBeacon on page hide. A leaked tab token can only mark that tab offline. */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => await presence.disconnect(ctx, sessionToken),
});
