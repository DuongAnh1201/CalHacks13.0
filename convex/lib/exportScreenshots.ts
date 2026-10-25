import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { ExportScreenshot } from "./exportMarkdown";

/**
 * Screenshots of a session in capture order, with a servable URL each (#138).
 * The `screenshots` table and its storage arrive with #137; until that branch
 * is merged here there is nothing to read, so this returns an empty list and
 * both the export and `notes.forSession` simply show "no screenshots".
 * This is the single function to fill in on the merge.
 */
export async function loadExportScreenshots(
  _ctx: QueryCtx,
  _sessionId: Id<"sessions">,
  _jobId: string,
): Promise<ExportScreenshot[]> {
  return [];
}
