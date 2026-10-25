import { create } from 'zustand';
import { callToken, useShare } from '../share/store';

export type CallStatus = 'idle' | 'connecting' | 'live' | 'error';
interface CallState { status: CallStatus; muted: boolean; speaking: Set<string>; error: string | null }

type CallTrack = { kind: string; attach(): HTMLMediaElement; detach(): HTMLMediaElement[] };
/** The slice of livekit-client's Room this store uses; tests pass a fake. */
export interface CallRoom {
  on(e: 'trackSubscribed' | 'trackUnsubscribed', fn: (t: CallTrack) => void): unknown;
  on(e: 'activeSpeakersChanged', fn: (speakers: { identity: string }[]) => void): unknown;
  on(e: 'disconnected', fn: () => void): unknown;
  connect(url: string, token: string): Promise<void>;
  disconnect(): Promise<void>;
  startAudio(): Promise<void>;
  localParticipant: { identity: string; setMicrophoneEnabled(on: boolean): Promise<unknown> };
}
type RoomFactory = () => Promise<CallRoom>;

export const MIC_BLOCKED = 'Microphone blocked';
export const CONNECT_FAILED = "Couldn't connect to the call";
export const CALL_DROPPED = 'Call dropped. Join again';

// Dynamic import: livekit-client loads on first Join only, and never in node tests.
const liveKitRoom: RoomFactory = async () => { const { Room } = await import('livekit-client'); return new Room() as unknown as CallRoom; };
let makeRoom = liveKitRoom;
let room: CallRoom | null = null;
let stopWatch: (() => void) | null = null;
const audio = new Set<HTMLMediaElement>();

export const useCall = create<CallState>()(() => ({ status: 'idle', muted: false, speaking: new Set<string>(), error: null }));
export function useRoomForTest(f: RoomFactory | null): void { makeRoom = f ?? liveKitRoom; room = null; }

function cleanup(): void {
  room = null;
  stopWatch?.();
  stopWatch = null;
  for (const el of audio) el.remove();
  audio.clear();
  useCall.setState({ speaking: new Set() });
}

async function fail(r: CallRoom, error: string): Promise<void> {
  cleanup();
  useCall.setState({ status: 'error', error });
  await r.disconnect().catch(() => {});
}

/** Connects this tab to the session's room with the mic live. Call from a click: it unlocks audio playback. */
export async function join(): Promise<void> {
  const { status } = useCall.getState();
  if (status === 'connecting' || status === 'live') return;
  useCall.setState({ status: 'connecting', error: null, muted: false });
  const t = await callToken();
  if (useCall.getState().status !== 'connecting') return; // left while fetching the token
  if ('error' in t) { useCall.setState({ status: 'error', error: t.error }); return; }

  const r = await makeRoom();
  if (useCall.getState().status !== 'connecting') return;
  room = r;
  r.on('trackSubscribed', (track) => {
    if (track.kind !== 'audio') return;
    const el = track.attach();
    el.hidden = true;
    document.body.append(el);
    audio.add(el);
  });
  r.on('trackUnsubscribed', (track) => { for (const el of track.detach()) { el.remove(); audio.delete(el); } });
  r.on('activeSpeakersChanged', (speakers) => useCall.setState({ speaking: new Set(speakers.map((p) => p.identity)) }));
  r.on('disconnected', () => { if (room === r) { cleanup(); useCall.setState({ status: 'idle', error: CALL_DROPPED }); } });
  // Leaving or losing the share session ends the call.
  stopWatch = useShare.subscribe((s) => { if (!s.stored || s.session?.status === 'ended') void leave(); });

  try { await r.connect(t.url, t.token); await r.startAudio(); } catch { if (room === r) await fail(r, CONNECT_FAILED); return; }
  if (room !== r) return; // left while connecting
  try { await r.localParticipant.setMicrophoneEnabled(true); } catch { if (room === r) await fail(r, MIC_BLOCKED); return; }
  if (room === r) useCall.setState({ status: 'live' });
}

export async function leave(): Promise<void> {
  const r = room;
  cleanup();
  useCall.setState({ status: 'idle', muted: false, error: null });
  await r?.disconnect();
}

export async function toggleMute(): Promise<void> {
  const r = room;
  if (!r || useCall.getState().status !== 'live') return;
  const muted = !useCall.getState().muted;
  await r.localParticipant.setMicrophoneEnabled(!muted);
  useCall.setState((s) => {
    const speaking = new Set(s.speaking);
    if (muted) speaking.delete(r.localParticipant.identity);
    return { muted, speaking };
  });
}
