import type { CameraPoseDto } from '../share/types';

type Rect = { left: number; top: number; width: number; height: number };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const normalise = (pts: { x: number; y: number }[], r: Rect) =>
  pts.flatMap((p) => [clamp01((p.x - r.left) / r.width), clamp01((p.y - r.top) / r.height)]);

export function simplify(flat: number[], minStep = 0.002): number[] {
  const out = flat.slice(0, 2);
  for (let i = 2; i < flat.length; i += 2) {
    if (Math.hypot(flat[i] - out[out.length - 2], flat[i + 1] - out[out.length - 1]) >= minStep) out.push(flat[i], flat[i + 1]);
  }
  return out;
}

const sub = (a: number[], b: number[]) => a.map((n, i) => n - b[i]);
const len = (a: number[]) => Math.hypot(...a);

/**
 * How visible a stroke drawn at `drawn` is from `now`: 1 within 2° / 2 %, 0 beyond 10° / 10 %.
 * Measures view-direction angle, zoom change and target shift (relative to distance); the worst wins.
 */
export function strokeOpacity(drawn: CameraPoseDto, now: CameraPoseDto): number {
  const d0 = sub(drawn.position, drawn.target), d1 = sub(now.position, now.target);
  const l0 = len(d0), l1 = len(d1);
  if (!l0 || !l1) return 0;
  const cos = Math.min(1, Math.max(-1, d0.reduce((s, n, i) => s + n * d1[i], 0) / (l0 * l1)));
  const angle = (Math.acos(cos) * 180) / Math.PI;
  const zoom = (Math.abs(l1 - l0) / l0) * 100;
  const pan = (len(sub(now.target, drawn.target)) / l0) * 100;
  const worst = Math.max(angle, zoom, pan);
  return clamp01(1 - (worst - 2) / 8);
}

export const poseKey = (p: CameraPoseDto) => [...p.position, ...p.target].map((n) => Math.round(n)).join(',');
