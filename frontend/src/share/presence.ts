import type { ConvexClient } from 'convex/browser';
import { api } from './client';
import type { Stored } from './stored';

type Client = Pick<ConvexClient, 'mutation' | 'onUpdate'>;

/** One row of convex/presence.ts `list`: userId is the participantId. */
export interface PresenceRow { userId: string; online: boolean; lastDisconnected: number }

/** Matches the Presence component hook's default; the server accepts 2-60 s. */
export const HEARTBEAT_MS = 10_000;

/**
 * Online status for this tab, the same protocol as `usePresence` from @convex-dev/presence
 * but on the shared ConvexClient (the app has no ConvexProvider). The server wants
 * roomId = sessionId and userId = participant token; see docs/CONVEX_BACKEND.md §12.
 * Returns a stop function that also tells the server this tab left.
 */
export function startPresence(client: Client, s: Stored, onRows: (online: Set<string>) => void, convexUrl?: string): () => void {
  const tab = globalThis.crypto?.randomUUID?.() ?? String(Math.random());
  const args = { roomId: s.sessionId, userId: s.participantToken, sessionId: JSON.stringify([tab, s.sessionId, s.participantToken]), interval: HEARTBEAT_MS };
  let timer: ReturnType<typeof setInterval> | null = null;
  let sessionToken: string | null = null;
  let roomToken: string | null = null;
  let unlist: (() => void) | null = null;
  let stopped = false;

  const beat = async () => {
    try {
      const r = (await client.mutation(api.presence.heartbeat, args)) as { roomToken: string; sessionToken: string };
      if (stopped) { void client.mutation(api.presence.disconnect, { sessionToken: r.sessionToken }).catch(() => {}); return; }
      sessionToken = r.sessionToken;
      if (r.roomToken !== roomToken) {
        roomToken = r.roomToken;
        unlist?.();
        unlist = client.onUpdate(api.presence.list, { roomToken }, (rows: PresenceRow[]) => onRows(new Set(rows.filter((p) => p.online).map((p) => p.userId))), (e: Error) => console.error('[presence]', e));
      }
    } catch (e) { console.error('[presence]', e); } // shortcut: an ended or stale session is handled by the sessions.get subscription
  };
  const run = () => { if (timer) clearInterval(timer); void beat(); timer = setInterval(() => void beat(), HEARTBEAT_MS); };
  const pause = () => {
    if (timer) clearInterval(timer);
    timer = null;
    if (sessionToken) void client.mutation(api.presence.disconnect, { sessionToken }).catch(() => {});
  };
  // A hidden tab is not looking at the scan; the hook does the same.
  const onVisibility = () => (globalThis.document?.hidden ? pause() : run());
  // sendBeacon survives the page closing; a normal mutation would not. Path fixed by the component.
  const onUnload = () => {
    if (!sessionToken || !convexUrl) return;
    const body = new Blob([JSON.stringify({ path: 'presence:disconnect', args: { sessionToken } })], { type: 'application/json' });
    navigator.sendBeacon(`${convexUrl}/api/mutation`, body);
  };

  globalThis.document?.addEventListener('visibilitychange', onVisibility);
  globalThis.addEventListener?.('beforeunload', onUnload);
  run();

  return () => {
    stopped = true;
    pause();
    unlist?.();
    globalThis.document?.removeEventListener('visibilitychange', onVisibility);
    globalThis.removeEventListener?.('beforeunload', onUnload);
  };
}
