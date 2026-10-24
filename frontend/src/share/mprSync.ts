import type { Axis } from '../actions/types';
import { AXIS_INDEX, sliceOf } from '../viewer/slices';
import type { SliceIndices, ViewerCommand } from './types';

const AXES: readonly Axis[] = ['axial', 'coronal', 'sagittal'];

/** NiiVue crosshair fraction → 0-based voxel index; same rounding as the slice label. */
export const toIdx = (frac: number, n: number) => sliceOf(frac, n) - 1;
/** 0-based voxel index → fraction at the voxel centre. */
export const toFrac = (idx: number, n: number) => (idx + 0.5) / n;

/** pos is nv.scene.crosshairPos (RAS fractions), dimsRAS is nv.volumes[0].dimsRAS ([ndim, x, y, z]). */
export const indicesOf = (pos: ArrayLike<number>, dimsRAS: ArrayLike<number>): SliceIndices =>
  Object.fromEntries(AXES.map((a) => [a, toIdx(pos[AXIS_INDEX[a]], dimsRAS[AXIS_INDEX[a] + 1])])) as SliceIndices;

export const fracsOf = (idx: SliceIndices, dimsRAS: ArrayLike<number>): [number, number, number] =>
  [toFrac(idx.sagittal, dimsRAS[1]), toFrac(idx.coronal, dimsRAS[2]), toFrac(idx.axial, dimsRAS[3])];

export const sameIndices = (a: SliceIndices, b: SliceIndices) => AXES.every((x) => a[x] === b[x]);

/** Phase A: Sage's setSlice acts on the current plane, so each changed axis sends its plane first, every time. */
export function commandsFor(prev: SliceIndices, next: SliceIndices): ViewerCommand[] {
  return AXES.filter((a) => prev[a] !== next[a]).flatMap((a): ViewerCommand[] => [{ type: 'setPlane', plane: a }, { type: 'setSlice', index: next[a] }]);
}
