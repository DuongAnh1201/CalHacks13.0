import { useState } from 'react';
import QRCode from 'react-qr-code';
import css from './SharePopover.module.css';
import { endShare, setDisplayName, setReportEmail, useShare, validEmail } from './store';
import type { SessionState } from './types';

export function SharePopover({ session, inviteCode }: { session: SessionState; inviteCode: string }) {
  const syncNote = useShare((s) => s.syncNote);
  const online = useShare((s) => s.online);
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [mailNote, setMailNote] = useState<string | null>(null);
  const [name, setName] = useState(session.me.displayName);
  const [nameNote, setNameNote] = useState<string | null>(null);
  const saveEmail = async () => setMailNote((await setReportEmail(email.trim())) ?? `The report will be emailed to ${email.trim()} when the session ends.`);
  const saveName = async () => {
    const next = name.trim().slice(0, 64);
    const err = await setDisplayName(next);
    if (!err) setName(next);
    setNameNote(err ?? 'Saved.');
  };
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
      <label className={css.label}>Email me the report
        <input className={css.link} type="email" value={email} maxLength={254} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button type="button" className={css.btn} disabled={!validEmail(email)} onClick={() => void saveEmail()}>Save</button>
      {mailNote && <p className={css.note} role="status">{mailNote}</p>}
      <label className={css.label}>Your name
        <input className={css.link} value={name} maxLength={64} autoComplete="nickname" aria-label="Your name" onChange={(e) => setName(e.target.value)} />
      </label>
      <button type="button" className={css.btn} disabled={!name.trim()} onClick={() => void saveName()}>Save name</button>
      <p className={css.note}>Earlier messages keep the name they were sent with.</p>
      {nameNote && <p className={css.note} role="status">{nameNote}</p>}
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
