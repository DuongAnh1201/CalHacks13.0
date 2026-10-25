import { useEffect, useRef, useState } from 'react';
import { MinimizeIcon } from '../components/workspace/icons';
import css from './SessionChat.module.css';
import { messagesAfter, sendChat, useShare, watchChat } from './store';
import type { ChatMessage } from './types';

const MAX = 2000; // convex/messages.ts MAX_MESSAGE_LENGTH
const NEAR = 80;
const WINDOW = 2 * 60 * 1000;

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

const AVATAR = [css.c0, css.c1, css.c2, css.c3];
function avatarHue(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % AVATAR.length;
  return AVATAR[h];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '') || '?').toUpperCase();
}

/** shortcut: other people group by the name stored on the line; split them if messages gain a participant id. */
function sameGroup(a: ChatMessage, b: ChatMessage): boolean {
  if (b.createdAt - a.createdAt > WINDOW) return false;
  if (a.author === 'agent' || b.author === 'agent') return a.author === 'agent' && b.author === 'agent';
  if (a.mine || b.mine) return a.mine === true && b.mine === true;
  return a.authorName === b.authorName;
}

/** Live chat for the shared review session (Convex messages.*). Renders nothing outside a session. */
export function SessionChat({ onMinimize, onSeen, draft, onDraft }: {
  onMinimize?: () => void;
  onSeen?: (seen: { messageId: string; createdAt: number }) => void;
  draft: string;
  onDraft: (next: string) => void;
}) {
  const sessionId = useShare((s) => (s.session?.status === 'active' ? s.session.sessionId : null));
  const online = useShare((s) => s.online.size);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [jump, setJump] = useState(0);
  const [announce, setAnnounce] = useState('');
  const log = useRef<HTMLOListElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);
  const seen = useRef(onSeen);
  useEffect(() => { seen.current = onSeen; }, [onSeen]);

  useEffect(() => {
    if (!sessionId) return;
    let seenCursor: { messageId: string; createdAt: number } | null = null;
    const stop = watchChat((ms) => {
      const el = log.current;
      const near = !el || el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
      const added = messagesAfter(ms, seenCursor);
      const last = ms.at(-1);
      if (!seenCursor) {
        stick.current = true;
        setJump(0);
      } else if (added.length) {
        const tip = added[added.length - 1];
        if (!tip.mine) setAnnounce(`${tip.author === 'agent' ? 'Assistant' : tip.authorName}: ${tip.text}`);
        if (near) { stick.current = true; setJump(0); setFreshId(tip.messageId); }
        else { stick.current = false; setJump((n) => n + added.length); }
      }
      if (last) {
        seenCursor = { messageId: last.messageId, createdAt: last.createdAt };
        seen.current?.(seenCursor);
      }
      setMessages(ms);
    });
    return () => { stop(); setMessages([]); };
  }, [sessionId]);

  useEffect(() => { if (stick.current) log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages]);
  useEffect(() => { field.current?.focus(); }, []);
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 96)}px`;
  }, [draft]);

  if (!sessionId) return null;

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const err = await sendChat(text);
    setSending(false);
    setError(err);
    if (!err) onDraft('');
  };

  const atBottom = () => {
    const el = log.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR;
    stick.current = near;
    if (near) setJump(0);
  };

  return (
    <section className={css.panel} aria-label="Session chat" onKeyDown={(e) => { if (e.key === 'Escape') onMinimize?.(); }}>
      <header className={css.head}>
        <h2 className={css.title}>Session chat</h2>
        <span className={css.online}><span className={css.dot} />{online} online</span>
        {onMinimize && <button type="button" className={css.min} aria-label="Minimize chat" onClick={onMinimize}><MinimizeIcon /></button>}
      </header>
      <div className={css.logWrap}>
        {messages.length === 0 && <p className={css.empty}>Say hello. Everyone in this session can see the chat.</p>}
        <ol className={css.log} ref={log} onScroll={atBottom}>
          {messages.map((m, i) => {
            const head = i === 0 || !sameGroup(messages[i - 1], m);
            const agent = m.author === 'agent';
            const mine = m.mine === true;
            return (
              <li key={m.messageId} className={`${css.row} ${mine ? css.mine : agent ? css.agent : css.theirs}${m.messageId === freshId ? ` ${css.fresh}` : ''}`}>
                <div className={css.stack}>
                  <div className={css.bubble}>
                    {head && <span className={`${css.avatar} ${agent ? css.ai : avatarHue(m.authorName)}`} aria-hidden="true">{agent ? 'AI' : initials(m.authorName)}</span>}
                    <div className={css.body}>
                      {head && <p className={agent ? css.who : css.sr}>{agent ? 'Assistant' : m.authorName}</p>}
                      <p className={css.text}>{m.text}</p>
                    </div>
                  </div>
                  <time className={css.time} dateTime={new Date(m.createdAt).toISOString()}>{time(m.createdAt)}</time>
                </div>
              </li>
            );
          })}
        </ol>
        {jump > 0 && (
          <button type="button" className={css.jump} onClick={() => { stick.current = true; setJump(0); log.current?.scrollTo({ top: log.current.scrollHeight }); }}>
            New messages{jump > 1 ? ` (${jump})` : ''}
          </button>
        )}
      </div>
      <p className={css.live} aria-live="polite">{announce}</p>
      {error && <p className={css.error} role="alert">{error}</p>}
      <form className={css.input} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {draft.length > 1800 && <span className={css.left}>{MAX - draft.length}</span>}
        <textarea ref={field} className={css.field} aria-label="Message the room" placeholder="Type your message..." maxLength={MAX} rows={1}
          value={draft} onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} />
        <button type="submit" className={css.send} aria-label="Send" aria-busy={sending} disabled={!draft.trim() || sending}>
          {sending ? <span aria-hidden="true">…</span> : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M22 2 11 13" /><path d="m22 2-7 20-4-9-9-4 20-7z" />
            </svg>
          )}
        </button>
      </form>
    </section>
  );
}
