import { useState } from 'react';
import QRCode from 'react-qr-code';
import css from './SharePopover.module.css';
import { endShare, useShare } from './store';
import type { SessionState } from './types';

export function SharePopover({ session, inviteCode }: { session: SessionState; inviteCode: string }) {
  const syncNote = useShare((s) => s.syncNote);
  const online = useShare((s) => s.online);
  const [copied, setCopied] = useState(false);
  const link = `${globalThis.location?.origin ?? ''}/join/${inviteCode}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } // blocked clipboard: the field stays selectable
  };
  return (
    <section className={css.pop} aria-label="Share session">
      {/* Scanning only works when this page is served on an address the phone can reach, not localhost. */}
      <div className={css.qr}><QRCode value={link} size={132} aria-label="Invite QR code" /></div>
      <label className={css.label}>Invite link
        <input className={css.link} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <button type="button" className={css.btn} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</button>
      <p className={css.code}>Code <span className={css.mono}>{inviteCode}</span></p>
      <h3 className={css.h}>In this session</h3>
      <ul className={css.roster}>
        {session.participants.map((p) => {
          const on = online.has(p.participantId);
          return (
            <li key={p.participantId}>
              <span className={on ? css.on : css.off} title={on ? 'Online' : 'Offline'} aria-label={on ? 'Online' : 'Offline'} />
              {p.displayName}{p.role === 'host' ? ' (host)' : p.following ? ' · following' : ''}
            </li>
          );
        })}
      </ul>
      {syncNote && <p className={css.note} role="status">{syncNote}</p>}
      <button type="button" className={css.end} onClick={() => void endShare()}>End session</button>
    </section>
  );
}
