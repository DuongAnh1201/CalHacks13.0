import { describe, expect, it } from 'vitest';
import { flairUrl, segUrl } from '../api/client';
import { labelColormap, sliceOf, windowFor } from './slices';

describe('slices', () => {
  it('label colormap: index = seg label, 0 transparent, colours from layers.ts', () => {
    const cm = labelColormap();
    expect(cm.A[0]).toBe(0);
    expect([cm.R[1], cm.G[1], cm.B[1], cm.A[1]]).toEqual([242, 201, 76, 255]); // edema #F2C94C
    expect([cm.R[2], cm.G[2], cm.B[2]]).toEqual([242, 153, 74]);             // core #F2994A
    expect([cm.R[3], cm.G[3], cm.B[3]]).toEqual([235, 87, 87]);              // enhancing #EB5757
    expect(cm.labels).toHaveLength(4);
  });
  it('window presets are fractions of the robust range', () => {
    expect(windowFor('Brain', 10, 110)).toEqual([10, 110]);
    expect(windowFor('Bone', 10, 110)).toEqual([60, 110]);
  });
  it('slice number is 1-based and clamped', () => {
    expect(sliceOf(0, 155)).toBe(1);
    expect(sliceOf(0.5, 155)).toBe(78);
    expect(sliceOf(1, 155)).toBe(155);
  });
  it('NIfTI urls', () => {
    expect(segUrl('a b')).toMatch(/\/jobs\/a%20b\/seg\.nii\.gz$/);
    expect(flairUrl('x')).toMatch(/\/jobs\/x\/flair\.nii\.gz$/);
  });
});
