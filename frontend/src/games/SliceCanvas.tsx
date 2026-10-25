import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import css from './SliceCanvas.module.css';
import { paintDisc, windowOf, type Mask, type Plane } from './slices';

export interface Overlay { mask: Mask; color: [number, number, number]; style: 'fill' | 'outline' }

interface Props {
  plane: Plane;
  overlays?: Overlay[];
  /** Paint mode: the caller owns the mask; every stroke calls onPaint with it. */
  paint?: { mask: Mask; brush: number; erase: boolean; onPaint: (m: Mask) => void };
  label?: string;
  children?: ReactNode;
}

const edge = (m: Mask, w: number, h: number, n: number) => {
  const x = n % w, y = (n - x) / w;
  return (x === 0 || !m[n - 1]) || (x === w - 1 || !m[n + 1]) || (y === 0 || !m[n - w]) || (y === h - 1 || !m[n + w]);
};

/** One MRI plane on a canvas at voxel resolution, scaled up by CSS, with mask overlays and an optional brush. */
export function SliceCanvas({ plane, overlays = [], paint, label, children }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [, redraw] = useState(0);
  const last = useRef<readonly [number, number] | null>(null); // previous brush point while a stroke is down
  const [lo, hi] = useMemo(() => windowOf(plane), [plane]);

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const { w, h, data } = plane;
    const img = ctx.createImageData(w, h);
    for (let n = 0; n < w * h; n++) {
      const g = Math.max(0, Math.min(255, ((data[n] - lo) / (hi - lo)) * 255));
      img.data.set([g, g, g, 255], n * 4);
    }
    const layers: Overlay[] = paint ? [...overlays, { mask: paint.mask, color: [242, 153, 74], style: 'fill' }] : overlays;
    for (const o of layers) {
      for (let n = 0; n < w * h; n++) {
        if (!o.mask[n]) continue;
        const a = o.style === 'fill' ? 0.45 : edge(o.mask, w, h, n) ? 1 : 0;
        if (!a) continue;
        for (let c = 0; c < 3; c++) img.data[n * 4 + c] = img.data[n * 4 + c] * (1 - a) + o.color[c] * a;
      }
    }
    ctx.putImageData(img, 0, 0);
  });

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * plane.w, ((e.clientY - r.top) / r.height) * plane.h] as const;
  };
  // Pointer events arrive sparsely on a fast stroke: stamp discs along the segment from the last point.
  const stroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!paint) return;
    const p = at(e);
    const from = last.current ?? p;
    const steps = Math.max(1, Math.ceil(Math.hypot(p[0] - from[0], p[1] - from[1]) / Math.max(1, paint.brush / 2)));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      paintDisc(paint.mask, plane.w, plane.h, from[0] + (p[0] - from[0]) * t, from[1] + (p[1] - from[1]) * t, paint.brush, paint.erase ? 0 : 1);
    }
    last.current = p;
    paint.onPaint(paint.mask);
    redraw((n) => n + 1);
  };

  return (
    <figure className={css.frame}>
      <canvas
        ref={ref} width={plane.w} height={plane.h} className={paint ? `${css.canvas} ${css.paint}` : css.canvas}
        onPointerDown={paint ? (e) => { last.current = null; e.currentTarget.setPointerCapture(e.pointerId); stroke(e); } : undefined}
        onPointerMove={paint ? (e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) stroke(e); } : undefined}
        onPointerUp={paint ? () => { last.current = null; } : undefined}
      />
      {label && <figcaption className={css.label}>{label}</figcaption>}
      {children}
    </figure>
  );
}
