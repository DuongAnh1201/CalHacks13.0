import { useEffect, useState } from 'react';
import { useShare, watchNotes } from './store';
import type { Note } from './types';

/** Live notes for the session reviewing this case; [] outside one. */
export function useNotes(jobId: string): Note[] {
  const sessionId = useShare((s) => (s.stored?.jobId === jobId && s.session?.status === 'active' ? s.session.sessionId : null));
  const [notes, setNotes] = useState<Note[]>([]);
  useEffect(() => {
    if (!sessionId) return;
    const stop = watchNotes(setNotes);
    return () => { stop(); setNotes([]); };
  }, [sessionId]);
  return notes;
}
