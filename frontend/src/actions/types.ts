import type { Layer } from '../viewer/layers';
import type { Vec3 } from '../viewer/transform';

// SPEC §7.2 + design spec §6 (anatomy additions)
export type Axis = 'sagittal' | 'coronal' | 'axial';
export type Mode = 'whole' | 'xray' | 'exploded' | 'cutaway';
export type Hemi = 'left' | 'right';

export interface ViewerState {
  jobId: string;
  mode: Mode;
  cursorRas: Vec3;
  tumorRevealed: boolean;
  selected: 'tumor' | 'left' | 'right' | null;
  brainOpacity: number;
  explodeAmount: number;
  cut: { axis: Axis; offsetMm: number; enabled: boolean };
  hidden: Record<Hemi, boolean>;
  layers: Record<Layer, boolean>;
  cameraTarget: 'brain' | 'tumor';
  selectedStructure: string | null;
  isolate: boolean;
  hiddenStructures: Record<string, boolean>;
}

export type Action =
  | { type: 'focusTumor' }
  | { type: 'setMode'; mode: Mode }
  | { type: 'setOpacity'; value: number }
  | { type: 'setExplosion'; value: number }
  | { type: 'setCutPlane'; axis?: Axis; offsetMm?: number; deltaMm?: number; enabled?: boolean }
  | { type: 'setHemisphereVisible'; side: Hemi; visible: boolean }
  | { type: 'setLayerVisible'; layer: Layer; visible: boolean }
  | { type: 'setSlice'; axis: Axis; offsetMm: number }
  | { type: 'select'; target: 'tumor' | 'left' | 'right' | null }
  | { type: 'resetView' }
  | { type: 'explainFinding' }
  | { type: 'selectStructure'; id: string | null }
  | { type: 'setStructureVisible'; id: string; visible: boolean }
  | { type: 'setIsolate'; on: boolean };

export type Source = 'pointer' | 'keyboard' | 'gesture' | 'voice';
export interface DispatchResult { ok: boolean; message: string }

export interface CaseContext {
  jobId: string;
  hasTumor: boolean;
  structureIds: ReadonlySet<string>;
  bboxMm: { min: Vec3; max: Vec3 };
}
