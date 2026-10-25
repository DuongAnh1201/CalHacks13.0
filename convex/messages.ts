/**
 * Session chat (Phase 2): the human side of the shared `messages` table (#56).
 *
 * WHAT LIVES HERE
 * ---------------
 *   messages.send   public mutation  a session member posts a chat line
 *   messages.list   public query     reactive, paginated, newest-first chat
 *
 * The table itself belongs to #56 and is shared with the agent/MCP side (Tom),
 * which writes `role: "assistant"` rows into the same session. There is ONE chat
 * store; do not add a second table for "human chat" (BACKEND_CONTEXT §3).
 *
 * Java analogy: this file is the `@RestController` + `@Service` for chat. The
 * auth helpers in `lib/auth.ts` are the Spring Security filter, and
 * `lib/author.ts` is the auditing listener that stamps createdBy/createdAt.
 *
 * NOT IN THIS FILE YET
 * --------------------
 * `/jarvis ...` handling (Phase 4). A `/jarvis` line is stored as an ordinary
 * user message today; Phase 4 schedules the command/LLM work from `send`.
 * No rate limit yet (Phase 6 hardening).
 */

import { paginationOptsValidator, type PaginationResult } from "convex/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { loadScan } from "./scans";

/** #56 contract: the shared insert path enforces this cap (docs/CONVEX_BACKEND.md §9). */
export { MAX_MESSAGE_LENGTH } from "./lib/messages";
import { insertMessage, listMessagePage, validateMessageText } from "./lib/messages";

/**
 * What a client sees for one chat line.
 *
 * A projection, not the raw row, for the same reason as `toPublicParticipant`:
 * the row carries `clientId`, `runId` and `toolSteps`, which are agent-panel
 * internals with their own owner. Add fields here deliberately, not by leaking
 * the document.
 */
export type PublicMessage = {
  messageId: Id<"messages">;
  role: "user" | "assistant";
  author: "human" | "agent";
  /** Untrusted display label. Never use it for identity or permission. */
  authorName: string;
  text: string;
  createdAt: number;
};

/**
 * Posts a chat line to a session.
 *
 * Any member may post, host or viewer: chatting is not presenter control
 * (BACKEND_CONTEXT §7). Author fields come from the server-resolved participant,
 * never from the request body (#56 `authorFor` rule).
 */
export const send = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    text: v.string(),
  },
  handler: async (ctx, args): Promise<{ messageId: Id<"messages"> }> => {
    const { session, participant } = await requireSessionMember(ctx, args);

    const text = validateMessageText(args.text);

    // `jobId` is required by the shared table so the agent side can find chat
    // for a case. The session already knows its scan, so it is derived here and
    // never trusted from the client.
    const scan = await loadScan(ctx, session.scanId);

    const messageId = await insertMessage(ctx, {
      jobId: scan.jobId, sessionId: session._id, role: "user", text,
    }, { kind: "human", displayName: participant.displayName, source: "ui" });

    return { messageId };
  },
});

/**
 * The session's chat, newest first, one page at a time.
 *
 * Designed for `usePaginatedQuery(api.messages.list, { sessionId,
 * participantToken }, { initialNumItems: 30 })`. Newest-first means the first
 * page is the latest conversation and "load more" walks back in time; the
 * client reverses each page for display.
 *
 * Paginated rather than `.collect()` (guardrail 8): a long review must not make
 * every subscriber re-read the whole history on every new message.
 */
export const list = query({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<PaginationResult<PublicMessage>> => {
    // Chat is room-private, exactly like the roster.
    await requireSessionMember(ctx, args);

    return listMessagePage(ctx, args.sessionId, args.paginationOpts);
  },
});
