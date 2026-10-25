import { useEffect, useRef, useState } from 'react';
import { ChatIcon } from '../components/workspace/icons';
import css from './ChatDock.module.css';
import { SessionChat } from './SessionChat';
import { messagesAfter, useShare, watchChat } from './store';

const KEY = 'nv.chatOpen';
const load = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
const save = (open: boolean) => { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* private window: per-page only */ } };

/** Session chat pinned bottom right; minimizes to a pill. Nothing outside a live session. */
export function ChatDock() {
  const live = useShare((s) => s.session?.status === 'active');
  const online = useShare((s) => s.online.size);
  const [open, setOpen] = useState(load);
  const [unread, setUnread] = useState(0);
  const [draft, setDraft] = useState('');
  const seen = useRef<{ messageId: string; createdAt: number } | null>(null);
  const pill = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!live || open) return;
    return watchChat((ms) => {
      const last = ms.at(-1);
      if (!seen.current) {
        if (last) seen.current = { messageId: last.messageId, createdAt: last.createdAt };
        setUnread(0);
        return;
      }
      setUnread(messagesAfter(ms, seen.current).length);
    });
  }, [live, open]);

  useEffect(() => {
    if (open || !returnFocus.current) return;
    returnFocus.current = false;
    pill.current?.focus();
  }, [open]);

  if (!live) return null;
  const toggle = (o: boolean) => { setOpen(o); save(o); if (o) setUnread(0); };
  const minimize = () => { returnFocus.current = true; toggle(false); };
  return open
    ? <div className={css.dock}><SessionChat draft={draft} onDraft={setDraft} onMinimize={minimize} onSeen={(c) => { seen.current = c; }} /></div>
    : (
      <button type="button" ref={pill} className={css.pill} onClick={() => toggle(true)}>
        <ChatIcon />Chat
        <span className={css.count}>{unread > 0 ? `${unread} new` : `${online} online`}</span>
      </button>
    );
}
