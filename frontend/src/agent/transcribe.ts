/**
 * Browser speech-to-text for the meeting transcript (#135). Pure helper: the
 * caller wires the UI and the Convex mutation. Uses the Web Speech API, so no
 * audio is sent to our server. Interim text and final text have separate callbacks.
 * The browser may use its speech recognition service.
 */

export type TranscriptSegment = { text: string; startedAt: number; endedAt: number };

type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; 0: SpeechAlternative };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
export interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
export type RecognizerCtor = new () => Recognizer;

export const MAX_SEGMENT_CHARS = 500;
/** Errors that mean "stop trying" (permission denied, no mic); the rest may restart. */
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);

export function speechRecognitionCtor(w: unknown = globalThis): RecognizerCtor | null {
  const g = w as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition ?? null;
}

/** Splits long speech at word boundaries so every segment fits the server cap. */
export function chunkText(text: string, max = MAX_SEGMENT_CHARS): string[] {
  const out: string[] = [];
  let rest = text.replace(/\s+/g, " ").trim();
  while (rest.length > max) {
    const cut = rest.lastIndexOf(" ", max);
    const at = cut > 0 ? cut : max;
    out.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) out.push(rest);
  return out;
}

export type Transcriber = { supported: boolean; running: () => boolean; start: () => void; stop: () => void };

export function createTranscriber(opts: {
  onSegment: (s: TranscriptSegment) => void;
  onInterim?: (s: TranscriptSegment) => void;
  onError?: (code: string) => void;
  lang?: string;
  ctor?: RecognizerCtor | null;
  now?: () => number;
}): Transcriber {
  const Ctor = opts.ctor === undefined ? speechRecognitionCtor() : opts.ctor;
  const now = opts.now ?? Date.now;
  let rec: Recognizer | null = null;
  let wanted = false;
  let utteranceStart: number | null = null;
  let interim = "";
  const finish = () => {
    if (interim && utteranceStart !== null) opts.onSegment({ text: interim, startedAt: utteranceStart, endedAt: now() });
    interim = ""; utteranceStart = null;
  };

  const begin = () => {
    if (!Ctor) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = opts.lang ?? "en-US";
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (utteranceStart === null) utteranceStart = now();
        if (!res.isFinal) {
          interim = res[0].transcript.replace(/\s+/g, " ").trim().slice(0, MAX_SEGMENT_CHARS);
          opts.onInterim?.({ text: interim, startedAt: utteranceStart, endedAt: now() });
          continue;
        }
        interim = "";
        const endedAt = now();
        const startedAt = utteranceStart;
        utteranceStart = null;
        for (const text of chunkText(res[0].transcript)) opts.onSegment({ text, startedAt, endedAt });
      }
    };
    r.onerror = (e) => {
      if (FATAL.has(e.error)) wanted = false;
      opts.onError?.(e.error);
    };
    // Browsers end recognition after silence; keep listening while wanted.
    r.onend = () => {
      finish();
      rec = null;
      if (wanted) begin();
    };
    rec = r;
    r.start();
  };

  return {
    supported: Ctor !== null,
    running: () => wanted,
    start() {
      if (wanted || !Ctor) return;
      wanted = true;
      begin();
    },
    stop() {
      wanted = false;
      finish();
      rec?.stop();
    },
  };
}
