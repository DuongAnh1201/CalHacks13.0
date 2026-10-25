import { useEffect } from 'react';
import { history } from './history';
import { setTool, type Tool } from './tool';

export type KeyAction = { type: 'undo' } | { type: 'redo' } | { type: 'tool'; tool: Tool } | { type: 'delete' };
const LETTERS: Record<string, Tool> = { v: 'select', c: 'comment', s: 'sticky', t: 'text', p: 'pen', h: 'highlight' };

export function keyAction(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, typing: boolean): KeyAction | null {
  if (typing) return null;
  const key = e.key.toLowerCase();
  const mod = e.metaKey || e.ctrlKey;
  if (mod && key === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
  if (e.ctrlKey && key === 'y') return { type: 'redo' };
  if (mod || e.altKey) return null;
  if (e.key === 'Escape') return { type: 'tool', tool: 'select' };
  if (e.key === 'Delete' || e.key === 'Backspace') return { type: 'delete' };
  return LETTERS[key] ? { type: 'tool', tool: LETTERS[key] } : null;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export function useBoardKeys(enabled: boolean, onDelete: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      const a = keyAction(e, isTyping(e.target));
      if (!a) return;
      e.preventDefault();
      if (a.type === 'undo') void history.undo().catch((err) => console.error('[board]', err));
      else if (a.type === 'redo') void history.redo().catch((err) => console.error('[board]', err));
      else if (a.type === 'tool') setTool(a.tool);
      else onDelete();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [enabled, onDelete]);
}
