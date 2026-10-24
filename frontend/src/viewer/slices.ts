import type { Axis } from '../actions/types';
import { LAYERS } from './layers';

export const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { sagittal: 0, coronal: 1, axial: 2 };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** NiiVue label colormap for seg.nii.gz: index = seg label (SPEC §7.4), 0 = transparent background. */
export function labelColormap() {
  const cm = { I: [0], R: [0], G: [0], B: [0], A: [0], labels: [''] };
  for (const l of [...LAYERS].sort((a, b) => a.seg - b.seg)) {
    const [r, g, b] = rgb(l.color);
    cm.I.push(l.seg); cm.R.push(r); cm.G.push(g); cm.B.push(b); cm.A.push(255); cm.labels.push(l.label);
  }
  return cm;
}

export type Preset = 'Brain' | 'Bone' | 'Subdural' | 'Perfusion';
export const PRESETS: readonly Preset[] = ['Brain', 'Bone', 'Subdural', 'Perfusion'];
// shortcut: Figma's CT preset names on an MRI, each a fraction of the FLAIR robust range (no Hounsfield units), rename when presets get a clinical owner
const FRACTION: Record<Preset, [number, number]> = { Brain: [0, 1], Bone: [0.5, 1], Subdural: [0.15, 0.75], Perfusion: [0.3, 0.9] };

export function windowFor(p: Preset, lo: number, hi: number): [number, number] {
  const [a, b] = FRACTION[p];
  return [lo + a * (hi - lo), lo + b * (hi - lo)];
}

/** 1-based slice number for a 0..1 crosshair fraction over n slices. */
export const sliceOf = (frac: number, n: number) => Math.min(n, Math.max(1, Math.floor(frac * n) + 1));
