import { describe, expect, it } from 'vitest';
import { normalise, poseKey, simplify, strokeOpacity } from './stroke';

const pose = (x: number, y: number, z: number, d = 1) => ({ position: [x * d, y * d, z * d], target: [0, 0, 0] });

describe('stroke', () => {
  it('normalises client points to 0..1 of the stage, clamped', () => {
    expect(normalise([{ x: 110, y: 70 }, { x: 400, y: -5 }], { left: 10, top: 20, width: 200, height: 100 })).toEqual([0.5, 0.5, 1, 0]);
  });
  it('drops points closer than minStep', () => {
    expect(simplify([0, 0, 0.001, 0, 0.01, 0])).toEqual([0, 0, 0.01, 0]);
  });
  it('is fully visible at the drawing pose and fades by 10 degrees', () => {
    expect(strokeOpacity(pose(0, 0, 300), pose(0, 0, 300))).toBe(1);
    const a = (deg: number) => { const r = (deg * Math.PI) / 180; return pose(Math.sin(r), 0, Math.cos(r), 300); };
    expect(strokeOpacity(pose(0, 0, 300), a(1.5))).toBe(1);
    expect(strokeOpacity(pose(0, 0, 300), a(6))).toBeCloseTo(0.5, 1);
    expect(strokeOpacity(pose(0, 0, 300), a(12))).toBe(0);
  });
  it('fades with zoom', () => {
    expect(strokeOpacity(pose(0, 0, 300), pose(0, 0, 330))).toBe(0);
    expect(strokeOpacity(pose(0, 0, 300), pose(0, 0, 303))).toBe(1);
  });
  it('groups nearly equal poses under one key', () => {
    expect(poseKey(pose(0, 0, 300.04))).toBe(poseKey(pose(0, 0, 300)));
  });
});
