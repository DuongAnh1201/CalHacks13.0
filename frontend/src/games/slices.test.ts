import { describe, expect, it } from 'vitest';
import { axial, dice, fillHoles, goodSlices, largestSlice, paintDisc, toScreen, tumorMask, windowOf } from './slices';
import { parseNifti, type Volume } from './volume';

/** 4×3×2 volume; value = voxel index, so every pixel says where it came from. */
const vol: Volume = { dims: [4, 3, 2], spacing: [1, 1, 1], data: Array.from({ length: 24 }, (_, n) => n) };

describe('game slices', () => {
  it('draws anterior at the top and puts the patient right on the chosen side', () => {
    // Voxel (i=3, j=2): the patient's far right, most anterior.
    expect(toScreen(3, 2, 4, 3, 'neurological')).toEqual([3, 0]);
    expect(toScreen(3, 2, 4, 3, 'radiological')).toEqual([0, 0]);
    const p = axial(vol, 1);
    expect(p.data[3]).toBe(12 + 2 * 4 + 3); // screen top-right (row 0, col 3) = voxel (3, 2, 1)
    expect(axial(vol, 1, 'radiological').data[0]).toBe(12 + 2 * 4 + 3); // flipped to top-left
  });

  it('finds the plane with the most tumor and the fair planes around it', () => {
    const seg: Volume = { dims: [2, 2, 3], spacing: [1, 1, 1], data: [0, 0, 0, 0, 1, 1, 1, 0, 2, 0, 0, 0] };
    expect(largestSlice(seg)).toBe(1);
    expect(goodSlices(seg)).toEqual([1]);
    expect(goodSlices(seg, 0.3)).toEqual([1, 2]);
    expect(Array.from(tumorMask(seg, 1))).toEqual([1, 0, 1, 1]); // rows flipped: j=1 on top
    expect(largestSlice({ ...seg, data: new Array(12).fill(0) })).toBe(-1);
  });

  it('scores overlap with Dice', () => {
    expect(dice(Uint8Array.of(1, 1, 0, 0), Uint8Array.of(1, 1, 0, 0))).toBe(1);
    expect(dice(Uint8Array.of(1, 1, 0, 0), Uint8Array.of(0, 1, 1, 0))).toBe(0.5);
    expect(dice(Uint8Array.of(1, 0), Uint8Array.of(0, 1))).toBe(0);
    expect(dice(Uint8Array.of(0, 0), Uint8Array.of(0, 0))).toBe(1);
  });

  it('paints discs and fills a drawn ring', () => {
    const m = new Uint8Array(25);
    paintDisc(m, 5, 5, 2, 2, 1, 1);
    expect(m.reduce((a, b) => a + b, 0)).toBe(5); // a plus sign
    const ring = Uint8Array.from('1111110001100011000111111'.split('').map(Number));
    expect(fillHoles(ring, 5, 5).every((v) => v === 1)).toBe(true);
  });

  it('windows on the brain, ignoring background zeros', () => {
    const [lo, hi] = windowOf({ w: 4, h: 1, data: Float32Array.of(0, 10, 20, 30) });
    expect(lo).toBe(10);
    expect(hi).toBe(30);
  });
});

describe('NIfTI reader', () => {
  it('reads dims, spacing and scaled voxels from a NIfTI-1 header', () => {
    const buf = new ArrayBuffer(352 + 8 * 2);
    const v = new DataView(buf);
    v.setInt32(0, 348, true);
    [3, 2, 2, 2].forEach((d, i) => v.setInt16(40 + 2 * i, d, true));
    v.setInt16(70, 4, true); // int16
    [1, 1.5, 1.5, 3].forEach((s, i) => v.setFloat32(76 + 4 * i, s, true));
    v.setFloat32(108, 352, true);
    v.setFloat32(112, 2, true); // slope
    v.setFloat32(116, 1, true); // intercept
    for (let n = 0; n < 8; n++) v.setInt16(352 + 2 * n, n, true);
    const vol = parseNifti(buf);
    expect(vol.dims).toEqual([2, 2, 2]);
    expect(vol.spacing).toEqual([1.5, 1.5, 3]);
    expect(Array.from(vol.data)).toEqual([1, 3, 5, 7, 9, 11, 13, 15]);
  });

  it('refuses a file that is not NIfTI-1', () => {
    expect(() => parseNifti(new ArrayBuffer(400))).toThrow(/Not a NIfTI-1/);
  });
});
