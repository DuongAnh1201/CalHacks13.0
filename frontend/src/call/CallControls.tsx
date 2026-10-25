import { useLocation } from 'react-router-dom';
import { useShare } from '../share/store';
import css from './CallControls.module.css';
import { join, leave, toggleMute, useCall } from './store';

/** Join / Mute / Leave for the session's voice call, next to the face pile. */
export function CallControls() {
  const { pathname } = useLocation();
  const active = useShare((s) => s.session?.status === 'active');
  const status = useCall((s) => s.status);
  const muted = useCall((s) => s.muted);
  const error = useCall((s) => s.error);
  if (!active || !/^\/jobs\/[^/]+\/(mri|3d)$/.test(pathname)) return null;
  return (
    <div className={css.call} role="group" aria-label="Voice call">
      {status === 'live' ? (
        <>
          <button type="button" className={css.btn} aria-pressed={muted} onClick={() => void toggleMute()}>{muted ? 'Unmute' : 'Mute'}</button>
          <button type="button" className={`${css.btn} ${css.leave}`} onClick={() => void leave()}>Leave</button>
        </>
      ) : (
        <button type="button" className={css.btn} disabled={status === 'connecting'} onClick={() => void join()}>
          {status === 'connecting' ? 'Joining…' : 'Join call'}
        </button>
      )}
      {error && <p className={css.error} role="alert">{error}</p>}
    </div>
  );
}
