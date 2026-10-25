import type { ConvexClient } from 'convex/browser';
import { create } from 'zustand';
import { api, convex, convexUrl } from './client';
import { codeOf, messageFor, NOT_CONFIGURED, SESSION_ENDED, SYNC_FAILED } from './copy';
import { startPresence } from './presence';
import { clearStored, loadStored, saveStored, type Stored } from './stored';
import type { ChatMessage, Cursor, Note, NoteAnchor, RemoteCursor, SessionState, ViewerCommand } from './types';

type Client = Pick<ConvexClient, 'query' | 'mutation' | 'action' | 'onUpdate'>;

/** `online` holds participantIds with an open tab (Phase 3 presence), separate from the roster. */
interface ShareState { stored: Stored | null; session: SessionState | null; notice: string | null; syncNote: string | null; online: Set<string> }

let client: Client | null = convex;
let unsubscribe: (() => void) | null = null;
let stopPresence: (() => void) | null = null;

export const useShare = create<ShareState>()(() => ({ stored: loadStored(), session: null, notice: null, syncNote: null, online: new Set<string>() }));
export const shareConfigured = () => client !== null;
export function useClientForTest(c: Client | null): void { unsubscribe = null; client = c; }

// Tokens the server no longer accepts: forget them, no banner.
const STALE = new Set(['NOT_A_MEMBER', 'NOT_AUTHENTICATED', 'NOT_FOUND']);

const auth = (s: Pick<Stored, 'sessionId' | 'participantToken'>) => ({ sessionId: s.sessionId, participantToken: s.participantToken });

function drop(notice: string | null): void {
  unsubscribe?.();
  unsubscribe = null;
  stopPresence?.();
  stopPresence = null;
  clearStored();
  useShare.setState({ stored: null, session: null, notice, syncNote: null, online: new Set<string>() });
}

function watch(s: Stored): void {
  unsubscribe?.();
  stopPresence?.();
  stopPresence = startPresence(client!, s, (online) => useShare.setState({ online }), convexUrl);
  unsubscribe = client!.onUpdate(api.sessions.get, auth(s), (session: SessionState) => useShare.setState({ session }), (e: Error) => {
    const code = codeOf(e);
    if (code === 'SESSION_ENDED') drop(SESSION_ENDED);
    else if (code && STALE.has(code)) drop(null);
    else console.error('[share]', e);
  });
}

function begin(s: Stored): void {
  saveStored(s);
  useShare.setState({ stored: s, session: null, notice: null, syncNote: null });
  watch(s);
}

/** Re-subscribes with the token from this tab's storage, so a reload never joins twice. */
export function resume(): void {
  const s = useShare.getState().stored;
  if (client && s && !unsubscribe) watch(s);
}

// shortcut: a Convex deployment that is down makes these await until it is back, add a timeout if that bites in the demo.
/** Shares any finished job: Convex fetches its report from the imaging service and registers the scan first. */
export async function startShare(jobId: string): Promise<string | null> {
  if (!client) return NOT_CONFIGURED;
  try {
    const { scanId } = (await client.action(api.jobs.registerScan, { jobId })) as { scanId: string };
    const r = (await client.mutation(api.sessions.create, { scanId, hostDisplayName: 'Host' })) as { sessionId: string; participantToken: string; inviteCode: string };
    begin({ sessionId: r.sessionId, participantToken: r.participantToken, role: 'host', inviteCode: r.inviteCode, jobId });
    return null;
  } catch (e) { return messageFor(e); }
}

export async function joinShare(code: string, name: string): Promise<string | null> {
  if (!client) return NOT_CONFIGURED;
  try {
    const r = (await client.mutation(api.sessions.join, { inviteCode: code, displayName: name })) as { sessionId: string; participantToken: string; jobId: string };
    begin({ sessionId: r.sessionId, participantToken: r.participantToken, role: 'viewer', inviteCode: code, jobId: r.jobId });
    return null;
  } catch (e) { return messageFor(e); }
}

export async function endShare(): Promise<void> {
  const s = useShare.getState().stored;
  if (!client || !s) return;
  drop(null); // unsubscribe first: otherwise the host's own subscription reports SESSION_ENDED
  try { await client.mutation(api.sessions.end, auth(s)); } catch (e) { console.error('[share]', e); }
}

export async function setFollowing(following: boolean): Promise<void> {
  const s = useShare.getState().stored;
  if (!client || !s) return;
  try { await client.mutation(api.sessions.setFollowMode, { ...auth(s), following }); } catch (e) { console.error('[share]', e); }
}

/** Host only. All mutations are issued before any await: the Convex client runs them in send order. */
export async function sendView(cmds: ViewerCommand[]): Promise<void> {
  const s = useShare.getState().stored;
  const c = client;
  if (!c || s?.role !== 'host' || cmds.length === 0) return;
  try {
    await Promise.all(cmds.map((command) => c.mutation(api.sessions.updateView, { ...auth(s), command })));
    if (useShare.getState().syncNote) useShare.setState({ syncNote: null });
  } catch (e) {
    console.error('[share]', e);
    useShare.setState({ syncNote: SYNC_FAILED });
  }
}

/** Newest page of session chat, oldest first. Returns an unsubscribe; a no-op outside a session. */
export function watchChat(onMessages: (m: ChatMessage[]) => void, pageSize = 50): () => void {
  const s = useShare.getState().stored;
  if (!client || !s) return () => {};
  return client.onUpdate(api.messages.list, { ...auth(s), paginationOpts: { numItems: pageSize, cursor: null } },
    (r: { page: ChatMessage[] }) => onMessages([...r.page].reverse()), // server sends newest first
    (e: Error) => console.error('[chat]', e)); // ended/stale sessions are handled by the sessions.get subscription
}

/** Posts a chat line as this tab's participant. Returns an error message, or null. */
export async function sendChat(text: string): Promise<string | null> {
  const s = useShare.getState().stored;
  if (!client || !s) return NOT_CONFIGURED;
  try { await client.mutation(api.messages.send, { ...auth(s), text }); return null; } catch (e) { return messageFor(e); }
}

/** Any role. Best-effort: a dropped point is replaced by the next one. */
export function sendCursor(cursor: Cursor | null): void {
  const s = useShare.getState().stored;
  if (!client || !s) return;
  client.mutation(api.cursors.move, { ...auth(s), cursor }).catch(() => {});
}

/** Everyone else's cursors in this room. An end or stale token is handled by the sessions.get subscription. */
export function watchCursors(onRows: (rows: RemoteCursor[]) => void): () => void {
  const s = useShare.getState().stored;
  if (!client || !s) return () => {};
  return client.onUpdate(api.cursors.list, auth(s), onRows, () => onRows([]));
}

/** The session's notes, oldest first. Returns an unsubscribe; a no-op outside a session. */
export function watchNotes(onNotes: (n: Note[]) => void): () => void {
  const s = useShare.getState().stored;
  if (!client || !s) return () => {};
  return client.onUpdate(api.annotations.list, auth(s), onNotes, (e: Error) => console.error('[notes]', e));
}

/** Pins a note as this tab's participant. Returns an error message, or null. */
export async function addNote(text: string, anchor: NoteAnchor): Promise<string | null> {
  const s = useShare.getState().stored;
  if (!client || !s) return NOT_CONFIGURED;
  try { await client.mutation(api.annotations.create, { ...auth(s), text, anchor }); return null; } catch (e) { return messageFor(e); }
}

/** Author or host only; the server enforces it, `Note.canRemove` hides the button. */
export async function removeNote(annotationId: string): Promise<string | null> {
  const s = useShare.getState().stored;
  if (!client || !s) return NOT_CONFIGURED;
  try { await client.mutation(api.annotations.remove, { ...auth(s), annotationId }); return null; } catch (e) { return messageFor(e); }
}

/** A LiveKit join token for this tab's participant (convex/call.ts), or an error message. */
export async function callToken(): Promise<{ url: string; token: string } | { error: string }> {
  const s = useShare.getState().stored;
  if (!client || !s) return { error: NOT_CONFIGURED };
  try { return await client.action(api.call.token, auth(s)); } catch (e) { return { error: messageFor(e) }; }
}

/** One final speech segment as this tab's participant (convex/transcript.ts). Best-effort: logged, never shown. */
export async function sendTranscript(text: string, durationMs: number): Promise<void> {
  const s = useShare.getState().stored;
  if (!client || !s) return;
  try { await client.mutation(api.transcript.append, { ...auth(s), text, durationMs }); } catch (e) { console.error('[transcript]', e); }
}

/** Bind writes to the recognizer's captured credentials, never a newly joined session. */
export async function writeTranscriptLine(s: Pick<Stored, 'sessionId' | 'participantToken'>, line: { text: string; final: boolean; durationMs: number; segmentId?: string }): Promise<{ segmentId?: string; retryAfterMs?: number; closed?: boolean }> {
  if (!client) throw new Error(NOT_CONFIGURED);
  return (await client.mutation(api.transcript.updateLine, { ...auth(s), ...line })) ?? {};
}
export async function finishTranscript(s: Pick<Stored, 'sessionId' | 'participantToken'>): Promise<void> {
  if (client) await client.mutation(api.transcript.finishOwn, auth(s));
}
export async function muteTranscript(s: Pick<Stored, 'sessionId' | 'participantToken'>, muted: boolean): Promise<void> {
  if (client) await client.mutation(api.transcript.setMuted, { ...auth(s), muted });
}

/** The host's transcript switch for this session. Returns an unsubscribe; reports false on error. */
export function watchTranscriptEnabled(onEnabled: (on: boolean) => void): () => void {
  const s = useShare.getState().stored;
  if (!client || !s) return () => {};
  return client.onUpdate(api.transcript.state, auth(s), (r: { enabled: boolean }) => onEnabled(r.enabled), () => onEnabled(false));
}

