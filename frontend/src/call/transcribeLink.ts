import { createTranscriber, type Transcriber, type TranscriptSegment } from '../agent/transcribe';
import { transcriptionKey, useTranscription } from '../agent/transcription';
import { sendTranscript, useShare, watchTranscriptEnabled } from '../share/store';
import { useCall } from './store';

type Make = (onSegment: (s: TranscriptSegment) => void) => Transcriber;

/** Captures call speech when the note-taker panel does not already own this tab's mic. */
export function linkTranscriber(make: Make = (onSegment) => createTranscriber({ onSegment })): () => void {
  let t: Transcriber | null = null;
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
      && pref.owner?.key !== key && !(pref.memberKey === key && pref.muted);
  };
  const stop = () => { generation++; const old = t; t = null; old?.stop(); };
  const sync = () => {
    const { status } = useCall.getState();
    const stored = useShare.getState().stored;
    const key = status === 'live' && stored ? transcriptionKey(stored) : null;
    if (key !== watching) {
      const subscription = ++subscriptionGeneration;
      stop();
      unwatch();
      enabled = false;
      watching = key;
      unwatch = key ? watchTranscriptEnabled((on) => {
        if (disposed || watching !== key || subscription !== subscriptionGeneration) return;
        enabled = on; sync();
      }) : () => {};
    }
    if (!wanted()) { if (t) stop(); return; }
    if (!t) {
      const current = ++generation;
      t = make((s) => {
        if (current === generation && wanted()) void sendTranscript(s.text, s.endedAt - s.startedAt);
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
