import type { JobStatus, Stage } from '../api/types';

export type RowState = 'done' | 'active' | 'pending' | 'failed';
export interface StageRow { stage: Stage; label: string; state: RowState }

const ORDER: readonly { stage: Stage; label: string }[] = [
  { stage: 'validating', label: 'Check the 4 sequences' },
  { stage: 'inferring', label: 'Segment the tumor (SegResNet)' },
  { stage: 'meshing', label: 'Build the 3D brain and tumor meshes' },
];

export function stageRows({ status, stage }: Pick<JobStatus, 'status' | 'stage'>): StageRow[] {
  const at = stage ? ORDER.findIndex((o) => o.stage === stage) : -1;
  return ORDER.map((o, i) => {
    let state: RowState = 'pending';
    if (status === 'done' || i < at) state = 'done';
    else if (i === at) state = status === 'failed' ? 'failed' : 'active';
    return { ...o, state };
  });
}
