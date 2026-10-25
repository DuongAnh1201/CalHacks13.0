import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createNoteTakerController, type NoteTakerClient } from '../agent/useNoteTaker';
import { useTranscription } from '../agent/transcription';
import type { TranscriptSegment, Transcriber } from '../agent/transcribe';
import { useClientForTest as setClient, useShare } from '../share/store';
import { useCall } from './store';
import { linkTranscriber } from './transcribeLink';

const stored = { sessionId: 's1', participantToken: 'tok', role: 'viewer' as const, jobId: 'sample', inviteCode: 'A' };
const segment = { text: 'a final line', startedAt: 100, endedAt: 500 };
const cleanups: (() => void)[] = [];
const flush = () => vi.advanceTimersByTimeAsync(335);
beforeEach(() => {
  vi.useFakeTimers();
  useTranscription.setState({ owner: null, memberKey: null, muted: false });
  useShare.setState({ stored, session: null });
  useCall.setState({ status: 'idle', muted: false });
});
afterEach(() => { cleanups.splice(0).reverse().forEach((f) => f()); vi.clearAllTimers(); vi.useRealTimers(); });

function setup(role: 'host' | 'viewer' = 'viewer') {
  const calls: { name: string; args: unknown }[] = [];
  const subs: { name: string; push(v: unknown): void; closed: boolean }[] = [];
  let nextId = 0;
  const client: NoteTakerClient = {
    async mutation(ref, args) {
      const name = getFunctionName(ref as never); calls.push({ name, args });
      return name === 'transcript:updateLine' ? { segmentId: (args as { segmentId?: string }).segmentId ?? `line${++nextId}` } : undefined;
    },
    async action() {},
    onUpdate(ref, _args, onData) {
      const sub = { name: getFunctionName(ref as never), push: (v: unknown) => onData(v as never), closed: false };
      subs.push(sub); return () => { sub.closed = true; };
    },
  };
  setClient(client as never);
  const recognizers: { active: boolean; emit(s: TranscriptSegment): void; interim(s: TranscriptSegment): void }[] = [];
  let peak = 0;
  function make(onSegment: (s: TranscriptSegment) => void, onInterim = (_s: TranscriptSegment) => {}): Transcriber {
    const rec = { active: false, emit: onSegment, interim: onInterim }; recognizers.push(rec);
    return { supported: true, running: () => rec.active,
      start() { rec.active = true; peak = Math.max(peak, recognizers.filter((r) => r.active).length); },
      stop() { rec.active = false; },
    };
  }
  const ctl = createNoteTakerController({ client, creds: { ...stored, role },
    makeTranscriber: ({ onSegment, onInterim }) => make(onSegment, onInterim),
    toggleCallMute: async () => { useCall.setState((s) => ({ muted: !s.muted })); },
  });
  ctl.start(); cleanups.push(() => ctl.dispose());
  const unlink = linkTranscriber(make); cleanups.push(unlink);
  const enable = (enabled: boolean) => subs.filter((s) => !s.closed && s.name === 'transcript:state').forEach((s) => s.push({ enabled }));
  const active = () => recognizers.filter((r) => r.active);
  const lines = () => calls.filter((c) => c.name === 'transcript:updateLine');
  const live = () => { useCall.setState({ status: 'live' }); enable(true); };
  return { ctl, unlink, enable, live, active, lines, recognizers, calls, subs, peak: () => peak };
}

it('captures only in a live call, shares interim/final updates on one row, and rejects late mute/leave callbacks', async () => {
  const f = setup(); f.enable(true);
  expect(f.active()).toHaveLength(0); // no standalone recognizer
  f.live(); expect(f.active()).toHaveLength(1);
  const rec = f.active()[0];
  rec.interim({ ...segment, text: 'a final' }); await flush();
  rec.emit(segment); await flush();
  expect(f.lines().map((c) => c.args)).toMatchObject([{ text: 'a final', final: false }, { segmentId: 'line1', text: 'a final line', final: true }]);
  await f.ctl.onMic(); // viewer's mic is the call mute
  expect(useCall.getState().muted).toBe(true); expect(f.active()).toHaveLength(0);
  rec.emit(segment); rec.interim(segment); await flush(); expect(f.lines()).toHaveLength(2);
  await f.ctl.onMic(); expect(f.active()).toHaveLength(1);
  const resumed = f.active()[0]; useCall.setState({ status: 'idle' });
  expect(f.active()).toHaveLength(0);
  resumed.emit(segment); await flush(); expect(f.lines()).toHaveLength(2);
  expect(f.calls.some((c) => c.name === 'transcript:finishOwn')).toBe(true);
  expect(f.peak()).toBe(1);
});

it('hands one recognizer across panel disposal and remount while call mute survives both routes', async () => {
  const f = setup(); f.live();
  await f.ctl.onMic(); f.ctl.dispose(); f.enable(true);
  expect(f.active()).toHaveLength(0);
  f.ctl.start(); f.enable(true); expect(f.active()).toHaveLength(0);
  await f.ctl.onMic(); expect(f.active()).toHaveLength(1);
  const panel = f.active()[0]; f.ctl.dispose(); f.enable(true);
  expect(f.active()).toHaveLength(1);
  panel.emit(segment); expect(f.lines()).toHaveLength(0);
  const call = f.active()[0]; call.interim({ ...segment, text: 'call interim' }); await flush();
  call.emit(segment); await flush();
  expect(f.lines().map((c) => c.args)).toMatchObject([{ text: 'call interim', final: false }, { segmentId: 'line1', final: true }]);
  f.ctl.start(); f.enable(true); expect(f.active()).toHaveLength(1); expect(f.peak()).toBe(1);
  call.emit(segment); await flush(); expect(f.lines()).toHaveLength(2);
});

it('preserves the host global switch, uses a separate call mute, and never resumes capture after Leave', async () => {
  const f = setup('host'); f.live(); const old = f.active()[0];
  await f.ctl.onMic();
  expect(f.calls.find((c) => c.name === 'transcript:setEnabled')).toMatchObject({ args: { enabled: false } });
  expect(f.calls.at(-1)).toMatchObject({ name: 'notes:endMeeting' }); // switching AI notes off ends the meeting
  f.enable(false); expect(f.active()).toHaveLength(0);
  old.emit(segment); expect(f.lines()).toHaveLength(0);
  f.enable(true); await f.ctl.muteSelf(); expect(useCall.getState().muted).toBe(true);
  expect(f.calls.filter((c) => c.name === 'transcript:setEnabled')).toHaveLength(1);
  await f.ctl.muteSelf(); expect(f.active()).toHaveLength(1);
  const previous = f.active()[0]; useCall.setState({ status: 'idle' });
  expect(f.active()).toHaveLength(0);
  previous.emit(segment); old.emit(segment); await flush(); expect(f.lines()).toHaveLength(0);
});

it('call-only capture rejects pre-mute and pre-session callbacks after resuming', async () => {
  const f = setup(); f.live(); f.ctl.dispose(); f.enable(true);
  const old = f.active()[0]; useCall.setState({ muted: true });
  expect(f.active()).toHaveLength(0); old.emit(segment); expect(f.lines()).toHaveLength(0);
  useCall.setState({ muted: false }); const current = f.active()[0];
  old.emit(segment); expect(f.lines()).toHaveLength(0);
  current.emit(segment); await flush(); expect(f.lines()).toHaveLength(1);
  useShare.setState({ stored: { ...stored, participantToken: 'new-member' } });
  expect(f.active()).toHaveLength(0); f.enable(true); expect(f.active()).toHaveLength(1);
  current.emit(segment); expect(f.lines()).toHaveLength(1);
  f.active()[0].emit(segment); await flush(); expect(f.lines().at(-1)?.args).toMatchObject({ participantToken: 'new-member' });
  f.unlink(); f.recognizers.forEach((r) => r.emit(segment)); await flush(); expect(f.lines()).toHaveLength(2);
});

it('reopened panel waits for fresh host settings and ignores the disposed subscription', () => {
  const f = setup(); f.live(); const previous = f.subs.find((s) => s.name === 'transcript:state')!;
  f.ctl.dispose(); f.ctl.start(); previous.push({ enabled: true });
  expect(f.active()).toHaveLength(0); f.enable(true); expect(f.active()).toHaveLength(1);
});

it('a controller created for old credentials cannot capture in a new session', () => {
  useShare.setState({ stored: { ...stored, sessionId: 's2' } });
  const f = setup(); f.live();
  // The fallback belongs to s2; the stale panel for s1 must never be its owner.
  expect(f.active()).toHaveLength(1);
  expect(useTranscription.getState().owner?.key).toBe('s1:tok');
  const old = f.recognizers[0]; old.emit(segment); expect(f.lines()).toHaveLength(0);
});

it('same-session call rejoin ignores settings from the previous subscription', () => {
  const f = setup(); f.ctl.dispose(); f.live();
  const old = f.subs.filter((s) => !s.closed && s.name === 'transcript:state').at(-1)!;
  useCall.setState({ status: 'idle' }); expect(f.active()).toHaveLength(0);
  useCall.setState({ status: 'live' }); old.push({ enabled: true });
  expect(f.active()).toHaveLength(0); f.enable(true); expect(f.active()).toHaveLength(1);
});

it('connecting and failed calls never start standalone capture or accept callbacks from the old call', async () => {
  const f = setup(); f.live(); const old = f.active()[0];
  useCall.setState({ status: 'connecting' }); expect(f.active()).toHaveLength(0);
  useCall.setState({ status: 'error', error: 'Call unavailable' }); expect(f.active()).toHaveLength(0);
  old.emit(segment); await flush(); expect(f.lines()).toHaveLength(0);
});
