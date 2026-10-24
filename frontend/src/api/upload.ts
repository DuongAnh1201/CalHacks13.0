export type Sequence = 't1c' | 't1' | 't2' | 'flair';
export const SEQUENCES: readonly Sequence[] = ['t1c', 't1', 't2', 'flair'];
export const SEQUENCE_LABEL: Record<Sequence, string> = { t1c: 'T1c', t1: 'T1', t2: 'T2', flair: 'FLAIR' };

// Contract §2 "Input guard". The backend check stays the trust boundary.
export const INVALID_FORMAT_MESSAGE =
  "Images and screenshots don't contain 3D scan data. Upload 4 NIfTI sequences (T1c, T1, T2, FLAIR) or use a sample case.";

export const isNifti = (name: string) => /\.nii(\.gz)?$/i.test(name);

export function guessSequence(name: string): Sequence | null {
  const n = name.toLowerCase();
  if (n.includes('flair')) return 'flair';
  if (/t1[-_+]?(ce|c|gd)/.test(n)) return 't1c';
  if (n.includes('t2')) return 't2';
  if (n.includes('t1')) return 't1';
  return null;
}

export interface SampleCase { id: string; title: string; detail: string }
// No backend endpoint lists samples; ids match backend/seed/.
export const SAMPLES: readonly SampleCase[] = [
  { id: 'sample', title: 'Sample case A', detail: 'BraTS glioma, right hemisphere. Model segmentation with expert-label Dice.' },
  { id: 'sample-2', title: 'Sample case B', detail: 'BraTS glioma, left hemisphere. Model segmentation with expert-label Dice.' },
];
