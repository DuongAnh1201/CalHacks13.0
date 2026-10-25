import { useState } from 'react';
import { ChatIcon } from '../components/workspace/icons';
import css from './ChatDock.module.css';
import { SessionChat } from './SessionChat';
import { useShare } from './store';

const KEY = 'nv.chatOpen';
const load = () => { try { return localStorage.getItem(KEY) !== '0'; } catch { return true; } };
const save = (open: boolean) => { try { localStorage.setItem(KEY, open ? '1' : '0'); } catch { /* private window: per-page only */ } };

/** Session chat pinned bottom right; minimizes to a pill. Nothing outside a live session. */
export function ChatDock() {
  const live = useShare((s) => s.session?.status === 'active');
  const online = useShare((s) => s.online.size);
  const [open, setOpen] = useState(load);
  if (!live) return null;
  const toggle = (o: boolean) => { setOpen(o); save(o); };
  return open
    ? <div className={css.dock}><SessionChat onMinimize={() => toggle(false)} /></div>
    : <button type="button" className={css.pill} onClick={() => toggle(true)}><ChatIcon />Chat<span className={css.count}>{online} online</span></button>;
}
