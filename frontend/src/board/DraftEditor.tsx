import { useState } from 'react';
import type { Placeable } from './tool';
import css from './BoardMarkers.module.css';

export function DraftEditor({ tool, onSave, onCancel }: { tool: Placeable; onSave(text: string): Promise<void>; onCancel(): void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => { if (!text.trim()) return; setBusy(true); try { await onSave(text); } finally { setBusy(false); } };
  return (
    <form className={css.draft} data-tool={tool} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <textarea autoFocus maxLength={280} value={text} placeholder={tool === 'comment' ? 'Add a comment' : tool === 'sticky' ? 'Sticky note' : 'Text'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (tool !== 'sticky' || e.metaKey || e.ctrlKey) && !e.shiftKey) { e.preventDefault(); void submit(); }
        }} />
      <button type="submit" disabled={busy || !text.trim()}>{tool === 'comment' ? 'Post' : 'Add'}</button>
    </form>
  );
}
