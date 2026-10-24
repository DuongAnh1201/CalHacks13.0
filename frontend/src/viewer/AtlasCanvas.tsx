import { CameraControls, Html, useGLTF } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { dispatch, viewEvents } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import { ATLAS_GLB_URL, CORTICAL_GROUPS, displayName, explodeOffset, type Atlas, type Structure } from './anatomy';
import { worldMatrix } from './transform';
import css from './AtlasCanvas.module.css';

interface Props { atlas: Atlas; colors: Record<string, string>; onMissing: (ids: string[]) => void }

const GHOST_OPACITY = 0.15;
const MIN_FRAME_RADIUS_MM = 12; // tiny nuclei: don't fly inside them
// Front-left three-quarter view. Brain front (RAS +y) is scene −z, left (RAS −x) is scene −x.
const HOME: [number, number, number, number, number, number] = [-260, 80, -200, 0, 0, 0];

export function AtlasCanvas(props: Props) {
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
      onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setLost(true); })}
      onPointerMissed={(e) => { if (e.type === 'click') dispatch({ type: 'selectStructure', id: null }, 'pointer'); }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[150, 250, 200]} intensity={1.6} />
      <directionalLight position={[-200, -50, -150]} intensity={0.5} />
      <AtlasScene {...props} />
    </Canvas>
  );
}

function AtlasScene({ atlas, colors, onMissing }: Props) {
  const { scene } = useGLTF(ATLAS_GLB_URL);
  const controls = useRef<CameraControls>(null);
  const [hover, setHover] = useState<{ id: string; point: THREE.Vector3 } | null>(null);
  const st = useViewer();
  const world = useMemo(() => worldMatrix(atlas.brain.centroidMm), [atlas]);

  // One material per structure; the GLB's own materials are ignored (SPEC §7.4).
  const nodes = useMemo(() => {
    const byId = new Map<string, { mesh: THREE.Mesh; s: Structure }>();
    const missing: string[] = [];
    for (const s of atlas.structures) {
      const o = scene.getObjectByName(s.id);
      if (!(o instanceof THREE.Mesh)) { missing.push(s.id); continue; }
      o.material = new THREE.MeshStandardMaterial({ color: colors[s.id], roughness: 0.65, metalness: 0 });
      o.userData.structureId = s.id;
      byId.set(s.id, { mesh: o, s });
    }
    if (missing.length) console.warn(`[atlas] ${missing.length} structures have no GLB node:`, missing);
    return { byId, missing };
  }, [scene, atlas, colors]);

  useEffect(() => onMissing(nodes.missing), [nodes, onMissing]);

  // Visibility, ghosting, X-Ray, hover and explode, applied imperatively (no React re-render per mesh).
  useEffect(() => {
    for (const { mesh, s } of nodes.byId.values()) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      const sideHidden = (s.side === 'left' && st.hidden.left) || (s.side === 'right' && st.hidden.right);
      mesh.visible = !st.hiddenStructures[s.id] && !sideHidden && !(st.isolate && st.selectedStructure !== s.id);
      const ghost = st.selectedStructure !== null && st.selectedStructure !== s.id;
      const xray = st.mode === 'xray' && CORTICAL_GROUPS.has(s.group);
      const opacity = Math.min(ghost ? GHOST_OPACITY : 1, xray ? st.brainOpacity : 1);
      if (m.transparent !== opacity < 1) m.needsUpdate = true;
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthWrite = opacity >= 1;
      m.emissive.set(hover?.id === s.id ? colors[s.id] : '#000000');
      m.emissiveIntensity = 0.45;
      const [x, y, z] = explodeOffset(s, st.explodeAmount, atlas.brain.centroidMm);
      mesh.position.set(x, y, z); // RAS mm: the parent group carries R_yup · T_center
    }
  }, [nodes, st, hover, colors, atlas]);

  // Fly to the selected structure's bounding sphere (camera is a view effect, not state).
  useEffect(() => {
    const e = st.selectedStructure ? nodes.byId.get(st.selectedStructure) : undefined;
    if (!e || !controls.current) return;
    e.mesh.updateWorldMatrix(true, false);
    e.mesh.geometry.computeBoundingSphere();
    const sphere = e.mesh.geometry.boundingSphere!.clone().applyMatrix4(e.mesh.matrixWorld);
    sphere.radius = Math.max(sphere.radius, MIN_FRAME_RADIUS_MM);
    void controls.current.fitToSphere(sphere, true);
  }, [st.selectedStructure, nodes]);

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

  const pickable = (id: string | undefined): id is string => {
    const e = id ? nodes.byId.get(id) : undefined;
    if (!e || !e.mesh.visible) return false;
    // In X-Ray the see-through cortex must not swallow clicks meant for deep structures.
    return !(st.mode === 'xray' && CORTICAL_GROUPS.has(e.s.group) && st.brainOpacity < 0.5);
  };
  const idOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.object.userData.structureId as string | undefined;

  return (
    <>
      <CameraControls ref={controls} makeDefault smoothTime={0.35} minDistance={20} maxDistance={900} />
      <group matrix={world} matrixAutoUpdate={false}>
        <primitive
          object={scene}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => {
            const id = idOf(e);
            if (!pickable(id)) return; // not stopped → R3F tries the next hit
            e.stopPropagation();
            if (hover?.id !== id) setHover({ id, point: e.point.clone() });
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e: ThreeEvent<PointerEvent>) => {
            if (idOf(e) === hover?.id) { setHover(null); document.body.style.cursor = ''; }
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            const id = idOf(e);
            if (!pickable(id)) return;
            e.stopPropagation();
            dispatch({ type: 'selectStructure', id }, 'pointer');
          }}
          onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
            const id = idOf(e);
            if (!pickable(id)) return;
            e.stopPropagation();
            dispatch({ type: 'selectStructure', id }, 'pointer');
            dispatch({ type: 'setIsolate', on: !useViewer.getState().isolate }, 'pointer');
          }}
        />
      </group>
      {hover && nodes.byId.has(hover.id) && (
        <Html position={hover.point} center style={{ pointerEvents: 'none' }}>
          <div className={css.tooltip}>{displayName(nodes.byId.get(hover.id)!.s)}</div>
        </Html>
      )}
    </>
  );
}

useGLTF.preload(ATLAS_GLB_URL);
