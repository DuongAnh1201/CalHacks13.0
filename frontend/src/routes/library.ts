import type { LibraryCase } from '../api/types';
import { SAMPLES } from '../api/upload';

export type Side = 'all' | 'left' | 'right' | 'bilateral';
export type Size = 'any' | 'small' | 'medium' | 'large';

/** Same cut-offs as backend/scripts/build_library.py size_word. */
export const sizeOf = (c: Pick<LibraryCase, 'volumesCm3'>): Exclude<Size, 'any'> =>
  c.volumesCm3.whole < 30 ? 'small' : c.volumesCm3.whole > 90 ? 'large' : 'medium';

export function filterCases(cases: LibraryCase[], side: Side, size: Size, query = ''): LibraryCase[] {
  const q = query.trim().toLowerCase();
  return cases.filter((c) => (side === 'all' || c.side === side)
    && (size === 'any' || sizeOf(c) === size)
    && (!q || `${c.title} ${c.blurb}`.toLowerCase().includes(q)));
}

/** A backend without GET /library still has the two seeded samples. */
export const FALLBACK: LibraryCase[] = SAMPLES.map((s) => ({
  jobId: s.id, title: s.title, blurb: s.detail, tumorDetected: true, side: null, lesionCount: 1,
  volumesCm3: { whole: 0, core: 0, enhancing: 0 }, segmentationSource: 'model',
}));
