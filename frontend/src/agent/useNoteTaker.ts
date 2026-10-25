import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AgentMessage, AgentPanelProps } from '../components/agent/types';
import { api, convex } from '../share/client';
import { useShare } from '../share/store';
import { useCall } from '../call/store';
import { transcriptionKey, useTranscription } from './transcription';
import { captureCanvas, uploadScreenshot, type CapturedImage, type ScreenshotUpload } from './screenshot';
import { createTranscriber, type Transcriber, type TranscriptSegment } from './transcribe';

/** Exactly the panel's props for the meeting note-taker. No onSend: the panel here is a live meeting log. */
export type NoteTakerBinding = Pick<AgentPanelProps, 'messages' | 'status' | 'onMic' | 'onSend' | 'script' | 'onRun' | 'onConfirm' | 'onDismiss'>;

export interface NoteTakerClient {
  mutation(ref: unknown, args: unknown): Promise<unknown>;
  action(ref: unknown, args: unknown): Promise<unknown>;
  onUpdate(ref: unknown, args: unknown, onData: (v: never) => void, onError?: (e: Error) => void): () => void;
}
export interface Creds { sessionId: string; participantToken: string; jobId: string; role: 'host' | 'viewer' }

interface Segment { segmentId: string; speakerName: string; text: string; startedAt: number; endedAt: number }
interface NoteView {
  text: string | null; version: number; isFinal: boolean;
  screenshots: { caption: string; takenAt: number; url: string }[];
  export: { exportId: string; version: number; status: 'pending' | 'ready' | 'failed'; trigger: 'manual' | 'auto'; url: string | null } | null;
}
interface ShotEvent { id: string; reason: string; runId?: string }

export interface NoteTakerDeps {
  client: NoteTakerClient;
  creds: Creds;
  makeTranscriber(on: { onSegment(s: TranscriptSegment): void; onError(code: string): void }): Transcriber;
  /** Presenter only. Null outside the browser. */
  getCanvas?(): HTMLCanvasElement | null;
  capture?(canvas: HTMLCanvasElement): Promise<CapturedImage>;
  upload?(image: CapturedImage, target: ScreenshotUpload): Promise<unknown>;
  /** Saves the export file. Default: a download link click (new tab if the browser blocks cross-origin downloads). */
  download?(url: string, filename: string): void;
  formatTime?(ms: number): string;
  now?(): number;
}
export interface NoteTakerState { messages: AgentMessage[]; status: AgentPanelProps['status'] }

const fmt = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const codeOf = (e: unknown): string => String(((e as { data?: { code?: unknown } } | null)?.data?.code) ?? '');
const PAGE = 200;
function defaultDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
}

export const EXPORT_LINE = 'Export summary';
export const NO_SESSION = 'Start a live session to take notes';
const BANNER = 'Transcription is on for this session. Only final text is shared with the notes.';

/** All logic of the note-taker panel. No React in here, so it is tested with a fake Convex client. */
export function createNoteTakerController(deps: NoteTakerDeps) {
  const { client, creds } = deps;
  const time = deps.formatTime ?? fmt;
  const now = deps.now ?? Date.now;
  const auth = { sessionId: creds.sessionId, participantToken: creds.participantToken };
  const host = creds.role === 'host';

  const segments = new Map<string, Segment>();
  let note: NoteView | null = null;
  let enabled = false, ended = false, blocked = false, failed = false, notice: string | null = null;
  let stops: (() => void)[] = [];
  let stopTranscript: (() => void) | null = null;
  let started = false;
  const seenEvents = new Set<string>();
  const dismissed = new Set<string>(); // `${exportId}:${status}` of confirm rows the user closed
  let waitingFor: string | null = null; // export we just requested, until forSession shows it settled
  let confirmAction: 'download' | 'retry' | null = null;
  const since = now();
  const listeners = new Set<() => void>();
  let state: NoteTakerState = { messages: [], status: 'ready' };

  const key = transcriptionKey(creds);
  const owner = { key };
  let generation = 0;
  let subscriptionGeneration = 0;
  let captureStops: (() => void)[] = [];
  const memberMuted = () => { const s = useTranscription.getState(); return s.memberKey === key && s.muted; };
  function canCapture() {
    const call = useCall.getState();
    const stored = useShare.getState().stored;
    return started && enabled && !memberMuted() && !ended && !blocked
      && useTranscription.getState().owner === owner
      && !!stored && transcriptionKey(stored) === key && useShare.getState().session?.status !== 'ended'
      && (call.status === 'idle' || call.status === 'error' || (call.status === 'live' && !call.muted));
  }
  function makeTranscriber() {
    const current = ++generation;
    return deps.makeTranscriber({
      onSegment: (s) => {
        if (current !== generation || !canCapture()) return;
        client.mutation(api.transcript.append, { ...auth, text: s.text, durationMs: Math.max(0, s.endedAt - s.startedAt) }).catch((e: unknown) => {
          const code = codeOf(e);
          if (code === 'SESSION_ENDED') markEnded();
          else if (code !== 'NOT_ALLOWED') { notice = 'A transcript line could not be saved.'; publish(); }
        });
      },
      onError: (code) => {
        if (current !== generation || !canCapture()) return;
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') blocked = true;
        syncCapture(); publish();
      },
    });
  }
  let transcriber = makeTranscriber();

  const capturing = () => transcriber.running();
  function syncCapture() {
    const want = canCapture() && transcriber.supported;
    if (!want && transcriber.running()) { generation++; transcriber.stop(); }
    if (want && !transcriber.running()) { transcriber = makeTranscriber(); transcriber.start(); }
  }

  function compute(): NoteTakerState {
    const out: AgentMessage[] = [];
    const sys = (text: string) => out.push({ kind: 'system', agent: 'Neuro Agent', text });
    if (ended) sys('Meeting ended. The final summary and export link appear below.');
    else if (enabled) {
      sys(BANNER);
      if (useCall.getState().status === 'live') sys('Voice call audio is carried by LiveKit.');
      if (!transcriber.supported) sys("This browser can't transcribe speech. You will still see everyone else's lines.");
      else if (blocked) sys('Microphone blocked. Allow it in the browser to transcribe your speech.');
      else if (memberMuted()) sys('You are muted: your speech is not transcribed.');
      else if (useCall.getState().status === 'live' && useCall.getState().muted) sys('Your call is muted: your speech is not transcribed.');
      else if (capturing()) sys('Transcribing your speech.');
      else sys('Your speech is not being transcribed.');
    } else sys(host ? 'Transcription is off. Press the mic to start it for everyone.' : 'Transcription is off. The host can start it.');
    if (notice) sys(notice);

    // Transcript lines and screenshots in time order.
    const timeline: { at: number; msg: AgentMessage }[] = [];
    for (const s of segments.values())
      timeline.push({ at: s.endedAt, msg: { kind: 'user', text: `${s.speakerName}: ${s.text}`, via: 'voice', at: time(s.endedAt) } });
    for (const shot of note?.screenshots ?? [])
      timeline.push({ at: shot.takenAt, msg: { kind: 'agent', agent: 'Scribe', at: time(shot.takenAt), text: `Screenshot: ${shot.caption}${shot.url ? `\n${shot.url}` : ' (image unavailable)'}` } });
    timeline.sort((a, b) => a.at - b.at);
    out.push(...timeline.map((t) => t.msg));

    if (note?.text) {
      out.push({ kind: 'agent', agent: 'Scribe', at: time(now()), text: note.isFinal ? `Final meeting summary\n${note.text}` : `Live notes (v${note.version})\n${note.text}` });
    }
    confirmAction = null;
    const e = note?.export ?? null;
    if (waitingFor && e?.exportId === waitingFor && e.status !== 'pending') waitingFor = null;
    const preparing = (waitingFor !== null && e?.exportId !== waitingFor) || e?.status === 'pending' || (ended && !e);
    if (preparing) out.push({ kind: 'agent', agent: 'Scribe', at: time(now()), text: 'Preparing export…' });
    else if (e && !dismissed.has(`${e.exportId}:${e.status}`)) {
      if (e.status === 'ready' && e.url) {
        confirmAction = 'download';
        out.push({ kind: 'confirm', agent: 'Scribe', text: ended ? 'The meeting summary is ready.' : `Export v${e.version} is ready.`, confirmLabel: 'Download summary (.md)', dismissLabel: 'Close' });
      } else if (e.status === 'failed') {
        confirmAction = 'retry';
        out.push({ kind: 'confirm', agent: 'Scribe', text: 'The export failed.', confirmLabel: 'Try again', dismissLabel: 'Close' });
      }
    }
    const status: NoteTakerState['status'] = failed ? 'offline' : capturing() ? 'listening' : 'ready';
    return { messages: out, status };
  }
  function publish() { state = compute(); listeners.forEach((l) => l()); }

  function watchTranscript(after?: number) {
    stopTranscript?.();
    stopTranscript = client.onUpdate(api.transcript.list, { ...auth, ...(after === undefined ? {} : { after }), limit: PAGE }, ((r: { segments: Segment[]; hasMore: boolean }) => {
      for (const s of r.segments) segments.set(s.segmentId, s);
      publish();
      // A long meeting: move the window forward instead of re-reading everything.
      if (r.hasMore && r.segments.length) watchTranscript(r.segments[r.segments.length - 1].startedAt);
    }) as (v: never) => void, fail);
  }
  function fail() { failed = true; publish(); }

  async function present(ev: ShotEvent) {
    if (seenEvents.has(ev.id)) return;
    seenEvents.add(ev.id);
    const canvas = deps.getCanvas?.();
    if (!canvas) return;
    try {
      const image = await (deps.capture ?? captureCanvas)(canvas);
      const scope = { ...auth, jobId: creds.jobId };
      await (deps.upload ?? uploadScreenshot)(image, {
        generateUploadUrl: () => client.mutation(api.screenshots.generateUploadUrl, scope) as Promise<string>,
        recordScreenshot: (data) => client.action(api.screenshots.recordScreenshot, { ...scope, ...data, reason: ev.reason, caption: ev.reason, ...(ev.runId ? { runId: ev.runId } : {}) }),
      });
    } catch {
      /* A missed screenshot must never break the meeting; the server enforces its own limits. */
    }
  }

  async function requestExport() {
    try {
      const r = (await client.mutation(api.exportDoc.requestMember, auth)) as { exportId: string };
      waitingFor = r.exportId; notice = null;
    } catch {
      notice = 'Could not start the export. Try again.';
    }
    publish();
  }

  function markEnded() {
    if (ended) return;
    ended = true;
    syncCapture();
    publish();
  }

  return {
    getState: () => state,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    /** Opens the live subscriptions. Safe to call again after dispose (React StrictMode). */
    start() {
      if (started) return;
      started = true; failed = false; enabled = false;
      const subscription = ++subscriptionGeneration;
      useTranscription.setState({ owner });
      const sync = () => { syncCapture(); publish(); };
      captureStops = [useCall.subscribe(sync), useTranscription.subscribe(sync), useShare.subscribe(sync)];
      stops = [
        client.onUpdate(api.transcript.state, auth, ((r: { enabled: boolean }) => { if (!started || subscription !== subscriptionGeneration) return; enabled = r.enabled; syncCapture(); publish(); }) as (v: never) => void, fail),
        client.onUpdate(api.notes.forSession, auth, ((r: NoteView | null) => { note = r; publish(); }) as (v: never) => void, fail),
      ];
      if (host) stops.push(client.onUpdate(api.screenshots.events, { ...auth, jobId: creds.jobId, since }, ((events: ShotEvent[]) => { if (!ended) for (const e of events) void present(e); }) as (v: never) => void, () => {}));
      watchTranscript();
      publish();
    },
    /** The mic button. Host: start or stop transcription for everyone. Member: mute or unmute only yourself. */
    async onMic() {
      if (ended) return;
      if (host) {
        try {
          await client.mutation(api.transcript.setEnabled, { ...auth, enabled: !enabled });
          blocked = false; notice = null;
        } catch (e) {
          if (codeOf(e) === 'SESSION_ENDED') markEnded();
          else { notice = 'Could not change transcription. Try again.'; publish(); }
        }
        return;
      }
      if (!enabled) return;
      useTranscription.setState({ memberKey: key, muted: !memberMuted() });
      syncCapture(); publish();
    },
    /** Script lines. "Export summary" builds a manual export of the meeting so far (members only, same builder). */
    async run(lines: string[]) {
      for (const line of lines) {
        if (line.trim().toLowerCase() === EXPORT_LINE.toLowerCase()) await requestExport();
        else { notice = `Unknown script line: ${line.trim().slice(0, 40)}`; publish(); }
      }
    },
    /** The confirm row: download the ready export, or re-run a failed one. */
    async onConfirm() {
      const e = note?.export;
      if (confirmAction === 'download' && e?.url) (deps.download ?? defaultDownload)(e.url, `meeting-summary-v${e.version}.md`);
      else if (confirmAction === 'retry') await requestExport();
    },
    onDismiss() {
      const e = note?.export;
      if (e) { dismissed.add(`${e.exportId}:${e.status}`); publish(); }
    },
    markEnded,
    dispose() {
      started = false;
      subscriptionGeneration++;
      generation++;
      if (transcriber.running()) transcriber.stop();
      captureStops.forEach((s) => s()); captureStops = [];
      if (useTranscription.getState().owner === owner) useTranscription.setState({ owner: null });
      stops.forEach((s) => s()); stops = [];
      stopTranscript?.(); stopTranscript = null;
    },
  };
}
export type NoteTakerController = ReturnType<typeof createNoteTakerController>;

const SCRIPT = [EXPORT_LINE];
export const OFFLINE_NOTE_TAKER: NoteTakerBinding = {
  messages: [{ kind: 'system', agent: 'Neuro Agent', text: NO_SESSION }],
  status: 'offline',
};

/**
 * Binds AgentPanel to the meeting note-taker for the case page.
 * Without a live session the panel is offline and says how to start one. After the
 * session ends, Sage's share store forgets the token, so the controller keeps its own
 * copy for this page visit to show the final summary and the export link.
 */
export function useNoteTaker(jobId: string): NoteTakerBinding {
  const stored = useShare((s) => s.stored);
  const sessionStatus = useShare((s) => s.session?.status);
  const key = stored && stored.jobId === jobId ? stored.sessionId : null;
  const [ctl, setCtl] = useState<{ id: string; ctl: NoteTakerController } | null>(null);
  const latest = useRef(ctl);
  latest.current = ctl;

  useEffect(() => {
    if (key && stored && convex && latest.current?.id !== key) {
      latest.current?.ctl.dispose();
      const created = createNoteTakerController({
        client: convex as unknown as NoteTakerClient,
        creds: { sessionId: stored.sessionId, participantToken: stored.participantToken, jobId, role: stored.role },
        makeTranscriber: ({ onSegment, onError }) => createTranscriber({ onSegment, onError }),
        getCanvas: () => document.querySelector('canvas'),
      });
      created.start();
      setCtl({ id: key, ctl: created });
    } else if (!key && latest.current) latest.current.ctl.markEnded(); // the share store dropped the session: it ended
  }, [key, jobId, stored]);
  useEffect(() => { if (sessionStatus === 'ended') latest.current?.ctl.markEnded(); }, [sessionStatus]);
  useEffect(() => { const c = latest.current; c?.ctl.start(); return () => c?.ctl.dispose(); }, [ctl?.id]);

  const active = ctl?.ctl;
  const state = useSyncExternalStore(active ? active.subscribe : noop, active ? active.getState : offlineState);
  if (!active) return OFFLINE_NOTE_TAKER;
  return {
    messages: state.messages, status: state.status, script: SCRIPT,
    onMic: () => { void active.onMic(); },
    onRun: (lines) => { void active.run(lines); },
    onConfirm: () => { void active.onConfirm(); },
    onDismiss: () => active.onDismiss(),
  };
}
const noop = () => () => {};
const offlineState = (): NoteTakerState => OFFLINE_NOTE_TAKER as NoteTakerState;
