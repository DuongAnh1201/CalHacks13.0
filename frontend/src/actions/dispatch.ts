import type { Vec3 } from '../viewer/transform';
import { initialState, useViewer } from './store';
import type { Action, Axis, CaseContext, DispatchResult, Mode, Source, ViewerState } from './types';

const MODES: readonly Mode[] = ['whole', 'xray', 'exploded', 'cutaway'];
const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { sagittal: 0, coronal: 1, axial: 2 };
const NO_TUMOR: DispatchResult = { ok: false, message: 'No tumor detected in this scan' };

let ctx: CaseContext = { jobId: '', hasTumor: false, structureIds: new Set(), bboxMm: { min: [0, 0, 0], max: [0, 0, 0] } };

/** View effects that are not state (camera). CaseCanvas listens for 'reset'. */
export const viewEvents = new EventTarget();

const ok = (message: string): DispatchResult => ({ ok: true, message });
const fail = (message: string): DispatchResult => ({ ok: false, message });
const set = (p: Partial<ViewerState>) => useViewer.setState(p);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Case loader: sets the validation context and resets the view to the snapshot. */
export function initCase(c: CaseContext): void {
  ctx = c;
  useViewer.setState(initialState(c.jobId), true);
}

function clampAxis(axis: Axis, mm: number): number {
  const i = AXIS_INDEX[axis];
  return clamp(mm, ctx.bboxMm.min[i], ctx.bboxMm.max[i]);
}

export function dispatch(a: Action, _source: Source): DispatchResult {
  const s = useViewer.getState();
  switch (a.type) {
    case 'focusTumor':
      if (!ctx.hasTumor) return NO_TUMOR;
      set({ tumorRevealed: true, cameraTarget: 'tumor', selected: 'tumor' });
      return ok('Focused on the tumor');
    case 'setMode':
      if (!MODES.includes(a.mode)) return fail(`Unknown mode ${String(a.mode)}`);
      set({ mode: a.mode });
      return ok(`Mode: ${a.mode}`);
    case 'setOpacity':
      if (!Number.isFinite(a.value)) return fail('Invalid opacity');
      set({ brainOpacity: clamp(a.value, 0, 1) });
      return ok(`Opacity ${pct(clamp(a.value, 0, 1))}`);
    case 'setExplosion':
      if (!Number.isFinite(a.value)) return fail('Invalid explosion');
      set({ explodeAmount: clamp(a.value, 0, 1) });
      return ok(`Explode ${pct(clamp(a.value, 0, 1))}`);
    case 'setCutPlane': {
      const axis = a.axis ?? s.cut.axis;
      const raw = a.offsetMm ?? s.cut.offsetMm + (a.deltaMm ?? 0);
      if (!Number.isFinite(raw)) return fail('Invalid cut offset');
      const offsetMm = clampAxis(axis, raw);
      const cut = { axis, offsetMm, enabled: a.enabled ?? s.cut.enabled };
      const patch: Partial<ViewerState> = { cut };
      if (s.mode === 'cutaway') {
        const c = [...s.cursorRas] as Vec3;
        c[AXIS_INDEX[axis]] = offsetMm;
        patch.cursorRas = c;
      }
      set(patch);
      return ok(`Cut ${axis} at ${offsetMm.toFixed(0)} mm`);
    }
    case 'setHemisphereVisible':
      set({ hidden: { ...s.hidden, [a.side]: !a.visible } });
      return ok(`${a.side === 'left' ? 'Left' : 'Right'} hemisphere ${a.visible ? 'shown' : 'hidden'}`);
    case 'setLayerVisible':
      if (!ctx.hasTumor) return NO_TUMOR;
      set({ layers: { ...s.layers, [a.layer]: a.visible } });
      return ok(`${a.layer} ${a.visible ? 'shown' : 'hidden'}`);
    case 'setSlice': {
      if (!Number.isFinite(a.offsetMm)) return fail('Invalid slice offset');
      const c = [...s.cursorRas] as Vec3;
      c[AXIS_INDEX[a.axis]] = clampAxis(a.axis, a.offsetMm);
      set({ cursorRas: c });
      return ok(`Slice ${a.axis} at ${c[AXIS_INDEX[a.axis]].toFixed(0)} mm`);
    }
    case 'select':
      if (a.target === 'tumor' && !ctx.hasTumor) return NO_TUMOR;
      set({ selected: a.target });
      return ok(a.target ? `Selected ${a.target}` : 'Selection cleared');
    case 'resetView':
      set(initialState(ctx.jobId));
      viewEvents.dispatchEvent(new Event('reset'));
      return ok('View reset');
    case 'explainFinding':
      // shortcut: the report-backed template is ticket E2; until then only the no-tumor answer exists
      return ctx.hasTumor ? fail('Explanations arrive with the report (ticket E2)') : NO_TUMOR;
    case 'selectStructure':
      if (a.id === null) {
        set({ selectedStructure: null, isolate: false });
        return ok('Selection cleared');
      }
      if (!ctx.structureIds.has(a.id)) return fail(`Unknown structure ${a.id}`);
      set({ selectedStructure: a.id });
      return ok(`Selected ${a.id}`);
    case 'setStructureVisible':
      if (!ctx.structureIds.has(a.id)) return fail(`Unknown structure ${a.id}`);
      set({ hiddenStructures: { ...s.hiddenStructures, [a.id]: !a.visible } });
      return ok(`${a.id} ${a.visible ? 'shown' : 'hidden'}`);
    case 'setIsolate':
      if (a.on && !s.selectedStructure) return fail('Select a structure first');
      set({ isolate: a.on });
      return ok(a.on ? 'Isolated' : 'Isolate off');
    default:
      return fail(`Unknown action ${(a as { type?: unknown }).type as string}`);
  }
}
