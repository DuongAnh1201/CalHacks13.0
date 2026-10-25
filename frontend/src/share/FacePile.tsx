import { colorOf } from './cursorSync';
import css from './SharePopover.module.css';
import { useShare } from './store';
import type { SessionState } from './types';

const MAX_FACES = 4;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

/** Online participants only (presence), not the durable roster. */
export function FacePile({ session }: { session: SessionState }) {
  const online = useShare((s) => s.online);
  const here = session.participants.filter((p) => online.has(p.participantId));
  if (here.length === 0) return null;
  return (
    <ul className={css.pile} aria-label={`${here.length} online`}>
      {here.slice(0, MAX_FACES).map((p) => (
        <li key={p.participantId} className={css.face} title={p.displayName} style={{ background: colorOf(p.participantId) }}>{initials(p.displayName)}</li>
      ))}
      {here.length > MAX_FACES && <li className={css.face}>+{here.length - MAX_FACES}</li>}
    </ul>
  );
}
