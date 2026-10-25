import { getFunctionName } from 'convex/server';
import { ConvexError } from 'convex/values';
import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_ENDED, SYNC_FAILED } from './copy';
import { endShare, joinShare, sendView, setFollowing, startShare, useClientForTest, useShare } from './store';
import type { SessionState } from './types';

type Ref = Parameters<typeof getFunctionName>[0];
const SESSION = { sessionId: 's1', status: 'active', participants: [], isPresenter: true } as unknown as SessionState;

function fakeClient(over: Partial<Record<string, (args: unknown) => unknown>> = {}) {
  const calls: [string, unknown][] = [];
  const subs: { onData: (v: unknown) => void; onError?: (e: Error) => void; closed: boolean }[] = [];
  const run = async (ref: Ref, args: unknown) => {
    const name = getFunctionName(ref);
    calls.push([name, args]);
    const f = over[name];
    if (f) return f(args);
    if (name === 'jobs:registerScan') return { scanId: 'scan1' };
    if (name === 'sessions:create') return { sessionId: 's1', inviteCode: 'ABC123', participantToken: 'host-t', participantId: 'p1', role: 'host' };
    if (name === 'sessions:join') return { sessionId: 's1', participantToken: 'guest-t', participantId: 'p2', role: 'viewer', jobId: 'job-7' };
    return null;
  };
  const client = {
    query: run,
    mutation: run,
    action: run,
    onUpdate: (_ref: Ref, _args: unknown, onData: (v: unknown) => void, onError?: (e: Error) => void) => {
      const sub = { onData, onError, closed: false };
      subs.push(sub);
      return Object.assign(() => { sub.closed = true; }, { unsubscribe: () => { sub.closed = true; }, getCurrentValue: () => undefined });
    },
  };
  return { client, calls, subs };
}

beforeEach(() => useShare.setState({ stored: null, session: null, notice: null, syncNote: null }));

describe('share store', () => {
  it('startShare registers the job scan, creates a session on it and subscribes', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    expect(await startShare('job-7')).toBeNull();
    expect(f.calls.map((c) => c[0]).filter((n) => !n.startsWith('presence:'))).toEqual(['jobs:registerScan', 'sessions:create']); // presence: presence.test.ts
    expect(f.calls[0][1]).toEqual({ jobId: 'job-7' });
    expect(f.calls[1][1]).toEqual({ scanId: 'scan1', hostDisplayName: 'Host' });
    expect(useShare.getState().stored).toMatchObject({ role: 'host', inviteCode: 'ABC123', jobId: 'job-7' });
    f.subs[0].onData(SESSION);
    expect(useShare.getState().session).toBe(SESSION);
  });
  it('startShare on a job that is still processing shows the server message and starts nothing', async () => {
    const f = fakeClient({ 'jobs:registerScan': () => { throw new ConvexError({ code: 'INVALID_ARGUMENT', message: 'This scan is still processing.' }); } });
    useClientForTest(f.client as never);
    expect(await startShare('job-7')).toBe('This scan is still processing.');
    expect(f.calls.map((c) => c[0])).toEqual(['jobs:registerScan']);
    expect(useShare.getState().stored).toBeNull();
  });
  it('joinShare remembers which job the session is on', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    expect(await joinShare('ABC123', 'Ana')).toBeNull();
    expect(useShare.getState().stored).toMatchObject({ role: 'viewer', jobId: 'job-7' });
  });
  it('joinShare maps INVALID_INVITE to the invite copy', async () => {
    const f = fakeClient({ 'sessions:join': () => { throw new ConvexError({ code: 'INVALID_INVITE', message: 'x' }); } });
    useClientForTest(f.client as never);
    expect(await joinShare('NOPE', 'Ana')).toBe("That invite link doesn't work. Ask the host for a new one.");
    expect(useShare.getState().stored).toBeNull();
  });
  it('SESSION_ENDED clears the token and shows the notice; a stale token clears silently', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    await joinShare('ABC123', 'Ana');
    f.subs[0].onError!(new ConvexError({ code: 'SESSION_ENDED', message: 'x' }));
    expect(useShare.getState()).toMatchObject({ stored: null, session: null, notice: SESSION_ENDED });
    await joinShare('ABC123', 'Ana');
    f.subs[1].onError!(new ConvexError({ code: 'NOT_A_MEMBER', message: 'x' }));
    expect(useShare.getState()).toMatchObject({ stored: null, notice: null });
  });
  it('endShare unsubscribes before ending, so the host sees no ended notice', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    await startShare('sample');
    await endShare();
    expect(f.subs[0].closed).toBe(true);
    expect(f.calls.at(-1)).toEqual(['sessions:end', { sessionId: 's1', participantToken: 'host-t' }]);
    expect(useShare.getState()).toMatchObject({ stored: null, notice: null });
  });
  it('sendView sends commands in order as host, nothing as guest, and notes a failure', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    await startShare('sample');
    await sendView([{ type: 'setPlane', plane: 'axial' }, { type: 'setSlice', index: 70 }]);
    expect(f.calls.slice(-2).map((c) => (c[1] as { command: unknown }).command)).toEqual([{ type: 'setPlane', plane: 'axial' }, { type: 'setSlice', index: 70 }]);
    const bad = fakeClient({ 'sessions:updateView': () => { throw new Error('offline'); } }); useClientForTest(bad.client as never);
    await sendView([{ type: 'setSlice', index: 1 }]);
    expect(useShare.getState().syncNote).toBe(SYNC_FAILED);
    useShare.setState({ stored: { sessionId: 's1', participantToken: 'g', role: 'viewer', inviteCode: 'A', jobId: 'sample' } });
    const n = bad.calls.length;
    await sendView([{ type: 'setSlice', index: 2 }]);
    expect(bad.calls.length).toBe(n);
  });
  it('setFollowing passes the flag', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    await joinShare('ABC123', 'Ana');
    await setFollowing(false);
    expect(f.calls.at(-1)).toEqual(['sessions:setFollowMode', { sessionId: 's1', participantToken: 'guest-t', following: false }]);
  });
});
