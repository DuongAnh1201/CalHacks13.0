import { CameraControls, useGLTF } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { modelUrl } from '../api/client';
import type { Report } from '../api/types';
import { viewEvents } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import type { Layer } from './layers';
import { buildCaseScene } from './loadCase';
import { rasToScene, type Vec3 } from './transform';
import css from './CaseCanvas.module.css';

interface Props { jobId: string; report: Report; onLayers: (available: Partial<Record<Layer, boolean>>) => void }

const MIN_FRAME_RADIUS_MM = 12;
// Same direction as AtlasCanvas HOME; the brain centroid is the scene origin.
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

function CaseScene({ jobId, report, onLayers }: Props) {
  const { scene } = useGLTF(modelUrl(jobId));
  const controls = useRef<CameraControls>(null);
  const cs = useMemo(() => buildCaseScene(scene, report), [scene, report]); // throws MissingNodeError
  const revealed = useViewer((s) => s.tumorRevealed);
  const target = useViewer((s) => s.cameraTarget);

  useEffect(() => onLayers(Object.fromEntries(Object.keys(cs.tumor).map((k) => [k, true]))), [cs, onLayers]);

  // Whole Brain: hemispheres opaque, tumor shown only once revealed.
  // shortcut: st.layers ignored, wire it when the layer toggles ticket lands
  useLayoutEffect(() => { for (const m of Object.values(cs.tumor)) m.visible = revealed; }, [cs, revealed]);

  // Home pose + Reset.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    void c.setLookAt(...HOME, false);
    c.saveState();
    const onReset = () => { void c.reset(true); };
    viewEvents.addEventListener('reset', onReset);
    return () => viewEvents.removeEventListener('reset', onReset);
  }, []);

  // focusTumor: frame the tumor's bounding sphere; the two logs prove the mesh and the camera agree (issue #10).
  useEffect(() => {
    const c = controls.current, centroid = report.centroidMm;
    const mesh = cs.tumor.edema ?? Object.values(cs.tumor)[0];
    if (target !== 'tumor' || !c || !centroid || !mesh) return;
    const log = () => {
      cs.world.updateMatrixWorld(true);
      console.info('[case] tumor world position', mesh.localToWorld(new THREE.Vector3(...centroid)).toArray());
    };
    const { min, max } = report.bboxMm ?? { min: centroid, max: centroid };
    const radius = Math.max(new THREE.Vector3(...(max as Vec3)).distanceTo(new THREE.Vector3(...(min as Vec3))) / 2, MIN_FRAME_RADIUS_MM);
    log();
    void c.fitToSphere(new THREE.Sphere(new THREE.Vector3(...rasToScene(centroid, report.brain.centroidMm)), radius), true).then(log);
  }, [target, cs, report]);

  return (
    <>
      <CameraControls ref={controls} makeDefault smoothTime={0.35} minDistance={20} maxDistance={900} />
      <primitive object={cs.world} />
    </>
  );
}
