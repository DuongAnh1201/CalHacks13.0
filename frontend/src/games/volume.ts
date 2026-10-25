import { API_URL, flairUrl, segUrl } from '../api/client';

/** A 3D scalar volume in native voxel order: index = i + j·nx + k·nx·ny. */
export interface Volume { dims: [number, number, number]; spacing: [number, number, number]; data: ArrayLike<number> }

/*
 * Minimal NIfTI-1 reader for the games' 2D slices. NiiVue renders the full viewers; the games only
 * need voxels, and its loader is built around a WebGL canvas. The games use library and sample
 * cases, which are BraTS volumes with an identity RAS affine (checked with nibabel), so native
 * order is RAS order: +i is patient right, +j anterior, +k superior.
 */
const TYPES: Record<number, (b: ArrayBuffer, off: number, n: number) => ArrayLike<number>> = {
  2: (b, o, n) => new Uint8Array(b, o, n),
  4: (b, o, n) => new Int16Array(b, o, n),
  8: (b, o, n) => new Int32Array(b, o, n),
  16: (b, o, n) => new Float32Array(b, o, n),
  64: (b, o, n) => new Float64Array(b, o, n),
  256: (b, o, n) => new Int8Array(b, o, n),
  512: (b, o, n) => new Uint16Array(b, o, n),
};

export function parseNifti(buf: ArrayBuffer): Volume {
  const view = new DataView(buf);
  const little = view.getInt32(0, true) === 348;
  if (!little && view.getInt32(0, false) !== 348) throw new Error('Not a NIfTI-1 file');
  if (!little) throw new Error('Big-endian NIfTI is not supported');
  const dims = [1, 2, 3].map((i) => view.getInt16(40 + 2 * i, true)) as [number, number, number];
  const type = view.getInt16(70, true);
  const spacing = [1, 2, 3].map((i) => Math.abs(view.getFloat32(76 + 4 * i, true)) || 1) as [number, number, number];
  const offset = Math.max(352, Math.round(view.getFloat32(108, true)));
  const make = TYPES[type];
  if (!make) throw new Error(`Unsupported NIfTI datatype ${type}`);
  const n = dims[0] * dims[1] * dims[2];
  // Typed arrays need an aligned offset; copy the voxel bytes when the header leaves them unaligned.
  const bytes = buf.slice(offset, offset + n * (BYTES[type] ?? 1));
  const slope = view.getFloat32(112, true), inter = view.getFloat32(116, true);
  const raw = make(bytes, 0, n);
  const data = slope && (slope !== 1 || inter) ? Float32Array.from(raw as ArrayLike<number>, (v) => v * slope + inter) : raw;
  return { dims, spacing, data };
}
const BYTES: Record<number, number> = { 2: 1, 4: 2, 8: 4, 16: 4, 64: 8, 256: 1, 512: 2 };

async function fetchNifti(url: string, signal?: AbortSignal): Promise<Volume> {
  const r = await fetch(url, { signal });
  if (!r.ok || !r.body) throw new Error(`Could not load ${url.split('/').pop()} (HTTP ${r.status})`);
  const gz = url.endsWith('.gz');
  const buf = gz ? await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer() : await r.arrayBuffer();
  return parseNifti(buf);
}

export const expertUrl = (id: string) => `${API_URL}/jobs/${encodeURIComponent(id)}/expert.nii.gz`;

/** One fetch per file per page visit; a failure is forgotten so Retry refetches. */
const cache = new Map<string, Promise<Volume>>();
export function loadVolume(url: string): Promise<Volume> {
  let p = cache.get(url);
  if (!p) {
    p = fetchNifti(url);
    cache.set(url, p);
    p.catch(() => cache.delete(url));
  }
  return p;
}

export const loadScan = (jobId: string) => Promise.all([loadVolume(flairUrl(jobId)), loadVolume(segUrl(jobId))]);
