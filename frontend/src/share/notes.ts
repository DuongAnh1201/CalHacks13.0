import { create } from 'zustand';
import type { Report } from '../api/types';
import type { Vec3 } from '../viewer/transform';
import type { NoteAnchor, SliceIndices } from './types';

/*
 * Note positions travel as RAS mm (convex/annotations.ts). The viewers work in "scan mm":
 * voxel index × spacing, the frame of the GLB meshes and of report.centroidMm.
 *
 * shortcut: Convex scans still carry the placeholder centredAxisAlignedAffine (seed.ts,
 * jobs.ts), so RAS mm = scan mm − spacing·(dim − 1)/2. Mirror the real affine here once M4
 * publishes it; every conversion goes through these four functions.
 */
type Geometry = Pick<Report, 'input'>;

const offset = (r: Geometry): Vec3 => r.input.shape.map((d, i) => (r.input.spacingMm[i] * (d - 1)) / 2) as Vec3;

export const scanMmToRas = (mm: Vec3, r: Geometry): Vec3 => { const o = offset(r); return mm.map((v, i) => v - o[i]) as Vec3; };
export const rasToScanMm = (ras: readonly number[], r: Geometry): Vec3 => { const o = offset(r); return [0, 1, 2].map((i) => ras[i] + o[i]) as Vec3; };

/** The MPR crosshair (sagittal = i, coronal = j, axial = k) as scan mm. */
export const indicesToScanMm = (idx: SliceIndices, r: Geometry): Vec3 =>
  [idx.sagittal, idx.coronal, idx.axial].map((v, i) => v * r.input.spacingMm[i]) as Vec3;

export function scanMmToIndices(mm: Vec3, r: Geometry): SliceIndices {
  const [i, j, k] = mm.map((v, a) => Math.min(r.input.shape[a] - 1, Math.max(0, Math.round(v / r.input.spacingMm[a]))));
  return { sagittal: i, coronal: j, axial: k };
}

/** Where a note sits in scan mm, or null when it has no position (a structure note). */
export function anchorMm(anchor: NoteAnchor, r: Geometry & Pick<Report, 'centroidMm'>): Vec3 | null {
  if (anchor.kind === 'point') return rasToScanMm(anchor.ras_mm, r);
  if (anchor.kind === 'tumor' && r.centroidMm) return [...r.centroidMm] as Vec3;
  return null;
}

/**
 * Local UI state for notes, shared by the rail panel and the viewers.
 * `goTo` is a request: viewers act when `n` changes, so asking twice for the same note works.
 */
interface NoteUi { placing: boolean; draft: Vec3 | null; selected: string | null; goTo: { mm: Vec3; n: number } | null }
export const useNoteUi = create<NoteUi>()(() => ({ placing: false, draft: null, selected: null, goTo: null }));

export const setPlacing = (placing: boolean) => useNoteUi.setState(placing ? { placing } : { placing, draft: null });
export const setDraft = (draft: Vec3 | null) => useNoteUi.setState({ draft, placing: false });
export const selectNote = (selected: string | null) => useNoteUi.setState({ selected });
export const goToMm = (mm: Vec3) => useNoteUi.setState((s) => ({ goTo: { mm, n: (s.goTo?.n ?? 0) + 1 } }));
