import type { Axis, Hemi, Mode } from '../actions/types';
import type { Layer } from '../viewer/layers';
import type { Scene } from './sceneSync';

/** 0-based voxel index per plane, the same numbers as Convex `view.sliceIndices`. */
export type SliceIndices = Record<Axis, number>;

export interface Participant { participantId: string; displayName: string; role: 'host' | 'viewer'; following: boolean; joinedAt: number }

/** Hand-written mirror of convex/sessions.ts SessionStateDto, the fields the UI reads (SPEC §6 "No codegen"). */
export interface SessionState {
  sessionId: string;
  status: 'active' | 'ended';
  /** The room's case; it changes when the host moves the room (sessions.setScan). */
  scan: { jobId: string };
  view: { plane: Axis; tumorVisible: boolean; viewVersion: number; sliceIndices: SliceIndices; scene: Scene };
  me: Participant;
  participants: Participant[];
  isPresenter: boolean;
}

/** Mirror of convex/lib/viewCommands.ts ViewerCommand. */
export type ViewerCommand =
  | { type: 'setPlane'; plane: Axis }
  | { type: 'setSlice'; index: number }
  | { type: 'setTumorVisible'; visible: boolean }
  | { type: 'setCursor'; sliceIndices: SliceIndices }
  | { type: 'setPage'; page: 'mri' | '3d' }
  | { type: 'setMode'; mode: Mode }
  | { type: 'setOpacity'; value: number }
  | { type: 'setExplosion'; value: number }
  | { type: 'setHemisphereVisible'; side: Hemi; visible: boolean }
  | { type: 'setLayerVisible'; layer: Layer; visible: boolean }
  | { type: 'setCameraTarget'; target: 'brain' | 'tumor' }
  | { type: 'setCamera'; position: number[]; target: number[] }
  | { type: 'resetView' };

/** Mirror of convex/messages.ts PublicMessage. */
export interface ChatMessage { messageId: string; role: 'user' | 'assistant'; author: 'human' | 'agent'; authorName: string; text: string; createdAt: number; mine?: boolean }

/** A pointer on the model: hit point in the hit mesh's local frame (convex/cursors.ts). */
export interface Cursor { node: string; localMm: [number, number, number] }
export interface RemoteCursor { participantId: string; displayName: string; cursor: Cursor | null }

/** Mirror of convex/schema.ts vAnnotationAnchor. A point is RAS mm. */
export type NoteAnchor = { kind: 'point'; ras_mm: number[] } | { kind: 'structure'; id: string } | { kind: 'tumor' };

/** Mirror of convex/annotations.ts PublicAnnotation. */
export interface Note {
  annotationId: string; text: string; anchor: NoteAnchor; status: 'accepted' | 'suggested'; author: 'human' | 'agent';
  authorName: string; createdAt: number; canRemove: boolean;
  resolvedAt: number | null; canResolve: boolean; replies: Reply[];
}

export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green';
export interface CameraPoseDto { position: number[]; target: number[] }
/** Mirror of convex/schema.ts vBoardItem. Strokes: flat x,y pairs in 0..1 of the stage. */
export type BoardItem =
  | { kind: 'sticky'; anchor: NoteAnchor; text: string; color: StickyColor }
  | { kind: 'text'; anchor: NoteAnchor; text: string }
  | { kind: 'stroke'; camera: CameraPoseDto; points: number[]; color: string; width: number; mode: 'pen' | 'highlight' };
/** Mirror of convex/board.ts PublicBoardItem. */
export interface BoardRow { itemId: string; item: BoardItem; authorName: string; mine: boolean; canRemove: boolean; createdAt: number; updatedAt: number }
/** Mirror of convex/annotations.ts PublicReply. */
export interface Reply { replyId: string; text: string; author: 'human' | 'agent'; authorName: string; createdAt: number; canRemove: boolean }
