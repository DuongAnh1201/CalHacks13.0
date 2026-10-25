import type { Volume } from './volume';

/** One axial (k) plane as row-major screen pixels: anterior at the top. */
export interface Plane { w: number; h: number; data: Float32Array }
export type Mask = Uint8Array;

/**
 * Screen convention for left/right. Neurological: the patient's right is on the screen's right
 * (what the app's slice viewer shows). Radiological: the patient's right is on the screen's LEFT,
 * as if facing the patient; most hospital viewers use it.
 */
export type Convention = 'neurological' | 'radiological';

/** Voxel (i, j) of an axial plane → screen (x, y). RAS volumes: +i right, +j anterior. */
export const toScreen = (i: number, j: number, w: number, h: number, c: Convention) =>
  [c === 'radiological' ? w - 1 - i : i, h - 1 - j] as const;

function plane(vol: Volume, k: number, c: Convention, f: (v: number) => number): Float32Array {
  const [w, h] = vol.dims;
  const out = new Float32Array(w * h);
  const base = k * w * h;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const [x, y] = toScreen(i, j, w, h, c);
      out[y * w + x] = f(vol.data[base + j * w + i]);
    }
  }
  return out;
}

export const axial = (vol: Volume, k: number, c: Convention = 'neurological'): Plane =>
  ({ w: vol.dims[0], h: vol.dims[1], data: plane(vol, k, c, (v) => v) });

/** Whole tumor (any label > 0) on one axial plane, in screen order. */
export const tumorMask = (seg: Volume, k: number, c: Convention = 'neurological'): Mask =>
  Uint8Array.from(plane(seg, k, c, (v) => (v > 0 ? 1 : 0)));

/** Tumor voxels per axial plane. */
export function tumorArea(seg: Volume): number[] {
  const [w, h, d] = seg.dims;
  const area = new Array<number>(d).fill(0);
  for (let k = 0; k < d; k++) {
    const base = k * w * h;
    for (let n = 0; n < w * h; n++) if (seg.data[base + n] > 0) area[k]++;
  }
  return area;
}

/** The plane with the largest tumor cross-section; -1 when there is no tumor. */
export function largestSlice(seg: Volume): number {
  const area = tumorArea(seg);
  const max = Math.max(...area);
  return max > 0 ? area.indexOf(max) : -1;
}

/** Planes whose tumor area is at least `frac` of the largest: fair targets for an outline round. */
export function goodSlices(seg: Volume, frac = 0.5): number[] {
  const area = tumorArea(seg);
  const max = Math.max(...area);
  return max > 0 ? area.flatMap((a, k) => (a >= frac * max ? [k] : [])) : [];
}

/** Dice overlap of two binary masks: 2|A∩B| / (|A|+|B|); 1 when both are empty. */
export function dice(a: Mask, b: Mask): number {
  let both = 0, sa = 0, sb = 0;
  for (let n = 0; n < a.length; n++) { sa += a[n]; sb += b[n]; both += a[n] & b[n]; }
  return sa + sb === 0 ? 1 : (2 * both) / (sa + sb);
}

/** Display window: the 1st and 99.5th percentile of the non-zero (brain) pixels. */
export function windowOf(p: Plane): [number, number] {
  const vals = Array.from(p.data).filter((v) => v > 0).sort((a, b) => a - b);
  if (vals.length === 0) return [0, 1];
  const at = (q: number) => vals[Math.min(vals.length - 1, Math.floor(q * vals.length))];
  const lo = at(0.01), hi = at(0.995);
  return [lo, hi > lo ? hi : lo + 1];
}

/** Paints (or erases) a filled disc into a mask in place. */
export function paintDisc(m: Mask, w: number, h: number, cx: number, cy: number, r: number, value: 0 | 1): void {
  const r2 = r * r;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(h - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(w - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) m[y * w + x] = value;
    }
  }
}

/** Fills enclosed holes so a drawn ring scores as the region inside it. */
export function fillHoles(m: Mask, w: number, h: number): Mask {
  const out = Uint8Array.from(m);
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const n = stack.pop()!;
    if (outside[n] || m[n]) continue;
    outside[n] = 1;
    const x = n % w, y = (n - x) / w;
    if (x > 0) stack.push(n - 1);
    if (x < w - 1) stack.push(n + 1);
    if (y > 0) stack.push(n - w);
    if (y < h - 1) stack.push(n + w);
  }
  for (let n = 0; n < w * h; n++) if (!outside[n]) out[n] = 1;
  return out;
}
