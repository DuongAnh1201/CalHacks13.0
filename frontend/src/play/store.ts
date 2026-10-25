import type { ConvexClient } from 'convex/browser';
import { create } from 'zustand';
import type { GameAnswer, GamePrompt, GameSecret, GameState } from '../games/types';
import { api, convex } from '../share/client';
import { codeOf, messageFor, NOT_CONFIGURED } from '../share/copy';
import { clearStored, loadStored, PLAY_KEY, saveStored, type Stored } from '../share/stored';
import type { SessionState } from '../share/types';

/*
 * The playground: a Convex session of kind "play" for the study games, kept apart from the
 * case-review session in share/store.ts. Its own token (PLAY_KEY), its own subscriptions and its
 * own invite page (/play/join/:code), so starting or leaving a playground never touches a review
 * room, and the reverse.
 */
type Client = Pick<ConvexClient, 'query' | 'mutation' | 'action' | 'onUpdate'>;

interface PlayState { stored: Stored | null; session: SessionState | null; game: GameState | null; notice: string | null }

/** The playground's scan only satisfies the session schema; every round names its own case. */
const PLAYGROUND_CASE = 'sample';
const STALE = new Set(['NOT_A_MEMBER', 'NOT_AUTHENTICATED', 'NOT_FOUND', 'SESSION_ENDED']);

let client: Client | null = convex;
let stops: (() => void)[] = [];

export const usePlay = create<PlayState>()(() => ({ stored: loadStored(undefined, PLAY_KEY), session: null, game: null, notice: null }));
export const playConfigured = () => client !== null;
export function usePlayClientForTest(c: Client | null): void { stops = []; client = c; }

const auth = (s: Stored) => ({ sessionId: s.sessionId, participantToken: s.participantToken });

function drop(notice: string | null): void {
  for (const stop of stops) stop();
  stops = [];
  clearStored(undefined, PLAY_KEY);
  usePlay.setState({ stored: null, session: null, game: null, notice });
}

function watch(s: Stored): void {
  for (const stop of stops) stop();
  const gone = (e: Error) => {
    const code = codeOf(e);
    if (code && STALE.has(code)) drop(code === 'SESSION_ENDED' ? 'The playground has ended.' : null);
    else console.error('[play]', e);
  };
  stops = [
    client!.onUpdate(api.sessions.get, auth(s), (session: SessionState) => usePlay.setState({ session }), gone),
    client!.onUpdate(api.games.current, auth(s), (game: GameState) => usePlay.setState({ game }), gone),
  ];
}

function begin(s: Stored): void {
  saveStored(s, undefined, PLAY_KEY);
  usePlay.setState({ stored: s, session: null, game: null, notice: null });
  watch(s);
}

/** Re-subscribes with this tab's playground token after a reload. */
export function resumePlay(): void {
  const s = usePlay.getState().stored;
  if (client && s && stops.length === 0) watch(s);
}

export async function startPlayground(name: string): Promise<string | null> {
  if (!client) return NOT_CONFIGURED;
  try {
    const { scanId } = (await client.action(api.jobs.registerScan, { jobId: PLAYGROUND_CASE })) as { scanId: string };
    const r = (await client.mutation(api.sessions.create, { scanId, hostDisplayName: name, kind: 'play' })) as { sessionId: string; participantToken: string; inviteCode: string };
    begin({ sessionId: r.sessionId, participantToken: r.participantToken, role: 'host', inviteCode: r.inviteCode, jobId: PLAYGROUND_CASE });
    return null;
  } catch (e) { return messageFor(e); }
}

export async function joinPlayground(code: string, name: string): Promise<string | null> {
  if (!client) return NOT_CONFIGURED;
  try {
    const r = (await client.mutation(api.sessions.join, { inviteCode: code, displayName: name, kind: 'play' })) as { sessionId: string; participantToken: string };
    begin({ sessionId: r.sessionId, participantToken: r.participantToken, role: 'viewer', inviteCode: code, jobId: PLAYGROUND_CASE });
    return null;
  } catch (e) { return messageFor(e); }
}

/** The host ends the playground for everyone; a guest just leaves. */
export async function leavePlayground(): Promise<void> {
  const s = usePlay.getState().stored;
  drop(null);
  if (client && s?.role === 'host') {
    try { await client.mutation(api.sessions.end, auth(s)); } catch (e) { console.error('[play]', e); }
  }
}

async function call(name: 'start' | 'answer' | 'reveal', args: Record<string, unknown>): Promise<string | null> {
  const s = usePlay.getState().stored;
  if (!client || !s) return NOT_CONFIGURED;
  try { await client.mutation(api.games[name], { ...auth(s), ...args }); return null; } catch (e) { return messageFor(e); }
}

/** Host only. Returns an error message, or null. */
export const startRound = (prompt: GamePrompt, secret: GameSecret | null) => call('start', { prompt, ...(secret ? { secret } : {}) });
export const answerRound = (roundId: string, answer: GameAnswer) => call('answer', { roundId, answer });
export const revealRound = (roundId: string) => call('reveal', { roundId });
