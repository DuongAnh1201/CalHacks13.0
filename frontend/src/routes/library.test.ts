import { describe, expect, it } from 'vitest';
import type { LibraryCase } from '../api/types';
import { filterCases, sizeOf } from './library';

const at = (jobId: string, side: LibraryCase['side'], whole: number, blurb = ''): LibraryCase => ({
  jobId, title: `Glioma ${jobId}`, blurb, tumorDetected: true, side, lesionCount: 1,
  volumesCm3: { whole, core: 0, enhancing: 0 }, segmentationSource: 'expert',
});
const cases = [at('01', 'left', 12, 'BRATS_101'), at('02', 'right', 60), at('03', 'bilateral', 140), at('04', 'left', 95)];

describe('study library filters', () => {
  it('sizes by whole-tumor volume with the build script cut-offs', () => {
    expect(cases.map(sizeOf)).toEqual(['small', 'medium', 'large', 'large']);
  });
  it('combines side, size and a text search', () => {
    expect(filterCases(cases, 'all', 'any').map((c) => c.jobId)).toEqual(['01', '02', '03', '04']);
    expect(filterCases(cases, 'left', 'any').map((c) => c.jobId)).toEqual(['01', '04']);
    expect(filterCases(cases, 'left', 'large').map((c) => c.jobId)).toEqual(['04']);
    expect(filterCases(cases, 'all', 'any', ' brats_101 ').map((c) => c.jobId)).toEqual(['01']);
  });
});
