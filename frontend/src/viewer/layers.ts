// SPEC §7.4 — one table drives NiiVue overlay colours, 3D materials and the legend.
export type Layer = 'edema' | 'core' | 'enhancing';

export interface LayerDef { layer: Layer; label: string; node: Layer; seg: 1 | 2 | 3; color: string; opacity: number; renderOrder: number }

export const LAYERS: readonly LayerDef[] = [
  { layer: 'edema', label: 'Edema (whole tumor)', node: 'edema', seg: 1, color: '#F2C94C', opacity: 0.35, renderOrder: 3 },
  { layer: 'core', label: 'Tumor core', node: 'core', seg: 2, color: '#F2994A', opacity: 0.7, renderOrder: 2 },
  { layer: 'enhancing', label: 'Enhancing', node: 'enhancing', seg: 3, color: '#EB5757', opacity: 1, renderOrder: 1 },
];

export const BRAIN_LAYER = { label: 'Brain', nodes: ['brain_left', 'brain_right'] as const, color: '#D9D4CF', renderOrder: 4 };
