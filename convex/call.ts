/**
 * Live group call (LiveKit Cloud). Convex only authorizes the caller and mints
 * the room join token; audio and speaking state never touch Convex.
 * Room = sessionId, identity = participantId. Spec: docs/superpowers/specs/2026-10-24-live-call-design.md.
 */

import { v } from "convex/values";
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { env } from "./lib/env";
import { appError } from "./lib/errors";

const TOKEN_TTL_S = 15 * 60;

const vCaller = { sessionId: v.id("sessions"), participantToken: v.string() };

/** The member check behind `token`; actions have no db. */
export const member = internalQuery({
  args: vCaller,
  handler: async (ctx, args): Promise<{ participantId: string; displayName: string }> => {
    const { participant } = await requireSessionMember(ctx, args);
    return { participantId: participant._id, displayName: participant.displayName };
  },
});

/** A mic-only join token for this session's room. */
export const token = action({
  args: vCaller,
  handler: async (ctx, args): Promise<{ url: string; token: string }> => {
    const apiKey = env("LIVEKIT_API_KEY");
    const apiSecret = env("LIVEKIT_API_SECRET");
    const url = env("LIVEKIT_URL");
    if (!apiKey || !apiSecret || !url) throw appError("UNAVAILABLE", "Call unavailable");

    const me = await ctx.runQuery(internal.call.member, args);
    const at = new AccessToken(apiKey, apiSecret, { identity: me.participantId, name: me.displayName, ttl: TOKEN_TTL_S });
    at.addGrant({
      roomJoin: true,
      room: args.sessionId,
      canPublish: true,
      canPublishSources: [TrackSource.MICROPHONE],
      canSubscribe: true,
      canPublishData: false,
    });
    return { url, token: await at.toJwt() };
  },
});
