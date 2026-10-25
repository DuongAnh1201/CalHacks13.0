import * as THREE from 'three';
import type { CaseScene } from './loadCase';
import type { Vec3 } from './transform';

const box = new THREE.Box3();

/**
 * The mesh whose frame a scan-mm point is drawn in: the hemisphere it falls in, so a pin
 * rides along with that hemisphere's explode offset. Mesh-local frames are scan mm (loadCase).
 */
export function meshFor(cs: CaseScene, mm: Vec3): THREE.Mesh {
  const p = new THREE.Vector3(...mm);
  const dist = (m: THREE.Mesh) => {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    return box.copy(m.geometry.boundingBox!).distanceToPoint(p);
  };
  return dist(cs.brainLeft) <= dist(cs.brainRight) ? cs.brainLeft : cs.brainRight;
}

/** World position of a scan-mm point on this screen (it moves with this screen's explode). */
export const worldOf = (cs: CaseScene, mm: Vec3, out = new THREE.Vector3()) => meshFor(cs, mm).localToWorld(out.set(...mm));
