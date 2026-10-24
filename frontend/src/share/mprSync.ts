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

/** What an active host must send so the session's mask flag matches its overlay; null when nothing to send. */
export const maskCommand = (mask: boolean | null, activeHost: boolean, sessionVisible: boolean): ViewerCommand | null =>
  activeHost && mask !== null && mask !== sessionVisible ? { type: 'setTumorVisible', visible: mask } : null;
