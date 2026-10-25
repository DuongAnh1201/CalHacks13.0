import type { ConvexClient } from 'convex/browser';
import { create } from 'zustand';
import { api, convex, convexUrl } from './client';
import { codeOf, messageFor, NO_SAMPLE, NOT_CONFIGURED, SESSION_ENDED, SYNC_FAILED } from './copy';
import { startPresence } from './presence';
import { clearStored, loadStored, saveStored, type Stored } from './stored';
import type { Cursor, RemoteCursor, SessionState, ViewerCommand } from './types';

type Client = Pick<ConvexClient, 'query' | 'mutation' | 'onUpdate'>;

interface ShareState { stored: Stored | null; session: SessionState | null; notice: string | null; syncNote: string | null; online: Set<string> }

let client: Client | null = convex;
let unsubscribe: (() => void) | null = null;
let stopPresence: (() => void) | null = null;

export const useShare = create<ShareState>()(() => ({ stored: loadStored(), session: null, notice: null, syncNote: null, online: new Set<string>() }));
export const shareConfigured = () => client !== null;
export function useClientForTest(c: Client | null): void { unsubscribe = null; client = c; }

// Tokens the server no longer accepts: forget them, no banner.
const STALE = new Set(['NOT_A_MEMBER', 'NOT_AUTHENTICATED', 'NOT_FOUND']);

const auth = (s: Stored) => ({ sessionId: s.sessionId, participantToken: s.participantToken });

function drop(notice: string | null): void {
  unsubscribe?.();
  unsubscribe = null;
  stopPresence?.();
  stopPresence = null;
  clearStored();
  useShare.setState({ stored: null, session: null, notice, syncNote: null, online: new Set() });
}

function watch(s: Stored): void {
  unsubscribe?.();
  unsubscribe = client!.onUpdate(api.sessions.get, auth(s), (session: SessionState) => useShare.setState({ session }), (e: Error) => {
    const code = codeOf(e);
    if (code === 'SESSION_ENDED') drop(SESSION_ENDED);
    else if (code && STALE.has(code)) drop(null);
    else console.error('[share]', e);
  });
  stopPresence?.();
  stopPresence = convexUrl ? startPresence(client!, auth(s), convexUrl, (online) => useShare.setState({ online })) : null;
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
export async function startShare(): Promise<string | null> {
  if (!client) return NOT_CONFIGURED;
  try {
    const scan = (await client.query(api.scans.getByJobId, { jobId: 'sample' })) as { scanId: string } | null;
    if (!scan) return NO_SAMPLE;
    const r = (await client.mutation(api.sessions.create, { scanId: scan.scanId, hostDisplayName: 'Host' })) as { sessionId: string; participantToken: string; inviteCode: string };
    begin({ sessionId: r.sessionId, participantToken: r.participantToken, role: 'host', inviteCode: r.inviteCode });
    return null;
  } catch (e) { return messageFor(e); }
}

export async function joinShare(code: string, name: string): Promise<string | null> {
  if (!client) return NOT_CONFIGURED;
  try {
    const r = (await client.mutation(api.sessions.join, { inviteCode: code, displayName: name })) as { sessionId: string; participantToken: string };
    begin({ sessionId: r.sessionId, participantToken: r.participantToken, role: 'viewer', inviteCode: code });
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
