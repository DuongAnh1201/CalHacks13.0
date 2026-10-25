import { CameraControls, useGLTF } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { modelUrl } from '../api/client';
import type { Report } from '../api/types';
import { viewEvents } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import { samePose, type CameraPose } from '../share/cameraSync';
import { cursorOf } from '../share/cursorSync';
import { BoardMarkers } from '../board/BoardMarkers';
import { isPlacing, setBoardDraft, setPose, useBoardTool } from '../board/tool';
import { useNoteUi } from '../share/notes';
import { MarkerPins, type Marker } from '../share/NotePins';
import { RemoteCursors, useCursorPush } from '../share/RemoteCursors';
import { useShare } from '../share/store';
import type { BoardRow, Note } from '../share/types';
import { applyView } from './applyView';
import type { Layer } from './layers';
import { buildCaseScene } from './loadCase';
import { worldOf } from './pins';
import type { Vec3 } from './transform';
import css from './CaseCanvas.module.css';

/** Shared-session camera (share/cameraSync.ts). Absent outside a session: the camera is local only. */
interface CameraShare { onMove?: (p: CameraPose) => void; remote: CameraPose | null; onUserControl?: () => void }
interface Props { jobId: string; report: Report; onLayers: (available: Partial<Record<Layer, boolean>>) => void; camera?: CameraShare; notes?: Note[]; markers?: Marker[]; board?: BoardRow[] }

const MIN_FRAME_RADIUS_MM = 12;
const NOTE_VIEW_MM = 170; // camera distance when flying to a note
const CLICK_SLOP_PX = 4; // a pointer that moved further was an orbit, not a click
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
// Front-left three-quarter view; the brain centroid is the scene origin.
const HOME: [number, number, number, number, number, number] = [-260, 80, -200, 0, 0, 0];

export function CaseCanvas(props: Props) {
  const [lost, setLost] = useState(false);
  if (lost) {
    return (
      <div className={css.lost} role="alert">
        The 3D view lost its graphics context.
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
  return (
    <Canvas className={css.canvas} dpr={[1, 2]} camera={{ fov: 40, near: 1, far: 3000, position: [HOME[0], HOME[1], HOME[2]] }}
      onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setLost(true); })}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[150, 250, 200]} intensity={1.6} />
      <directionalLight position={[-200, -50, -150]} intensity={0.5} />
      <CaseScene {...props} />
    </Canvas>
  );
}

function CaseScene({ jobId, report, onLayers, camera, notes = [], markers = [], board = [] }: Props) {
  const { scene } = useGLTF(modelUrl(jobId));
  const controls = useRef<CameraControls>(null);
  const cs = useMemo(() => buildCaseScene(scene, report), [scene, report]); // throws MissingNodeError
  const view = useViewer(useShallow((s) => ({ tumorRevealed: s.tumorRevealed, layers: s.layers, mode: s.mode, brainOpacity: s.brainOpacity, hidden: s.hidden, explodeAmount: s.explodeAmount })));
  const target = useViewer((s) => s.cameraTarget);
  const live = useShare((s) => s.stored?.jobId === jobId); // cursors on the case this session reviews; useCursorPush / RemoteCursors also require an active session
  const push = useCursorPush(live);
  const tool = useBoardTool((s) => s.tool);
  const goTo = useNoteUi((s) => s.goTo);
  const goToPose = useBoardTool((s) => s.goToPose);

  useEffect(() => onLayers(Object.fromEntries(Object.keys(cs.tumor).map((k) => [k, true]))), [cs, onLayers]);

  useLayoutEffect(() => applyView(cs, view), [cs, view]);

  // Home pose + Reset.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    void c.setLookAt(...HOME, false);
    c.saveState();
    const onReset = () => { void c.reset(!reduced()); };
    viewEvents.addEventListener('reset', onReset);
    return () => viewEvents.removeEventListener('reset', onReset);
  }, []);

  // focusTumor: frame the tumor's bounding sphere at its world position (follows the explode offset); the two logs prove the mesh and the camera agree (issue #10).
  const focus = useCallback(() => {
    const c = controls.current, centroid = report.centroidMm;
    const mesh = cs.tumor.edema ?? Object.values(cs.tumor)[0];
    if (!c || !centroid || !mesh) return;
    const world = () => { cs.world.updateMatrixWorld(true); return mesh.localToWorld(new THREE.Vector3(...centroid)); };
    const log = () => console.info('[case] tumor world position', world().toArray().map((n) => n.toFixed(2)).join(', '));
    const { min, max } = report.bboxMm ?? { min: centroid, max: centroid };
    const radius = Math.max(new THREE.Vector3(...(max as Vec3)).distanceTo(new THREE.Vector3(...(min as Vec3))) / 2, MIN_FRAME_RADIUS_MM);
    const center = world();
    // Approach from the tumor's own side (brain centroid is the scene origin): from the home side an opaque hemisphere would hide it.
    const eye = center.length() > 1 ? center.clone().normalize().multiplyScalar(c.getDistanceToFitSphere(radius)).add(center) : null;
    log();
    void (eye ? c.setLookAt(...eye.toArray(), ...center.toArray(), !reduced()) : c.fitToSphere(new THREE.Sphere(center, radius), !reduced())).then(log);
  }, [cs, report]);

  useEffect(() => { if (target === 'tumor') focus(); }, [target, focus]);

  // Focus Tumor pressed again while already focused (e.g. after changing explode): the target does not change, so Brain3D fires this.
  useEffect(() => {
    viewEvents.addEventListener('focus', focus);
    return () => viewEvents.removeEventListener('focus', focus);
  }, [focus]);

  // Host: report every camera move, end-of-transition values so guests glide straight to where we land.
  const onMove = camera?.onMove;
  useEffect(() => {
    const c = controls.current;
    if (!c || !onMove) return;
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    const emit = () => { c.getPosition(p, true); c.getTarget(t, true); onMove({ position: p.toArray(), target: t.toArray() }); };
    emit(); // the pose this page opened with, so guests start where the host is
    c.addEventListener('update', emit);
    return () => c.removeEventListener('update', emit);
  }, [onMove]);

  // Following guest: glide to the host's pose. A drag of their own stops following (onUserControl).
  const remote = camera?.remote ?? null;
  const applied = useRef<CameraPose | null>(null);
  useEffect(() => {
    const c = controls.current;
    if (!c || !remote) { applied.current = null; return; }
    if (samePose(applied.current, remote)) return;
    applied.current = remote;
    const [px, py, pz] = remote.position, [tx, ty, tz] = remote.target;
    void c.setLookAt(px, py, pz, tx, ty, tz, !reduced());
  }, [remote]);

  // A note's "Go to": keep the viewing direction, centre the note. The host's move reaches followers through onMove.
  const seen = useRef(goTo?.n);
  useEffect(() => {
    const c = controls.current;
    if (!c || !goTo || goTo.n === seen.current) return;
    seen.current = goTo.n;
    cs.world.updateMatrixWorld(true);
    const at = worldOf(cs, goTo.mm);
    const eye = c.getPosition(new THREE.Vector3(), true).sub(c.getTarget(new THREE.Vector3(), true)).setLength(NOTE_VIEW_MM).add(at);
    void c.setLookAt(...eye.toArray(), ...at.toArray(), !reduced());
  }, [goTo, cs]);

  // Pose for stroke fading, on every tab (the host's onMove above is for guests following).
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    const emit = () => { c.getPosition(p); c.getTarget(t); setPose({ position: p.toArray(), target: t.toArray() }); };
    emit();
    c.addEventListener('update', emit);
    return () => c.removeEventListener('update', emit);
  }, []);

  const seenPose = useRef(goToPose?.n);
  useEffect(() => {
    const c = controls.current;
    if (!c || !goToPose || goToPose.n === seenPose.current) return;
    seenPose.current = goToPose.n;
    const [px, py, pz] = goToPose.pose.position, [tx, ty, tz] = goToPose.pose.target;
    void c.setLookAt(px, py, pz, tx, ty, tz, !reduced());
  }, [goToPose]);

  const onUserControl = camera?.onUserControl;
  useEffect(() => {
    const c = controls.current;
    if (!c || !onUserControl) return;
    c.addEventListener('controlstart', onUserControl);
    return () => c.removeEventListener('controlstart', onUserControl);
  }, [onUserControl]);

  return (
    <>
      <CameraControls ref={controls} makeDefault smoothTime={0.35} minDistance={20} maxDistance={900} />
      <primitive
        object={cs.world}
        // handlers only during a session: without them R3F does not raycast the case at all
        onPointerMove={push ? (e: ThreeEvent<PointerEvent>) => {
          const c = cursorOf(e.object, e.point);
          if (!c) return; // hidden or unnamed: R3F tries the next hit
          e.stopPropagation();
          push(c);
        } : undefined}
        onPointerOut={push ? () => push(null) : undefined}
        onClick={isPlacing(tool) ? (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > CLICK_SLOP_PX) return;
          const c = cursorOf(e.object, e.point);
          if (!c) return;
          e.stopPropagation();
          setBoardDraft({ tool, mm: c.localMm });
        } : undefined}
      />
      <RemoteCursors enabled={live} />
      <BoardMarkers cs={cs} report={report} notes={notes} rows={board} />
      <MarkerPins cs={cs} markers={markers} />
    </>
  );
}
