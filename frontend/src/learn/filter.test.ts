import { describe, expect, it } from 'vitest';
import type { Structure } from '../viewer/anatomy';
import { filterStructures, groupStructures } from './filter';

const mk = (id: string, name: string, group: Structure['group']): Structure => ({
  id, name, side: 'left', group, volumeCm3: 1, centroidMm: [0, 0, 0], bboxMm: { min: [0, 0, 0], max: [0, 0, 0] }, neighbours: [],
});
const list = [mk('lh_hippocampus', 'Hippocampus', 'limbic'), mk('lh_superior_frontal', 'Superior Frontal', 'frontal'), mk('lh_cuneus', 'Cuneus', 'occipital')];

describe('filterStructures', () => {
  it('returns everything for a blank query', () => expect(filterStructures(list, '  ')).toHaveLength(3));
  it('matches names case-insensitively', () => expect(filterStructures(list, 'HIPPO').map((s) => s.id)).toEqual(['lh_hippocampus']));
  it('matches group labels', () => expect(filterStructures(list, 'frontal lobe').map((s) => s.id)).toEqual(['lh_superior_frontal']));
});

describe('groupStructures', () => {
  it('orders groups by GROUP_ORDER and drops empty ones', () => {
    expect(groupStructures(list).map(([g]) => g)).toEqual(['frontal', 'occipital', 'limbic']);
  });
});
