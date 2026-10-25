import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { messageFor } from '../share/copy';
import type { BoardRow, CameraPoseDto } from '../share/types';
import { createItem } from './commands';
import { history, toast } from './history';
import { normalise, poseKey, simplify, strokeOpacity } from './stroke';
import { requestPose, selectItem, useBoardTool } from './tool';
import css from './StrokeLayer.module.css';

const asPoints = (flat: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < flat.length; i += 2) out.push(`${flat[i]},${flat[i + 1]}`);
  return out.join(' ');
};

export function StrokeLayer({ rows }: { rows: BoardRow[] }) {
  const tool = useBoardTool((s) => s.tool);
  const pose = useBoardTool((s) => s.pose);
  const selected = useBoardTool((s) => s.selected);
  const drawing = tool === 'pen' || tool === 'highlight';
  const svg = useRef<SVGSVGElement>(null);
  const raw = useRef<{ x: number; y: number }[]>([]);
  const active = useRef(false);
  const [live, setLive] = useState<number[] | null>(null);

  const inking = live !== null;
  useEffect(() => {
    if (!inking) return;
    const onKey = (e: KeyboardEvent) => {
      const undo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
      if (e.key !== 'Escape' && !undo) return;
      e.preventDefault();
      e.stopPropagation();
      raw.current = [];
      active.current = false;
      setLive(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [inking]);

  const paint = () => {
    const rect = svg.current?.getBoundingClientRect();
    if (!rect) return;
    setLive(normalise(raw.current, rect));
  };
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drawing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    raw.current = [{ x: e.clientX, y: e.clientY }];
    active.current = true;
    paint();
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!active.current) return;
    raw.current.push({ x: e.clientX, y: e.clientY });
    paint();
  };
  const onUp = () => {
    if (!active.current) return;
    const rect = svg.current?.getBoundingClientRect();
    const points = rect ? simplify(normalise(raw.current, rect)) : [];
    raw.current = [];
    active.current = false;
    setLive(null);
    if (points.length < 4 || !pose) return;
    const highlight = tool === 'highlight';
    void history.run(createItem({
      kind: 'stroke', camera: pose, points,
      color: highlight ? '#ffd400' : '#e5484d', width: highlight ? 16 : 3, mode: highlight ? 'highlight' : 'pen',
    })).catch((err) => toast(messageFor(err)));
  };

  const hidden = new Map<string, { n: number; camera: CameraPoseDto }>();
  const strokes = rows.flatMap((row) => {
    if (row.item.kind !== 'stroke') return [];
    const fade = pose ? strokeOpacity(row.item.camera, pose) : 1;
    if (fade === 0 && pose) {
      const key = poseKey(row.item.camera);
      const g = hidden.get(key) ?? { n: 0, camera: row.item.camera };
      g.n += 1;
      hidden.set(key, g);
      return [];
    }
    const opacity = fade * (row.item.mode === 'highlight' ? 0.35 : 1);
    return [{ row, opacity, points: asPoints(row.item.points) }];
  });

  return (
    <div className={css.layer} data-draw={drawing || undefined} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      <svg ref={svg} viewBox="0 0 1 1" preserveAspectRatio="none">
        {strokes.map(({ row, opacity, points }) => {
          const item = row.item;
          if (item.kind !== 'stroke') return null;
          const on = tool === 'select';
          return (
            <g key={row.itemId}>
              {on && (
                <polyline points={points} fill="none" stroke="transparent" strokeWidth={12} vectorEffect="non-scaling-stroke"
                  strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: 'stroke' }}
                  onClick={(e) => { e.stopPropagation(); selectItem(row.itemId); }} />
              )}
              <polyline points={points} fill="none" stroke={item.color} strokeWidth={item.width} vectorEffect="non-scaling-stroke"
                strokeLinecap="round" strokeLinejoin="round" opacity={opacity}
                strokeDasharray={selected === row.itemId ? '6 4' : undefined}
                style={{ pointerEvents: on ? 'stroke' : 'none', mixBlendMode: item.mode === 'highlight' ? 'multiply' : undefined }} />
            </g>
          );
        })}
        {live && live.length >= 2 && (
          <polyline points={asPoints(live)} fill="none" stroke={tool === 'highlight' ? '#ffd400' : '#e5484d'}
            strokeWidth={tool === 'highlight' ? 16 : 3} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"
            opacity={tool === 'highlight' ? 0.35 : 1} style={{ mixBlendMode: tool === 'highlight' ? 'multiply' : undefined, pointerEvents: 'none' }} />
        )}
      </svg>
      {hidden.size > 0 && (
        <div className={css.chips}>
          {[...hidden.entries()].map(([key, g]) => (
            <button key={key} type="button" className={css.chip} onClick={() => requestPose(g.camera)}>
              ✎ {g.n} {g.n === 1 ? 'sketch' : 'sketches'} · view
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
