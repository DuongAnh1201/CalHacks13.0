import { useEffect, useState } from 'react';
import { NavLink, useLocation, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import brandMark from '../assets/figma/664bf.svg';
import { NOT_CONFIGURED, OPEN_A_SCAN } from '../share/copy';
import { FollowBanner } from '../share/FollowBanner';
import { FacePile } from '../share/FacePile';
import { SharePopover } from '../share/SharePopover';
import { resume, shareConfigured, startShare, useShare } from '../share/store';
import css from './TopNavBar.module.css';

export function TopNavBar() {
  const { id } = useParams();
  const { pathname } = useLocation();
  // zustand's server snapshot is getInitialState(), so renderToStaticMarkup never sees setState. Subscribe with the hook, read getState().
  useShare(useShallow((s) => ({ stored: s.stored, session: s.session, notice: s.notice })));
  const { stored, session, notice } = useShare.getState();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { resume(); }, []);

  const why = !shareConfigured() ? NOT_CONFIGURED : !id ? OPEN_A_SCAN : null;
  const guest = stored?.role === 'viewer';
  const onShare = async () => {
    if (stored?.role === 'host') { setOpen((o) => !o); return; }
    setBusy(true);
    const e = await startShare(id!); // `why` disables the button when there is no id
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
      {session?.status === 'active' && /^\/jobs\/[^/]+\/(mri|3d)$/.test(pathname) && <FacePile session={session} />}
      {guest && session && <FollowBanner session={session} />}
      {id && !guest && (
        <div className={css.shareWrap}>
          <button className={css.share} type="button" disabled={!!why || busy} title={why ?? undefined} aria-expanded={open} onClick={() => void onShare()}>{busy ? 'Starting…' : 'Share'}</button>
          {error && <p className={css.error} role="alert">{error}</p>}
          {open && session && stored?.role === 'host' && <SharePopover session={session} inviteCode={stored.inviteCode} />}
        </div>
      )}
    </header>
  );
}
