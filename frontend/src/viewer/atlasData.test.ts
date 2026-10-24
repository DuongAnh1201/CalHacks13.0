import { describe, expect, it } from 'vitest';
import atlasJson from '../../public/atlas/structures.json';
import content from '../content/anatomy.json';
import { baseId, contentFor } from '../content';
import { explodeOffset, type Atlas } from './anatomy';

const atlas = atlasJson as unknown as Atlas;

describe('atlas data (real structures.json)', () => {
  it('has 95 structures with unique ids', () => {
    const ids = atlas.structures.map((s) => s.id);
    expect(ids.length).toBe(95);
    expect(new Set(ids).size).toBe(95);
  });
  it('explodeOffset(s, 0) is [0,0,0] for every structure', () => {
    for (const s of atlas.structures) expect(explodeOffset(s, 0, atlas.brain.centroidMm)).toEqual([0, 0, 0]);
  });
  it('has authored content for every structure', () => {
    for (const s of atlas.structures) {
      const c = contentFor(s.id);
      expect(c, s.id).toBeDefined();
      expect(c!.description.length, s.id).toBeGreaterThan(20);
      expect(c!.functions.length, s.id).toBeGreaterThanOrEqual(2);
      expect(c!.whenDamaged.length, s.id).toBeGreaterThan(20);
    }
  });
  it('has no orphan content keys', () => {
    const bases = new Set(atlas.structures.map((s) => baseId(s.id)));
    expect(Object.keys(content).filter((k) => !bases.has(k))).toEqual([]);
  });
  it('avoids banned clinical words', () => {
    expect(JSON.stringify(content)).not.toMatch(/diagnos|healthy|prognos/i);
  });
});
