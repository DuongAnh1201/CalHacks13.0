import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { AgentMessage, AgentPanelProps } from '../components/agent/types';
import { api, convex } from '../share/client';
import { useShare } from '../share/store';
import { toggleMute, useCall } from '../call/store';
import { transcriptionKey, useTranscription } from './transcription';
import { captureCanvas, uploadScreenshot, type CapturedImage, type ScreenshotUpload } from './screenshot';
import { createTranscriptWriter } from './transcriptWriter';
import { createTranscriber, type Transcriber, type TranscriptSegment } from './transcribe';

/** Exactly the panel's props for the meeting note-taker. No onSend: the panel here is a live meeting log. */
export type NoteTakerBinding = Pick<AgentPanelProps, 'messages' | 'status' | 'onMic' | 'onSend' | 'script' | 'onRun' | 'onConfirm' | 'onDismiss'> & {
  hidden: boolean; meeting?: NoteTakerState; muteSelf?(): void; toggleEnabled?(): void; dismissPrompt?(): void; exportSummary?(): void;
};

export interface NoteTakerClient {
  mutation(ref: unknown, args: unknown): Promise<unknown>;
  action(ref: unknown, args: unknown): Promise<unknown>;
  onUpdate(ref: unknown, args: unknown, onData: (v: never) => void, onError?: (e: Error) => void): () => void;
}
export interface Creds { sessionId: string; participantToken: string; jobId: string; role: 'host' | 'viewer' }

export interface Segment { segmentId: string; participantId?: string; speakerName: string; text: string; startedAt: number; endedAt: number; final?: boolean; updatedAt?: number }
export interface MeetingEvent { at: number; participantId: string; speakerName: string; kind: 'on' | 'off' | 'mute' | 'unmute' }
export interface NoteView {
  text: string | null; version: number; isFinal: boolean;
  screenshots: { caption: string; takenAt: number; url: string }[];
  export: { exportId: string; version: number; status: 'pending' | 'ready' | 'failed'; trigger: 'manual' | 'auto'; url: string | null } | null;
}
interface ShotEvent { id: string; reason: string; runId?: string }

export interface NoteTakerDeps {
  client: NoteTakerClient;
  creds: Creds;
  makeTranscriber(on: { onSegment(s: TranscriptSegment): void; onInterim(s: TranscriptSegment): void; onError(code: string): void }): Transcriber;
  /** Presenter only. Null outside the browser. */
  getCanvas?(): HTMLCanvasElement | null;
  capture?(canvas: HTMLCanvasElement): Promise<CapturedImage>;
  upload?(image: CapturedImage, target: ScreenshotUpload): Promise<unknown>;
  /** Saves the export file. Default: a download link click (new tab if the browser blocks cross-origin downloads). */
  download?(url: string, filename: string): void;
  formatTime?(ms: number): string;
  now?(): number;
  toggleCallMute?(): Promise<void>;
}
export interface NoteTakerState {
  messages: AgentMessage[]; status: AgentPanelProps['status']; segments: Segment[]; note: NoteView | null;
  enabled: boolean; muted: boolean; callActive: boolean; ended: boolean; host: boolean; promptDismissed: boolean; events: MeetingEvent[]; selfId?: string;
}

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
export const CONSENT_BANNER = "Transcribing. Your browser's speech service turns speech into text; only the text is shared with this session.";
const BANNER = CONSENT_BANNER;

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
  let transcriptStops: (() => void)[] = [];
  let promptDismissed = true, selfId: string | undefined;
  let events: MeetingEvent[] = [];
  let started = false;
  const seenEvents = new Set<string>();
  const dismissed = new Set<string>(); // `${exportId}:${status}` of confirm rows the user closed
  let waitingFor: string | null = null; // export we just requested, until forSession shows it settled
  let confirmAction: 'download' | 'retry' | null = null;
  const since = now();
  const listeners = new Set<() => void>();
  let state: NoteTakerState;

  const key = transcriptionKey(creds);
  const owner = { key };
  let generation = 0, subscriptionGeneration = 0;
  let captureStops: (() => void)[] = [];
  let lastMute: boolean | undefined;
  const memberMuted = () => useCall.getState().muted;
  function canCapture() {
    const call = useCall.getState(), stored = useShare.getState().stored;
    return started && enabled && !ended && !blocked && useTranscription.getState().owner === owner
      && !!stored && transcriptionKey(stored) === key && useShare.getState().session?.status !== 'ended'
      && call.status === 'live' && !call.muted;
  }
  let writer = makeWriter();
  function makeWriter() {
    return createTranscriptWriter(async (line) => ((await client.mutation(api.transcript.updateLine, { ...auth, ...line })) ?? {}) as { segmentId?: string; retryAfterMs?: number; closed?: boolean }, (e) => {
      const code = codeOf(e);
      if (code === 'SESSION_ENDED') markEnded();
      else if (code !== 'NOT_ALLOWED') { notice = 'A transcript line could not be saved.'; publish(); }
    });
  }
  function makeTranscriber() {
    const current = ++generation;
    return deps.makeTranscriber({
      onInterim: (s) => { if (current === generation && canCapture()) writer.push(s, false); },
      onSegment: (s) => { if (current === generation && canCapture()) writer.push(s, true); },
      onError: (code) => {
        if (current !== generation || !canCapture()) return;
        if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture') blocked = true;
        syncCapture(); publish();
      },
    });
  }
  let transcriber = makeTranscriber();
  const capturing = () => transcriber.running();
  function stopCapture() {
    generation++;
    transcriber.stop(); writer.stop(); writer = makeWriter();
    void client.mutation(api.transcript.finishOwn, auth).catch(() => {});
  }
  function syncCapture() {
    const call = useCall.getState();
    if (started && useTranscription.getState().owner === owner) {
      const pref = useTranscription.getState();
      if (pref.memberKey !== key || pref.muted !== call.muted) useTranscription.setState({ memberKey: key, muted: call.muted });
      if (enabled && call.status === 'live' && lastMute !== call.muted) {
        lastMute = call.muted;
        void client.mutation(api.transcript.setMuted, { ...auth, muted: call.muted }).catch(() => {});
      }
    }
    const want = canCapture() && transcriber.supported;
    if (!want && transcriber.running()) stopCapture();
    if (want && !transcriber.running()) { transcriber = makeTranscriber(); transcriber.start(); }
  }

  function compute(): NoteTakerState {
    const out: AgentMessage[] = [];
    const sys = (text: string) => out.push({ kind: 'system', agent: 'Neuro Agent', text });
    if (ended) sys('Meeting ended. The final summary and export link appear below.');
    else if (enabled) {
      sys(BANNER);
      if (!transcriber.supported) sys("This browser can't transcribe speech. You will still see everyone else's lines.");
      else if (blocked) sys('Microphone blocked. Allow it in the browser to transcribe your speech.');
      else if (memberMuted()) sys('Your call is muted: your speech is not transcribed.');
    } else sys(host ? 'Transcription is off. Turn on AI notes to start it for everyone.' : 'Transcription is off. The host can start it.');
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
    return { messages: out, status, segments: [...segments.values()].sort((a, b) => a.startedAt - b.startedAt), note, enabled, muted: memberMuted(), callActive: useCall.getState().status === 'live', ended, host, promptDismissed, events, selfId };
  }
  function publish() { state = compute(); listeners.forEach((l) => l()); }

  const pages = new Map<string, Segment[]>();
  function watchTranscript(after?: number) {
    const key = String(after ?? 'start');
    let following = false;
    transcriptStops.push(client.onUpdate(api.transcript.list, { ...auth, ...(after === undefined ? {} : { after }), limit: PAGE }, ((r: { segments: Segment[]; hasMore: boolean }) => {
      pages.set(key, r.segments);
      segments.clear();
      for (const page of pages.values()) for (const s of page) segments.set(s.segmentId, s);
      publish();
      // Keep older pages reactive: an unfinished utterance can finalize behind the cursor.
      if (!following && r.hasMore && r.segments.length) {
        following = true; watchTranscript(r.segments[r.segments.length - 1].startedAt);
      }
    }) as (v: never) => void, fail));
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

  async function toggleEnabled() {
    if (ended || !host) return;
    try { await client.mutation(api.transcript.setEnabled, { ...auth, enabled: !enabled }); blocked = false; notice = null; }
    catch (e) { if (codeOf(e) === 'SESSION_ENDED') markEnded(); else { notice = 'Could not change transcription. Try again.'; publish(); } }
  }
  async function muteSelf() {
    if (ended || useCall.getState().status !== 'live') return;
    try { await (deps.toggleCallMute ?? toggleMute)(); blocked = false; syncCapture(); publish(); }
    catch { notice = 'Could not change your microphone. Try again.'; publish(); }
  }

  return {
    getState: () => state,
    subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
    /** Opens the live subscriptions. Safe to call again after dispose (React StrictMode). */
    start() {
      if (started) return;
      started = true; failed = false; enabled = false; lastMute = undefined;
      const subscription = ++subscriptionGeneration;
      useTranscription.setState({ owner });
      const sync = () => { syncCapture(); publish(); };
      captureStops = [useCall.subscribe(sync), useTranscription.subscribe(sync), useShare.subscribe(sync)];
      stops = [
        client.onUpdate(api.transcript.state, auth, ((r: { enabled: boolean; promptDismissed?: boolean; participantId?: string; events?: MeetingEvent[]; muted?: string[] }) => {
          if (!started || subscription !== subscriptionGeneration) return;
          const wasEnabled = enabled;
          enabled = r.enabled; promptDismissed = r.promptDismissed ?? true; selfId = r.participantId; events = r.events ?? [];
          if (lastMute === undefined) lastMute = r.muted?.includes(selfId ?? '') ?? false;
          if (wasEnabled && !enabled) { writer.stop(); writer = makeWriter(); lastMute = undefined; }
          syncCapture(); publish();
        }) as (v: never) => void, fail),
        client.onUpdate(api.notes.forSession, auth, ((r: NoteView | null) => { note = r; publish(); }) as (v: never) => void, fail),
      ];
      if (host) stops.push(client.onUpdate(api.screenshots.events, { ...auth, jobId: creds.jobId, since }, ((events: ShotEvent[]) => { if (!ended) for (const e of events) void present(e); }) as (v: never) => void, () => {}));
      watchTranscript();
      publish();
    },
    /** Preserve #151's host-global mic action; call mute is the separate member control. */
    async onMic() {
      if (host) return toggleEnabled();
      return muteSelf();
    },
    muteSelf,
    toggleEnabled,
    async dismissPrompt() {
      if (!host || ended) return;
      try { await client.mutation(api.transcript.dismissPrompt, auth); promptDismissed = true; publish(); }
      catch { notice = 'Could not dismiss the prompt. Try again.'; publish(); }
    },
    requestExport,
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
      started = false; subscriptionGeneration++;
      generation++;
      if (transcriber.running()) transcriber.stop();
      writer.stop(); writer = makeWriter();
      void client.mutation(api.transcript.finishOwn, auth).catch(() => {});
      captureStops.forEach((s) => s()); captureStops = [];
      if (useTranscription.getState().owner === owner) useTranscription.setState({ owner: null });
      stops.forEach((s) => s()); stops = [];
      transcriptStops.forEach((s) => s()); transcriptStops = []; pages.clear();
    },
  };
}
export type NoteTakerController = ReturnType<typeof createNoteTakerController>;

const SCRIPT = [EXPORT_LINE];
export const OFFLINE_NOTE_TAKER: NoteTakerBinding = {
  hidden: true,
  messages: [{ kind: 'system', agent: 'Neuro Agent', text: NO_SESSION }],
  status: 'offline',
};

/**
 * Binds AgentPanel to the meeting note-taker for the case page.
 * Outside an active session the Assistant is hidden. The controller retains its
 * own capability during this page visit so final processing can settle gracefully.
 */
export function useNoteTaker(jobId: string): NoteTakerBinding {
  const stored = useShare((s) => s.stored);
  const sessionStatus = useShare((s) => s.session?.status);
  const callStatus = useCall((s) => s.status);
  const key = stored && stored.jobId === jobId ? stored.sessionId : null;
  const [ctl, setCtl] = useState<{ id: string; ctl: NoteTakerController } | null>(null);
  const latest = useRef(ctl);
  useEffect(() => { latest.current = ctl; }, [ctl]);

  useEffect(() => {
    if (key && stored && convex && latest.current?.id !== key) {
      latest.current?.ctl.dispose();
      const created = createNoteTakerController({
        client: convex as unknown as NoteTakerClient,
        creds: { sessionId: stored.sessionId, participantToken: stored.participantToken, jobId, role: stored.role },
        makeTranscriber: (callbacks) => createTranscriber(callbacks),
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
  if (!active || !key || sessionStatus !== 'active' || callStatus !== 'live' || ctl?.id !== key) return OFFLINE_NOTE_TAKER;
  return {
    hidden: false, meeting: state, messages: state.messages, status: state.status, script: SCRIPT,
    muteSelf: () => { void active.muteSelf(); },
    toggleEnabled: () => { void active.toggleEnabled(); }, dismissPrompt: () => { void active.dismissPrompt(); },
    exportSummary: () => { void active.requestExport(); },
    onMic: () => { void active.onMic(); },
    onRun: (lines) => { void active.run(lines); },
    onConfirm: () => { void active.onConfirm(); },
    onDismiss: () => active.onDismiss(),
  };
}
const noop = () => () => {};
const offline: NoteTakerState = { messages: OFFLINE_NOTE_TAKER.messages, status: 'offline', segments: [], note: null, enabled: false, muted: false, callActive: false, ended: true, host: false, promptDismissed: true, events: [] };
const offlineState = () => offline;
