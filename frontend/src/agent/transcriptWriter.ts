import type { TranscriptSegment } from './transcribe';

export const WRITE_INTERVAL_MS = 334;
interface Line { text: string; final: boolean; durationMs: number; segmentId?: string; dirty: boolean }
interface Result { segmentId?: string; retryAfterMs?: number; closed?: boolean }

/** Coalesce interim words, serialize utterances, and preserve finals behind the 3/s limit. */
export function createTranscriptWriter(
  write: (args: { text: string; final: boolean; durationMs: number; segmentId?: string }) => Promise<Result>,
  onError: (error: unknown) => void,
) {
  const queue: Line[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let busy = false, lastWrite = -Infinity, stopped = false;
  const later = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => { timer = undefined; void pump(); }, ms); };
  async function pump() {
    if (busy || stopped || !queue[0]?.dirty) return;
    const wait = WRITE_INTERVAL_MS - (Date.now() - lastWrite);
    if (wait > 0) { later(wait); return; }
    const line = queue[0];
    const snapshot = { text: line.text, final: line.final, durationMs: line.durationMs, ...(line.segmentId ? { segmentId: line.segmentId } : {}) };
    busy = true; line.dirty = false;
    try {
      const r = await write(snapshot);
      if (stopped) return;
      if (r.retryAfterMs) { line.dirty = true; later(r.retryAfterMs); return; }
      lastWrite = Date.now();
      if (r.segmentId) line.segmentId = r.segmentId;
      if (snapshot.final || r.closed) queue.shift();
    } catch (error) {
      queue.shift(); onError(error);
    } finally { busy = false; if (!timer) void pump(); }
  }
  return {
    push(s: TranscriptSegment, final: boolean) {
      if (stopped) return;
      let line = queue.at(-1);
      if (!line || line.final) { line = { text: '', final: false, durationMs: 0, dirty: false }; queue.push(line); }
      Object.assign(line, { text: s.text, final, durationMs: Math.max(0, s.endedAt - s.startedAt), dirty: true });
      void pump();
    },
    /** Cancel queued speech when notes are switched off; the server settles the saved line. */
    stop() { stopped = true; clearTimeout(timer); queue.length = 0; },
  };
}
