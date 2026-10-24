import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { rasToScene, sceneToRas, worldMatrix, type Vec3 } from './transform';

describe('transform (SPEC §5.2)', () => {
  it('maps RAS (10,20,30) to scene (10,30,-20) with centroid 0', () => {
    expect(rasToScene([10, 20, 30], [0, 0, 0])).toEqual([10, 30, -20]);
  });
  it('subtracts the centroid before rotating', () => {
    expect(rasToScene([11, 22, 33], [1, 2, 3])).toEqual([10, 30, -20]);
  });
  it('round-trips ras → scene → ras within 1e-6', () => {
    const c: Vec3 = [0.4, -24.1, 5.5];
    for (const p of [[10, 20, 30], [-71.3, 52.2, -40.9], [0, 0, 0]] as Vec3[]) {
      const back = sceneToRas(rasToScene(p, c), c);
      back.forEach((v, i) => expect(Math.abs(v - p[i])).toBeLessThan(1e-6));
    }
  });
  it('worldMatrix equals rasToScene', () => {
    const c: Vec3 = [3, -7, 11];
    const p: Vec3 = [10, 20, 30];
    const v = new Vector3(...p).applyMatrix4(worldMatrix(c));
    const e = rasToScene(p, c);
    expect(v.x).toBeCloseTo(e[0], 6); expect(v.y).toBeCloseTo(e[1], 6); expect(v.z).toBeCloseTo(e[2], 6);
  });
});
