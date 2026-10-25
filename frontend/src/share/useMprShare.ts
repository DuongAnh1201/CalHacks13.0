import { useCallback, useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { maskCommand, sameIndices } from './mprSync';
import { sendView, setFollowing, useShare } from './store';
import type { SliceIndices } from './types';

export interface MprRemote { indices: SliceIndices; tumorVisible: boolean }

/** Crosshair + mask sync for /jobs/<session job>/mri. The host sends, a following guest receives. */
export function useMprShare(jobId: string): { onCrosshair: (idx: SliceIndices) => void; onMaskVisible: (visible: boolean) => void; remote: MprRemote | null } {
  // useShallow: the object is rebuilt per call, so identity must change only when the server sends a new view.
  const remote = useShare(useShallow((s): MprRemote | null => {
    const live = s.stored?.jobId === jobId && s.session?.status === 'active' && s.stored?.role === 'viewer' ? s.session : null;
    return live?.me.following ? { indices: live.view.sliceIndices, tumorVisible: live.view.tumorVisible } : null;
  }));
  // Last indices this host sent, per session: broadcastTo fires onLocationChange on all three views for one click.
  const sent = useRef<{ sessionId: string; idx: SliceIndices } | null>(null);

  const onCrosshair = useCallback((next: SliceIndices) => {
    const { stored, session } = useShare.getState();
    if (stored?.jobId !== jobId || session?.status !== 'active') return;
    if (stored?.role === 'host') {
      const prev = sent.current?.sessionId === session.sessionId ? sent.current.idx : session.view.sliceIndices;
      if (sameIndices(prev, next)) return;
      sent.current = { sessionId: session.sessionId, idx: next };
      void sendView([{ type: 'setCursor', sliceIndices: next }]);
    } else if (session.me.following && !sameIndices(next, session.view.sliceIndices)) {
      void setFollowing(false); // a guest's own click: stop following and browse locally (spec §2)
    }
  }, [jobId]);

  // The page reports its overlay state on mount, usually before any session exists; keep it for when one starts.
  const mask = useRef<boolean | null>(null);
  const hostSession = useShare((s) => s.stored?.jobId === jobId && s.stored?.role === 'host' && s.session?.status === 'active' ? s.session.sessionId : null);
  const hostVisible = useShare((s) => hostSession && s.session?.status === 'active' ? s.session.view.tumorVisible : false);
  const syncMask = useCallback(() => {
    const { session } = useShare.getState();
    const cmd = maskCommand(mask.current, !!hostSession, session?.status === 'active' ? session.view.tumorVisible : false);
    if (cmd) void sendView([cmd]);
  }, [hostSession]);
  const onMaskVisible = useCallback((visible: boolean) => { mask.current = visible; syncMask(); }, [syncMask]);
  // Session just became active, or the server's flag drifted from the overlay: send once. A rejected send leaves hostVisible unchanged, so no retry loop.
  useEffect(() => { syncMask(); }, [syncMask, hostVisible]);

  return { onCrosshair, onMaskVisible, remote };
}
