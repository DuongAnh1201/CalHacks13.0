/**
 * Coordinate transforms: voxel index <-> RAS+ millimetres
 * =======================================================
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * NeuroVision has three coordinate systems and a bug in any conversion between
 * them looks like "the tumor is 4 mm to the left", which is the hardest class of
 * bug to notice and the easiest to ship. SPEC §5.3 makes it a stop-the-line
 * issue; BACKEND_CONTEXT guardrail 10 says "keep spatial transforms explicit".
 * So all of the arithmetic lives here, as PURE FUNCTIONS with no database and no
 * Convex imports, and it is unit-tested directly (convex/tests/transform.test.ts).
 *
 * The three systems:
 *
 *   1. VOXEL INDEX  (i, j, k)  — integers into the NIfTI array. What an
 *      annotation is anchored to, and what "slice 77" means.
 *   2. RAS+ MM      (x, y, z)  — physical millimetres.  +x = patient Right,
 *      +y = Anterior, +z = Superior. This is what `model.glb` vertices, every
 *      `report` coordinate, and NiiVue all use (BACKEND_CONTRACT §1.2, §2.2).
 *   3. THREE.JS SCENE          — RAS mm, re-centred and rotated -90 deg about X.
 *      THE BACKEND NEVER TOUCHES THIS. It is defined once on the frontend in
 *      `frontend/src/viewer/transform.ts` (SPEC §5.2). We stop at RAS mm.
 *
 * The bridge between (1) and (2) is the NIfTI affine, which Tom's pipeline
 * applies to the meshes and which we store on the scan row as
 * `affineRowMajor`.
 *
 * NOTE FOR A JAVA READER
 * ----------------------
 * There is no matrix class here on purpose. A `number[]` of length 16, row-major,
 * is exactly a Java `double[16]` walked as `m[row * 4 + col]`. Keeping it as a
 * plain array means it round-trips through the database and over the wire with
 * no serialisation layer. `readonly number[]` is just a compile-time hint that
 * the function will not mutate the caller's array (there is no runtime
 * immutability, unlike `List.copyOf`).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A 3-vector. In RAS mm unless the variable name says "voxel". */
export type Vec3 = [number, number, number];

/** A 4x4 affine, row-major, 16 numbers. `m[row * 4 + col]`. */
export type Mat4 = readonly number[];

/** The three anatomical planes, matching `vPlane` in schema.ts. */
export type Plane = "axial" | "coronal" | "sagittal";

/** Voxel grid size, matching the `dimensions` field on a scan row. */
export type Dimensions = { i: number; j: number; k: number };

/**
 * The subset of a scan row that the transform code needs.
 *
 * Declaring this narrow shape instead of taking `Doc<"scans">` means the
 * transform functions can be tested with a hand-written literal and do not drag
 * in the generated database types. (Java equivalent: accepting an interface
 * instead of the JPA entity.)
 */
export type ScanGeometry = {
  dimensions: Dimensions;
  affineRowMajor: readonly number[];
};

// ---------------------------------------------------------------------------
// Small guards — these turn "variable-length array from the DB" into "Vec3"
// ---------------------------------------------------------------------------

/**
 * Narrows a `number[]` from the database into a `Vec3`, throwing if it is the
 * wrong length. Convex cannot express a fixed-length array validator, so this
 * is the runtime check that stands in for one.
 *
 * Java equivalent: `Preconditions.checkArgument(a.length == 3, ...)`.
 */
export function asVec3(a: readonly number[], what = "vector"): Vec3 {
  if (a.length !== 3) {
    throw new Error(`${what} must have exactly 3 components, got ${a.length}`);
  }
  assertAllFinite(a, what);
  return [a[0], a[1], a[2]];
}

/** Same idea for the affine: must be 16 finite numbers. */
export function asMat4(a: readonly number[], what = "affine"): Mat4 {
  if (a.length !== 16) {
    throw new Error(`${what} must have exactly 16 components, got ${a.length}`);
  }
  assertAllFinite(a, what);
  return a;
}

/**
 * Rejects NaN and +/-Infinity.
 *
 * This matters more than it looks: `NaN` propagates silently through every
 * arithmetic operation and through `Math.round`, so a single bad number from a
 * client would land in the database as a cursor position that can never be
 * compared or clamped back into range. JSON has no NaN, but a client can send
 * one via other encodings, and our own division by a near-zero determinant
 * could produce one.
 */
function assertAllFinite(a: readonly number[], what: string): void {
  for (let n = 0; n < a.length; n++) {
    if (!Number.isFinite(a[n])) {
      throw new Error(`${what}[${n}] must be a finite number, got ${a[n]}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Matrix maths
// ---------------------------------------------------------------------------

/**
 * Applies an affine to a point: `out = m * [p, 1]`, then divides by w.
 *
 * The `w` division is the "homogeneous" part. For a well-formed NIfTI affine the
 * bottom row is `[0, 0, 0, 1]` so `w` is always 1 and the division is a no-op —
 * but doing it anyway means this function is also correct for the inverse of an
 * odd affine, and it costs nothing.
 */
export function applyAffine(m: Mat4, p: Vec3): Vec3 {
  const x = m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3];
  const y = m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7];
  const z = m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11];
  const w = m[12] * p[0] + m[13] * p[1] + m[14] * p[2] + m[15];

  if (!Number.isFinite(w) || Math.abs(w) < 1e-12) {
    throw new Error("affine produced a degenerate homogeneous coordinate");
  }
  return [x / w, y / w, z / w];
}

/**
 * Determinant of the 3x3 matrix formed by deleting `skipRow` and `skipCol`
 * from a 4x4 (this is called a "minor").
 *
 * Written as an explicit loop rather than a hardcoded expression so it is
 * readable and obviously matches the textbook definition. 4x4 inversion happens
 * at most a handful of times per request, so clarity beats speed here.
 */
function minor3(m: Mat4, skipRow: number, skipCol: number): number {
  // Collect the surviving 3x3 into s[row][col].
  const s: number[][] = [];
  for (let r = 0; r < 4; r++) {
    if (r === skipRow) continue;
    const row: number[] = [];
    for (let c = 0; c < 4; c++) {
      if (c === skipCol) continue;
      row.push(m[r * 4 + c]);
    }
    s.push(row);
  }
  // Standard 3x3 determinant (rule of Sarrus).
  return (
    s[0][0] * (s[1][1] * s[2][2] - s[1][2] * s[2][1]) -
    s[0][1] * (s[1][0] * s[2][2] - s[1][2] * s[2][0]) +
    s[0][2] * (s[1][0] * s[2][1] - s[1][1] * s[2][0])
  );
}

/** Determinant of a 4x4, by cofactor expansion along the first row. */
export function determinant4(m: Mat4): number {
  let det = 0;
  for (let c = 0; c < 4; c++) {
    const sign = c % 2 === 0 ? 1 : -1;
    det += sign * m[c] * minor3(m, 0, c);
  }
  return det;
}

/**
 * Inverts a 4x4 affine via the adjugate: `inv = adj(m) / det(m)`.
 *
 *   inv[i][j] = (-1)^(i+j) * minor(m, j, i) / det      <- note the j,i swap:
 *                                                         the adjugate is the
 *                                                         TRANSPOSE of the
 *                                                         cofactor matrix.
 *
 * Throws if the matrix is singular (determinant ~ 0), which for a NIfTI affine
 * would mean a degenerate scan with a zero-size voxel axis. Better to fail loudly
 * at registration time than to hand back Infinity coordinates.
 */
export function invertMat4(m: Mat4): Mat4 {
  asMat4(m);
  const det = determinant4(m);

  // Scale-aware tolerance: a 1 mm isotropic brain affine has |det| ~ 1, but a
  // coarse scan could legitimately have |det| ~ 30. Comparing against the
  // largest element keeps the check meaningful at any scale.
  const largest = Math.max(...m.map(Math.abs), 1);
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12 * largest) {
    throw new Error(`affine is not invertible (determinant ${det})`);
  }

  const out = new Array<number>(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const sign = (i + j) % 2 === 0 ? 1 : -1;
      out[i * 4 + j] = (sign * minor3(m, j, i)) / det;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Voxel <-> RAS mm
// ---------------------------------------------------------------------------

/** Voxel index (may be fractional) -> RAS millimetres. */
export function voxelToRasMm(scan: ScanGeometry, voxel: Vec3): Vec3 {
  return applyAffine(asMat4(scan.affineRowMajor), voxel);
}

/**
 * RAS millimetres -> CONTINUOUS voxel index.
 *
 * Deliberately NOT rounded. Rounding is a separate decision that depends on what
 * the caller is doing: a slice index rounds to nearest, while a bounds check
 * wants the unrounded value so that 239.6 in a 240-voxel axis is "inside".
 */
export function rasMmToVoxel(scan: ScanGeometry, rasMm: Vec3): Vec3 {
  return applyAffine(invertMat4(asMat4(scan.affineRowMajor)), rasMm);
}

/** `dimensions` as an array so it can be indexed by axis number. */
function dimsArray(d: Dimensions): Vec3 {
  return [d.i, d.j, d.k];
}

// ---------------------------------------------------------------------------
// Plane <-> axis mapping
// ---------------------------------------------------------------------------

/**
 * Which RAS axis is a plane's NORMAL? (0 = x, 1 = y, 2 = z)
 *
 * A "sagittal slice" is a plane of constant x, so stepping through sagittal
 * slices moves along RAS x. Same convention as SPEC §7.2
 * (`type Axis = 'sagittal' | 'coronal' | 'axial'; // RAS x, y, z`).
 */
export function planeToRasAxis(plane: Plane): 0 | 1 | 2 {
  switch (plane) {
    case "sagittal":
      return 0; // constant x (left <-> right)
    case "coronal":
      return 1; // constant y (posterior <-> anterior)
    case "axial":
      return 2; // constant z (inferior <-> superior)
  }
}

/**
 * Figures out which VOXEL axis corresponds to each RAS axis, from the affine.
 *
 * Why this is needed: "slice 77 in the axial plane" is an index into the NIfTI
 * array, but which of i/j/k that is depends on how the scan was stored. A NIfTI
 * can be stored LAS, RAS, or any of 48 orientations, so voxel k is not always
 * superior-inferior.
 *
 * How it works: column `c` of the affine's upper-left 3x3 is the RAS direction
 * you travel when you increment voxel axis `c` by one. We assign each voxel axis
 * to whichever RAS axis it points along most strongly, and record the sign.
 *
 *   returns rasAxisToVoxel[r] = { voxelAxis, sign }
 *
 * This is the standard "nearest axis / orientation code" approach (the same idea
 * as nibabel's `aff2axcodes`). It is EXACT for any affine that is a signed
 * permutation of scaled axes — which includes every BraTS-preprocessed scan
 * (D1: co-registered, 1 mm isotropic, RAS) — and it is rejected outright for a
 * heavily oblique affine, rather than being quietly approximated.
 */
export function rasAxisToVoxelAxis(
  affine: Mat4,
): [{ voxelAxis: 0 | 1 | 2; sign: 1 | -1 }, { voxelAxis: 0 | 1 | 2; sign: 1 | -1 }, { voxelAxis: 0 | 1 | 2; sign: 1 | -1 }] {
  const m = asMat4(affine);

  // For each voxel axis c, find its dominant RAS axis.
  const dominantRasOf: (0 | 1 | 2)[] = [];
  const signOf: (1 | -1)[] = [];
  for (let c = 0; c < 3; c++) {
    let best: 0 | 1 | 2 = 0;
    let bestAbs = -1;
    for (let r = 0; r < 3; r++) {
      const abs = Math.abs(m[r * 4 + c]);
      if (abs > bestAbs) {
        bestAbs = abs;
        best = r as 0 | 1 | 2;
      }
    }
    if (bestAbs === 0) {
      throw new Error(`affine column ${c} is all zeros: voxel axis has no direction`);
    }
    dominantRasOf.push(best);
    signOf.push(m[best * 4 + c] >= 0 ? 1 : -1);
  }

  // Invert the mapping. If two voxel axes claim the same RAS axis, the affine is
  // too oblique for a "which slice am I on" question to have a single answer.
  const result = new Array<{ voxelAxis: 0 | 1 | 2; sign: 1 | -1 } | undefined>(3);
  for (let c = 0; c < 3; c++) {
    const r = dominantRasOf[c];
    if (result[r] !== undefined) {
      throw new Error(
        "affine is too oblique to map RAS axes onto voxel axes " +
          `(voxel axes ${result[r]!.voxelAxis} and ${c} both point mainly along RAS axis ${r}); ` +
          "slice indexing needs an axis-aligned or permuted affine",
      );
    }
    result[r] = { voxelAxis: c as 0 | 1 | 2, sign: signOf[c] };
  }

  return result as [
    { voxelAxis: 0 | 1 | 2; sign: 1 | -1 },
    { voxelAxis: 0 | 1 | 2; sign: 1 | -1 },
    { voxelAxis: 0 | 1 | 2; sign: 1 | -1 },
  ];
}

/** How many slices exist in a plane, i.e. the length of the voxel axis it steps along. */
export function sliceCount(scan: ScanGeometry, plane: Plane): number {
  const mapping = rasAxisToVoxelAxis(scan.affineRowMajor);
  const { voxelAxis } = mapping[planeToRasAxis(plane)];
  return dimsArray(scan.dimensions)[voxelAxis];
}

/**
 * Derives the integer slice index for a plane from the shared RAS mm cursor.
 *
 * This is the "never stored, always derived" half of SPEC §5.2. The cursor is
 * the truth; the slice number is a view of it.
 *
 * Clamped into `[0, count - 1]` so the frontend always receives a usable index
 * even if the cursor sits a hair outside the grid.
 */
export function sliceIndexFromCursor(scan: ScanGeometry, plane: Plane, cursorRasMm: Vec3): number {
  const voxel = rasMmToVoxel(scan, cursorRasMm);
  const mapping = rasAxisToVoxelAxis(scan.affineRowMajor);
  const { voxelAxis } = mapping[planeToRasAxis(plane)];
  const count = dimsArray(scan.dimensions)[voxelAxis];
  return clampInt(Math.round(voxel[voxelAxis]), 0, count - 1);
}

/**
 * The inverse operation: move the cursor so that the given plane shows the given
 * slice index, leaving the other two axes exactly where they were.
 *
 * We do the edit IN VOXEL SPACE (mm -> voxel -> overwrite one component ->
 * mm) rather than overwriting one RAS mm component directly. For an axis-aligned
 * affine the two are identical; for a permuted or flipped affine, only the voxel
 * version lands on the actual centre of the requested slice. Doing it this way
 * also means repeatedly stepping slices cannot accumulate drift in the other two
 * coordinates, because they are re-derived from the same voxel values each time.
 *
 * Returns `null` if `index` is outside `[0, sliceCount)` — the caller decides
 * whether that is a clamp or a rejection.
 */
export function cursorForSliceIndex(
  scan: ScanGeometry,
  plane: Plane,
  index: number,
  currentCursorRasMm: Vec3,
): Vec3 | null {
  if (!Number.isInteger(index)) return null;

  const mapping = rasAxisToVoxelAxis(scan.affineRowMajor);
  const { voxelAxis } = mapping[planeToRasAxis(plane)];
  const count = dimsArray(scan.dimensions)[voxelAxis];
  if (index < 0 || index >= count) return null;

  const voxel = rasMmToVoxel(scan, currentCursorRasMm);
  voxel[voxelAxis] = index;
  return voxelToRasMm(scan, voxel);
}

// ---------------------------------------------------------------------------
// Bounds
// ---------------------------------------------------------------------------

/**
 * The RAS mm axis-aligned bounding box of the whole voxel grid.
 *
 * Computed by pushing the 8 corners of the grid through the affine and taking
 * the min/max. Corners are at voxel CENTRES `0` and `dim - 1` (not `-0.5` and
 * `dim - 0.5`), matching how `sliceIndexFromCursor` rounds to a centre.
 *
 * This is geometry derived from the affine, so it is true by construction and
 * safe to store even for a fixture scan. It is NOT the brain's bounding box —
 * see `scans.brain` for that, which only a real report can supply.
 */
export function volumeExtentMm(scan: ScanGeometry): { min: Vec3; max: Vec3 } {
  const d = dimsArray(scan.dimensions);
  if (d.some((n) => !Number.isInteger(n) || n < 1)) {
    throw new Error(`dimensions must be positive integers, got ${JSON.stringify(scan.dimensions)}`);
  }

  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];

  // 8 corners = every combination of (0 or dim-1) on each voxel axis.
  for (const i of [0, d[0] - 1]) {
    for (const j of [0, d[1] - 1]) {
      for (const k of [0, d[2] - 1]) {
        const p = voxelToRasMm(scan, [i, j, k]);
        for (let a = 0; a < 3; a++) {
          if (p[a] < min[a]) min[a] = p[a];
          if (p[a] > max[a]) max[a] = p[a];
        }
      }
    }
  }
  return { min, max };
}

/**
 * Is a voxel coordinate a valid integer index into this scan?
 *
 * Phase 2 (`annotations.create`) is the real customer for this: an annotation
 * anchored outside the volume is a silent data-corruption bug, so the check
 * belongs on the server where a client cannot skip it. It lives here now
 * because it is the same arithmetic, and it is tested now.
 */
export function isVoxelInBounds(scan: ScanGeometry, voxel: Vec3): boolean {
  const d = dimsArray(scan.dimensions);
  for (let a = 0; a < 3; a++) {
    if (!Number.isInteger(voxel[a])) return false;
    if (voxel[a] < 0 || voxel[a] >= d[a]) return false;
  }
  return true;
}

/**
 * Clamps an RAS mm point into an axis-aligned box.
 *
 * Used to keep the shared cursor inside the scan: a gesture or a bad client can
 * ask for any number, and we store a usable one rather than rejecting the whole
 * update (a presenter dragging a slider past the end should stop at the end, not
 * see an error toast).
 */
export function clampToBoxMm(p: Vec3, box: { min: Vec3; max: Vec3 }): Vec3 {
  return [
    clampNumber(p[0], box.min[0], box.max[0]),
    clampNumber(p[1], box.min[1], box.max[1]),
    clampNumber(p[2], box.min[2], box.max[2]),
  ];
}

function clampNumber(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) {
    throw new Error(`cannot clamp non-finite value ${n}`);
  }
  return Math.min(Math.max(n, lo), hi);
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

/**
 * Builds a simple axis-aligned RAS affine from voxel spacing and grid size, with
 * the grid centred on the RAS origin.
 *
 *     A = [ sx  0   0   -sx*(di-1)/2 ]
 *         [ 0   sy  0   -sy*(dj-1)/2 ]
 *         [ 0   0   sz  -sz*(dk-1)/2 ]
 *         [ 0   0   0    1           ]
 *
 * THIS IS A FIXTURE CONVENIENCE ONLY. A real scan's affine comes from its NIfTI
 * header via Tom's pipeline and will generally have a different (non-centred,
 * possibly flipped) origin. Never use this to "reconstruct" an affine we were
 * not given — that is exactly the silent misalignment SPEC §5.3 guards against.
 */
export function centredAxisAlignedAffine(spacingMm: Vec3, dimensions: Dimensions): Mat4 {
  const d = dimsArray(dimensions);
  const [sx, sy, sz] = spacingMm;
  if ([sx, sy, sz].some((s) => !Number.isFinite(s) || s <= 0)) {
    throw new Error(`voxel spacing must be positive, got ${JSON.stringify(spacingMm)}`);
  }
  // prettier-ignore
  return [
    sx, 0,  0,  -sx * (d[0] - 1) / 2,
    0,  sy, 0,  -sy * (d[1] - 1) / 2,
    0,  0,  sz, -sz * (d[2] - 1) / 2,
    0,  0,  0,  1,
  ];
}
