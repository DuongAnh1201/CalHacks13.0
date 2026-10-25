import { paginationOptsValidator } from "convex/server";
import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";
import { listMessagePage } from "./lib/messages";
import { loadScan } from "./scans";

const scopeFields = { jobId: v.string(), sessionId: v.optional(v.id("sessions")), participantToken: v.optional(v.string()) };
const AUTH_MESSAGE = "Not authorized for this session. Supply a matching session_id and participant_token.";

async function requireChatScope(ctx: QueryCtx, args: { jobId: string; sessionId?: Id<"sessions">; participantToken?: string }) {
  if (!args.sessionId || !args.participantToken) throw appError("NOT_AUTHENTICATED", AUTH_MESSAGE);
  try {
    const { session } = await requireSessionMember(ctx, { sessionId: args.sessionId, participantToken: args.participantToken });
    const scan = await loadScan(ctx, session.scanId);
    if (scan.jobId !== args.jobId) throw appError("NOT_A_MEMBER", AUTH_MESSAGE);
    return { sessionId: session._id, jobId: scan.jobId };
  } catch {
    // Do not disclose which part of an invalid room/job/credential combination exists.
    throw appError("NOT_AUTHENTICATED", AUTH_MESSAGE);
  }
}

export const list = internalQuery({
  args: { ...scopeFields, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { sessionId } = await requireChatScope(ctx, args);
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) {
      throw appError("INVALID_ARGUMENT", "Message limit must be between 1 and 100.");
    }
    return listMessagePage(ctx, sessionId, args.paginationOpts);
  },
});
