import type { ReactNode } from 'react';
import { messageFor } from '../share/copy';
import { history, toast } from './history';
import { CommentIcon, HighlightIcon, PenIcon, RedoIcon, SelectIcon, StickyIcon, TextIcon, UndoIcon } from './icons';
import { setTool, useBoardTool, type Tool } from './tool';
import css from './Toolbar.module.css';

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Select (V)', icon: <SelectIcon /> },
  { id: 'comment', label: 'Comment (C)', icon: <CommentIcon /> },
  { id: 'sticky', label: 'Sticky note (S)', icon: <StickyIcon /> },
  { id: 'text', label: 'Text (T)', icon: <TextIcon /> },
  { id: 'pen', label: 'Pen (P)', icon: <PenIcon /> },
  { id: 'highlight', label: 'Highlighter (H)', icon: <HighlightIcon /> },
];

export function Toolbar({ disabled }: { disabled: boolean }) {
  const tool = useBoardTool((s) => s.tool);
  return (
    <div className={css.bar} role="toolbar" aria-label="Board tools" aria-orientation="vertical" title={disabled ? 'Share to use the board' : undefined}>
      {TOOLS.map((t) => (
        <button key={t.id} type="button" className={css.btn} aria-label={t.label} title={t.label} aria-pressed={tool === t.id}
          disabled={disabled} onClick={() => setTool(t.id)}>{t.icon}</button>
      ))}
      <hr className={css.sep} />
      <button type="button" className={css.btn} aria-label="Undo (⌘Z)" title="Undo (⌘Z)" disabled={disabled} onClick={() => void history.undo().catch((e) => toast(messageFor(e)))}><UndoIcon /></button>
      <button type="button" className={css.btn} aria-label="Redo (⇧⌘Z)" title="Redo (⇧⌘Z)" disabled={disabled} onClick={() => void history.redo().catch((e) => toast(messageFor(e)))}><RedoIcon /></button>
    </div>
  );
}
