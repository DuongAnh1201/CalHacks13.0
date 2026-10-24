import { describe, expect, it } from 'vitest';
import { commandsFor, fracsOf, indicesOf, sameIndices, toFrac, toIdx } from './mprSync';

const DIMS = [3, 240, 240, 155]; // NiiVue dimsRAS: [ndim, x, y, z]
const A = { sagittal: 120, coronal: 120, axial: 77 };

describe('mprSync', () => {
  it('no change → no commands', () => expect(commandsFor(A, { ...A })).toEqual([]));
  it('one axis → setPlane then setSlice', () => {
    expect(commandsFor(A, { ...A, axial: 80 })).toEqual([{ type: 'setPlane', plane: 'axial' }, { type: 'setSlice', index: 80 }]);
  });
  it('two axes → a plane/slice pair for each, always both', () => {
    expect(commandsFor(A, { ...A, sagittal: 10, coronal: 20 })).toEqual([
      { type: 'setPlane', plane: 'coronal' }, { type: 'setSlice', index: 20 },
      { type: 'setPlane', plane: 'sagittal' }, { type: 'setSlice', index: 10 },
    ]);
  });
  it('index ↔ fraction round-trips at both ends and matches sliceOf', () => {
    for (const [i, n] of [[0, 155], [154, 155], [0, 240], [239, 240], [77, 155]]) expect(toIdx(toFrac(i, n), n)).toBe(i);
    expect(toIdx(0, 155)).toBe(0);
    expect(toIdx(1, 155)).toBe(154);
  });
  it('maps NiiVue RAS fractions to plane indices and back', () => {
    const idx = indicesOf([0.5, 0.25, 0.999], DIMS);
    expect(idx).toEqual({ sagittal: 120, coronal: 60, axial: 154 });
    expect(indicesOf(fracsOf(idx, DIMS), DIMS)).toEqual(idx);
    expect(sameIndices(idx, { ...idx })).toBe(true);
    expect(sameIndices(idx, { ...idx, axial: 0 })).toBe(false);
  });
});
