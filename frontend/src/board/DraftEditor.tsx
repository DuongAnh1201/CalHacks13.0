import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Placeable } from './tool';
import css from './BoardMarkers.module.css';

export function DraftEditor({ tool, onSave, onCancel }: { tool: Placeable; onSave(text: string): Promise<void>; onCancel(): void }) {
  const [mobile, setMobile] = useState(() => globalThis.matchMedia?.('(max-width: 760px)').matches ?? false);
  const sheet = useRef<HTMLFormElement>(null);
  const opener = useRef(document.activeElement);
  useEffect(() => {
    const query = globalThis.matchMedia?.('(max-width: 760px)');
    if (!query) return;
    const update = (e: MediaQueryListEvent) => setMobile(e.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!mobile) return;
    const previous = opener.current;
    sheet.current?.querySelector('textarea')?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, [mobile]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => { if (!text.trim()) return; setBusy(true); try { await onSave(text); } finally { setBusy(false); } };
  const content = (
    <form ref={sheet} className={css.draft} data-tool={tool} role={mobile ? 'dialog' : undefined} aria-label={mobile ? 'Add a board note' : undefined}
      onPointerDown={(e) => e.stopPropagation()} onPointerMove={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onCancel(); } }}
      onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {mobile && <button type="button" className={css.sheetClose} onClick={onCancel}>Cancel</button>}
      <textarea autoFocus maxLength={280} value={text} placeholder={tool === 'comment' ? 'Add a comment' : tool === 'sticky' ? 'Sticky note' : 'Text'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.stopPropagation(); onCancel(); }
          if (e.key === 'Enter' && (tool !== 'sticky' || e.metaKey || e.ctrlKey) && !e.shiftKey) { e.preventDefault(); void submit(); }
        }} />
      <button type="submit" disabled={busy || !text.trim()}>{tool === 'comment' ? 'Post' : 'Add'}</button>
    </form>
  );
  return mobile ? createPortal(content, document.body) : content;
}
