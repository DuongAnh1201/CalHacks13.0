import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { dispatch } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import { DEFAULT_SCENE, sceneActions, sceneOf, sceneSender, type Page, type Scene } from './sceneSync';
import { sendView, switchShare, useShare } from './store';

/** Phase B: the host streams its page + 3D scene; a following guest goes to that page and mirrors the scene once `ready`. */
export function useShareSync(jobId: string, page: Page, ready: boolean): void {
  const navigate = useNavigate();
  // The room's case. stored.jobId follows sessions.get, so it moves when the host switches case.
  const roomJob = useShare((s) => (s.session?.status === 'active' ? s.stored?.jobId ?? null : null));
  const myRole = useShare((s) => (s.session?.status === 'active' ? s.stored?.role ?? null : null));
  const role = roomJob === jobId ? myRole : null;
  const scene = useShare((s) => (role === 'viewer' && s.session?.me.following ? s.session.view.scene : null));
  const roomPage = useShare((s) => s.session?.view.scene.page ?? null);
  const applied = useRef<Scene | null>(null);
  const lastRoomJob = useRef(roomJob);

  // A sharing host who opens another case takes the room along: same invite link, guests follow.
  useEffect(() => {
    if (myRole === 'host' && roomJob && roomJob !== jobId && ready) void switchShare(jobId, page);
  }, [myRole, roomJob, jobId, ready, page]);

  // The host moved the room: guests go with it, following or not (notes and cursors belong to the room's case).
  useEffect(() => {
    const moved = lastRoomJob.current !== null && lastRoomJob.current !== roomJob;
    lastRoomJob.current = roomJob;
    if (myRole === 'viewer' && moved && roomJob && roomJob !== jobId) navigate(`/jobs/${roomJob}/${roomPage ?? page}`);
  }, [myRole, roomJob, roomPage, jobId, page, navigate]);

  useEffect(() => {
    if (role !== 'host' || !ready) return;
    const sender = sceneSender(useShare.getState().session?.view.scene ?? DEFAULT_SCENE, (cmds) => void sendView(cmds));
    sender.push(sceneOf(useViewer.getState(), page)); // announces the page and the state this page loaded with
    const off = useViewer.subscribe((s) => sender.push(sceneOf(s, page)));
    return () => { off(); sender.flush(); };
  }, [role, ready, page]);

  // shortcut: a guest's own 3D tweaks while following stay until the host's next change, apply the full scene on every update if that confuses people.
  useEffect(() => {
    if (!scene) { applied.current = null; return; } // re-following applies the whole scene again
    if (scene.page !== page) { navigate(`/jobs/${jobId}/${scene.page}`); return; }
    if (!ready) return;
    for (const a of sceneActions(applied.current, scene)) dispatch(a, 'pointer');
    applied.current = scene;
  }, [scene, page, ready, navigate]);
}
