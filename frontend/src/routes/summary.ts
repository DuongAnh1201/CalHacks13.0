import type { Report } from '../api/types';

export const headline = (r: Report) => (r.tumorDetected ? 'Tumor detected' : 'No tumor detected');
const SIDE: Record<NonNullable<Report['side']>, string> = { left: 'Left hemisphere', right: 'Right hemisphere', bilateral: 'Both hemispheres' };
export const sideLabel = (s: Report['side']) => (s ? SIDE[s] : '—');
export const cm3 = (v: number) => `${v.toFixed(1)} cm³`;
