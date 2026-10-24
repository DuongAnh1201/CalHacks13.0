// Mirrors docs/BACKEND_CONTRACT.md §2 by hand (SPEC §6: no codegen).
import type { Vec3 } from '../viewer/transform';

export interface Health { ok: boolean; model: string; version: string }

export type JobState = 'queued' | 'running' | 'done' | 'failed';
export type Stage = 'validating' | 'inferring' | 'meshing';
export interface JobError { code: string; message: string }
export interface JobStatus { jobId: string; status: JobState; stage: Stage | null; error: JobError | null; createdAt: string }

export interface BBoxMm { min: Vec3; max: Vec3 }
export interface Report {
  jobId: string;
  coordinateFrame: 'RAS_mm';
  model: { name: string; arch: string; version: string };
  segmentationSource: 'model' | 'expert';
  tumorDetected: boolean;
  side: 'left' | 'right' | 'bilateral' | null;
  lesionCount: number;
  centroidMm: Vec3 | null;
  bboxMm: BBoxMm | null;
  volumesCm3: { whole: number; core: number; enhancing: number };
  brain: { centroidMm: Vec3; bboxMm: BBoxMm };
  input: { shape: [number, number, number]; spacingMm: Vec3; sequences: string[] };
  certainty?: { whole: number | null; core: number | null; enhancing: number | null } | null;
  expertDice?: { whole: number; core: number; enhancing: number };
}
