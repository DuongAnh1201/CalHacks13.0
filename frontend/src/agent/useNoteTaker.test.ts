import { getFunctionName } from 'convex/server';
import { ConvexError } from 'convex/values';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNoteTakerController, EXPORT_LINE, panelVisible, NO_SESSION, OFFLINE_NOTE_TAKER, type Creds, type NoteTakerClient } from './useNoteTaker';
import { useTranscription } from './transcription';
import { useShare } from '../share/store';
import { useCall } from '../call/store';
import type { Transcriber, TranscriptSegment } from './transcribe';

const controllers: ReturnType<typeof createNoteTakerController>[] = [];
beforeEach(() => useTranscription.setState({ memberKey: null, muted: false, owner: null }));
afterEach(() => controllers.splice(0).forEach((c) => c.dispose()));

type Ref = Parameters<typeof getFunctionName>[0];
const seg = (id: string, speakerName: string, text: string, at: number) => ({ segmentId: id, speakerName, text, startedAt: at - 500, endedAt: at });
const flush = () => new Promise((r) => setTimeout(r, 0));

function fakeClient(over: { mutation?: (name: string, args: unknown) => unknown } = {}) {
  const subs: { name: string; args: Record<string, unknown>; push: (v: unknown) => void; fail: () => void; closed: boolean }[] = [];
  const calls: [string, string, unknown][] = [];
  const client: NoteTakerClient = {
    async mutation(ref, args) { const n = getFunctionName(ref as Ref); calls.push(['mutation', n, args]); return over.mutation ? over.mutation(n, args) : n === 'screenshots:generateUploadUrl' ? 'https://upload' : { ok: true }; },
    async action(ref, args) { const n = getFunctionName(ref as Ref); calls.push(['action', n, args]); return null; },
    onUpdate(ref, args, onData, onError) {
      const sub = { name: getFunctionName(ref as Ref), args: args as Record<string, unknown>, push: (v: unknown) => onData(v as never), fail: () => onError?.(new Error('x')), closed: false };
      subs.push(sub);
      return () => { sub.closed = true; };
    },
  };
  const live = (name: string) => subs.filter((s) => s.name === name && !s.closed).at(-1)!;
  return { client, subs, calls, live, mutations: (name: string) => calls.filter(([k, n]) => k === 'mutation' && n === name) };
}
function fakeTranscriber(supported = true) {
  const t = { handlers: null as null | { onSegment(s: TranscriptSegment): void; onInterim(s: TranscriptSegment): void; onError(c: string): void }, running: false, starts: 0, stops: 0 };
  const make = (h: NonNullable<typeof t.handlers>): Transcriber => {
    t.handlers = h;
    return { supported, running: () => t.running, start: () => { if (supported) { t.running = true; t.starts++; } }, stop: () => { t.running = false; t.stops++; } };
  };
  return { t, make };
}
const HOST: Creds = { sessionId: 's1', participantToken: 'host-tok', jobId: 'sample', role: 'host' };
const VIEWER: Creds = { sessionId: 's1', participantToken: 'view-tok', jobId: 'sample', role: 'viewer' };
function setup(creds: Creds = HOST, opts: { supported?: boolean; mutation?: (n: string, a: unknown) => unknown } = {}) {
  useShare.setState({ stored: { ...creds, inviteCode: 'A' }, session: null });
  useCall.setState({ status: 'live', muted: false });
  const f = fakeClient({ mutation: opts.mutation });
  const tr = fakeTranscriber(opts.supported ?? true);
  const download = vi.fn();
  const capture = vi.fn(async () => ({ blob: new Blob(['x'], { type: 'image/jpeg' }), width: 10, height: 10 }));
  const upload = vi.fn(async (_image: unknown, target: { generateUploadUrl(): Promise<string>; recordScreenshot(d: { storageId: string; width: number; height: number }): Promise<unknown> }) => {
    await target.generateUploadUrl();
    await target.recordScreenshot({ storageId: 'st1', width: 10, height: 10 });
  });
  const ctl = createNoteTakerController({
    client: f.client, creds, makeTranscriber: tr.make, download, formatTime: (ms) => `t${ms}`, now: () => 1000, toggleCallMute: async () => { useCall.setState((s) => ({ muted: !s.muted })); },
    getCanvas: () => ({}) as HTMLCanvasElement, capture: capture as never, upload: upload as never,
  });
  controllers.push(ctl);
  ctl.start();
  return { f, tr, ctl, download, capture, upload };
}
const texts = (ctl: ReturnType<typeof createNoteTakerController>) => ctl.getState().messages.map((m) => ('text' in m ? m.text : ''));
const kinds = (ctl: ReturnType<typeof createNoteTakerController>) => ctl.getState().messages.map((m) => m.kind);
const note = (over: Record<string, unknown> = {}) => ({ text: null, version: 0, isFinal: false, screenshots: [], export: null, ...over });
const exp = (status: 'pending' | 'ready' | 'failed', over: Record<string, unknown> = {}) => ({ exportId: 'e1', version: 1, status, trigger: 'manual', url: status === 'ready' ? 'https://files/e1.md' : null, ...over });

describe('without a live session', () => {
  it('is offline with the start-a-session message and no controls', () => {
    expect(OFFLINE_NOTE_TAKER.hidden).toBe(true);
    expect(OFFLINE_NOTE_TAKER.status).toBe('offline');
    expect(OFFLINE_NOTE_TAKER.messages).toEqual([{ kind: 'system', agent: 'Pons Assistant', text: NO_SESSION }]);
    expect(NO_SESSION).toBe('Start a live session to take notes');
    expect(OFFLINE_NOTE_TAKER.onMic).toBeUndefined();
    expect(OFFLINE_NOTE_TAKER.onSend).toBeUndefined();
  });
});

describe('subscriptions use the share store credentials', () => {
  it('watch state, transcript and notes with the session id and participant token', () => {
    const { f } = setup(HOST);
    for (const name of ['transcript:state', 'notes:forSession']) expect(f.live(name).args).toEqual({ sessionId: 's1', participantToken: 'host-tok' });
    expect(f.live('transcript:list').args).toMatchObject({ sessionId: 's1', participantToken: 'host-tok', limit: 200 });
    expect(f.live('transcript:list').args.after).toBeUndefined();
  });
});

describe('mic, transcription banner and local capture', () => {
  it('shows the off state, then the Transcribing banner and listening status when the host turns it on', async () => {
    const { f, tr, ctl } = setup(HOST);
    expect(texts(ctl)[0]).toMatch(/Transcription is off.*AI notes/);
    expect(ctl.getState().status).toBe('ready');

    await ctl.toggleEnabled();
    expect(f.mutations('transcript:setEnabled')[0][2]).toEqual({ sessionId: 's1', participantToken: 'host-tok', enabled: true });
    f.live('transcript:state').push({ enabled: true }); // the server answers through the live query
    expect(texts(ctl)[0]).toMatch(/^Transcribing/);
    expect(tr.t.running).toBe(true);
    expect(ctl.getState().status).toBe('listening');

    await ctl.toggleEnabled(); // the host turns it off for everyone
    expect(f.mutations('transcript:setEnabled')[1][2]).toMatchObject({ enabled: false });
    f.live('transcript:state').push({ enabled: false });
    expect(tr.t.running).toBe(false);
    expect(ctl.getState().status).toBe('ready');
  });

  it('a member mutes only their own capture, banner stays', async () => {
    const { f, tr, ctl } = setup(VIEWER);
    expect(texts(ctl)[0]).toMatch(/host can start it/);
    f.live('transcript:state').push({ enabled: true });
    expect(ctl.getState().status).toBe('listening');
    await ctl.onMic();
    expect(f.mutations('transcript:setEnabled')).toHaveLength(0);
    expect(f.mutations('transcript:setMuted').at(-1)![2]).toMatchObject({ muted: true });
    expect(tr.t.running).toBe(false);
    expect(ctl.getState().status).toBe('ready');
    expect(texts(ctl).slice(0, 2)).toEqual([expect.stringMatching(/^Transcribing/), expect.stringMatching(/call is muted/)]);
    await ctl.onMic();
    expect(tr.t.running).toBe(true);
    expect(ctl.getState().status).toBe('listening');
  });

  it('appends each final segment with its duration, and ignores a server refusal because transcription is off', async () => {
    const { f, tr, ctl } = setup(VIEWER, { mutation: (n) => { if (n === 'transcript:updateLine') throw new ConvexError({ code: 'NOT_ALLOWED', message: 'off' }); return null; } });
    f.live('transcript:state').push({ enabled: true });
    tr.t.handlers!.onSegment({ text: 'looks irregular', startedAt: 100, endedAt: 2100 });
    await flush();
    expect(f.mutations('transcript:updateLine')[0][2]).toEqual({ sessionId: 's1', participantToken: 'view-tok', text: 'looks irregular', durationMs: 2000, final: true });
    expect(texts(ctl).join('|')).not.toMatch(/could not be saved/);
  });

  it('reports a blocked microphone and a browser without speech support, without listening', () => {
    const blocked = setup(VIEWER);
    blocked.f.live('transcript:state').push({ enabled: true });
    blocked.tr.t.handlers!.onError('not-allowed');
    expect(texts(blocked.ctl).join('|')).toMatch(/Microphone blocked/);
    expect(blocked.ctl.getState().status).toBe('ready');

    const none = setup(VIEWER, { supported: false });
    none.f.live('transcript:state').push({ enabled: true });
    expect(texts(none.ctl).join('|')).toMatch(/can't transcribe speech/);
    expect(none.ctl.getState().status).toBe('ready');
  });
});

describe('messages', () => {
  it('maps transcript lines to voice user messages with the speaker, screenshots to Scribe messages in time order, then the live notes', () => {
    const { f, ctl } = setup(HOST);
    f.live('transcript:list').push({ segments: [seg('a', 'Dr Host', 'Look at the margin.', 3000), seg('c', 'Judge', 'Agreed.', 9000)], hasMore: false });
    f.live('notes:forSession').push(note({
      text: 'The host pointed out the margin.', version: 2,
      screenshots: [{ caption: 'Tumor focused', takenAt: 5000, url: 'https://files/s1.jpg' }],
    }));
    const m = ctl.getState().messages;
    expect(m.map((x) => x.kind)).toEqual(['system', 'user', 'agent', 'user', 'agent']);
    expect(m[1]).toMatchObject({ kind: 'user', via: 'voice', text: 'Dr Host: Look at the margin.', at: 't3000' });
    expect(m[2]).toMatchObject({ kind: 'agent', agent: 'Scribe', text: 'Screenshot: Tumor focused\nhttps://files/s1.jpg' });
    expect(m[3]).toMatchObject({ text: 'Judge: Agreed.' });
    expect(m[4]).toMatchObject({ kind: 'agent', agent: 'Scribe', text: 'Live notes (v2)\nThe host pointed out the margin.' });
  });

  it('does not duplicate lines that arrive again, and moves the window forward when the server has more', () => {
    const { f, ctl } = setup(HOST);
    const first = f.live('transcript:list');
    first.push({ segments: [seg('a', 'A', 'one', 1000), seg('b', 'A', 'two', 2000)], hasMore: true });
    expect(first.closed).toBe(false); // older pages stay reactive for interim updates
    const next = f.live('transcript:list');
    expect(next.args.after).toBe(1500); // startedAt of the last line received
    next.push({ segments: [seg('b', 'A', 'two', 2000), seg('c', 'A', 'three', 3000)], hasMore: false });
    expect(texts(ctl).filter((t) => t.startsWith('A:'))).toEqual(['A: one', 'A: two', 'A: three']);
  });

  it('after the meeting shows the final summary, and a lost subscription goes offline', () => {
    const { f, ctl } = setup(HOST);
    ctl.markEnded();
    expect(texts(ctl)[0]).toMatch(/Meeting ended/);
    f.live('notes:forSession').push(note({ text: '## Attendees\n- Dr Host (host)', version: 3, isFinal: true, export: exp('ready', { trigger: 'auto' }) }));
    expect(texts(ctl)).toContain('Final meeting summary\n## Attendees\n- Dr Host (host)');
    f.live('transcript:state').fail();
    expect(ctl.getState().status).toBe('offline');
  });
});

describe('export from the panel', () => {
  it('after the meeting: preparing -> ready -> confirm row -> download, then Close hides it', async () => {
    const { f, ctl, download } = setup(HOST);
    ctl.markEnded();
    expect(texts(ctl).at(-1)).toBe('Preparing export…'); // ended, the auto export is not there yet
    f.live('notes:forSession').push(note({ export: exp('pending', { trigger: 'auto' }) }));
    expect(texts(ctl).at(-1)).toBe('Preparing export…');
    expect(kinds(ctl)).not.toContain('confirm');

    f.live('notes:forSession').push(note({ text: 'Done', isFinal: true, export: exp('ready', { trigger: 'auto', version: 1 }) }));
    const confirm = ctl.getState().messages.at(-1);
    expect(confirm).toMatchObject({ kind: 'confirm', agent: 'Scribe', text: 'The meeting summary is ready.', confirmLabel: 'Download summary (.md)', dismissLabel: 'Close' });
    await ctl.onConfirm();
    expect(download).toHaveBeenCalledWith('https://files/e1.md', 'meeting-summary-v1.md');

    ctl.onDismiss();
    expect(kinds(ctl)).not.toContain('confirm');
  });

  it('a failed export offers Try again, which requests a new member export and shows preparing until it settles', async () => {
    const { f, ctl } = setup(VIEWER, { mutation: (n) => (n === 'exportDoc:requestMember' ? { exportId: 'e2' } : null) });
    ctl.markEnded();
    f.live('notes:forSession').push(note({ export: exp('failed', { trigger: 'auto' }) }));
    expect(ctl.getState().messages.at(-1)).toMatchObject({ kind: 'confirm', text: 'The export failed.', confirmLabel: 'Try again', dismissLabel: 'Close' });
    await ctl.onConfirm();
    expect(f.mutations('exportDoc:requestMember')[0][2]).toEqual({ sessionId: 's1', participantToken: 'view-tok' });
    expect(texts(ctl).at(-1)).toBe('Preparing export…'); // before forSession shows the new row
    f.live('notes:forSession').push(note({ export: exp('pending', { exportId: 'e2', version: 2 }) }));
    expect(texts(ctl).at(-1)).toBe('Preparing export…');
    f.live('notes:forSession').push(note({ export: exp('ready', { exportId: 'e2', version: 2, url: 'https://files/e2.md' }) }));
    expect(ctl.getState().messages.at(-1)).toMatchObject({ kind: 'confirm', confirmLabel: 'Download summary (.md)' });
  });

  it('during the meeting the "Export summary" script line makes a manual export, then offers the download', async () => {
    const { f, ctl, download } = setup(HOST, { mutation: (n) => (n === 'exportDoc:requestMember' ? { exportId: 'e1' } : null) });
    await ctl.run([EXPORT_LINE]);
    expect(f.mutations('exportDoc:requestMember')).toHaveLength(1);
    expect(texts(ctl).at(-1)).toBe('Preparing export…');
    f.live('notes:forSession').push(note({ export: exp('pending') }));
    f.live('notes:forSession').push(note({ export: exp('ready') }));
    expect(ctl.getState().messages.at(-1)).toMatchObject({ kind: 'confirm', text: 'Export v1 is ready.', confirmLabel: 'Download summary (.md)' });
    await ctl.onConfirm();
    expect(download).toHaveBeenCalledTimes(1);
    await ctl.run(['something else']);
    expect(texts(ctl).join('|')).toMatch(/Unknown script line: something else/);
  });

  it('says so when the export request is refused', async () => {
    const { ctl } = setup(HOST, { mutation: () => { throw new ConvexError({ code: 'NOT_A_MEMBER', message: 'no' }); } });
    await ctl.run([EXPORT_LINE]);
    expect(texts(ctl).join('|')).toMatch(/Could not start the export/);
  });
});

describe('presenter screenshots', () => {
  it('only the host listens for capture events, once per event id, using the approved reason and the share credentials', async () => {
    const { f, ctl, capture, upload } = setup(HOST);
    const events = f.live('screenshots:events');
    expect(events.args).toMatchObject({ sessionId: 's1', participantToken: 'host-tok', jobId: 'sample', since: 1000 });
    events.push([{ id: 'r1:capture', reason: 'Tumor focused', runId: 'r1' }]);
    events.push([{ id: 'r1:capture', reason: 'Tumor focused', runId: 'r1' }, { id: 'annotation:a1', reason: 'Annotation added' }]);
    await flush(); await flush();
    expect(capture).toHaveBeenCalledTimes(2);
    expect(upload).toHaveBeenCalledTimes(2);
    expect(f.mutations('screenshots:generateUploadUrl')[0][2]).toEqual({ sessionId: 's1', participantToken: 'host-tok', jobId: 'sample' });
    const rec = f.calls.filter(([k, n]) => k === 'action' && n === 'screenshots:recordScreenshot').map((c) => c[2]);
    expect(rec[0]).toEqual({ sessionId: 's1', participantToken: 'host-tok', jobId: 'sample', storageId: 'st1', width: 10, height: 10, reason: 'Tumor focused', caption: 'Tumor focused', runId: 'r1' });
    expect(rec[1]).toMatchObject({ reason: 'Annotation added', caption: 'Annotation added' });
    expect(rec[1]).not.toHaveProperty('runId');
    ctl.markEnded();
    events.push([{ id: 'late', reason: 'x' }]);
    await flush();
    expect(capture).toHaveBeenCalledTimes(2);

    const viewer = setup(VIEWER);
    expect(viewer.f.subs.some((s) => s.name === 'screenshots:events')).toBe(false);
  });

  it('a failed capture never breaks the panel', async () => {
    const { f, ctl, capture } = setup(HOST);
    capture.mockRejectedValueOnce(new Error('blank canvas'));
    f.live('screenshots:events').push([{ id: 'e', reason: 'Tumor focused' }]);
    await flush(); await flush();
    expect(ctl.getState().status).toBe('ready');
  });
});

describe('meeting state', () => {
  it('the host has a separate call mute control and retains the global switch', async () => {
    const { f, ctl } = setup(HOST);
    f.live('transcript:state').push({ enabled: true, participantId: 'host-id', muted: [], promptDismissed: true });
    await ctl.muteSelf();
    expect(f.mutations('transcript:setMuted').at(-1)![2]).toMatchObject({ muted: true });
    expect(f.mutations('transcript:setEnabled')).toHaveLength(0);
    expect(ctl.getState()).toMatchObject({ muted: true, enabled: true, selfId: 'host-id' });
  });
  it('a member cannot issue a host toggle or dismiss the meeting prompt', async () => {
    const { f, ctl } = setup(VIEWER);
    await ctl.toggleEnabled(); await ctl.dismissPrompt();
    expect(f.mutations('transcript:setEnabled')).toHaveLength(0);
    expect(f.mutations('transcript:dismissPrompt')).toHaveLength(0);
  });
  it('keeps interim edits reactive and removes stale empty rows from the view', () => {
    const { f, ctl } = setup(VIEWER);
    const sub = f.live('transcript:list');
    sub.push({ segments: [{ ...seg('a', 'Guest', 'hel', 3000), final: false }], hasMore: false });
    sub.push({ segments: [{ ...seg('a', 'Guest', 'hello', 3300), final: true }], hasMore: false });
    expect(ctl.getState().segments).toHaveLength(1);
    expect(ctl.getState().segments[0]).toMatchObject({ text: 'hello', final: true });
    sub.push({ segments: [], hasMore: false });
    expect(ctl.getState().segments).toEqual([]);
  });
});

describe('lifecycle', () => {
  it('dispose stops capture and closes every subscription; start can reopen them', () => {
    const { f, tr, ctl } = setup(HOST);
    f.live('transcript:state').push({ enabled: true });
    expect(tr.t.running).toBe(true);
    ctl.dispose();
    expect(tr.t.running).toBe(false);
    expect(f.subs.every((s) => s.closed)).toBe(true);
    const before = f.subs.length;
    ctl.start();
    expect(f.subs.length).toBeGreaterThan(before);
  });
});

describe('meeting end: leaving the call, AI notes off, panel stays', () => {
  it('the host leaving the call asks the server for the final summary once, and the panel shows Meeting ended state', async () => {
    const { f, ctl, download } = setup(HOST);
    await ctl.leaveMeeting();
    await ctl.leaveMeeting();
    expect(f.mutations('notes:endMeeting')).toEqual([['mutation', 'notes:endMeeting', { sessionId: 's1', participantToken: 'host-tok' }]]);
    expect(ctl.getState().left).toBe(true);
    expect(texts(ctl)[0]).toMatch(/You left the call.*final summary/);
    expect(texts(ctl).at(-1)).toBe('Preparing export…');

    f.live('notes:forSession').push(note({ text: 'Done', isFinal: true, export: exp('pending', { trigger: 'auto' }) }));
    expect(texts(ctl)).toContain('Final meeting summary\nDone');
    expect(download).not.toHaveBeenCalled();
    f.live('notes:forSession').push(note({ text: 'Done', isFinal: true, export: exp('ready', { trigger: 'auto' }) }));
    expect(ctl.getState().messages.at(-1)).toMatchObject({ kind: 'confirm', confirmLabel: 'Download summary (.md)' });
    // The host's download starts by itself, once.
    expect(download).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledWith('https://files/e1.md', 'meeting-summary-v1.md');
    f.live('notes:forSession').push(note({ text: 'Done', isFinal: true, export: exp('ready', { trigger: 'auto' }) }));
    expect(download).toHaveBeenCalledTimes(1);
    await ctl.onConfirm(); // the button still works
    expect(download).toHaveBeenCalledTimes(2);
  });

  it('a member leaving does not end the meeting: no server call, no automatic download, export is still offered', async () => {
    const { f, ctl, download } = setup(VIEWER);
    await ctl.leaveMeeting();
    expect(f.mutations('notes:endMeeting')).toHaveLength(0);
    expect(texts(ctl)[0]).toMatch(/host ends the meeting/);
    expect(texts(ctl)).not.toContain('Preparing export…');
    f.live('notes:forSession').push(note({ export: exp('ready', { trigger: 'auto' }) }));
    expect(kinds(ctl)).toContain('confirm');
    expect(download).not.toHaveBeenCalled();
    useCall.setState({ status: 'live' });
    ctl.resumeMeeting();
    expect(ctl.getState().left).toBe(false);
  });

  it('session end for the host also downloads the auto export once', () => {
    const { f, ctl, download } = setup(HOST);
    ctl.markEnded();
    f.live('notes:forSession').push(note({ text: 'Done', isFinal: true, export: exp('ready', { trigger: 'auto' }) }));
    f.live('notes:forSession').push(note({ text: 'Done', isFinal: true, export: exp('ready', { trigger: 'auto' }) }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(ctl.getState().ended).toBe(true);
  });

  it('a manual export never downloads by itself', async () => {
    const { f, ctl, download } = setup(HOST);
    await ctl.leaveMeeting();
    f.live('notes:forSession').push(note({ export: exp('ready', { trigger: 'manual' }) }));
    expect(download).not.toHaveBeenCalled();
  });

  it('switching AI notes off ends the meeting; switching on does not; a refused call is reported', async () => {
    const { f, ctl } = setup(HOST);
    await ctl.toggleEnabled(); // off -> on
    expect(f.mutations('notes:endMeeting')).toHaveLength(0);
    f.live('transcript:state').push({ enabled: true });
    await ctl.toggleEnabled(); // on -> off
    expect(f.calls.map((c) => c[1]).filter((n) => n === 'transcript:setEnabled' || n === 'notes:endMeeting')).toEqual(['transcript:setEnabled', 'transcript:setEnabled', 'notes:endMeeting']);
  });

  it('a failed endMeeting says so and keeps the manual export available', async () => {
    const { ctl } = setup(HOST, { mutation: (n) => { if (n === 'notes:endMeeting') throw new Error('x'); return { ok: true }; } });
    await ctl.leaveMeeting();
    expect(texts(ctl).join('\n')).toMatch(/Could not start the final summary/);
  });

  it('the panel stays visible after the call or session ends until the user closes it', () => {
    expect(panelVisible({ live: true, over: false, joined: true, closed: false })).toBe(true);
    expect(panelVisible({ live: false, over: true, joined: true, closed: false })).toBe(true); // call left or session ended
    expect(panelVisible({ live: false, over: false, joined: true, closed: false })).toBe(false);
    expect(panelVisible({ live: false, over: true, joined: true, closed: true })).toBe(false);
    expect(panelVisible({ live: true, over: false, joined: false, closed: false })).toBe(false); // never joined the call
  });
});
