import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { NOT_CONFIGURED, OPEN_A_SCAN } from './copy';
import { CallControls } from '../call/CallControls';
import { FacePile } from './FacePile';
import { FollowBanner } from './FollowBanner';
import { SharePopover } from './SharePopover';
import { resume, shareConfigured, startShare, switchShare, useShare } from './store';

/** Notice, face pile, follow banner and the Share button + popover. Class names come from the bar that hosts them. */
export function ShareControls({ css }: { css: { notice?: string; shareWrap?: string; share?: string; error?: string } }) {
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
    if (stored?.role === 'host' && stored.jobId !== id) { // the automatic move failed (useShareSync): retry it
      setBusy(true);
      await switchShare(id!, pathname.endsWith('/3d') ? '3d' : 'mri');
      setBusy(false);
      setOpen(true); // shows the outcome in the popover's sync note
      return;
    }
    if (stored?.role === 'host') { setOpen((o) => !o); return; }
    setBusy(true);
    const e = await startShare(id!); // `why` disables the button when there is no id
    setBusy(false);
    setError(e);
    setOpen(!e);
  };

  return (
    <>
      {notice && <p className={css.notice} role="status">{notice}</p>}
      {session?.status === 'active' && /^\/jobs\/[^/]+\/(mri|3d)$/.test(pathname) && <FacePile session={session} />}
      <CallControls />
      {guest && session && <FollowBanner session={session} />}
      {id && !guest && (
        <div className={css.shareWrap}>
          <button className={css.share} type="button" disabled={!!why || busy} title={why ?? undefined} aria-expanded={open} onClick={() => void onShare()}>{busy ? 'Starting…' : 'Share'}</button>
          {error && <p className={css.error} role="alert">{error}</p>}
          {open && session && stored?.role === 'host' && <SharePopover session={session} inviteCode={stored.inviteCode} />}
        </div>
      )}
    </>
  );
}
