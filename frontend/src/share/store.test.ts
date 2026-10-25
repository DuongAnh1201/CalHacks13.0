import { getFunctionName } from 'convex/server';
import { ConvexError } from 'convex/values';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SESSION_ENDED, SYNC_FAILED } from './copy';
import { endShare, joinShare, messagesAfter, sendCursor, sendView, sessionCall, setDisplayName, setFollowing, setReportEmail, startShare, switchShare, useClientForTest, useShare, validEmail, watchCursors } from './store';
import type { SessionState } from './types';

type Ref = Parameters<typeof getFunctionName>[0];
const SESSION = { sessionId: 's1', status: 'active', scan: { jobId: 'job-7' }, participants: [], isPresenter: true } as unknown as SessionState;

function fakeClient(over: Partial<Record<string, (args: unknown) => unknown>> = {}) {
  const calls: [string, unknown][] = [];
  const subs: { name: string; args: unknown; onData: (v: unknown) => void; onError?: (e: Error) => void; closed: boolean }[] = [];
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
      const sub = { name: getFunctionName(_ref), args: _args, onData, onError, closed: false };
      subs.push(sub);
      return Object.assign(() => { sub.closed = true; }, { unsubscribe: () => { sub.closed = true; }, getCurrentValue: () => undefined });
    },
  };
  return { client, calls, subs };
}

beforeEach(() => {
  useShare.setState({ stored: null, session: null, notice: null, syncNote: null });
  try { globalThis.localStorage?.removeItem('nv.displayName'); } catch { /* node without storage */ }
});

describe('messagesAfter', () => {
  const line = (messageId: string, createdAt: number) => ({ messageId, createdAt, role: 'user' as const, author: 'human' as const, authorName: 'A', text: messageId });
  it('counts rows newer than the seen id even when the page stays 50 long', () => {
    expect(messagesAfter([line('1', 1), line('2', 2), line('3', 3)], { messageId: '2', createdAt: 2 }).map((m) => m.messageId)).toEqual(['3']);
    const capped = Array.from({ length: 50 }, (_, i) => line(String(i + 2), i + 2));
    expect(messagesAfter(capped, { messageId: '1', createdAt: 1 })).toHaveLength(50);
    expect(messagesAfter(capped, { messageId: '50', createdAt: 50 }).map((m) => m.messageId)).toEqual(['51']);
    expect(messagesAfter(capped, null)).toEqual([]);
    const empty = { messageId: '', createdAt: 0 };
    expect(messagesAfter([], empty)).toEqual([]);
    expect(messagesAfter([line('m1', 10)], empty)).toHaveLength(1);
  });
});

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
  it('startShare sends a trimmed name, then the saved name, and otherwise Host', async () => {
    const bag = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => bag.get(k) ?? null, setItem: (k: string, v: string) => { bag.set(k, v); }, removeItem: (k: string) => { bag.delete(k); } });
    try {
      const f = fakeClient(); useClientForTest(f.client as never);
      expect(await startShare('job-7', '  Ada  ')).toBeNull();
      expect(f.calls[1][1]).toEqual({ scanId: 'scan1', hostDisplayName: 'Ada' });
      f.calls.length = 0;
      expect(await startShare('job-7')).toBeNull();
      expect(f.calls[1][1]).toEqual({ scanId: 'scan1', hostDisplayName: 'Ada' });
      f.calls.length = 0;
      bag.delete('nv.displayName');
      expect(await startShare('job-7', '   ')).toBeNull();
      expect(f.calls[1][1]).toEqual({ scanId: 'scan1', hostDisplayName: 'Host' });
    } finally { vi.unstubAllGlobals(); }
  });
  it('setDisplayName renames this participant and remembers the name', async () => {
    const bag = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => bag.get(k) ?? null, setItem: (k: string, v: string) => { bag.set(k, v); }, removeItem: (k: string) => { bag.delete(k); } });
    try {
      const f = fakeClient(); useClientForTest(f.client as never);
      await startShare('job-7');
      expect(await setDisplayName('  Bea  ')).toBeNull();
      expect(f.calls).toContainEqual(['sessions:setDisplayName', { sessionId: 's1', participantToken: 'host-t', displayName: 'Bea' }]);
      expect(bag.get('nv.displayName')).toBe('Bea');
      expect(await setDisplayName('   ')).toBe('Enter a name.');
    } finally { vi.unstubAllGlobals(); }
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
    expect(await joinShare('ABC123', 'Ana', 'ana@example.com')).toBeNull();
    expect(useShare.getState().stored).toMatchObject({ role: 'viewer', jobId: 'job-7' });
  });
  it('joinShare maps INVALID_INVITE to the invite copy', async () => {
    const f = fakeClient({ 'sessions:join': () => { throw new ConvexError({ code: 'INVALID_INVITE', message: 'x' }); } });
    useClientForTest(f.client as never);
    expect(await joinShare('NOPE', 'Ana', 'ana@example.com')).toBe("That invite link doesn't work. Ask the host for a new one.");
    expect(useShare.getState().stored).toBeNull();
  });
  it('SESSION_ENDED clears the token and shows the notice; a stale token clears silently', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    await joinShare('ABC123', 'Ana', 'ana@example.com');
    f.subs[0].onError!(new ConvexError({ code: 'SESSION_ENDED', message: 'x' }));
    expect(useShare.getState()).toMatchObject({ stored: null, session: null, notice: SESSION_ENDED });
    await joinShare('ABC123', 'Ana', 'ana@example.com');
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
    await joinShare('ABC123', 'Ana', 'ana@example.com');
    await setFollowing(false);
    expect(f.calls.at(-1)).toEqual(['sessions:setFollowMode', { sessionId: 's1', participantToken: 'guest-t', following: false }]);
  });
  it('joinShare sends the email to sessions.join', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    await joinShare('ABC123', 'Ana', 'ana@example.com');
    expect(f.calls).toContainEqual(['sessions:join', { inviteCode: 'ABC123', displayName: 'Ana', email: 'ana@example.com' }]);
  });
  it('setReportEmail saves the address for this participant', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    await startShare('job-7');
    expect(await setReportEmail('host@example.com')).toBeNull();
    expect(f.calls).toContainEqual(['reportMail:setMyEmail', { sessionId: 's1', participantToken: 'host-t', email: 'host@example.com' }]);
  });
  it('validEmail matches the server rule', () => {
    expect(validEmail(' a@b.co ')).toBe(true);
    expect(validEmail('a@b')).toBe(false);
    expect(validEmail(`${'a'.repeat(250)}@x.io`)).toBe(false);
  });
});

describe('moving the room to another case', () => {
  it('switchShare registers the new job and moves the session onto it, keeping the invite', async () => {
    const f = fakeClient({ 'jobs:registerScan': () => ({ scanId: 'scan2' }) }); useClientForTest(f.client as never);
    await startShare('job-7');
    f.calls.length = 0;
    await switchShare('upload-1', '3d');
    expect(f.calls.filter((c) => !c[0].startsWith('presence:'))).toEqual([
      ['jobs:registerScan', { jobId: 'upload-1' }],
      ['sessions:setScan', { sessionId: 's1', participantToken: 'host-t', scanId: 'scan2', page: '3d' }],
    ]);
    expect(useShare.getState().stored).toMatchObject({ role: 'host', inviteCode: 'ABC123', jobId: 'upload-1' });
  });
  it('switchShare does nothing for a guest or for the same job, and notes a failure', async () => {
    const f = fakeClient({ 'jobs:registerScan': () => { throw new ConvexError({ code: 'X', message: 'The imaging service did not answer.' }); } });
    useClientForTest(f.client as never);
    await joinShare('ABC123', 'Ana', 'ana@example.com');
    f.calls.length = 0;
    await switchShare('upload-1', 'mri');
    expect(f.calls).toEqual([]);
    useShare.setState({ stored: { ...useShare.getState().stored!, role: 'host' } });
    await switchShare('job-7', 'mri');
    expect(f.calls).toEqual([]);
    await switchShare('upload-1', 'mri');
    expect(useShare.getState().syncNote).toBe('The imaging service did not answer.');
    expect(useShare.getState().stored?.jobId).toBe('job-7');
  });
  it("a guest's stored job follows the session's case", async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    await joinShare('ABC123', 'Ana', 'ana@example.com');
    f.subs.find((x) => x.name === 'sessions:get')!.onData({ ...SESSION, scan: { jobId: 'upload-1' } });
    expect(useShare.getState().stored).toMatchObject({ role: 'viewer', jobId: 'upload-1' });
  });
});

describe('cursors', () => {
  it('send and watch use the stored token; both are no-ops without a session', () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    sendCursor(null);
    expect(watchCursors(() => {})).toBeTypeOf('function');
    expect(f.calls).toEqual([]);
    expect(f.subs).toHaveLength(0);
    useShare.setState({ stored: { sessionId: 's1', participantToken: 't', role: 'viewer', inviteCode: 'X', jobId: 'sample' } });
    sendCursor({ node: 'n', localMm: [1, 2, 3] });
    watchCursors(() => {});
    expect(f.calls).toEqual([['cursors:move', { sessionId: 's1', participantToken: 't', cursor: { node: 'n', localMm: [1, 2, 3] } }]]);
    expect(f.subs.at(-1)).toMatchObject({ name: 'cursors:list', args: { sessionId: 's1', participantToken: 't' } });
  });
});

it('sessionCall passes auth and rethrows the ConvexError data', async () => {
  const calls: unknown[] = [];
  const err = new ConvexError({ code: 'STALE', message: 'Changed' });
  const f = fakeClient({ 'board:update': (args) => { calls.push(args); throw err; } });
  useClientForTest(f.client as never);
  useShare.setState({ stored: { sessionId: 's1', participantToken: 'tok', role: 'host', inviteCode: 'c', jobId: 'sample' } as never });
  await expect(sessionCall('board.update', { itemId: 'i1' })).rejects.toBe(err);
  expect(calls).toEqual([{ sessionId: 's1', participantToken: 'tok', itemId: 'i1' }]);
});
