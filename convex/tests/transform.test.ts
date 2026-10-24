/**
 * Tests for the coordinate transforms.
 *
 * These are plain unit tests — no database, no Convex runtime, no mocks. That is
 * possible because `lib/transform.ts` is pure arithmetic, and it is why the
 * riskiest code in the backend is also the cheapest to test.
 *
 * WHY SO MANY TESTS FOR SO LITTLE CODE: SPEC §5.3 makes a coordinate
 * misalignment a stop-the-line defect, and a wrong affine does not crash — it
 * quietly puts the tumor 4 mm from where it belongs. The only defence is to pin
 * the arithmetic down with known values.
 */

import { describe, expect, it } from "vitest";
import {
  applyAffine,
  asMat4,
  asVec3,
  centredAxisAlignedAffine,
  clampToBoxMm,
  cursorForSliceIndex,
  determinant4,
  invertMat4,
  isVoxelInBounds,
  planeToRasAxis,
  rasAxisToVoxelAxis,
  rasMmToVoxel,
  sliceCount,
  sliceIndexFromCursor,
  volumeExtentMm,
  voxelToRasMm,
  type Dimensions,
  type Mat4,
  type Vec3,
} from "../lib/transform";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** The Decathlon Task01 grid used by the real fixture scan (SPEC D2). */
const DIMS: Dimensions = { i: 240, j: 240, k: 155 };
const SPACING: Vec3 = [1, 1, 1];

/** Plain RAS, 1 mm isotropic, centred on the origin — what `seed.ts` uses. */
const CENTRED = {
  dimensions: DIMS,
  affineRowMajor: centredAxisAlignedAffine(SPACING, DIMS),
};

/**
 * A PERMUTED AND FLIPPED affine, to prove the axis mapping is not hardcoded.
 *
 *   voxel i  ->  RAS -x   (flipped: a "LAS"-style first axis)
 *   voxel j  ->  RAS  z
 *   voxel k  ->  RAS  y
 *
 * Rows of a row-major matrix are the RAS output components:
 *   row x = [-1, 0, 0, +120]   so  x = -i + 120
 *   row y = [ 0, 0, 1,  -77]   so  y =  k - 77
 *   row z = [ 0, 1, 0, -120]   so  z =  j - 120
 *
 * This is exactly the sort of header a real NIfTI can carry, and the reason
 * "slice 77" cannot be assumed to mean "index into k".
 */
const PERMUTED = {
  // 240 x 155 x 240 so that each voxel axis has a distinguishable length and a
  // test cannot pass by picking the wrong axis of equal size.
  dimensions: { i: 240, j: 200, k: 155 } as Dimensions,
  // prettier-ignore
  affineRowMajor: [
    -1, 0, 0,  120,
     0, 0, 1,  -77,
     0, 1, 0, -120,
     0, 0, 0,    1,
  ] as Mat4,
};

/** Compares vectors with a millimetre-scale tolerance. */
function expectVec3Close(actual: Vec3, expected: Vec3, tolerance = 1e-9) {
  for (let i = 0; i < 3; i++) {
    expect(Math.abs(actual[i] - expected[i])).toBeLessThanOrEqual(tolerance);
  }
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

describe("input guards", () => {
  it("accepts a well-formed 3-vector", () => {
    expect(asVec3([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("rejects the wrong number of components", () => {
    expect(() => asVec3([1, 2], "cursor")).toThrow(/exactly 3 components/);
    expect(() => asVec3([1, 2, 3, 4], "cursor")).toThrow(/exactly 3 components/);
  });

  it("rejects NaN and Infinity", () => {
    // This is the important one: NaN survives every arithmetic operation and
    // every Math.round, so one NaN stored as a cursor would be permanently
    // un-clampable and un-comparable.
    expect(() => asVec3([1, NaN, 3])).toThrow(/finite/);
    expect(() => asVec3([1, Infinity, 3])).toThrow(/finite/);
  });

  it("requires 16 components for an affine", () => {
    expect(() => asMat4([1, 2, 3])).toThrow(/exactly 16 components/);
  });
});

// ---------------------------------------------------------------------------
// Matrix maths
// ---------------------------------------------------------------------------

describe("matrix maths", () => {
  const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

  it("identity has determinant 1 and is its own inverse", () => {
    expect(determinant4(IDENTITY)).toBeCloseTo(1, 12);
    // Compared element-wise rather than with `toEqual`, because the adjugate
    // computes some zero entries as `-0` (`-1 * 0`). `-0 === 0` is true in
    // JavaScript, but `toEqual` treats them as different values. Floats should
    // be compared with a tolerance anyway.
    const inv = invertMat4(IDENTITY);
    for (let n = 0; n < 16; n++) {
      expect(Math.abs(inv[n] - IDENTITY[n])).toBeLessThan(1e-12);
    }
  });

  it("computes the determinant of a scaled affine", () => {
    // A diagonal affine with 1 mm spacing: det of the 3x3 part is 1*1*1, and the
    // bottom-right 1 carries through.
    expect(determinant4(CENTRED.affineRowMajor)).toBeCloseTo(1, 10);
    // Flip + permutation: one flip and one axis swap -> det = (-1) * (-1) = 1.
    expect(Math.abs(determinant4(PERMUTED.affineRowMajor))).toBeCloseTo(1, 10);
  });

  it("inverts a general affine so that A * A^-1 == I", () => {
    const inv = invertMat4(PERMUTED.affineRowMajor);
    // Multiply the two and compare against the identity, element by element.
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) {
          sum += PERMUTED.affineRowMajor[r * 4 + k] * inv[k * 4 + c];
        }
        expect(Math.abs(sum - (r === c ? 1 : 0))).toBeLessThan(1e-12);
      }
    }
  });

  it("refuses a singular affine instead of returning Infinity", () => {
    // Voxel axis k has zero length, so the matrix collapses a dimension. Failing
    // loudly at registration is much better than handing back Infinity
    // coordinates that get stored as a cursor.
    // prettier-ignore
    const singular: Mat4 = [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 1,
    ];
    expect(() => invertMat4(singular)).toThrow(/not invertible/);
  });

  it("applies an affine as a point transform, not a direction transform", () => {
    // The translation column must be included: voxel (0,0,0) is NOT RAS (0,0,0).
    const origin = applyAffine(PERMUTED.affineRowMajor, [0, 0, 0]);
    expectVec3Close(origin, [120, -77, -120]);
  });
});

// ---------------------------------------------------------------------------
// The centred fixture affine
// ---------------------------------------------------------------------------

describe("centredAxisAlignedAffine", () => {
  it("places the centre of the voxel grid at the RAS origin", () => {
    const centre: Vec3 = [(DIMS.i - 1) / 2, (DIMS.j - 1) / 2, (DIMS.k - 1) / 2];
    expectVec3Close(voxelToRasMm(CENTRED, centre), [0, 0, 0]);
  });

  it("moves exactly one millimetre per voxel at 1 mm spacing", () => {
    const a = voxelToRasMm(CENTRED, [100, 100, 70]);
    const b = voxelToRasMm(CENTRED, [101, 100, 70]);
    expect(b[0] - a[0]).toBeCloseTo(1, 12);
    expect(b[1] - a[1]).toBeCloseTo(0, 12);
  });

  it("scales with anisotropic spacing", () => {
    const scan = {
      dimensions: { i: 10, j: 10, k: 10 },
      affineRowMajor: centredAxisAlignedAffine([2, 3, 4], { i: 10, j: 10, k: 10 }),
    };
    const a = voxelToRasMm(scan, [0, 0, 0]);
    const b = voxelToRasMm(scan, [1, 1, 1]);
    expectVec3Close([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [2, 3, 4]);
  });

  it("rejects non-positive spacing", () => {
    expect(() => centredAxisAlignedAffine([1, 0, 1], DIMS)).toThrow(/positive/);
    expect(() => centredAxisAlignedAffine([1, -1, 1], DIMS)).toThrow(/positive/);
  });
});

// ---------------------------------------------------------------------------
// Round trips
// ---------------------------------------------------------------------------

describe("voxel <-> RAS mm round trips", () => {
  it("round-trips through the centred affine", () => {
    const voxel: Vec3 = [37, 201, 12];
    const back = rasMmToVoxel(CENTRED, voxelToRasMm(CENTRED, voxel));
    expectVec3Close(back, voxel, 1e-9);
  });

  it("round-trips through the permuted-and-flipped affine", () => {
    // The real test of the inverse: a flip plus an axis swap, where getting the
    // transpose or the sign wrong still produces plausible-looking numbers.
    const voxel: Vec3 = [11, 150, 99];
    const ras = voxelToRasMm(PERMUTED, voxel);
    // Verify against the hand-computed expectation, so a self-consistent but
    // wrong inverse cannot make this pass.
    expectVec3Close(ras, [-11 + 120, 99 - 77, 150 - 120]);
    expectVec3Close(rasMmToVoxel(PERMUTED, ras), voxel, 1e-9);
  });

  it("round-trips fractional voxel coordinates", () => {
    const voxel: Vec3 = [37.25, 100.5, 12.75];
    expectVec3Close(rasMmToVoxel(CENTRED, voxelToRasMm(CENTRED, voxel)), voxel, 1e-9);
  });
});

// ---------------------------------------------------------------------------
// Plane / axis mapping — the part most likely to be silently wrong
// ---------------------------------------------------------------------------

describe("plane to axis mapping", () => {
  it("maps planes to their RAS normal, matching SPEC §7.2", () => {
    expect(planeToRasAxis("sagittal")).toBe(0); // constant x
    expect(planeToRasAxis("coronal")).toBe(1); // constant y
    expect(planeToRasAxis("axial")).toBe(2); // constant z
  });

  it("maps RAS axes onto voxel axes for a plain RAS affine", () => {
    const m = rasAxisToVoxelAxis(CENTRED.affineRowMajor);
    expect(m[0]).toEqual({ voxelAxis: 0, sign: 1 });
    expect(m[1]).toEqual({ voxelAxis: 1, sign: 1 });
    expect(m[2]).toEqual({ voxelAxis: 2, sign: 1 });
  });

  it("follows the permutation and the flip", () => {
    const m = rasAxisToVoxelAxis(PERMUTED.affineRowMajor);
    expect(m[0]).toEqual({ voxelAxis: 0, sign: -1 }); // x <- -i
    expect(m[1]).toEqual({ voxelAxis: 2, sign: 1 }); //  y <-  k
    expect(m[2]).toEqual({ voxelAxis: 1, sign: 1 }); //  z <-  j
  });

  it("refuses an oblique affine rather than guessing", () => {
    // 45 degrees in the xy plane: voxel axes i and j both point equally along
    // RAS x and y, so "which slice am I on" has no single answer. Approximating
    // here would produce a plausible number and a wrong picture.
    const s = Math.SQRT1_2;
    // prettier-ignore
    const oblique: Mat4 = [
      s, -s, 0, 0,
      s,  s, 0, 0,
      0,  0, 1, 0,
      0,  0, 0, 1,
    ];
    expect(() => rasAxisToVoxelAxis(oblique)).toThrow(/too oblique/);
  });

  it("counts slices along the correct voxel axis", () => {
    // Plain RAS: axial steps along z -> voxel k -> 155.
    expect(sliceCount(CENTRED, "axial")).toBe(155);
    expect(sliceCount(CENTRED, "coronal")).toBe(240);
    expect(sliceCount(CENTRED, "sagittal")).toBe(240);

    // Permuted: axial steps along z, which is voxel j -> 200. Getting this wrong
    // would report 155 axial slices on a volume that has 200 of them.
    expect(sliceCount(PERMUTED, "axial")).toBe(200);
    expect(sliceCount(PERMUTED, "coronal")).toBe(155); // y <- k
    expect(sliceCount(PERMUTED, "sagittal")).toBe(240); // x <- i
  });
});

// ---------------------------------------------------------------------------
// Slice index <-> cursor
// ---------------------------------------------------------------------------

describe("slice index derivation", () => {
  it("derives the slice index of a known voxel", () => {
    const cursor = voxelToRasMm(CENTRED, [37, 201, 12]);
    expect(sliceIndexFromCursor(CENTRED, "sagittal", cursor)).toBe(37); // i
    expect(sliceIndexFromCursor(CENTRED, "coronal", cursor)).toBe(201); // j
    expect(sliceIndexFromCursor(CENTRED, "axial", cursor)).toBe(12); // k
  });

  it("derives the slice index through a flipped axis", () => {
    const cursor = voxelToRasMm(PERMUTED, [11, 150, 99]);
    // x <- -i, so sagittal slice 11 must come back as 11 even though increasing
    // the index DECREASES x. A sign error here shows up as 228 instead of 11.
    expect(sliceIndexFromCursor(PERMUTED, "sagittal", cursor)).toBe(11);
    expect(sliceIndexFromCursor(PERMUTED, "coronal", cursor)).toBe(99); // y <- k
    expect(sliceIndexFromCursor(PERMUTED, "axial", cursor)).toBe(150); // z <- j
  });

  it("round-trips index -> cursor -> index", () => {
    const start = voxelToRasMm(CENTRED, [120, 120, 77]);
    const moved = cursorForSliceIndex(CENTRED, "axial", 42, start)!;
    expect(moved).not.toBeNull();
    expect(sliceIndexFromCursor(CENTRED, "axial", moved)).toBe(42);
  });

  it("leaves the other two axes untouched when changing slice", () => {
    // This is the property that makes a plane switch non-destructive (SPEC §4:
    // "Switching mode never changes ... the cursor").
    const start = voxelToRasMm(CENTRED, [37, 201, 12]);
    const moved = cursorForSliceIndex(CENTRED, "axial", 99, start)!;
    expect(sliceIndexFromCursor(CENTRED, "sagittal", moved)).toBe(37);
    expect(sliceIndexFromCursor(CENTRED, "coronal", moved)).toBe(201);
    expect(sliceIndexFromCursor(CENTRED, "axial", moved)).toBe(99);
  });

  it("does not drift when stepping repeatedly", () => {
    // 150 single-slice steps, each one a full mm -> voxel -> mm round trip.
    // Accumulated floating-point drift in the two untouched axes would show up
    // here as an off-by-one on a neighbouring plane.
    let cursor = voxelToRasMm(CENTRED, [37, 201, 0]);
    for (let n = 1; n < 150; n++) {
      cursor = cursorForSliceIndex(CENTRED, "axial", n, cursor)!;
    }
    expect(sliceIndexFromCursor(CENTRED, "axial", cursor)).toBe(149);
    expect(sliceIndexFromCursor(CENTRED, "sagittal", cursor)).toBe(37);
    expect(sliceIndexFromCursor(CENTRED, "coronal", cursor)).toBe(201);
  });

  it("returns null for an out-of-range or fractional index", () => {
    const start = voxelToRasMm(CENTRED, [120, 120, 77]);
    expect(cursorForSliceIndex(CENTRED, "axial", -1, start)).toBeNull();
    expect(cursorForSliceIndex(CENTRED, "axial", 155, start)).toBeNull(); // count is 155, so 0..154
    expect(cursorForSliceIndex(CENTRED, "axial", 12.5, start)).toBeNull();
  });

  it("clamps a derived index into range when the cursor sits outside", () => {
    const farOutside = voxelToRasMm(CENTRED, [0, 0, 0]);
    const nudged: Vec3 = [farOutside[0] - 500, farOutside[1], farOutside[2]];
    expect(sliceIndexFromCursor(CENTRED, "sagittal", nudged)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

describe("bounds", () => {
  it("computes the volume extent from the grid corners", () => {
    const { min, max } = volumeExtentMm(CENTRED);
    // 240 voxels at 1 mm, centred: corners at -(239/2) and +(239/2).
    expectVec3Close(min, [-119.5, -119.5, -77]);
    expectVec3Close(max, [119.5, 119.5, 77]);
  });

  it("computes the extent correctly through a flip", () => {
    // x = -i + 120 over i in [0, 239] -> x in [-119, 120]. If the code took the
    // transform's output without min/max-ing, it would report [120, -119].
    const { min, max } = volumeExtentMm(PERMUTED);
    expect(min[0]).toBeCloseTo(-119, 9);
    expect(max[0]).toBeCloseTo(120, 9);
  });

  it("rejects non-integer or zero dimensions", () => {
    expect(() =>
      volumeExtentMm({ dimensions: { i: 0, j: 10, k: 10 }, affineRowMajor: CENTRED.affineRowMajor }),
    ).toThrow(/positive integers/);
    expect(() =>
      volumeExtentMm({ dimensions: { i: 1.5, j: 10, k: 10 }, affineRowMajor: CENTRED.affineRowMajor }),
    ).toThrow(/positive integers/);
  });

  it("validates voxel coordinates for annotations (Phase 2 precondition)", () => {
    expect(isVoxelInBounds(CENTRED, [0, 0, 0])).toBe(true);
    expect(isVoxelInBounds(CENTRED, [239, 239, 154])).toBe(true);
    expect(isVoxelInBounds(CENTRED, [240, 0, 0])).toBe(false); // one past the end
    expect(isVoxelInBounds(CENTRED, [-1, 0, 0])).toBe(false);
    expect(isVoxelInBounds(CENTRED, [0.5, 0, 0])).toBe(false); // must be an integer
  });

  it("clamps a point into a box per axis", () => {
    const box = { min: [-10, -10, -10] as Vec3, max: [10, 10, 10] as Vec3 };
    expectVec3Close(clampToBoxMm([0, 0, 0], box), [0, 0, 0]);
    expectVec3Close(clampToBoxMm([50, -50, 3], box), [10, -10, 3]);
  });

  it("refuses to clamp a non-finite value", () => {
    const box = { min: [-10, -10, -10] as Vec3, max: [10, 10, 10] as Vec3 };
    expect(() => clampToBoxMm([NaN, 0, 0], box)).toThrow(/non-finite/);
  });
});
