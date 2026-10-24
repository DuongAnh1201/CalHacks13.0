import css from './SharePopover.module.css';
import { setFollowing } from './store';
import type { SessionState } from './types';

export function FollowBanner({ session }: { session: SessionState }) {
  const host = session.participants.find((p) => p.role === 'host')?.displayName ?? 'the host';
  const on = session.me.following;
  return (
    <div className={css.banner} role="status">
      <span>{on ? `Following ${host}` : `Not following ${host}`}</span>
      <button type="button" className={css.btn} onClick={() => void setFollowing(!on)}>{on ? 'Stop following' : 'Follow'}</button>
    </div>
  );
}
