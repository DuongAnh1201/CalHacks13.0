import { create } from 'zustand';

export const transcriptionKey = (s: { sessionId: string; participantToken: string }) => `${s.sessionId}:${s.participantToken}`;

/** The panel owns capture while mounted; member consent survives /3d ↔ /mri. */
export const useTranscription = create<{
  memberKey: string | null;
  muted: boolean;
  owner: { key: string } | null;
}>(() => ({ memberKey: null, muted: false, owner: null }));
