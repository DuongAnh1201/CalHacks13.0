import { describe, expect, it } from 'vitest';
import { chunkText, createTranscriber, speechRecognitionCtor, type Recognizer, type TranscriptSegment } from './transcribe';

class Fake implements Recognizer {
  static all: Fake[] = [];
  continuous = false; interimResults = false; lang = '';
  onresult: Recognizer['onresult'] = null; onerror: Recognizer['onerror'] = null; onend: (() => void) | null = null;
  started = 0; stopped = 0;
  constructor() { Fake.all.push(this); }
  start() { this.started++; }
  stop() { this.stopped++; this.onend?.(); }
}
const res = (text: string, isFinal: boolean) => ({ isFinal, 0: { transcript: text } });
function setup() {
  Fake.all = [];
  let t = 1000;
  const segs: TranscriptSegment[] = []; const errs: string[] = [];
  const tr = createTranscriber({ onSegment: (s) => segs.push(s), onError: (c) => errs.push(c), ctor: Fake, now: () => (t += 100) });
  return { tr, segs, errs };
}

describe('transcribe', () => {
  it('emits only final results, with timing from the first interim to the final', () => {
    const { tr, segs } = setup(); tr.start();
    const r = Fake.all[0];
    expect(r.interimResults).toBe(true);
    r.onresult!({ resultIndex: 0, results: [res('hel', false)] });
    expect(segs).toEqual([]);
    r.onresult!({ resultIndex: 0, results: [res('hello team', true)] });
    expect(segs).toEqual([{ text: 'hello team', startedAt: 1100, endedAt: 1200 }]);
  });

  it('restarts after silence while wanted, and stops for good on stop()', () => {
    const { tr } = setup(); tr.start();
    Fake.all[0].onend!();
    expect(Fake.all).toHaveLength(2);
    expect(Fake.all[1].started).toBe(1);
    tr.stop();
    expect(tr.running()).toBe(false);
    expect(Fake.all).toHaveLength(2);
  });

  it('does not restart after a permission error and reports it', () => {
    const { tr, errs } = setup(); tr.start();
    Fake.all[0].onerror!({ error: 'not-allowed' });
    Fake.all[0].onend!();
    expect(errs).toEqual(['not-allowed']);
    expect(Fake.all).toHaveLength(1);
    expect(tr.running()).toBe(false);
  });

  it('is a no-op without browser support', () => {
    const tr = createTranscriber({ onSegment: () => {}, ctor: null });
    tr.start();
    expect(tr.supported).toBe(false);
    expect(tr.running()).toBe(false);
    expect(speechRecognitionCtor({})).toBeNull();
  });

  it('splits long speech into segments that fit the server cap', () => {
    const long = Array.from({ length: 300 }, (_, i) => `w${i}`).join(' ');
    const parts = chunkText(long);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 500)).toBe(true);
    expect(parts.join(' ')).toBe(long);
  });
});
