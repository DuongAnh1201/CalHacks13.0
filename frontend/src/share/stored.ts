/** jobId: the case this session reviews, /jobs/<jobId>/... (any finished upload, not only the sample). */
export interface Stored { sessionId: string; participantToken: string; role: 'host' | 'viewer'; inviteCode: string; jobId: string }

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEY = 'nv.share';
/** The playground's token, kept apart so a playground never touches the tab's review session. */
export const PLAY_KEY = 'nv.play';

// sessionStorage, not localStorage: per tab, so host and guest can share one browser, and a reload keeps its token instead of joining twice.
function session(): Store | null {
  try { return globalThis.sessionStorage ?? null; } catch { return null; }
}

const isStored = (v: unknown): v is Stored => {
  const s = v as Stored | null;
  return !!s && typeof s.sessionId === 'string' && typeof s.participantToken === 'string' && (s.role === 'host' || s.role === 'viewer') && typeof s.inviteCode === 'string' && typeof s.jobId === 'string';
};

export function loadStored(s: Store | null = session(), key = KEY): Stored | null {
  try {
    const v: unknown = JSON.parse(s?.getItem(key) ?? 'null');
    return isStored(v) ? v : null;
  } catch { return null; }
}

export function saveStored(v: Stored, s: Store | null = session(), key = KEY): void {
  try { s?.setItem(key, JSON.stringify(v)); } catch { /* blocked: the session lasts until reload */ }
}

export function clearStored(s: Store | null = session(), key = KEY): void {
  try { s?.removeItem(key); } catch { /* blocked: nothing stored */ }
}
