import { createTranscriptWriter } from '../agent/transcriptWriter';
import { createTranscriber, type Transcriber, type TranscriptSegment } from '../agent/transcribe';
import { transcriptionKey, useTranscription } from '../agent/transcription';
import { finishTranscript, muteTranscript, writeTranscriptLine, useShare, watchTranscriptEnabled } from '../share/store';
import { useCall } from './store';

type Make = (onSegment: (s: TranscriptSegment) => void, onInterim?: (s: TranscriptSegment) => void) => Transcriber;

/** Captures call speech when the note-taker panel does not already own this tab's mic. */
export function linkTranscriber(make: Make = (onSegment, onInterim) => createTranscriber({ onSegment, onInterim })): () => void {
  let t: Transcriber | null = null;
  let writer: ReturnType<typeof createTranscriptWriter> | null = null;
  let captureCreds: { sessionId: string; participantToken: string } | null = null;
  let lastMute: boolean | undefined;
  let enabled = false;
  let watching: string | null = null;
  let unwatch = () => {};
  let disposed = false;
  let generation = 0;
  let subscriptionGeneration = 0;

  const wanted = () => {
    const { status, muted } = useCall.getState();
    const stored = useShare.getState().stored;
    const pref = useTranscription.getState();
    const key = stored ? transcriptionKey(stored) : null;
    return !disposed && status === 'live' && !muted && enabled && key !== null && key === watching
      && useShare.getState().session?.status !== 'ended'
      && pref.owner?.key !== key;
  };
  const stop = () => {
    generation++;
    const old = t; t = null; old?.stop();
    writer?.stop(); writer = null;
    if (old && captureCreds) void finishTranscript(captureCreds).catch(() => {});
    captureCreds = null;
  };
  const sync = () => {
    const { status } = useCall.getState();
    const stored = useShare.getState().stored;
    const key = status === 'live' && stored ? transcriptionKey(stored) : null;
    if (key !== watching) {
      const subscription = ++subscriptionGeneration;
      stop();
      unwatch();
      enabled = false; lastMute = undefined;
      watching = key;
      unwatch = key ? watchTranscriptEnabled((on) => {
        if (disposed || watching !== key || subscription !== subscriptionGeneration) return;
        enabled = on; sync();
      }) : () => {};
    }
    const call = useCall.getState();
    if (enabled && key && stored && useTranscription.getState().owner?.key !== key && lastMute !== call.muted) {
      lastMute = call.muted;
      void muteTranscript(stored, call.muted).catch(() => {});
    }
    if (!wanted()) { if (t) stop(); return; }
    if (!t) {
      const current = ++generation;
      captureCreds = { sessionId: stored!.sessionId, participantToken: stored!.participantToken };
      const creds = captureCreds;
      writer = createTranscriptWriter((line) => writeTranscriptLine(creds, line), () => {});
      const ownWriter = writer;
      t = make((s) => {
        if (current === generation && wanted()) ownWriter.push(s, true);
      }, (s) => {
        if (current === generation && wanted()) ownWriter.push(s, false);
      });
      if (t.supported) t.start();
    }
  };

  const offCall = useCall.subscribe(sync);
  const offShare = useShare.subscribe(sync);
  const offPref = useTranscription.subscribe(sync);
  sync();
  return () => { disposed = true; offCall(); offShare(); offPref(); unwatch(); stop(); };
}
