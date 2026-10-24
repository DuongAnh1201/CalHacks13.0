import * as THREE from 'three';
import type { Report } from '../api/types';
import { BRAIN_LAYER, LAYERS, type Layer } from './layers';
import { worldMatrix } from './transform';

export class MissingNodeError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`3D model is missing node${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
    this.name = 'MissingNodeError';
    this.missing = missing;
  }
}

export interface CaseScene {
  world: THREE.Group; hemiLeft: THREE.Group; hemiRight: THREE.Group; brainLeft: THREE.Mesh; brainRight: THREE.Mesh; tumorCenter: THREE.Group; cursorMarker: THREE.Group;
  tumor: Partial<Record<Layer, THREE.Mesh>>;
}

const group = (name: string, parent?: THREE.Object3D) => { const g = new THREE.Group(); g.name = name; parent?.add(g); return g; };

/** SPEC §6 scene graph. Clones the GLB so useGLTF's cached scene stays untouched. GLB materials are ignored (SPEC §7.4). */
export function buildCaseScene(gltfScene: THREE.Object3D, report: Report): CaseScene {
  const src = gltfScene.clone(true);
  // A multi-primitive glTF node loads as a Group of Meshes; take its first Mesh.
  const find = (n: string) => { const m = src.getObjectByName(n)?.getObjectByProperty('isMesh', true); return m instanceof THREE.Mesh ? m : null; };
  const left = find('brain_left'), right = find('brain_right');
  const missing = [!left && 'brain_left', !right && 'brain_right'].filter((n): n is string => !!n);
  if (missing.length) throw new MissingNodeError(missing);

  const world = group('world');
  world.matrixAutoUpdate = false;
  world.matrix.copy(worldMatrix(report.brain.centroidMm));
  const hemiLeft = group('hemiLeft', world), hemiRight = group('hemiRight', world), tumorCenter = group('tumorCenter', world);
  const cursorMarker = group('cursorMarker', world); // shortcut: empty, C2 adds the crosshair mesh

  for (const [m, host] of [[left!, hemiLeft], [right!, hemiRight]] as const) {
    m.material = new THREE.MeshStandardMaterial({ color: BRAIN_LAYER.color, roughness: 0.7, metalness: 0 });
    m.renderOrder = BRAIN_LAYER.renderOrder;
    host.add(m);
  }

  const tumor: CaseScene['tumor'] = {};
  if (report.tumorDetected) {
    const host = report.side === 'left' ? hemiLeft : report.side === 'right' ? hemiRight : tumorCenter;
    for (const l of LAYERS) {
      const m = find(l.node);
      if (!m) continue;
      const transparent = l.opacity < 1;
      m.material = new THREE.MeshStandardMaterial({ color: l.color, opacity: l.opacity, transparent, depthWrite: !transparent, roughness: 0.5, metalness: 0 });
      m.renderOrder = l.renderOrder;
      host.add(m);
      tumor[l.layer] = m;
    }
  }
  return { world, hemiLeft, hemiRight, brainLeft: left!, brainRight: right!, tumorCenter, cursorMarker, tumor };
}
