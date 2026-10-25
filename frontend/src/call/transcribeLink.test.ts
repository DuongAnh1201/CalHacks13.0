import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TranscriptSegment } from '../agent/transcribe';
import { useClientForTest, useShare } from '../share/store';
import { useCall } from './store';
import { linkTranscriber } from './transcribeLink';

type Ref = Parameters<typeof getFunctionName>[0];
const STORED = { sessionId: 's1', participantToken: 'tok', role: 'viewer' as const, inviteCode: 'A', jobId: 'sample' };

function fakeClient() {
  const calls: [string, unknown][] = [];
  const subs: { name: string; onData: (v: unknown) => void; closed: boolean }[] = [];
  const client = {
    query: async () => null,
    action: async () => null,
    mutation: async (ref: Ref, args: unknown) => { calls.push([getFunctionName(ref), args]); return null; },
    onUpdate: (ref: Ref, _args: unknown, onData: (v: unknown) => void) => {
      const sub = { name: getFunctionName(ref), onData, closed: false };
      subs.push(sub);
      return Object.assign(() => { sub.closed = true; }, { unsubscribe: () => { sub.closed = true; }, getCurrentValue: () => undefined });
    },
  };
  return { client, calls, subs };
}

function fakeTranscriber() {
  let on = false;
  const log: string[] = [];
  let emit: (s: TranscriptSegment) => void = () => {};
  const make = (onSegment: (s: TranscriptSegment) => void) => {
    emit = onSegment;
    return { supported: true, running: () => on, start: () => { on = true; log.push('start'); }, stop: () => { on = false; log.push('stop'); } };
  };
  return { make, log, emit: (s: TranscriptSegment) => emit(s) };
}

let unlink = () => {};
beforeEach(() => {
  useShare.setState({ stored: STORED, session: null, notice: null, syncNote: null });
  useCall.setState({ status: 'idle', muted: false, speaking: new Set(), error: null });
});
afterEach(() => unlink());

describe('linkTranscriber', () => {
  it('transcribes only while live, unmuted and switched on by the host', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    const tr = fakeTranscriber();
    unlink = linkTranscriber(tr.make);
    expect(f.subs).toEqual([]); // not in the call: no subscription, no mic

    useCall.setState({ status: 'live' });
    const state = f.subs.find((s) => s.name === 'transcript:state')!;
    expect(tr.log).toEqual([]); // switch not known yet
    state.onData({ enabled: true });
    expect(tr.log).toEqual(['start']);

    useCall.setState({ muted: true });
    expect(tr.log).toEqual(['start', 'stop']);
    useCall.setState({ muted: false });
    state.onData({ enabled: false });
    expect(tr.log).toEqual(['start', 'stop', 'start', 'stop']);

    state.onData({ enabled: true });
    useCall.setState({ status: 'idle' });
    expect(tr.log.at(-1)).toBe('stop');
    expect(state.closed).toBe(true);
  });

  it('posts each final segment with its duration', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    const tr = fakeTranscriber();
    unlink = linkTranscriber(tr.make);
    tr.emit({ text: 'enhancing rim at the margin', startedAt: 1000, endedAt: 3500 });
    await Promise.resolve();
    expect(f.calls).toEqual([['transcript:append', { sessionId: 's1', participantToken: 'tok', text: 'enhancing rim at the margin', durationMs: 2500 }]]);
  });
});
