import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_MS, startPresence } from './presence';

type Ref = Parameters<typeof getFunctionName>[0];
const AUTH = { sessionId: 's1', participantToken: 't1' };

function fake() {
  const calls: [string, unknown][] = [];
  const subs: { name: string; args: unknown; onData: (v: unknown) => void; closed: boolean }[] = [];
  const client = {
    mutation: async (ref: Ref, args: unknown) => {
      const name = getFunctionName(ref);
      calls.push([name, args]);
      return name === 'presence:heartbeat' ? { roomToken: 'room', sessionToken: 'sess' } : null;
    },
    onUpdate: (ref: Ref, args: unknown, onData: (v: unknown) => void) => {
      const sub = { name: getFunctionName(ref), args, onData, closed: false };
      subs.push(sub);
      return () => { sub.closed = true; };
    },
  };
  return { client, calls, subs };
}

const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
const win = new EventTarget();
const sendBeacon = vi.fn(() => true);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', { sendBeacon });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); sendBeacon.mockClear(); doc.visibilityState = 'visible'; });

describe('startPresence', () => {
  it('heartbeats, lists the room, reports online participants only', async () => {
    const f = fake();
    const online = vi.fn();
    const stop = startPresence(f.client as never, AUTH, 'https://x.convex.cloud', online);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls[0]).toEqual(['presence:heartbeat', { ...AUTH, clientId: expect.any(String), interval: HEARTBEAT_MS }]);
    expect(f.subs[0]).toMatchObject({ name: 'presence:list', args: { roomToken: 'room' } });
    f.subs[0].onData([{ userId: 'p1', online: true }, { userId: 'p2', online: false }]);
    expect(online).toHaveBeenLastCalledWith(new Set(['p1']));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(f.calls.filter((c) => c[0] === 'presence:heartbeat')).toHaveLength(2);
    expect(f.subs).toHaveLength(1); // same room token: no resubscribe
    stop();
  });

  it('hidden tab disconnects; visible again heartbeats; pagehide beacons', async () => {
    const f = fake();
    const stop = startPresence(f.client as never, AUTH, 'https://x.convex.cloud', () => {});
    await vi.advanceTimersByTimeAsync(0);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    expect(f.calls.at(-1)).toEqual(['presence:disconnect', { sessionToken: 'sess' }]);
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls.at(-1)?.[0]).toBe('presence:heartbeat');
    win.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).toHaveBeenCalledWith('https://x.convex.cloud/api/mutation', expect.any(Blob));
    stop();
  });

  it('stop unsubscribes, disconnects and stops the timer', async () => {
    const f = fake();
    const stop = startPresence(f.client as never, AUTH, 'https://x.convex.cloud', () => {});
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(f.subs[0].closed).toBe(true);
    expect(f.calls.at(-1)).toEqual(['presence:disconnect', { sessionToken: 'sess' }]);
    const n = f.calls.length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(f.calls).toHaveLength(n);
  });
});
