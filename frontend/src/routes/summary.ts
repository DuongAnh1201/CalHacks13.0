import type { Report } from '../api/types';
import { SAMPLES } from '../api/upload';

export const headline = (r: Report) => (r.tumorDetected ? 'Tumor detected' : 'No tumor detected');
const SIDE: Record<NonNullable<Report['side']>, string> = { left: 'Left hemisphere', right: 'Right hemisphere', bilateral: 'Both hemispheres' };
export const sideLabel = (s: Report['side']) => (s ? SIDE[s] : '—');
export const cm3 = (v: number) => `${v.toFixed(1)} cm³`;

const dec = (v: number | null) => (v === null ? '—' : v.toFixed(2));
/** Model certainty of the outline per region (BACKEND_CONTRACT §5); null for expert labels. */
export const certaintyText = (c: Report['certainty']) => (c ? `whole ${dec(c.whole)} · core ${dec(c.core)} · enhancing ${dec(c.enhancing)}` : null);

export const caseTitle = (r: Report) => SAMPLES.find((s) => s.id === r.jobId)?.title ?? `Case ${r.jobId}`;
