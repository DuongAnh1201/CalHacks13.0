import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import css from './JoinInvite.module.css';
import { inviteTarget } from './invite';

/** "Join a session": paste an invite link or code, then open the real join page for it. */
export function JoinInvite({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); };
  }, [open, onOpenChange]);

  const go = (kind: 'session' | 'playground') => (e?: FormEvent) => {
    e?.preventDefault();
    const to = inviteTarget(text, kind);
    if (to) navigate(to);
    else setError('That is not an invite link or code.');
  };

  return (
    <div className={css.wrap} ref={box}>
      <button type="button" className={css.trigger} aria-expanded={open} aria-controls="join-invite" onClick={() => onOpenChange(!open)}>Join a session</button>
      {open && (
        <form id="join-invite" className={css.panel} onSubmit={go('session')}>
          <button type="button" className={css.close} onClick={() => onOpenChange(false)}>Close</button>
          <label className={css.label} htmlFor="join-invite-code">Paste an invite link or code</label>
          <input id="join-invite-code" ref={input} className={css.input} value={text} autoComplete="off" spellCheck={false}
            placeholder="lobe.app/join/… or C7RR-63PY-FT94-D6AK" onChange={(e) => { setText(e.target.value); setError(null); }} />
          {error && <p className={css.error} role="alert">{error}</p>}
          <div className={css.actions}>
            <button type="submit" className={css.primary} disabled={!text.trim()}>Join study session</button>
            <button type="button" className={css.secondary} disabled={!text.trim()} onClick={() => go('playground')()}>Join playground</button>
          </div>
          <p className={css.hint}>A full link opens the right kind of session on its own.</p>
        </form>
      )}
    </div>
  );
}
