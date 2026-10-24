import type { Action, Hemi, Mode, ViewerState } from '../actions/types';
import type { Layer } from '../viewer/layers';
import type { ViewerCommand } from './types';

export type Page = 'mri' | '3d';
/** Mirror of convex/lib/viewCommands.ts Scene. */
export interface Scene {
  page: Page;
  mode: Mode;
  brainOpacity: number;
  explodeAmount: number;
  hidden: Record<Hemi, boolean>;
  layers: Record<Layer, boolean>;
  cameraTarget: 'brain' | 'tumor';
}

export const DEFAULT_SCENE: Scene = {
  page: 'mri', mode: 'whole', brainOpacity: 0.3, explodeAmount: 0,
  hidden: { left: false, right: false }, layers: { edema: true, core: true, enhancing: true }, cameraTarget: 'brain',
};

const SIDES: readonly Hemi[] = ['left', 'right'];
const LAYERS: readonly Layer[] = ['edema', 'core', 'enhancing'];

export const sceneOf = (s: ViewerState, page: Page): Scene => ({
  page, mode: s.mode, brainOpacity: s.brainOpacity, explodeAmount: s.explodeAmount, hidden: s.hidden, layers: s.layers, cameraTarget: s.cameraTarget,
});

export function sceneCommands(prev: Scene, next: Scene): ViewerCommand[] {
  const out: ViewerCommand[] = [];
  if (prev.page !== next.page) out.push({ type: 'setPage', page: next.page });
  if (prev.mode !== next.mode) out.push({ type: 'setMode', mode: next.mode });
  if (prev.brainOpacity !== next.brainOpacity) out.push({ type: 'setOpacity', value: next.brainOpacity });
  if (prev.explodeAmount !== next.explodeAmount) out.push({ type: 'setExplosion', value: next.explodeAmount });
  for (const side of SIDES) if (prev.hidden[side] !== next.hidden[side]) out.push({ type: 'setHemisphereVisible', side, visible: !next.hidden[side] });
  for (const layer of LAYERS) if (prev.layers[layer] !== next.layers[layer]) out.push({ type: 'setLayerVisible', layer, visible: next.layers[layer] });
  if (prev.cameraTarget !== next.cameraTarget) out.push({ type: 'setCameraTarget', target: next.cameraTarget });
  return out;
}

/** Guest side. prev null = apply everything. A brain camera dispatches nothing: the guest's own orbit stays put. */
export function sceneActions(prev: Scene | null, next: Scene): Action[] {
  const out: Action[] = [];
  if (next.cameraTarget === 'tumor' && prev?.cameraTarget !== 'tumor') out.push({ type: 'focusTumor' });
  if (!prev || prev.mode !== next.mode) out.push({ type: 'setMode', mode: next.mode });
  if (!prev || prev.brainOpacity !== next.brainOpacity) out.push({ type: 'setOpacity', value: next.brainOpacity });
  if (!prev || prev.explodeAmount !== next.explodeAmount) out.push({ type: 'setExplosion', value: next.explodeAmount });
  for (const side of SIDES) if (!prev || prev.hidden[side] !== next.hidden[side]) out.push({ type: 'setHemisphereVisible', side, visible: !next.hidden[side] });
  for (const layer of LAYERS) if (!prev || prev.layers[layer] !== next.layers[layer]) out.push({ type: 'setLayerVisible', layer, visible: next.layers[layer] });
  return out;
}

/** Host side: one trailing send per `ms` with whatever changed since the last send (spec §3 throttle, applied to all fields). */
export function sceneSender(base: Scene, send: (cmds: ViewerCommand[]) => void, ms = 150) {
  let sent = base;
  let latest = base;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    const cmds = sceneCommands(sent, latest);
    sent = latest;
    if (cmds.length) send(cmds);
  };
  return {
    push(s: Scene) { latest = s; timer ??= setTimeout(flush, ms); },
    flush,
  };
}
