import { useState } from 'react';
import QRCode from 'react-qr-code';
import css from './PlaygroundBar.module.css';
import { usePlay } from './store';

/** The playground's invite (link, code, QR) and who is in it. Separate from a case workspace's Share popover. */
export function PlaygroundBar() {
  const stored = usePlay((s) => s.stored);
  const session = usePlay((s) => s.session);
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  if (!stored || !session) return null;
  const link = `${globalThis.location?.origin ?? ''}/play/join/${stored.inviteCode}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } // blocked clipboard: the field stays selectable
  };
  return (
    <section className={css.bar} aria-label="Playground">
      <div className={css.invite}>
        <b>Playground</b>
        {stored.role === 'host'
          ? (
            <>
              <input className={css.link} readOnly value={link} aria-label="Playground invite link" onFocus={(e) => e.currentTarget.select()} />
              <button type="button" className={css.btn} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</button>
              <button type="button" className={css.btn} aria-expanded={qr} onClick={() => setQr((q) => !q)}>QR</button>
            </>
          )
          : <span className={css.hint}>Joined as a player. The host picks each game.</span>}
      </div>
      <ul className={css.members} aria-label="Members">
        {session.participants.map((p) => <li key={p.participantId}>{p.displayName}{p.role === 'host' ? ' · host' : ''}</li>)}
      </ul>
      {qr && stored.role === 'host' && <div className={css.qr}><QRCode value={link} size={140} aria-label="Playground invite QR code" /></div>}
    </section>
  );
}
