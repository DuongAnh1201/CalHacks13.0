import { getFunctionName } from 'convex/server';
import { ConvexError } from 'convex/values';
import { afterEach, describe, expect, it } from 'vitest';
import { useShare } from '../share/store';
import { joinPlayground, leavePlayground, startPlayground, usePlay, usePlayClientForTest } from './store';

type Ref = Parameters<typeof getFunctionName>[0];

function fakeClient(over: Record<string, (args: unknown) => unknown> = {}) {
  const calls: [string, unknown][] = [];
  const subs: { name: string; onError?: (e: Error) => void }[] = [];
  const run = async (ref: Ref, args: unknown) => {
    const name = getFunctionName(ref);
    calls.push([name, args]);
    if (over[name]) return over[name](args);
    if (name === 'jobs:registerScan') return { scanId: 'scan1' };
    if (name === 'sessions:create') return { sessionId: 'p1', inviteCode: 'PLAY-1', participantToken: 'host-t', participantId: 'h', role: 'host' };
    if (name === 'sessions:join') return { sessionId: 'p1', participantToken: 'guest-t', participantId: 'g', role: 'viewer', jobId: 'sample', kind: 'play' };
    return null;
  };
  const onUpdate = (ref: Ref, _args: unknown, _onData: (v: unknown) => void, onError?: (e: Error) => void) => {
    subs.push({ name: getFunctionName(ref), onError });
    return Object.assign(() => {}, { unsubscribe() {}, getCurrentValue: () => undefined });
  };
  return { client: { query: run, mutation: run, action: run, onUpdate }, calls, subs };
}

afterEach(() => {
  usePlayClientForTest(null);
  usePlay.setState({ stored: null, session: null, game: null, notice: null });
});

describe('playground store', () => {
  it('starts a "play" session and never touches the tab\'s review session', async () => {
    const f = fakeClient();
    usePlayClientForTest(f.client as never);
    const review = useShare.getState().stored;
    expect(await startPlayground('Sage')).toBeNull();
    expect(f.calls.find(([n]) => n === 'sessions:create')?.[1]).toEqual({ scanId: 'scan1', hostDisplayName: 'Sage', kind: 'play' });
    expect(usePlay.getState().stored).toMatchObject({ role: 'host', inviteCode: 'PLAY-1' });
    expect(useShare.getState().stored).toBe(review);
    expect(f.subs.map((s) => s.name).sort()).toEqual(['games:current', 'sessions:get']);
  });

  it('joins with kind "play" so a workspace invite is refused', async () => {
    const f = fakeClient();
    usePlayClientForTest(f.client as never);
    expect(await joinPlayground('PLAY-1', 'Khoi')).toBeNull();
    expect(f.calls.find(([n]) => n === 'sessions:join')?.[1]).toEqual({ inviteCode: 'PLAY-1', displayName: 'Khoi', kind: 'play' });
  });

  it('forgets the playground when it ends, and only the host ends it for everyone', async () => {
    const f = fakeClient();
    usePlayClientForTest(f.client as never);
    await joinPlayground('PLAY-1', 'Khoi');
    f.subs[0].onError?.(new ConvexError({ code: 'SESSION_ENDED', message: 'ended' }));
    expect(usePlay.getState()).toMatchObject({ stored: null, notice: 'The playground has ended.' });

    await joinPlayground('PLAY-1', 'Khoi');
    await leavePlayground();
    expect(f.calls.some(([n]) => n === 'sessions:end')).toBe(false); // a guest just leaves
    await startPlayground('Sage');
    await leavePlayground();
    expect(f.calls.some(([n]) => n === 'sessions:end')).toBe(true);
  });
});
