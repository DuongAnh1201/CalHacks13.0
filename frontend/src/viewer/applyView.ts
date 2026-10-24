import type * as THREE from 'three';
import type { ViewerState } from '../actions/types';
import type { Layer } from './layers';
import type { CaseScene } from './loadCase';

/** Hemisphere shift at explode 100 %, per side, in RAS mm. */
export const EXPLODE_MM = 40;

export type ViewInput = Pick<ViewerState, 'tumorRevealed' | 'layers' | 'mode' | 'brainOpacity' | 'hidden' | 'explodeAmount'>;

/** Store state → case scene graph. Plain three.js so node vitest covers it. */
export function applyView(cs: CaseScene, v: ViewInput): void {
  for (const [l, m] of Object.entries(cs.tumor) as [Layer, THREE.Mesh][]) m.visible = v.tumorRevealed && v.layers[l];
  const xray = v.mode === 'xray';
  for (const [m, side] of [[cs.brainLeft, 'left'], [cs.brainRight, 'right']] as const) {
    m.visible = !v.hidden[side];
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.transparent !== xray) mat.needsUpdate = true; // transparency changes the shader program
    mat.transparent = xray;
    mat.opacity = xray ? v.brainOpacity : 1;
    mat.depthWrite = !xray;
  }
  cs.hemiLeft.position.x = -v.explodeAmount * EXPLODE_MM;
  cs.hemiRight.position.x = v.explodeAmount * EXPLODE_MM;
}
