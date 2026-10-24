import { describe, expect, it } from 'vitest';
import type { Report } from '../api/types';
import { certaintyText, cm3, headline, sideLabel } from './summary';

describe('result summary', () => {
  it('headline never says anything but the two contract phrases', () => {
    expect(headline({ tumorDetected: true } as Report)).toBe('Tumor detected');
    expect(headline({ tumorDetected: false } as Report)).toBe('No tumor detected');
  });
  it('side labels (+x = patient right)', () => {
    expect(sideLabel('left')).toBe('Left hemisphere');
    expect(sideLabel('right')).toBe('Right hemisphere');
    expect(sideLabel('bilateral')).toBe('Both hemispheres');
    expect(sideLabel(null)).toBe('—');
  });
  it('formats volumes', () => expect(cm3(136.28)).toBe('136.3 cm³'));
  it('formats certainty, dashes empty regions', () => {
    expect(certaintyText({ whole: 0.94, core: 0.97, enhancing: null })).toBe('whole 0.94 · core 0.97 · enhancing —');
  });
  it('hides certainty for expert labels', () => {
    expect(certaintyText(null)).toBeNull();
    expect(certaintyText(undefined)).toBeNull();
  });
});
