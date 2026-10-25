import { useLocation } from 'react-router-dom';
import { useCall } from '../call/store';
import { colorOf } from './cursorSync';
import css from './SharePopover.module.css';
import { useShare } from './store';
import type { SessionState } from './types';

const MAX_FACES = 4;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

/** Online participants only (presence), not the durable roster. */
export function FacePile({ session }: { session: SessionState }) {
  const online = useShare((s) => s.online);
  const speaking = useCall((s) => s.speaking);
  const { pathname } = useLocation();
  if (!/^\/jobs\/[^/]+\/(mri|3d)$/.test(pathname)) return null;
  const here = session.participants.filter((p) => online.has(p.participantId));
  if (here.length === 0) return null;
  return (
    <ul className={css.pile} aria-label={`${here.length} online`}>
      {here.slice(0, MAX_FACES).map((p) => (
        <li key={p.participantId} className={speaking.has(p.participantId) ? `${css.face} ${css.speaking}` : css.face}
          title={speaking.has(p.participantId) ? `${p.displayName} · speaking` : p.displayName}
          style={{ background: colorOf(p.participantId), outlineColor: colorOf(p.participantId) }}>{initials(p.displayName)}</li>
      ))}
      {here.length > MAX_FACES && <li className={css.face}>+{here.length - MAX_FACES}</li>}
    </ul>
  );
}
