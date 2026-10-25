import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { createNoteTakerController, type NoteTakerClient } from '../agent/useNoteTaker';
import type { TranscriptSegment, Transcriber } from '../agent/transcribe';
import { useClientForTest as setClient, useShare } from '../share/store';
import { useCall } from './store';
import { linkTranscriber } from './transcribeLink';

const stored = { sessionId: 's1', participantToken: 'tok', role: 'viewer' as const, jobId: 'sample', inviteCode: 'A' };
const segment = { text: 'a final line', startedAt: 100, endedAt: 500 };
const cleanups: (() => void)[] = [];
beforeEach(() => {
  useShare.setState({ stored, session: null });
  useCall.setState({ status: 'idle', muted: false });
});
afterEach(() => { cleanups.splice(0).reverse().forEach((f) => f()); });

function setup(role: 'host' | 'viewer' = 'viewer') {
  const calls: { name: string; args: unknown }[] = [];
  const subs: { name: string; push(v: unknown): void; closed: boolean }[] = [];
  const client: NoteTakerClient = {
    async mutation(ref, args) { calls.push({ name: getFunctionName(ref as never), args }); },
    async action() {},
    onUpdate(ref, _args, onData) {
      const sub = { name: getFunctionName(ref as never), push: (v: unknown) => onData(v as never), closed: false };
      subs.push(sub); return () => { sub.closed = true; };
    },
  };
  setClient(client as never);
  const recognizers: { active: boolean; emit(s: TranscriptSegment): void }[] = [];
  let peak = 0;
  function make(onSegment: (s: TranscriptSegment) => void): Transcriber {
    const rec = { active: false, emit: onSegment };
    recognizers.push(rec);
    return { supported: true, running: () => rec.active,
      start() { rec.active = true; peak = Math.max(peak, recognizers.filter((r) => r.active).length); },
      stop() { rec.active = false; },
    };
  }
  const ctl = createNoteTakerController({ client, creds: { ...stored, role }, makeTranscriber: ({ onSegment }) => make(onSegment) });
  ctl.start(); cleanups.push(() => ctl.dispose());
  const unlink = linkTranscriber(make); cleanups.push(unlink);
  const enable = (enabled: boolean) => subs.filter((s) => !s.closed && s.name === 'transcript:state').forEach((s) => s.push({ enabled }));
  const active = () => recognizers.filter((r) => r.active);
  const append = () => calls.filter((c) => c.name === 'transcript:append');
  const banner = () => ctl.getState().messages.map((m) => 'text' in m ? m.text : '').join('|');
  return { ctl, unlink, enable, active, append, banner, recognizers, calls, subs, peak: () => peak };
}

it('uses one recognizer for panel and call; mute and member opt-out reject even late final callbacks', async () => {
  const f = setup();
  f.enable(true);
  expect(f.active()).toHaveLength(1); // standalone notes
  const standalone = f.active()[0];
  useCall.setState({ status: 'live' }); f.enable(true);
  expect(f.active()).toHaveLength(1);
  expect(f.peak()).toBe(1);
  f.active()[0].emit(segment);
  expect(f.append()).toHaveLength(1);
  const old = f.active()[0];
  useCall.setState({ muted: true });
  expect(f.active()).toHaveLength(0);
  old.emit(segment); standalone.emit(segment);
  expect(f.append()).toHaveLength(1);
  expect(f.banner()).toMatch(/call.*muted/i);
  expect(f.banner()).not.toMatch(/Audio stays on your device/);
  useCall.setState({ muted: false });
  expect(f.active()).toHaveLength(1);
  old.emit(segment); expect(f.append()).toHaveLength(1);
  const resumed = f.active()[0];
  resumed.emit(segment); expect(f.append()).toHaveLength(2);
  await f.ctl.onMic();
  expect(f.active()).toHaveLength(0);
  resumed.emit(segment); expect(f.append()).toHaveLength(2);
  expect(f.banner()).toMatch(/not transcribed/);
  await f.ctl.onMic();
  expect(f.active()).toHaveLength(1);
  f.active()[0].emit(segment); expect(f.append()).toHaveLength(3);
});

it('hands capture across panel disposal and remount, retaining member opt-out across /3d and /mri', async () => {
  const f = setup(); useCall.setState({ status: 'live' }); f.enable(true);
  await f.ctl.onMic();
  f.ctl.dispose(); f.enable(true);
  expect(f.active()).toHaveLength(0);
  f.ctl.start(); f.enable(true);
  expect(f.active()).toHaveLength(0);
  await f.ctl.onMic(); expect(f.active()).toHaveLength(1);
  const panel = f.active()[0];
  f.ctl.dispose(); f.enable(true);
  expect(f.active()).toHaveLength(1);
  panel.emit(segment); expect(f.append()).toHaveLength(0);
  const call = f.active()[0]; call.emit(segment); expect(f.append()).toHaveLength(1);
  f.ctl.start(); f.enable(true);
  expect(f.active()).toHaveLength(1); expect(f.peak()).toBe(1);
  call.emit(segment); expect(f.append()).toHaveLength(1);
});

it('host switch gates both paths; leaving restores standalone notes; session change and disposal reject stale callbacks', async () => {
  const f = setup('host'); useCall.setState({ status: 'live' }); f.enable(true);
  const old = f.active()[0];
  await f.ctl.onMic();
  expect(f.calls.at(-1)).toMatchObject({ name: 'transcript:setEnabled', args: { enabled: false } });
  f.enable(false); expect(f.active()).toHaveLength(0);
  old.emit(segment); expect(f.append()).toHaveLength(0);
  f.enable(true); expect(f.active()).toHaveLength(1);
  useCall.setState({ status: 'idle' });
  expect(f.active()).toHaveLength(1); // standalone notes still enabled
  const previous = f.active()[0];
  useShare.setState({ stored: { ...stored, sessionId: 's2', participantToken: 'other' } });
  previous.emit(segment); old.emit(segment);
  expect(f.append()).toHaveLength(0);
  expect(f.active()).toHaveLength(0);
  f.ctl.dispose(); f.unlink();
  f.recognizers.forEach((r) => r.emit(segment));
  expect(f.append()).toHaveLength(0);
});

it('call-only capture rejects pre-mute and pre-session callbacks after resuming', () => {
  const f = setup(); useCall.setState({ status: 'live' }); f.enable(true);
  f.ctl.dispose(); f.enable(true);
  const old = f.active()[0];
  useCall.setState({ muted: true });
  expect(f.active()).toHaveLength(0);
  old.emit(segment); expect(f.append()).toHaveLength(0);
  useCall.setState({ muted: false });
  expect(f.active()).toHaveLength(1);
  old.emit(segment); expect(f.append()).toHaveLength(0);
  const current = f.active()[0];
  current.emit(segment); expect(f.append()).toHaveLength(1);
  useShare.setState({ stored: { ...stored, participantToken: 'new-member' } });
  expect(f.active()).toHaveLength(0);
  f.enable(true); expect(f.active()).toHaveLength(1);
  current.emit(segment); expect(f.append()).toHaveLength(1);
  f.active()[0].emit(segment);
  expect(f.append().at(-1)?.args).toMatchObject({ participantToken: 'new-member' });
  f.unlink();
  f.recognizers.forEach((r) => r.emit(segment));
  expect(f.append()).toHaveLength(2);
});


it('reopened panel waits for fresh host settings and ignores the disposed subscription', () => {
  const f = setup(); f.enable(true);
  const previousState = f.subs.find((s) => s.name === 'transcript:state')!;
  f.ctl.dispose(); f.ctl.start();
  previousState.push({ enabled: true });
  useCall.setState({ muted: false });
  expect(f.active()).toHaveLength(0);
  f.enable(true); expect(f.active()).toHaveLength(1);
});

it('a controller created for old credentials cannot capture in the new session', () => {
  useShare.setState({ stored: { ...stored, sessionId: 's2' } });
  const f = setup(); f.enable(true);
  expect(f.active()).toHaveLength(0);
  f.recognizers.forEach((r) => r.emit(segment));
  expect(f.append()).toHaveLength(0);
});

it('same-session call rejoin ignores settings from the previous subscription', () => {
  const f = setup(); f.ctl.dispose();
  useCall.setState({ status: 'live' }); f.enable(true);
  const oldSettings = f.subs.filter((s) => !s.closed && s.name === 'transcript:state').at(-1)!;
  useCall.setState({ status: 'idle' });
  expect(f.active()).toHaveLength(0);
  useCall.setState({ status: 'live' });
  oldSettings.push({ enabled: true });
  expect(f.active()).toHaveLength(0);
  f.enable(true); expect(f.active()).toHaveLength(1);
});

it('failed call join resumes standalone notes without accepting pre-join final callbacks', () => {
  const f = setup(); f.enable(true);
  const old = f.active()[0];
  useCall.setState({ status: 'connecting' });
  expect(f.active()).toHaveLength(0);
  useCall.setState({ status: 'error', error: 'Call unavailable' });
  expect(f.active()).toHaveLength(1);
  old.emit(segment); expect(f.append()).toHaveLength(0);
  f.active()[0].emit(segment); expect(f.append()).toHaveLength(1);
});
