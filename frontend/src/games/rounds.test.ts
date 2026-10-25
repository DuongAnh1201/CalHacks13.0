import { describe, expect, it } from 'vitest';
import type { LibraryCase } from '../api/types';
import { beatAiRound, biggerRound, findSliceRound, score, whichSideRound } from './rounds';
import type { Volume } from './volume';

const lib = (jobId: string, side: LibraryCase['side'], whole: number): LibraryCase => ({
  jobId, title: jobId, blurb: '', tumorDetected: true, side, lesionCount: 1,
  volumesCm3: { whole, core: 0, enhancing: 0 }, segmentationSource: 'expert',
});
const seq = (...xs: number[]) => { let n = 0; return () => xs[n++ % xs.length]; };

describe('round generators', () => {
  it('which side: a case with a side, never the one just played', () => {
    const cases = [lib('a', 'left', 50), lib('b', null, 50), lib('c', 'right', 50)];
    for (let n = 0; n < 20; n++) expect(whichSideRound(cases, 'a')?.prompt).toEqual({ kind: 'whichSide', jobId: 'c' });
    expect(whichSideRound(cases, 'a')?.secret).toEqual({ kind: 'whichSide', side: 'right' });
    expect(whichSideRound([lib('a', 'left', 1)], 'a')).toBeNull();
  });

  it('bigger: only pairs 15-100 % apart, answer matches the volumes', () => {
    const cases = [lib('a', 'left', 100), lib('b', 'left', 104), lib('c', 'right', 150), lib('d', 'left', 400)];
    for (let n = 0; n < 20; n++) {
      const r = biggerRound(cases)!;
      const ids = r.prompt.kind === 'bigger' ? [r.prompt.jobA, r.prompt.jobB].sort() : [];
      expect([['a', 'c'], ['b', 'c']]).toContainEqual(ids);
      const s = r.secret!;
      if (s.kind === 'bigger') expect(s.volumesCm3[s.bigger === 'A' ? 0 : 1]).toBe(Math.max(...s.volumesCm3));
    }
    expect(biggerRound([lib('a', 'left', 10), lib('b', 'left', 10.5)])).toBeNull();
  });

  it('beat the AI and find the slice pick targets from the volumes', () => {
    const seg: Volume = { dims: [2, 2, 2], spacing: [1, 1, 2], data: [0, 0, 0, 0, 1, 1, 1, 1] };
    expect(beatAiRound('sample', seg)?.prompt).toEqual({ kind: 'beatAi', jobId: 'sample', slice: 1 });
    const flair: Volume = { ...seg, data: new Array(8).fill(5) };
    const r = findSliceRound('sample', flair, seg, seq(0.1, 0))!; // tumor half, first tumor voxel (n = 7)
    expect(r.prompt).toEqual({ kind: 'findSlice', jobId: 'sample', targetMm: [1, 1, 2] });
  });
});

describe('solo scoring mirrors the server', () => {
  it('scores each kind', () => {
    expect(score({ kind: 'findSlice', jobId: 's', targetMm: [0, 0, 0] }, null, { kind: 'findSlice', mm: [3, 4, 0] })).toEqual({ points: 90, distanceMm: 5 });
    expect(score({ kind: 'beatAi', jobId: 's', slice: 1 }, null, { kind: 'beatAi', dice: 0.8123 })).toEqual({ points: 81, dice: 0.812 });
    expect(score({ kind: 'whichSide', jobId: 's' }, { kind: 'whichSide', side: 'left' }, { kind: 'whichSide', side: 'left' })).toEqual({ points: 100, correct: true });
    expect(score({ kind: 'bigger', jobA: 'a', jobB: 'b' }, { kind: 'bigger', bigger: 'B', volumesCm3: [1, 2] }, { kind: 'bigger', pick: 'A' })).toEqual({ points: 0, correct: false });
  });
});
