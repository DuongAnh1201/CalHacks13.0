import { getFunctionName } from 'convex/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_MS, startPresence } from './presence';

type Ref = Parameters<typeof getFunctionName>[0];
const STORED = { sessionId: 's1', participantToken: 'tok', role: 'viewer' as const, inviteCode: 'A' };

function fakeClient() {
  const calls: [string, Record<string, unknown>][] = [];
  const lists: { args: unknown; onData: (v: unknown) => void; closed: boolean }[] = [];
  const client = {
    mutation: async (ref: Ref, args: Record<string, unknown>) => {
      const name = getFunctionName(ref);
      calls.push([name, args]);
      return name === 'presence:heartbeat' ? { roomToken: 'room-1', sessionToken: 'tab-1' } : null;
    },
    onUpdate: (_ref: Ref, args: unknown, onData: (v: unknown) => void) => {
      const sub = { args, onData, closed: false };
      lists.push(sub);
      return Object.assign(() => { sub.closed = true; }, { unsubscribe: () => { sub.closed = true; }, getCurrentValue: () => undefined });
    },
  };
  return { client, calls, lists };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => vi.useRealTimers());

describe('presence', () => {
  it('heartbeats with roomId = sessionId and userId = token, then lists online participant ids', async () => {
    const f = fakeClient();
    const seen: Set<string>[] = [];
    const stop = startPresence(f.client as never, STORED, (s) => seen.push(s));
    await flush();

    expect(f.calls[0][0]).toBe('presence:heartbeat');
    expect(f.calls[0][1]).toMatchObject({ roomId: 's1', userId: 'tok', interval: HEARTBEAT_MS });
    expect(f.lists[0].args).toEqual({ roomToken: 'room-1' });

    f.lists[0].onData([{ userId: 'p1', online: true }, { userId: 'p2', online: false }]);
    expect([...seen.at(-1)!]).toEqual(['p1']);
    stop();
  });

  it('beats every interval and subscribes to the list only once per room', async () => {
    vi.useFakeTimers();
    const f = fakeClient();
    const stop = startPresence(f.client as never, STORED, () => {});
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 2);
    expect(f.calls.filter((c) => c[0] === 'presence:heartbeat')).toHaveLength(3);
    expect(f.lists).toHaveLength(1);
    stop();
  });

  it('stop disconnects this tab, unsubscribes and stops beating', async () => {
    vi.useFakeTimers();
    const f = fakeClient();
    const stop = startPresence(f.client as never, STORED, () => {});
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(f.calls.at(-1)).toEqual(['presence:disconnect', { sessionToken: 'tab-1' }]);
    expect(f.lists[0].closed).toBe(true);
    const n = f.calls.length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(f.calls.length).toBe(n);
  });
});
