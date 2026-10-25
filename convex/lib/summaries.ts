import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { authorFor } from "./author";

/**
 * Where a running summary lives. Client scope is private to one browser's
 * capability (clientId); session scope belongs to the room. The two never mix:
 * a client-scope row has no sessionId and a session-scope row has no clientId.
 */
export type SummaryScope =
  | { kind: "client"; clientId: string; jobId: string }
  | { kind: "session"; sessionId: Id<"sessions">; jobId: string };

/** Newest version for the scope, or null. Shared with #59 (session summaries). */
export async function latestSummary(
  ctx: QueryCtx,
  scope: SummaryScope,
): Promise<Doc<"sessionSummaries"> | null> {
  if (scope.kind === "client") {
    return await ctx.db
      .query("sessionSummaries")
      .withIndex("by_client", (q) => q.eq("clientId", scope.clientId))
      .filter((q) => q.and(q.eq(q.field("jobId"), scope.jobId), q.eq(q.field("sessionId"), undefined)))
      .order("desc")
      .first();
  }
  return await ctx.db
    .query("sessionSummaries")
    .withIndex("by_session", (q) => q.eq("sessionId", scope.sessionId))
    .filter((q) => q.and(q.eq(q.field("jobId"), scope.jobId), q.eq(q.field("clientId"), undefined)))
    .order("desc")
    .first();
}

/**
 * Writes the next version (previous + 1) as an AI-labelled Scribe row.
 * Callers must have authenticated and run the reply Guard on `text` already.
 */
export async function insertSummary(
  ctx: MutationCtx,
  scope: SummaryScope,
  args: { text: string; coversUpTo: number; final?: boolean },
): Promise<{ summaryId: Id<"sessionSummaries">; version: number }> {
  const previous = await latestSummary(ctx, scope);
  const version = (previous?.version ?? 0) + 1;
  const summaryId = await ctx.db.insert("sessionSummaries", {
    ...authorFor({ kind: "agent", name: "Scribe", source: "agent" }),
    jobId: scope.jobId,
    ...(scope.kind === "client" ? { clientId: scope.clientId } : { sessionId: scope.sessionId }),
    text: args.text,
    coversUpTo: args.coversUpTo,
    version,
    ...(args.final ? { final: true } : {}),
  });
  return { summaryId, version };
}
