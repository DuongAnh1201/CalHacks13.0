import { create } from 'zustand';

export const transcriptionKey = (s: { sessionId: string; participantToken: string }) => `${s.sessionId}:${s.participantToken}`;

/** One recognizer owner per tab: panel while mounted, call fallback otherwise. Mute mirrors the call across routes. */
export const useTranscription = create<{
  memberKey: string | null;
  muted: boolean;
  owner: { key: string } | null;
}>(() => ({ memberKey: null, muted: false, owner: null }));
