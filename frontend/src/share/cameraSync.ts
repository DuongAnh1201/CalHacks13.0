import { useCallback, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { sendView, setFollowing, useShare } from './store';

/** Mirror of convex/lib/viewCommands.ts Camera: /3d world units (mm, brain centroid at the origin). */
export interface CameraPose { position: number[]; target: number[] }

/** 0.1 mm: below anything visible, and it stops float jitter from counting as a move. */
const round = (v: number[]) => v.map((n) => Math.round(n * 10) / 10);
export const samePose = (a: CameraPose | null | undefined, b: CameraPose | null | undefined) =>
  !!a && !!b && a.position.every((n, i) => n === b.position[i]) && a.target.every((n, i) => n === b.target[i]);

/**
 * Host side: at most one send per `ms` while the camera moves, plus a trailing send so the
 * final pose always lands. 200 ms = 5 writes/s while orbiting, none while still (guardrail 7).
 */
export function cameraSender(send: (p: CameraPose) => void, ms = 200) {
  let sent: CameraPose | null = null;
  let latest: CameraPose | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (latest && !samePose(sent, latest)) { sent = latest; send(latest); }
  };
  return {
    push(p: CameraPose) { latest = { position: round(p.position), target: round(p.target) }; timer ??= setTimeout(flush, ms); },
    flush,
  };
}

/**
 * The /3d camera in a shared session. The host's orbit is sent throttled; a following guest
 * gets `remote` to move to. A guest dragging the view stops following, like a guest click on /mri.
 */
export function useCameraShare(jobId: string): { onMove?: (p: CameraPose) => void; remote: CameraPose | null; onUserControl?: () => void } {
  const role = useShare((s) => (s.stored?.jobId === jobId && s.session?.status === 'active' ? s.stored.role : null));
  const remote = useShare(useShallow((s) => (role === 'viewer' && s.session?.me.following ? s.session.view.scene.camera ?? null : null)));

  const sender = useMemo(() => (role === 'host' ? cameraSender((p) => void sendView([{ type: 'setCamera', ...p }])) : null), [role]);
  useEffect(() => () => sender?.flush(), [sender]);

  const onUserControl = useCallback(() => { if (useShare.getState().session?.me.following) void setFollowing(false); }, []);
  return {
    onMove: sender ? sender.push : undefined,
    remote,
    onUserControl: role === 'viewer' ? onUserControl : undefined,
  };
}
