import type { PaginationOptions } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authorFor, type ResolvedCaller } from "./author";
import { appError } from "./errors";

export const MAX_MESSAGE_LENGTH = 2000;

/** One validator for UI and agent messages: preserves the existing UI wording. */
export function validateMessageText(input: string): string {
  const text = input.trim();
  if (!text.length) throw appError("INVALID_ARGUMENT", "A message cannot be empty.");
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw appError("INVALID_ARGUMENT", `A message can be at most ${MAX_MESSAGE_LENGTH} characters.`);
  }
  return text;
}

/** Callers must authenticate/resolve the scope and author before this shared write. */
type MessageScope =
  | { sessionId: Id<"sessions">; clientId?: never }
  | { clientId: string; sessionId?: never };

export async function insertMessage(ctx: MutationCtx, input: MessageScope & {
  jobId: string; text: string; role: "user" | "assistant";
  runId?: Id<"agentRuns">; toolSteps?: Doc<"messages">["toolSteps"];
}, caller: ResolvedCaller): Promise<Id<"messages">> {
  return ctx.db.insert("messages", { ...input, text: validateMessageText(input.text), ...authorFor(caller) });
}

/** One secret-free projection for UI pages, MCP tools and the resource. */
export function publicMessage(row: Doc<"messages">) {
  return { messageId: row._id, role: row.role, author: row.author, authorName: row.authorName,
    text: row.text, createdAt: row.createdAt };
}

/** Same newest-first index and pagination for every reader; auth remains mandatory. `me` marks the caller's own lines. */
export async function listMessagePage(ctx: QueryCtx, sessionId: Id<"sessions">, paginationOpts: PaginationOptions, me?: Id<"sessionParticipants">) {
  const page = await ctx.db.query("messages")
    .withIndex("by_session_time", (q) => q.eq("sessionId", sessionId))
    .order("desc").paginate(paginationOpts);
  return { ...page, page: page.page.map((row) => ({ ...publicMessage(row), mine: !!me && row.authorParticipantId === me })) };
}
