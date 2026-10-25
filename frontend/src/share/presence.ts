import type { ConvexClient } from 'convex/browser';
import { api } from './client';

type Client = Pick<ConvexClient, 'mutation' | 'onUpdate'>;
interface Auth { sessionId: string; participantToken: string }
interface Row { userId: string; online: boolean }

export const HEARTBEAT_MS = 10_000;

/**
 * Who is online in this room (spec §2.1). Same protocol as the component's stock usePresence,
 * on our own ConvexClient (its hook has no slot for our participant token). Returns stop.
 */
export function startPresence(client: Client, auth: Auth, convexUrl: string, onOnline: (ids: Set<string>) => void): () => void {
  const clientId = crypto.randomUUID();
  let sessionToken: string | null = null;
  let roomToken: string | null = null;
  let unlist: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const beat = async () => {
    try {
      const r = (await client.mutation(api.presence.heartbeat, { ...auth, clientId, interval: HEARTBEAT_MS })) as { roomToken: string; sessionToken: string };
      if (stopped) return;
      sessionToken = r.sessionToken;
      if (r.roomToken === roomToken) return;
      roomToken = r.roomToken;
      unlist?.();
      unlist = client.onUpdate(api.presence.list, { roomToken }, (rows: Row[]) => onOnline(new Set(rows.filter((x) => x.online).map((x) => x.userId))));
    } catch { /* offline or session over: the next tick retries; sessions.get reports an end */ }
  };
  const run = () => { void beat(); timer ??= setInterval(() => void beat(), HEARTBEAT_MS); };
  const pause = () => {
    if (timer) { clearInterval(timer); timer = null; }
    if (sessionToken) client.mutation(api.presence.disconnect, { sessionToken }).catch(() => {});
  };
  // The page may be gone before a websocket send flushes; a beacon is fire-and-forget over HTTP (as the stock hook does).
  const beacon = () => {
    if (sessionToken) navigator.sendBeacon(`${convexUrl}/api/mutation`, new Blob([JSON.stringify({ path: 'presence:disconnect', args: { sessionToken } })], { type: 'application/json' }));
  };
  const onVisibility = () => (document.visibilityState === 'hidden' ? pause() : run());

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', beacon);
  run();
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', beacon);
    unlist?.();
    pause();
  };
}
