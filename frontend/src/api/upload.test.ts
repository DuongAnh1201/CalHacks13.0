import { describe, expect, it } from 'vitest';
import { guessSequence, INVALID_FORMAT_MESSAGE, isNifti, SAMPLES, SEQUENCES } from './upload';

describe('upload guards', () => {
  it('accepts only .nii and .nii.gz', () => {
    expect(isNifti('BraTS_001_t1.nii')).toBe(true);
    expect(isNifti('x.NII.GZ')).toBe(true);
    for (const n of ['scan.jpg', 'scan.png', 'scan.dcm', 'scan.zip', 'scan.nii.zip', 'nii', 'scan.gz']) expect(isNifti(n)).toBe(false);
  });
  it('guesses the sequence from the file name', () => {
    expect(guessSequence('BraTS20_001_t1ce.nii.gz')).toBe('t1c');
    expect(guessSequence('case_T1c.nii')).toBe('t1c');
    expect(guessSequence('case_t1gd.nii.gz')).toBe('t1c');
    expect(guessSequence('case_t1.nii.gz')).toBe('t1');
    expect(guessSequence('case_T2.nii.gz')).toBe('t2');
    expect(guessSequence('case_flair.nii.gz')).toBe('flair');
    expect(guessSequence('brain.nii.gz')).toBeNull();
  });
  it('keeps the contract message and sample ids', () => {
    expect(INVALID_FORMAT_MESSAGE).toBe("Images and screenshots don't contain 3D scan data. Upload 4 NIfTI sequences (T1c, T1, T2, FLAIR) or use a sample case.");
    expect(SEQUENCES).toEqual(['t1c', 't1', 't2', 'flair']);
    expect(SAMPLES.map((s) => s.id)).toEqual(['sample', 'sample-2']);
  });
});
