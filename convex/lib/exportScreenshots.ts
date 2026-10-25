import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { ExportScreenshot } from "./exportMarkdown";

const MAX_SHOTS = 20; // the capture policy's own per-meeting cap

/**
 * Screenshots of a session in capture order, each with a storage URL for
 * embedding (#138). Only rows for this session and case that were taken during
 * the meeting (session start up to its end time) are returned. A row whose file
 * is gone keeps its caption and gets an empty URL, which the export renders as
 * "image unavailable". Callers must already have checked membership: this is
 * used by the private export snapshot and by notes.forSession.
 */
export async function loadExportScreenshots(
  ctx: QueryCtx,
  sessionId: Id<"sessions">,
  jobId: string,
): Promise<ExportScreenshot[]> {
  const session = await ctx.db.get(sessionId);
  if (!session) return [];
  const until = session.status === "ended" ? session.updatedAt : Number.POSITIVE_INFINITY;
  const rows = await ctx.db
    .query("screenshots")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .take(MAX_SHOTS * 2);
  const inWindow = rows
    .filter((r) => r.jobId === jobId && r.takenAt >= session._creationTime && r.takenAt <= until)
    .sort((a, b) => a.takenAt - b.takenAt)
    .slice(0, MAX_SHOTS);
  return Promise.all(
    inWindow.map(async (r) => ({ caption: r.caption, takenAt: r.takenAt, url: (await ctx.storage.getUrl(r.storageId)) ?? "" })),
  );
}
