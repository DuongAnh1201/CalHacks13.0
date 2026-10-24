import { useCallback, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { sameIndices } from './mprSync';
import { sendView, setFollowing, useShare } from './store';
import type { SliceIndices } from './types';

export interface MprRemote { indices: SliceIndices; tumorVisible: boolean }

/** Crosshair + mask sync for /jobs/sample/mri. The host sends, a following guest receives. */
export function useMprShare(jobId: string): { onCrosshair: (idx: SliceIndices) => void; onMaskVisible: (visible: boolean) => void; remote: MprRemote | null } {
  // useShallow: the object is rebuilt per call, so identity must change only when the server sends a new view.
  const remote = useShare(useShallow((s): MprRemote | null => {
    const live = jobId === 'sample' && s.session?.status === 'active' && s.stored?.role === 'viewer' ? s.session : null;
    return live?.me.following ? { indices: live.view.sliceIndices, tumorVisible: live.view.tumorVisible } : null;
  }));
  // Last indices this host sent, per session: broadcastTo fires onLocationChange on all three views for one click.
  const sent = useRef<{ sessionId: string; idx: SliceIndices } | null>(null);

  const onCrosshair = useCallback((next: SliceIndices) => {
    const { stored, session } = useShare.getState();
    if (jobId !== 'sample' || session?.status !== 'active') return;
    if (stored?.role === 'host') {
      const prev = sent.current?.sessionId === session.sessionId ? sent.current.idx : session.view.sliceIndices;
      if (sameIndices(prev, next)) return;
      sent.current = { sessionId: session.sessionId, idx: next };
      void sendView([{ type: 'setCursor', sliceIndices: next }]);
    } else if (session.me.following && !sameIndices(next, session.view.sliceIndices)) {
      void setFollowing(false); // a guest's own click: stop following and browse locally (spec §2)
    }
  }, [jobId]);

  const onMaskVisible = useCallback((visible: boolean) => {
    const { stored, session } = useShare.getState();
    if (jobId === 'sample' && session?.status === 'active' && stored?.role === 'host' && session.view.tumorVisible !== visible) {
      void sendView([{ type: 'setTumorVisible', visible }]);
    }
  }, [jobId]);

  return { onCrosshair, onMaskVisible, remote };
}
