import type { Action, Hemi } from '../actions/types';
import type { Layer } from '../viewer/layers';

/** What the 3D viewer can apply today for each agent viewer tool. Anything else is reported, never faked. */
export const TOOLS_3D = ['focus_region', 'toggle_visibility', 'set_mode', 'set_opacity', 'set_explode', 'reset_view'] as const;
/** The tools this page offers the server (viewer tools it can apply + the MCP ones). */
export const AVAILABLE_TOOLS_3D: string[] = [...TOOLS_3D, 'summarize_tumor', 'get_tumor_metrics', 'explain_finding', 'get_report', 'search', 'export_document'];

const MODE = { solid: 'whole', xray: 'xray', exploded: 'exploded', cutaway: 'cutaway' } as const;
const LAYERS = new Set<string>(['edema', 'core', 'enhancing']);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export type StepPlan = { actions: Action[] } | { unsupported: string };

/** Maps one server viewer step (zod-validated there) to dispatch actions. Pure. */
export function planStep(tool: string, rawArgs: unknown): StepPlan {
  const a = rec(rawArgs);
  switch (tool) {
    case 'focus_region':
      return a.region === 'tumor' ? { actions: [{ type: 'focusTumor' }] } : { unsupported: 'Only the tumor can be focused here.' };
    case 'set_mode': {
      const mode = MODE[a.mode as keyof typeof MODE];
      return mode ? { actions: [{ type: 'setMode', mode }] } : { unsupported: 'Unknown mode.' };
    }
    case 'set_opacity':
      return a.target === 'brain' && typeof a.percent === 'number'
        ? { actions: [{ type: 'setOpacity', value: a.percent / 100 }] }
        : { unsupported: 'Only brain opacity is available here.' };
    case 'set_explode':
      return typeof a.percent === 'number' ? { actions: [{ type: 'setExplosion', value: a.percent / 100 }] } : { unsupported: 'Missing explode amount.' };
    case 'reset_view':
      return { actions: [{ type: 'resetView' }] };
    case 'toggle_visibility': {
      const targets = Array.isArray(a.targets) ? a.targets.filter((t): t is string => typeof t === 'string') : [];
      const visible = a.visible === true;
      const actions: Action[] = [];
      for (const t of targets) {
        if (t === 'left' || t === 'right') actions.push({ type: 'setHemisphereVisible', side: t as Hemi, visible });
        else if (LAYERS.has(t)) actions.push({ type: 'setLayerVisible', layer: t as Layer, visible });
      }
      return actions.length ? { actions } : { unsupported: 'Only hemispheres and tumor layers can be toggled here.' };
    }
    default:
      return { unsupported: 'Not available in this viewer yet.' };
  }
}
