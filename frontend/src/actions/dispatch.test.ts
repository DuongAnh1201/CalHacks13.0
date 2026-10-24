import { beforeEach, describe, expect, it } from 'vitest';
import type { Action, CaseContext } from './types';
import { dispatch, initCase, viewEvents } from './dispatch';
import { initialState, useViewer } from './store';

const ctx: CaseContext = {
  jobId: 'atlas',
  hasTumor: false,
  structureIds: new Set(['lh_superior_frontal', 'brainstem']),
  bboxMm: { min: [-70, -100, -50], max: [70, 70, 80] },
};
const st = () => useViewer.getState();

beforeEach(() => initCase(ctx));

describe('dispatch', () => {
  it('clamps opacity to 1', () => {
    expect(dispatch({ type: 'setOpacity', value: 1.7 }, 'pointer').ok).toBe(true);
    expect(st().brainOpacity).toBe(1);
  });
  it('clamps explosion to 0', () => {
    dispatch({ type: 'setExplosion', value: -1 }, 'pointer');
    expect(st().explodeAmount).toBe(0);
  });
  it('rejects NaN values', () => {
    expect(dispatch({ type: 'setOpacity', value: Number.NaN }, 'pointer').ok).toBe(false);
    expect(st().brainOpacity).toBe(0.3);
  });
  it('resetView restores the snapshot and emits reset', () => {
    let resets = 0;
    const on = () => { resets++; };
    viewEvents.addEventListener('reset', on);
    dispatch({ type: 'setOpacity', value: 0.9 }, 'pointer');
    dispatch({ type: 'setExplosion', value: 0.5 }, 'pointer');
    dispatch({ type: 'setMode', mode: 'xray' }, 'pointer');
    dispatch({ type: 'selectStructure', id: 'brainstem' }, 'pointer');
    dispatch({ type: 'setStructureVisible', id: 'lh_superior_frontal', visible: false }, 'pointer');
    expect(dispatch({ type: 'resetView' }, 'pointer').ok).toBe(true);
    expect(st()).toEqual(initialState('atlas'));
    expect(resets).toBe(1);
    viewEvents.removeEventListener('reset', on);
  });
  it('rejects an unknown structure id and leaves state alone', () => {
    const r = dispatch({ type: 'selectStructure', id: 'lh_nope' }, 'pointer');
    expect(r.ok).toBe(false);
    expect(st().selectedStructure).toBeNull();
    expect(dispatch({ type: 'setStructureVisible', id: 'nope', visible: false }, 'pointer').ok).toBe(false);
  });
  it('refuses focusTumor on the no-tumor atlas', () => {
    const r = dispatch({ type: 'focusTumor' }, 'pointer');
    expect(r).toEqual({ ok: false, message: 'No tumor detected in this scan' });
    expect(st().tumorRevealed).toBe(false);
    expect(dispatch({ type: 'setLayerVisible', layer: 'core', visible: true }, 'pointer').ok).toBe(false);
    expect(dispatch({ type: 'select', target: 'tumor' }, 'pointer').ok).toBe(false);
  });
  it('refuses isolate without a selection', () => {
    expect(dispatch({ type: 'setIsolate', on: true }, 'pointer').ok).toBe(false);
    expect(st().isolate).toBe(false);
  });
  it('isolates the selection, and deselect clears isolate', () => {
    dispatch({ type: 'selectStructure', id: 'brainstem' }, 'pointer');
    expect(dispatch({ type: 'setIsolate', on: true }, 'pointer').ok).toBe(true);
    expect(st().isolate).toBe(true);
    dispatch({ type: 'selectStructure', id: null }, 'pointer');
    expect(st()).toMatchObject({ selectedStructure: null, isolate: false });
  });
  it('hides and shows a structure', () => {
    dispatch({ type: 'setStructureVisible', id: 'brainstem', visible: false }, 'pointer');
    expect(st().hiddenStructures.brainstem).toBe(true);
    dispatch({ type: 'setStructureVisible', id: 'brainstem', visible: true }, 'pointer');
    expect(st().hiddenStructures.brainstem).toBe(false);
  });
  it('toggles hemispheres', () => {
    dispatch({ type: 'setHemisphereVisible', side: 'left', visible: false }, 'pointer');
    expect(st().hidden).toEqual({ left: true, right: false });
  });
  it('clamps the cut offset to the brain bbox', () => {
    dispatch({ type: 'setCutPlane', axis: 'axial', offsetMm: 500, enabled: true }, 'pointer');
    expect(st().cut).toEqual({ axis: 'axial', offsetMm: 80, enabled: true });
    dispatch({ type: 'setCutPlane', deltaMm: -1000 }, 'pointer');
    expect(st().cut.offsetMm).toBe(-50);
  });
  it('rejects unknown actions', () => {
    expect(dispatch({ type: 'warp' } as unknown as Action, 'pointer').ok).toBe(false);
  });
});
