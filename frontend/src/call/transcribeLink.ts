import { createTranscriber, type Transcriber, type TranscriptSegment } from '../agent/transcribe';
import { sendTranscript, useShare, watchTranscriptEnabled } from '../share/store';
import { useCall } from './store';

type Make = (onSegment: (s: TranscriptSegment) => void) => Transcriber;

/**
 * Speech-to-text on this tab's mic while in the call, unmuted, and with the host's
 * transcript switch on (#135). Returns an unlink.
 */
export function linkTranscriber(make: Make = (onSegment) => createTranscriber({ onSegment })): () => void {
  const t = make((s) => void sendTranscript(s.text, s.endedAt - s.startedAt));
  let enabled = false;
  let watching: string | null = null; // sessionId the switch subscription is for
  let unwatch = () => {};

  const sync = () => {
    const { status, muted } = useCall.getState();
    const key = status === 'live' ? useShare.getState().stored?.sessionId ?? null : null;
    if (key !== watching) {
      unwatch();
      enabled = false;
      watching = key;
      unwatch = key ? watchTranscriptEnabled((on) => { enabled = on; sync(); }) : () => {};
    }
    const want = t.supported && status === 'live' && !muted && enabled;
    if (want && !t.running()) t.start();
    else if (!want && t.running()) t.stop();
  };

  const offCall = useCall.subscribe(sync);
  const offShare = useShare.subscribe(sync);
  sync();
  return () => { offCall(); offShare(); unwatch(); if (t.running()) t.stop(); };
}
