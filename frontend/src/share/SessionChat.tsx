import { useEffect, useRef, useState } from 'react';
import { MinimizeIcon } from '../components/workspace/icons';
import css from './SessionChat.module.css';
import { sendChat, useShare, watchChat } from './store';
import type { ChatMessage } from './types';

const MAX = 2000; // convex/messages.ts MAX_MESSAGE_LENGTH

const time = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Live chat for the shared review session (Convex messages.*). Renders nothing outside a session. */
export function SessionChat({ onMinimize }: { onMinimize?: () => void } = {}) {
  const sessionId = useShare((s) => (s.session?.status === 'active' ? s.session.sessionId : null));
  const online = useShare((s) => s.online.size);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const log = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    const stop = watchChat(setMessages);
    return () => { stop(); setMessages([]); };
  }, [sessionId]);

  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight }); }, [messages]);

  if (!sessionId) return null;

  const submit = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    const err = await sendChat(text);
    setSending(false);
    setError(err);
    if (!err) setDraft(''); // the new line arrives through the subscription, not from here
  };

  return (
    <section className={css.panel} aria-label="Session chat">
      <header className={css.head}>
        <h2 className={css.title}>Session chat</h2>
        <span className={css.online}><span className={css.dot} />{online} online</span>
        {onMinimize && <button type="button" className={css.min} aria-label="Minimize chat" onClick={onMinimize}><MinimizeIcon /></button>}
      </header>
      <ol className={css.log} ref={log} aria-live="polite">
        {messages.length === 0 && <li className={css.empty}>No messages yet. Say hello to the room.</li>}
        {messages.map((m) => (
          <li key={m.messageId} className={m.author === 'agent' ? css.agent : css.msg}>
            <p className={css.meta}><b>{m.authorName}</b> · {time(m.createdAt)}</p>
            <p className={css.text}>{m.text}</p>
          </li>
        ))}
      </ol>
      {error && <p className={css.error} role="alert">{error}</p>}
      <form className={css.input} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <input className={css.field} aria-label="Message the room" placeholder="Message the room" maxLength={MAX}
          value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button type="submit" className={css.send} disabled={!draft.trim() || sending}>Send</button>
      </form>
    </section>
  );
}
