import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Report } from '../api/types';
import { applyView, EXPLODE_MM, type ViewInput } from './applyView';
import { buildCaseScene } from './loadCase';

const mesh = (name: string) => Object.assign(new THREE.Mesh(new THREE.BufferGeometry()), { name });
const glb = () => { const g = new THREE.Group(); ['brain_left', 'brain_right', 'edema', 'core', 'enhancing'].forEach((n) => g.add(mesh(n))); return g; };
const report = { tumorDetected: true, side: 'right', centroidMm: [150, 110, 70], brain: { centroidMm: [120, 105, 76], bboxMm: { min: [53, 21, 10], max: [188, 196, 141] } } } as Report;
const base: ViewInput = { tumorRevealed: true, layers: { edema: true, core: true, enhancing: true }, mode: 'whole', brainOpacity: 0.3, hidden: { left: false, right: false }, explodeAmount: 0 };
const scene = (v: Partial<ViewInput>) => { const cs = buildCaseScene(glb(), report); applyView(cs, { ...base, ...v }); return cs; };
const mat = (m: THREE.Mesh) => m.material as THREE.MeshStandardMaterial;

describe('applyView', () => {
  it('a tumor layer shows only when revealed and its layer is on', () => {
    expect(scene({}).tumor.core!.visible).toBe(true);
    expect(scene({ tumorRevealed: false }).tumor.core!.visible).toBe(false);
    const cs = scene({ layers: { edema: false, core: true, enhancing: true } });
    expect([cs.tumor.edema!.visible, cs.tumor.core!.visible]).toEqual([false, true]);
  });
  it('x-ray makes the brain transparent at brainOpacity; whole is opaque', () => {
    const x = scene({ mode: 'xray', brainOpacity: 0.4 });
    expect([mat(x.brainLeft).transparent, mat(x.brainLeft).opacity, mat(x.brainLeft).depthWrite]).toEqual([true, 0.4, false]);
    const w = scene({ mode: 'whole', brainOpacity: 0.4 });
    expect([mat(w.brainRight).transparent, mat(w.brainRight).opacity]).toEqual([false, 1]);
  });
  it('hiding the brain keeps the tumor visible', () => {
    const cs = scene({ hidden: { left: true, right: true } });
    expect([cs.brainLeft.visible, cs.brainRight.visible, cs.tumor.edema!.visible]).toEqual([false, false, true]);
  });
  it('explode moves the hemispheres apart along RAS x (+x = patient right)', () => {
    const cs = scene({ explodeAmount: 0.5 });
    expect(cs.hemiLeft.position.x).toBe(-0.5 * EXPLODE_MM);
    expect(cs.hemiRight.position.x).toBe(0.5 * EXPLODE_MM);
  });
});
