import { describe, expect, it } from 'vitest';
import { displayName, explodeOffset, structureColors, type Structure } from './anatomy';
import type { Vec3 } from './transform';

const mk = (id: string, side: Structure['side'], group: Structure['group'], centroidMm: Vec3): Structure => ({
  id, name: id, side, group, volumeCm3: 1, centroidMm, bboxMm: { min: centroidMm, max: centroidMm }, neighbours: [],
});
const C: Vec3 = [0, -20, 5];
const lhFront = mk('lh_superior_frontal', 'left', 'frontal', [-13, 34, 37]);
const rhFront = mk('rh_superior_frontal', 'right', 'frontal', [13, 34, 37]);
const stem = mk('brainstem', 'midline', 'brainstem', [0, -31, -36]);
const cbl = mk('lh_cerebellum_gray_matter', 'left', 'cerebellum', [-25, -60, -30]);
const len = (v: Vec3) => Math.hypot(...v);

describe('explodeOffset (design spec §5.3)', () => {
  it('is exactly zero at amount 0', () => {
    for (const s of [lhFront, rhFront, stem, cbl]) expect(explodeOffset(s, 0, C)).toEqual([0, 0, 0]);
  });
  it('stage 1 splits hemispheres to ±40 mm on x and keeps midline still', () => {
    expect(explodeOffset(lhFront, 0.4, C)).toEqual([-40, 0, 0]);
    expect(explodeOffset(rhFront, 0.4, C)).toEqual([40, 0, 0]);
    expect(explodeOffset(stem, 0.4, C)).toEqual([0, 0, 0]);
  });
  it('stage 2 adds a radial push of 40 mm × group factor', () => {
    const o = explodeOffset(rhFront, 1, C);
    const radial: Vec3 = [o[0] - 40, o[1], o[2]];
    expect(len(radial)).toBeCloseTo(40, 6);
    expect(explodeOffset(stem, 1, C)).toEqual([0, 0, 0]); // brainstem factor 0
  });
  it('biases the cerebellum downward', () => {
    const o = explodeOffset(cbl, 1, C);
    const d: Vec3 = [cbl.centroidMm[0] - C[0], cbl.centroidMm[1] - C[1], cbl.centroidMm[2] - C[2]];
    expect(o[2] / 40).toBeLessThan(d[2] / len(d)); // pushed lower than pure radial
  });
  it('clamps amount', () => {
    expect(explodeOffset(rhFront, 5, C)).toEqual(explodeOffset(rhFront, 1, C));
    expect(explodeOffset(rhFront, -1, C)).toEqual([0, 0, 0]);
  });
});

describe('colours and names', () => {
  it('gives left and right of a pair the same colour and neighbours distinct ones', () => {
    const lhMid = mk('lh_caudal_middle_frontal', 'left', 'frontal', [-35, 10, 45]);
    const c = structureColors([lhFront, rhFront, lhMid, stem]);
    expect(c.lh_superior_frontal).toBe(c.rh_superior_frontal);
    expect(c.lh_superior_frontal).not.toBe(c.lh_caudal_middle_frontal);
    expect(c.brainstem).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('adds the side to display names', () => {
    expect(displayName(lhFront)).toBe('lh_superior_frontal (L)');
    expect(displayName(stem)).toBe('brainstem');
  });
});
