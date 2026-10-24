import type { Axis } from '../actions/types';

/** 0-based voxel index per plane, the same numbers as Convex `view.sliceIndices`. */
export type SliceIndices = Record<Axis, number>;

export interface Participant { participantId: string; displayName: string; role: 'host' | 'viewer'; following: boolean; joinedAt: number }

/** Hand-written mirror of convex/sessions.ts SessionStateDto, the fields the UI reads (SPEC §6 "No codegen"). */
export interface SessionState {
  sessionId: string;
  status: 'active' | 'ended';
  view: { plane: Axis; tumorVisible: boolean; viewVersion: number; sliceIndices: SliceIndices };
  me: Participant;
  participants: Participant[];
  isPresenter: boolean;
}

/** Mirror of convex/lib/viewCommands.ts ViewerCommand. */
export type ViewerCommand =
  | { type: 'setPlane'; plane: Axis }
  | { type: 'setSlice'; index: number }
  | { type: 'setTumorVisible'; visible: boolean }
  | { type: 'resetView' };
