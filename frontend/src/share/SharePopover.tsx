import { useState } from 'react';
import css from './SharePopover.module.css';
import { endShare, useShare } from './store';
import type { SessionState } from './types';

export function SharePopover({ session, inviteCode }: { session: SessionState; inviteCode: string }) {
  const syncNote = useShare((s) => s.syncNote);
  const [copied, setCopied] = useState(false);
  const link = `${globalThis.location?.origin ?? ''}/join/${inviteCode}`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); } catch { setCopied(false); } // blocked clipboard: the field stays selectable
  };
  return (
    <section className={css.pop} aria-label="Share session">
      <label className={css.label}>Invite link
        <input className={css.link} readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
      </label>
      <button type="button" className={css.btn} onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</button>
      <p className={css.code}>Code <span className={css.mono}>{inviteCode}</span></p>
      <h3 className={css.h}>In this session</h3>
      <ul className={css.roster}>
        {session.participants.map((p) => (
          <li key={p.participantId}>{p.displayName}{p.role === 'host' ? ' (host)' : p.following ? ' · following' : ''}</li>
        ))}
      </ul>
      {syncNote && <p className={css.note} role="status">{syncNote}</p>}
      <button type="button" className={css.end} onClick={() => void endShare()}>End session</button>
    </section>
  );
}
