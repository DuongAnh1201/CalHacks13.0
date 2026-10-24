import { describe, expect, it } from 'vitest';
import type { Report } from '../../api/types';
import { demoMessages } from './demo';

const tumor = { tumorDetected: true, side: 'right', volumesCm3: { whole: 136.28, core: 40, enhancing: 10 } } as Report;
const none = { tumorDetected: false, side: null, volumesCm3: { whole: 0, core: 0, enhancing: 0 } } as Report;

describe('demoMessages', () => {
  it('tumor on /mri: vision summary + place-in-3D confirm', () => {
    expect(demoMessages(tumor, 'mri')).toEqual([
      { kind: 'system', agent: 'Vision agent', text: 'Segmentation done: 136.3 cm³, Right hemisphere' },
      { kind: 'confirm', agent: 'Spatial UI', text: 'Place the 136.3 cm³ tumor on the 3D brain?', confirmLabel: 'Place in 3D', dismissLabel: 'Not now' },
    ]);
  });
  it('tumor on /3d: summary only', () => expect(demoMessages(tumor, '3d')).toHaveLength(1));
  it('no tumor: one line, contract wording', () => {
    expect(demoMessages(none, 'mri')).toEqual([{ kind: 'system', agent: 'Vision agent', text: 'No tumor detected' }]);
  });
});
