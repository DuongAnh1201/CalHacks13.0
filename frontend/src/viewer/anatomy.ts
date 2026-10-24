import { Color } from 'three';
import type { Vec3 } from './transform';

export type Group =
  | 'frontal' | 'parietal' | 'temporal' | 'occipital' | 'insula_cingulate'
  | 'deep' | 'limbic' | 'ventricles' | 'cerebellum' | 'brainstem' | 'other';
export type Side = 'left' | 'right' | 'midline';
export interface BBox { min: Vec3; max: Vec3 }
export interface Structure {
  id: string; name: string; side: Side; group: Group; volumeCm3: number;
  centroidMm: Vec3; bboxMm: BBox; neighbours: string[];
}
export interface Atlas {
  source: { atlas: string; license: string; doi: string };
  brain: { centroidMm: Vec3; bboxMm: BBox };
  structures: Structure[];
}

export const ATLAS_JSON_URL = `${import.meta.env.BASE_URL}atlas/structures.json`;
export const ATLAS_GLB_URL = `${import.meta.env.BASE_URL}atlas/brain_atlas.glb`;

export const GROUP_ORDER: readonly Group[] = [
  'frontal', 'parietal', 'temporal', 'occipital', 'insula_cingulate',
  'limbic', 'deep', 'ventricles', 'cerebellum', 'brainstem', 'other',
];
export const GROUP_LABEL: Record<Group, string> = {
  frontal: 'Frontal lobe', parietal: 'Parietal lobe', temporal: 'Temporal lobe', occipital: 'Occipital lobe',
  insula_cingulate: 'Insula & cingulate', limbic: 'Limbic', deep: 'Deep nuclei', ventricles: 'Ventricles',
  cerebellum: 'Cerebellum', brainstem: 'Brainstem', other: 'Other',
};
export const SIDE_LABEL: Record<Side, string> = { left: 'Left', right: 'Right', midline: 'Midline' };
/** Groups that go see-through in X-Ray (design spec §5.3). */
export const CORTICAL_GROUPS: ReadonlySet<Group> = new Set(['frontal', 'parietal', 'temporal', 'occipital', 'insula_cingulate']);

export async function loadAtlas(): Promise<Atlas> {
  const r = await fetch(ATLAS_JSON_URL);
  if (!r.ok) throw new Error(`Atlas failed to load (HTTP ${r.status})`);
  return (await r.json()) as Atlas;
}

export function displayName(s: Structure): string {
  return s.side === 'midline' ? s.name : `${s.name} (${s.side === 'left' ? 'L' : 'R'})`;
}

// Hue per group, lightness step per structure within the group (design spec §5.4).
const HUE: Record<Group, number> = {
  frontal: 205, parietal: 145, temporal: 275, occipital: 330, insula_cingulate: 180,
  limbic: 55, deep: 25, ventricles: 195, cerebellum: 100, brainstem: 15, other: 0,
};
const baseId = (id: string) => id.replace(/^(lh|rh)_/, '');

export function structureColors(list: readonly Structure[]): Record<string, string> {
  const idx = new Map<string, number>();
  const perGroup = new Map<Group, number>();
  const out: Record<string, string> = {};
  for (const s of list) {
    const b = baseId(s.id);
    if (!idx.has(b)) {
      const n = perGroup.get(s.group) ?? 0;
      idx.set(b, n);
      perGroup.set(s.group, n + 1);
    }
    const i = idx.get(b)!;
    const sat = s.group === 'other' ? 0 : s.group === 'ventricles' ? 0.35 : 0.45;
    out[s.id] = `#${new Color().setHSL(HUE[s.group] / 360, sat, 0.42 + (i % 6) * 0.06).getHexString()}`;
  }
  return out;
}

const HEMI_MM = 40;
const RADIAL_MM = 40;
const FACTOR: Record<Group, number> = {
  frontal: 1, parietal: 1, temporal: 1, occipital: 1, insula_cingulate: 1,
  limbic: 0.7, deep: 0.5, ventricles: 0.5, cerebellum: 1, brainstem: 0, other: 0.5,
};

/** Grouped radial explode offset in RAS mm (design spec §5.3). amount 0 → exactly [0,0,0]. */
export function explodeOffset(s: Structure, amount: number, brainCentroid: Vec3): Vec3 {
  const a = Math.min(1, Math.max(0, amount));
  if (a === 0) return [0, 0, 0];
  const s1 = Math.min(a, 0.4) / 0.4;
  const s2 = Math.max(0, a - 0.4) / 0.6;
  const hx = s.side === 'left' ? -HEMI_MM * s1 : s.side === 'right' ? HEMI_MM * s1 : 0;
  let d: Vec3 = [s.centroidMm[0] - brainCentroid[0], s.centroidMm[1] - brainCentroid[1], s.centroidMm[2] - brainCentroid[2]];
  if (s.group === 'cerebellum') d = [d[0], d[1], d[2] - 0.5 * Math.hypot(...d)];
  const n = Math.hypot(...d);
  const k = n > 1e-9 ? (FACTOR[s.group] * RADIAL_MM * s2) / n : 0;
  if (k === 0) return [hx, 0, 0]; // avoids -0 from d * 0, which breaks toEqual([0, 0, 0])
  return [hx + d[0] * k, d[1] * k, d[2] * k];
}
