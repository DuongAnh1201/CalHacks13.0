import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import * as THREE from 'three';
import type { Report } from '../api/types';
import type { CaseScene } from '../viewer/loadCase';
import { worldOf } from '../viewer/pins';
import type { Vec3 } from '../viewer/transform';
import { anchorMm, selectNote, useNoteUi } from './notes';
import css from './NotePins.module.css';
import type { Note } from './types';

const PIN_MM = 2.2;
/** Session notes as numbered pins, plus the pin being placed. */
export function NotePins({ cs, report, notes }: { cs: CaseScene; report: Report; notes: Note[] }) {
  const draft = useNoteUi((s) => s.draft);
  const selected = useNoteUi((s) => s.selected);
  return (
    <>
      {notes.map((n, i) => {
        const mm = anchorMm(n.anchor, report);
        return mm && <Pin key={n.annotationId} cs={cs} mm={mm} label={String(i + 1)} text={selected === n.annotationId ? n.text : null}
          onClick={() => selectNote(selected === n.annotationId ? null : n.annotationId)} />;
      })}
      {draft && <Pin cs={cs} mm={draft} label="+" text={null} draft />}
    </>
  );
}

function Pin({ cs, mm, label, text, draft, onClick }: { cs: CaseScene; mm: Vec3; label: string; text: string | null; draft?: boolean; onClick?: () => void }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => { if (ref.current) worldOf(cs, mm, ref.current.position); }); // every frame: explode moves the hemisphere
  return (
    <group ref={ref}>
      <mesh renderOrder={11} raycast={() => null}>
        <sphereGeometry args={[PIN_MM, 16, 12]} />
        <meshBasicMaterial color={draft ? '#1f5673' : '#f2994a'} depthTest={false} transparent />
      </mesh>
      <Html zIndexRange={[15, 0]} style={{ pointerEvents: onClick ? 'auto' : 'none' }}>
        <div className={css.pin}>
          <button type="button" className={draft ? `${css.badge} ${css.draft}` : css.badge} onClick={onClick} tabIndex={-1}>{label}</button>
          {text && <p className={css.card}>{text}</p>}
        </div>
      </Html>
    </group>
  );
}
