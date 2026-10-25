import type { Doc } from "../_generated/dataModel";

/**
 * When the meeting's final summary is due, or undefined while it is still going.
 * A session that ended always wins (its end time). Otherwise the host ended the
 * meeting without ending the session (`notes.endMeeting`): that counts until
 * transcription is turned on again, which starts a new meeting.
 */
export function meetingEnd(session: Doc<"sessions">, settings: Doc<"transcriptSettings"> | null): number | undefined {
  if (session.status === "ended") return session.updatedAt;
  const at = settings?.meetingEndedAt;
  if (at === undefined) return undefined;
  const lastOn = Math.max(0, ...(settings?.events ?? []).filter((e) => e.kind === "on").map((e) => e.at));
  return at >= lastOn ? at : undefined;
}
