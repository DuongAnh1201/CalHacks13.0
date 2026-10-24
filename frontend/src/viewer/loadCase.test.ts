import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Report } from '../api/types';
import { buildCaseScene, MissingNodeError } from './loadCase';
import { rasToScene, type Vec3 } from './transform';

const mesh = (name: string) => Object.assign(new THREE.Mesh(new THREE.BufferGeometry()), { name });
const glb = (...names: string[]) => { const g = new THREE.Group(); names.forEach((n) => g.add(mesh(n))); return g; };
const ALL = ['brain_left', 'brain_right', 'edema', 'core', 'enhancing'];
const report = (over: Partial<Report> = {}) => ({
  tumorDetected: true, side: 'right', centroidMm: [157.9, 114.3, 67.6],
  brain: { centroidMm: [120.7, 105, 76.3], bboxMm: { min: [53, 21, 10], max: [188, 196, 141] } }, ...over,
}) as Report;

describe('buildCaseScene', () => {
  it('names the missing hemisphere node', () => {
    expect(() => buildCaseScene(glb('brain_right', 'edema'), report())).toThrow(MissingNodeError);
    try { buildCaseScene(glb('core'), report()); } catch (e) {
      expect((e as MissingNodeError).missing).toEqual(['brain_left', 'brain_right']);
      expect((e as Error).message).toContain('brain_left');
    }
  });
  it('puts tumor layers under the hemisphere named by report.side', () => {
    const s = buildCaseScene(glb(...ALL), report({ side: 'right' }));
    expect(s.tumor.edema?.parent).toBe(s.hemiRight);
    expect(s.brainLeft.name).toBe('brain_left');
    expect(s.brainRight.parent).toBe(s.hemiRight);
    expect(buildCaseScene(glb(...ALL), report({ side: 'left' })).tumor.core?.parent?.name).toBe('hemiLeft');
    expect(buildCaseScene(glb(...ALL), report({ side: 'bilateral' })).tumor.enhancing?.parent?.name).toBe('tumorCenter');
  });
  it('maps the tumor centroid through R_yup · T_center (SPEC §5.2)', () => {
    const r = report();
    const s = buildCaseScene(glb(...ALL), r);
    s.world.updateMatrixWorld(true);
    const p = s.tumor.edema!.localToWorld(new THREE.Vector3(...(r.centroidMm as Vec3)));
    const want = rasToScene(r.centroidMm as Vec3, r.brain.centroidMm);
    p.toArray().forEach((v, i) => expect(v).toBeCloseTo(want[i], 6));
  });
  it('no tumor: brain only, no throw', () => {
    const s = buildCaseScene(glb('brain_left', 'brain_right'), report({ tumorDetected: false, side: null, centroidMm: null }));
    expect(s.tumor).toEqual({});
  });
  it('uses layers.ts materials, transparent ones without depth write', () => {
    const s = buildCaseScene(glb(...ALL), report());
    const m = s.tumor.edema!.material as THREE.MeshStandardMaterial;
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(s.tumor.edema!.renderOrder).toBe(3);
  });
  it('does not mutate the cached GLB scene', () => {
    const g = glb(...ALL);
    buildCaseScene(g, report());
    expect(g.children.map((c) => c.name)).toEqual(ALL);
  });
});
