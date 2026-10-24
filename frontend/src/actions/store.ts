import { create } from 'zustand';
import type { ViewerState } from './types';

export function initialState(jobId: string): ViewerState {
  return {
    jobId,
    mode: 'whole',
    cursorRas: [0, 0, 0],
    tumorRevealed: false,
    selected: null,
    brainOpacity: 0.3,
    explodeAmount: 0,
    cut: { axis: 'axial', offsetMm: 0, enabled: false },
    hidden: { left: false, right: false },
    layers: { edema: true, core: true, enhancing: true },
    cameraTarget: 'brain',
    selectedStructure: null,
    isolate: false,
    hiddenStructures: {},
  };
}

// Mutated only by actions/dispatch.ts (SPEC §7.3).
export const useViewer = create<ViewerState>()(() => initialState(''));
