import { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import brandMark from '../assets/figma/664bf.svg';
import { NOT_CONFIGURED, SAMPLE_ONLY } from '../share/copy';
import { FollowBanner } from '../share/FollowBanner';
import { SharePopover } from '../share/SharePopover';
import { resume, shareConfigured, startShare, useShare } from '../share/store';
import css from './TopNavBar.module.css';

export function TopNavBar() {
  const { id, wsId } = useParams();
  // zustand's server snapshot is getInitialState(), so renderToStaticMarkup never sees setState. Subscribe with the hook, read getState().
  useShare(useShallow((s) => ({ stored: s.stored, session: s.session, notice: s.notice })));
  const { stored, session, notice } = useShare.getState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { resume(); }, []);

  const why = !shareConfigured() ? NOT_CONFIGURED : id !== 'sample' ? SAMPLE_ONLY : null;
  const guest = stored?.role === 'viewer';
  const onShare = async () => {
    if (stored?.role === 'host') { setOpen((o) => !o); return; }
    setBusy(true);
    const e = await startShare();
    setBusy(false);
    setError(e);
    setOpen(!e);
  };

  return (
    <header className={css.bar}>
      <NavLink to="/" className={css.brand}>
        <img src={brandMark} alt="" width={19} height={20} />
        NeuroVision
      </NavLink>
      {notice && <p className={css.notice} role="status">{notice}</p>}
      {guest && session && <FollowBanner session={session} />}
      {(id || wsId) && !guest && (
        <div className={css.shareWrap}>
          <button className={css.share} type="button" disabled={!!why || busy} title={why ?? undefined} aria-expanded={open} onClick={() => void onShare()}>{busy ? 'Starting…' : 'Share'}</button>
          {error && <p className={css.error} role="alert">{error}</p>}
          {open && session && stored?.role === 'host' && <SharePopover session={session} inviteCode={stored.inviteCode} />}
        </div>
      )}
    </header>
  );
}
