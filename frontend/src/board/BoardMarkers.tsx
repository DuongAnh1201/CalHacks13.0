import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import * as THREE from 'three';
import type { Report } from '../api/types';
import { messageFor } from '../share/copy';
import { cursorOf } from '../share/cursorSync';
import { anchorMm, scanMmToRas } from '../share/notes';
import type { BoardRow, Note, StickyColor } from '../share/types';
import type { CaseScene } from '../viewer/loadCase';
import { worldOf } from '../viewer/pins';
import type { Vec3 } from '../viewer/transform';
import { createComment, createItem, updateItem } from './commands';
import { DraftEditor } from './DraftEditor';
import { history, toast } from './history';
import { Thread } from './Thread';
import { selectItem, setBoardDraft, useBoardTool, type Tool } from './tool';
import css from './BoardMarkers.module.css';

const COLORS: StickyColor[] = ['yellow', 'pink', 'blue', 'green'];
const SLOP = 4;

const run = (c: Parameters<typeof history.run>[0]) => { void history.run(c).catch((e) => toast(messageFor(e))); };
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';

function Anchored({ cs, mm, children }: { cs: CaseScene; mm: Vec3; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => { if (ref.current) worldOf(cs, mm, ref.current.position); });
  return (
    <group ref={ref}>
      <Html center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>{children}</Html>
    </group>
  );
}

function Item({ cs, report, row, selected, tool }: { cs: CaseScene; report: Report; row: BoardRow; selected: boolean; tool: Tool }) {
  const item = row.item;
  const mm = item.kind === 'stroke' ? null : anchorMm(item.anchor, report);
  const [draftText, setDraftText] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [floatAt, setFloatAt] = useState<{ x: number; y: number } | null>(null);
  const origin = useRef({ x: 0, y: 0, moved: false });
  const skipSave = useRef(false);
  const suppressClick = useRef(false);
  const { camera, raycaster, gl } = useThree();
  const ctx = useRef({ row, report, cs });

  useEffect(() => {
    ctx.current = { row, report, cs };
    if (!armed) return;
    const move = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) <= SLOP) return;
      origin.current.moved = true;
      setFloatAt({ x: e.clientX, y: e.clientY });
    };
    const up = (e: PointerEvent) => {
      const moved = origin.current.moved;
      setArmed(false);
      setFloatAt(null);
      if (!moved) return;
      suppressClick.current = true;
      const { row: current, report: rep, cs: scene } = ctx.current;
      if (current.item.kind === 'stroke') return;
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      scene.world.updateMatrixWorld(true);
      const hit = raycaster.intersectObject(scene.world, true)[0];
      const local = hit && cursorOf(hit.object, hit.point)?.localMm;
      if (!local) return;
      run(updateItem(current, { anchor: { kind: 'point', ras_mm: scanMmToRas(local, rep) } }));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [armed, camera, raycaster, gl, row, report, cs]);

  if (!mm || item.kind === 'stroke') return null;
  const text = draftText ?? item.text;
  const editing = draftText !== null;
  const save = () => {
    const next = text.trim();
    setDraftText(null);
    if (!next || next === item.text) return;
    run(updateItem(row, { text: next }));
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (tool !== 'select' || editing || (e.target as HTMLElement).closest('[data-nodrag]')) return;
    origin.current = { x: e.clientX, y: e.clientY, moved: false };
    setArmed(true);
  };

  const body = editing ? (
    <textarea data-nodrag autoFocus maxLength={280} className={css.edit} value={text} aria-label="Edit text"
      onChange={(e) => setDraftText(e.target.value)}
      onBlur={() => { if (skipSave.current) { skipSave.current = false; return; } save(); }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.stopPropagation(); skipSave.current = true; setDraftText(null); }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); skipSave.current = true; save(); }
      }} />
  ) : <p>{item.text}</p>;

  return (
    <Anchored cs={cs} mm={mm}>
      <div
        className={item.kind === 'sticky' ? css.sticky : css.label}
        data-color={item.kind === 'sticky' ? item.color : undefined}
        data-selected={selected || undefined}
        style={floatAt ? { position: 'fixed', left: floatAt.x, top: floatAt.y, pointerEvents: 'none', zIndex: 40 } : undefined}
        onPointerDown={onPointerDown}
        onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } selectItem(row.itemId); }}
        onDoubleClick={() => { if (tool === 'select') setDraftText(item.text); }}
      >
        {body}
        {item.kind === 'sticky' && selected && !editing && (
          <div className={css.dots}>
            {COLORS.map((c) => (
              <button key={c} type="button" data-nodrag data-color={c} className={css.dot} aria-label={c} aria-pressed={item.color === c}
                onClick={(e) => { e.stopPropagation(); run(updateItem(row, { color: c })); }} />
            ))}
          </div>
        )}
      </div>
    </Anchored>
  );
}

/** Stickies, text labels and comment threads, anchored to the brain. Strokes live in StrokeLayer. */
export function BoardMarkers({ cs, report, notes, rows = [] }: { cs: CaseScene; report: Report; notes: Note[]; rows?: BoardRow[] }) {
  const draft = useBoardTool((s) => s.draft);
  const selected = useBoardTool((s) => s.selected);
  const tool = useBoardTool((s) => s.tool);
  return (
    <>
      {notes.map((n) => {
        if (n.resolvedAt && selected !== n.annotationId) return null;
        const mm = anchorMm(n.anchor, report);
        if (!mm) return null;
        return (
          <Anchored key={n.annotationId} cs={cs} mm={mm}>
            <div className={css.commentWrap}>
              <button type="button" className={css.bubble} aria-label={`Comment by ${n.authorName}`}
                onClick={() => selectItem(selected === n.annotationId ? null : n.annotationId)}>{initials(n.authorName)}</button>
              {selected === n.annotationId && <Thread note={n} />}
            </div>
          </Anchored>
        );
      })}
      {rows.map((row) => row.item.kind === 'stroke' ? null : (
        <Item key={row.itemId} cs={cs} report={report} row={row} selected={selected === row.itemId} tool={tool} />
      ))}
      {draft && (
        <Anchored cs={cs} mm={draft.mm}>
          <DraftEditor tool={draft.tool} onCancel={() => setBoardDraft(null)} onSave={async (text) => {
            const anchor = { kind: 'point' as const, ras_mm: scanMmToRas(draft.mm, report) };
            try {
              await history.run(draft.tool === 'comment' ? createComment(text, anchor)
                : createItem(draft.tool === 'sticky' ? { kind: 'sticky', anchor, text, color: 'yellow' } : { kind: 'text', anchor, text }));
              setBoardDraft(null);
            } catch (e) { toast(messageFor(e)); }
          }} />
        </Anchored>
      )}
    </>
  );
}
