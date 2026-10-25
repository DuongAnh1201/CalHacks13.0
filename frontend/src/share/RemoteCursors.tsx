import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useCall } from '../call/store';
import { colorOf, cursorSender } from './cursorSync';
import css from './RemoteCursors.module.css';
import { sendCursor, useShare, watchCursors } from './store';
import type { Cursor, RemoteCursor } from './types';

const EASE_S = 0.12;
const DOT_MM = 2.5;

const useLiveSession = (enabled: boolean) => useShare((s) => (enabled && s.session?.status === 'active' ? s.session.sessionId : null));

/** Pointer → shared cursor for this canvas; null outside a live session. */
export function useCursorPush(enabled: boolean): ((c: Cursor | null) => void) | null {
  const sessionId = useLiveSession(enabled);
  const sender = useMemo(() => (sessionId ? cursorSender(sendCursor) : null), [sessionId]);
  useEffect(() => () => { sender?.push(null); sender?.flush(); }, [sender]); // leaving the page hides our dot for the others
  return sender ? sender.push : null;
}

/** Everyone else's pointer as a dot + name chip, re-projected through this screen's own explode (spec §2.1). */
export function RemoteCursors({ enabled }: { enabled: boolean }) {
  const sessionId = useLiveSession(enabled);
  const online = useShare((s) => s.online);
  const speaking = useCall((s) => s.speaking);
  const [rows, setRows] = useState<RemoteCursor[]>([]);
  useEffect(() => (sessionId ? watchCursors(setRows) : undefined), [sessionId]);
  if (!sessionId) return null;
  return <>{rows.map((r) => (r.cursor && online.has(r.participantId) ? <RemoteDot key={r.participantId} id={r.participantId} name={r.displayName} cursor={r.cursor} speaking={speaking.has(r.participantId)} /> : null))}</>;
}

function RemoteDot({ id, name, cursor, speaking }: { id: string; name: string; cursor: Cursor; speaking: boolean }) {
  const scene = useThree((s) => s.scene);
  const node = useMemo(() => scene.getObjectByName(cursor.node), [scene, cursor.node]);
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  const placed = useRef(false);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || !node) return;
    node.localToWorld(target.set(...cursor.localMm)); // every frame: this screen's explode may move the mesh
    if (placed.current) g.position.lerp(target, 1 - Math.exp(-dt / EASE_S));
    else { g.position.copy(target); placed.current = true; }
  });
  if (!node) return null;
  const color = colorOf(id);
  return (
    <group ref={ref}>
      <mesh renderOrder={10} raycast={() => null}>
        <sphereGeometry args={[DOT_MM, 16, 12]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
      <Html style={{ pointerEvents: 'none' }}><span className={speaking ? `${css.chip} ${css.speaking}` : css.chip} style={{ background: color, outlineColor: color }}>{name}</span></Html>
    </group>
  );
}
