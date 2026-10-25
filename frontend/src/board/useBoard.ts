import { useEffect, useState } from 'react';
import { useShare, watchBoard } from '../share/store';
import type { BoardRow } from '../share/types';

/** Live board rows for the session reviewing this case; [] outside one. */
export function useBoard(jobId: string): BoardRow[] {
  const sessionId = useShare((s) => (s.stored?.jobId === jobId && s.session?.status === 'active' ? s.session.sessionId : null));
  const [rows, setRows] = useState<BoardRow[]>([]);
  useEffect(() => {
    if (!sessionId) return;
    const stop = watchBoard(setRows);
    return () => { stop(); setRows([]); };
  }, [sessionId]);
  return rows;
}
