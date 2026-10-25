import { describe, expect, it } from 'vitest';
import { anchorMm, indicesToScanMm, rasToScanMm, scanMmToIndices, scanMmToRas } from './notes';

const r = { input: { shape: [240, 240, 155] as [number, number, number], spacingMm: [1, 1, 2] as [number, number, number], sequences: [] }, centroidMm: [100, 70, 98] as [number, number, number] };

describe('note coordinates', () => {
  it('maps scan mm to the centred placeholder RAS frame Convex validates against, and back', () => {
    expect(scanMmToRas([119.5, 119.5, 154], r)).toEqual([0, 0, 0]); // the volume centre is the RAS origin
    expect(rasToScanMm(scanMmToRas([12, 34, 56], r), r)).toEqual([12, 34, 56]);
  });

  it('round-trips an MPR crosshair through scan mm, clamping to the volume', () => {
    const idx = { sagittal: 10, coronal: 200, axial: 77 };
    expect(indicesToScanMm(idx, r)).toEqual([10, 200, 154]);
    expect(scanMmToIndices(indicesToScanMm(idx, r), r)).toEqual(idx);
    expect(scanMmToIndices([-5, 999, 400], r)).toEqual({ sagittal: 0, coronal: 239, axial: 154 });
  });

  it('places tumor notes at the tumor centre and structure notes nowhere', () => {
    expect(anchorMm({ kind: 'tumor' }, r)).toEqual([100, 70, 98]);
    expect(anchorMm({ kind: 'structure', id: 'hippocampus' }, r)).toBeNull();
    expect(anchorMm({ kind: 'point', ras_mm: [0, 0, 0] }, r)).toEqual([119.5, 119.5, 154]);
  });
});
