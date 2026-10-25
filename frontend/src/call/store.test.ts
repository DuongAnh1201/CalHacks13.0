import { getFunctionName } from 'convex/server';
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useClientForTest, useShare } from '../share/store';
import { CALL_DROPPED, MIC_BLOCKED, join, leave, toggleMute, useCall, useRoomForTest, type CallRoom } from './store';

type Ref = Parameters<typeof getFunctionName>[0];
const STORED = { sessionId: 's1', participantToken: 'tok', role: 'viewer' as const, inviteCode: 'A', jobId: 'sample' };

function fakeClient(token: () => unknown) {
  const calls: [string, unknown][] = [];
  const client = {
    query: async () => null,
    mutation: async () => null,
    action: async (ref: Ref, args: unknown) => { calls.push([getFunctionName(ref), args]); return token(); },
    onUpdate: () => Object.assign(() => {}, { unsubscribe: () => {}, getCurrentValue: () => undefined }),
  };
  return { client, calls };
}

function fakeRoom(opts: { mic?: () => Promise<void> } = {}) {
  const handlers = new Map<string, (...a: never[]) => void>();
  const calls: string[] = [];
  const room = {
    on: (e: string, fn: (...a: never[]) => void) => { handlers.set(e, fn); return room; },
    connect: async (url: string, token: string) => { calls.push(`connect ${url} ${token}`); },
    disconnect: async () => { calls.push('disconnect'); },
    startAudio: async () => { calls.push('startAudio'); },
    localParticipant: { identity: 'me', setMicrophoneEnabled: async (on: boolean) => { calls.push(`mic ${on}`); await opts.mic?.(); } },
  };
  const emit = (e: string, ...a: unknown[]) => (handlers.get(e) as ((...x: unknown[]) => void) | undefined)?.(...a);
  return { room: room as unknown as CallRoom, calls, emit };
}

const ok = () => ({ url: 'wss://lk', token: 'jwt' });

beforeEach(() => {
  useShare.setState({ stored: STORED, session: { status: 'active' } as never, notice: null, syncNote: null });
  useCall.setState({ status: 'idle', muted: false, speaking: new Set(), error: null });
});
afterEach(async () => { await leave(); useRoomForTest(null); });

describe('call store', () => {
  it('joins with this tab\'s credentials: token, connect, audio, mic on', async () => {
    const c = fakeClient(ok); useClientForTest(c.client as never);
    const r = fakeRoom(); useRoomForTest(async () => r.room);
    await join();
    expect(c.calls).toEqual([['call:token', { sessionId: 's1', participantToken: 'tok' }]]);
    expect(r.calls).toEqual(['connect wss://lk jwt', 'startAudio', 'mic true']);
    expect(useCall.getState()).toMatchObject({ status: 'live', muted: false, error: null });
  });

  it('shows the server message and never builds a room when the token is refused', async () => {
    useClientForTest(fakeClient(() => { throw new ConvexError({ code: 'UNAVAILABLE', message: 'Call unavailable' }); }).client as never);
    let built = false; useRoomForTest(async () => { built = true; return fakeRoom().room; });
    await join();
    expect(built).toBe(false);
    expect(useCall.getState()).toMatchObject({ status: 'error', error: 'Call unavailable' });
  });

  it('disconnects when the microphone is blocked', async () => {
    useClientForTest(fakeClient(ok).client as never);
    const r = fakeRoom({ mic: async () => { throw new Error('NotAllowedError'); } }); useRoomForTest(async () => r.room);
    await join();
    expect(r.calls.at(-1)).toBe('disconnect');
    expect(useCall.getState()).toMatchObject({ status: 'error', error: MIC_BLOCKED });
  });

  it('tracks active speakers and drops yourself from them on mute', async () => {
    useClientForTest(fakeClient(ok).client as never);
    const r = fakeRoom(); useRoomForTest(async () => r.room);
    await join();
    r.emit('activeSpeakersChanged', [{ identity: 'me' }, { identity: 'p2' }]);
    expect([...useCall.getState().speaking]).toEqual(['me', 'p2']);
    await toggleMute();
    expect(r.calls.at(-1)).toBe('mic false');
    expect(useCall.getState().muted).toBe(true);
    expect([...useCall.getState().speaking]).toEqual(['p2']);
    await toggleMute();
    expect(r.calls.at(-1)).toBe('mic true');
    expect(useCall.getState().muted).toBe(false);
  });

  it('plays remote audio through hidden elements and removes them on unsubscribe', async () => {
    const body: unknown[] = [];
    const el = { hidden: false, remove: () => body.splice(body.indexOf(el), 1) };
    (globalThis as { document?: unknown }).document = { body: { append: (e: unknown) => body.push(e) } };
    useClientForTest(fakeClient(ok).client as never);
    const r = fakeRoom(); useRoomForTest(async () => r.room);
    await join();
    const track = { kind: 'audio', attach: () => el, detach: () => [el] };
    r.emit('trackSubscribed', track);
    expect(body).toEqual([el]);
    expect(el.hidden).toBe(true);
    r.emit('trackUnsubscribed', track);
    expect(body).toEqual([]);
    delete (globalThis as { document?: unknown }).document;
  });

  it('leaves the call when the share session goes away', async () => {
    useClientForTest(fakeClient(ok).client as never);
    const r = fakeRoom(); useRoomForTest(async () => r.room);
    await join();
    useShare.setState({ stored: null, session: null });
    await Promise.resolve();
    expect(r.calls.at(-1)).toBe('disconnect');
    expect(useCall.getState().status).toBe('idle');
  });

  it('does not connect when left while the token is in flight', async () => {
    let release!: () => void;
    useClientForTest(fakeClient(() => new Promise((res) => { release = () => res(ok()); })).client as never);
    let built = false; useRoomForTest(async () => { built = true; return fakeRoom().room; });
    const p = join();
    await Promise.resolve();
    await leave();
    release();
    await p;
    expect(built).toBe(false);
    expect(useCall.getState().status).toBe('idle');
  });

  it('reports a dropped call when LiveKit disconnects on its own', async () => {
    useClientForTest(fakeClient(ok).client as never);
    const r = fakeRoom(); useRoomForTest(async () => r.room);
    await join();
    r.emit('disconnected');
    expect(useCall.getState()).toMatchObject({ status: 'idle', error: CALL_DROPPED });
  });
});
