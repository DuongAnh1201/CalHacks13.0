import { useCallback, useRef } from 'react';
import { commandsFor, sameIndices } from './mprSync';
import { sendView, setFollowing, useShare } from './store';
import type { SliceIndices } from './types';

/** Phase A crosshair sync for /jobs/sample/mri. The host sends, a following guest receives. */
export function useMprShare(jobId: string): { onCrosshair: (idx: SliceIndices) => void; remote: SliceIndices | null } {
  const remote = useShare((s) => {
    const live = jobId === 'sample' && s.session?.status === 'active' && s.stored?.role === 'viewer' ? s.session : null;
    return live?.me.following ? live.view.sliceIndices : null;
  });
  // Last indices this host sent, per session: broadcastTo fires onLocationChange on all three views for one click.
  const sent = useRef<{ sessionId: string; idx: SliceIndices } | null>(null);

  const onCrosshair = useCallback((next: SliceIndices) => {
    const { stored, session } = useShare.getState();
    if (jobId !== 'sample' || session?.status !== 'active') return;
    if (stored?.role === 'host') {
      const prev = sent.current?.sessionId === session.sessionId ? sent.current.idx : session.view.sliceIndices;
      const cmds = commandsFor(prev, next);
      if (!cmds.length) return;
      sent.current = { sessionId: session.sessionId, idx: next };
      void sendView(cmds);
    } else if (session.me.following && !sameIndices(next, session.view.sliceIndices)) {
      void setFollowing(false); // a guest's own click: stop following and browse locally (spec §2)
    }
  }, [jobId]);

  return { onCrosshair, remote };
}
