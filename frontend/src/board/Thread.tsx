import { useState } from 'react';
import { messageFor } from '../share/copy';
import { sessionCall } from '../share/store';
import type { Note } from '../share/types';
import { setResolved } from './commands';
import { history } from './history';
import { selectItem } from './tool';
import css from './BoardMarkers.module.css';

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export function Thread({ note }: { note: Note }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fail = (e: unknown) => setError(messageFor(e));

  const reply = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    try { await sessionCall('annotations.reply', { annotationId: note.annotationId, text }); setText(''); }
    catch (e) { fail(e); }
    finally { setBusy(false); }
  };
  const removeReply = (replyId: string) => { setError(null); void sessionCall('annotations.removeReply', { replyId }).catch(fail); };
  const resolve = () => { setError(null); void history.run(setResolved(note.annotationId, !note.resolvedAt)).catch(fail); };
  const remove = async () => {
    setError(null);
    try { await sessionCall('annotations.remove', { annotationId: note.annotationId }); selectItem(null); }
    catch (e) { fail(e); }
  };

  return (
    <div className={css.thread} role="dialog" aria-label="Comment thread">
      <p className={css.who}><strong>{note.authorName}</strong> <time dateTime={new Date(note.createdAt).toISOString()}>{time(note.createdAt)}</time></p>
      <p className={css.body}>{note.text}</p>
      <ul className={css.replies}>
        {(note.replies ?? []).map((r) => (
          <li key={r.replyId}>
            <p className={css.who}><strong>{r.authorName}</strong> <time dateTime={new Date(r.createdAt).toISOString()}>{time(r.createdAt)}</time></p>
            <p className={css.body}>{r.text}{r.canRemove && <button type="button" className={css.x} aria-label="Remove reply" onClick={() => removeReply(r.replyId)}>×</button>}</p>
          </li>
        ))}
      </ul>
      <textarea className={css.replyBox} maxLength={1000} value={text} placeholder="Reply" aria-label="Reply"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { selectItem(null); return; }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void reply(); }
        }} />
      <div className={css.actions}>
        <button type="button" disabled={busy || !text.trim()} onClick={() => void reply()}>Reply</button>
        {note.canResolve && <button type="button" onClick={resolve}>{note.resolvedAt ? 'Reopen' : 'Resolve'}</button>}
        {note.canRemove && <button type="button" onClick={() => void remove()}>Delete</button>}
      </div>
      {error && <p className={css.err} role="alert">{error}</p>}
    </div>
  );
}
