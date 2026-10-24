import { getFunctionName } from 'convex/server';
import { ConvexError } from 'convex/values';
import { beforeEach, describe, expect, it } from 'vitest';
import { sendChat, useClientForTest, useShare, watchChat } from './store';
import type { ChatMessage } from './types';

type Ref = Parameters<typeof getFunctionName>[0];
const STORED = { sessionId: 's1', participantToken: 'tok', role: 'viewer' as const, inviteCode: 'A' };
const msg = (id: string, text: string): ChatMessage => ({ messageId: id, role: 'user', author: 'human', authorName: 'Ana', text, createdAt: 1 });

function fakeClient(send?: (args: unknown) => unknown) {
  const calls: [string, unknown][] = [];
  const subs: { name: string; args: unknown; onData: (v: unknown) => void; closed: boolean }[] = [];
  const client = {
    query: async () => null,
    mutation: async (ref: Ref, args: unknown) => { calls.push([getFunctionName(ref), args]); return send?.(args) ?? null; },
    onUpdate: (ref: Ref, args: unknown, onData: (v: unknown) => void) => {
      const sub = { name: getFunctionName(ref), args, onData, closed: false };
      subs.push(sub);
      return Object.assign(() => { sub.closed = true; }, { unsubscribe: () => { sub.closed = true; }, getCurrentValue: () => undefined });
    },
  };
  return { client, calls, subs };
}

beforeEach(() => useShare.setState({ stored: STORED, session: null, notice: null, syncNote: null }));

describe('session chat', () => {
  it('subscribes to the newest page with this tab\'s credentials and shows it oldest first', () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    const seen: ChatMessage[][] = [];
    const stop = watchChat((m) => seen.push(m), 30);

    expect(f.subs[0].name).toBe('messages:list');
    expect(f.subs[0].args).toEqual({ sessionId: 's1', participantToken: 'tok', paginationOpts: { numItems: 30, cursor: null } });
    f.subs[0].onData({ page: [msg('2', 'second'), msg('1', 'first')] });
    expect(seen.at(-1)!.map((m) => m.text)).toEqual(['first', 'second']);
    stop();
    expect(f.subs[0].closed).toBe(true);
  });

  it('does nothing outside a session', () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    useShare.setState({ stored: null });
    watchChat(() => {})();
    expect(f.subs).toHaveLength(0);
  });

  it('sendChat posts the text and returns null, or the server message on failure', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    expect(await sendChat('hello')).toBeNull();
    expect(f.calls.at(-1)).toEqual(['messages:send', { sessionId: 's1', participantToken: 'tok', text: 'hello' }]);

    const bad = fakeClient(() => { throw new ConvexError({ code: 'INVALID_ARGUMENT', message: 'A message cannot be empty.' }); });
    useClientForTest(bad.client as never);
    expect(await sendChat(' ')).toBe('A message cannot be empty.');
  });
});
