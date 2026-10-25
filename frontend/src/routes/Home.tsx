import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ApiError, getReport } from '../api/client';
import brandMark from '../assets/figma/664bf.svg';
import coronalUrl from '../assets/home/coronal.png';
import sagittalUrl from '../assets/home/sagittal.png';
import type { GameKind } from '../games/types';
import { BrainFact } from '../home/BrainFact';
import { JoinInvite } from '../home/JoinInvite';
import { OUTLINES } from '../home/scanArt';
import { ScanHero } from '../home/ScanHero';
import { tilt, untilt } from '../home/tilt';
import { ago, hrefOf, listWorkspaces, removeWorkspace, saveWorkspace, type Workspace } from '../home/workspaces';
import { resumePlay, usePlay } from '../play/store';
import { resume as resumeShare, useShare } from '../share/store';
import css from './Home.module.css';

/** The case "Enter the workspace" opens: the seeded sample, always available. */
const SAMPLE = { id: 'sample', name: 'Sample case A' };

const GAMES: { kind: GameKind; name: string; line: string; glyph: ReactNode }[] = [
  {
    kind: 'findSlice', name: 'Find the slice', line: 'Match a point in the 3D brain to its MRI slices.',
    glyph: <svg viewBox="0 0 40 40"><path d="M6 20h28M20 6v28" stroke="#8cc8ee" strokeWidth="1.6" /><path d="m20 11 2.6 5.4 5.9.8-4.3 4.1 1 5.9L20 24.4l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="#f2994a" /></svg>,
  },
  {
    kind: 'beatAi', name: 'Beat the AI', line: 'Outline a tumor, then compare with the expert and the AI.',
    glyph: <svg viewBox="0 0 40 40" fill="none" strokeWidth="2"><ellipse cx="18" cy="21" rx="11" ry="9" stroke="#27ae60" /><ellipse cx="22" cy="19" rx="10" ry="9.5" stroke="#56a0ff" /><ellipse cx="20" cy="20" rx="7" ry="6" fill="rgba(242,153,74,.55)" stroke="#f2994a" /></svg>,
  },
  {
    kind: 'whichSide', name: 'Which side?', line: 'Read a slice the way radiologists do: left or right?',
    glyph: <svg viewBox="0 0 40 40"><path d="M20 6c-8 0-13 6-13 14s5 14 13 14 13-6 13-14S28 6 20 6Z" fill="rgba(255,255,255,.14)" /><path d="M20 5v30" stroke="#8cc8ee" strokeWidth="1.4" strokeDasharray="2.5 2.5" /><circle cx="13.5" cy="17" r="4.5" fill="#eb5757" /></svg>,
  },
  {
    kind: 'bigger', name: 'Bigger or smaller', line: 'Judge which tumor is bigger in 3D from one slice each.',
    glyph: <svg viewBox="0 0 40 40"><circle cx="13" cy="22" r="8" fill="#f2c94c" /><circle cx="29" cy="18" r="5" fill="none" stroke="#f2c94c" strokeWidth="2" /></svg>,
  },
];

function Plane({ src, plane, label }: { src: string; plane: 'sagittal' | 'coronal'; label: string }) {
  const o = OUTLINES[plane];
  return (
    <figure className={css.plane}>
      <div className={css.planeArt} style={{ aspectRatio: `${o.w} / ${o.h}` }}>
        <img src={src} alt="" width={o.w * 2} height={o.h * 2} />
        <svg viewBox={`0 0 ${o.w} ${o.h}`} aria-hidden="true">
          <path d={o.edema} className={css.oEdema} />
          <path d={o.core} className={css.oCore} />
          <path d={o.enhancing} className={css.oEnhancing} />
        </svg>
      </div>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function Home() {
  const [items, setItems] = useState(() => listWorkspaces());
  const [joinOpen, setJoinOpen] = useState(false);
  // Only sessions Convex confirms are live: re-subscribing drops a token whose session has ended.
  const review = useShare((s) => (s.session?.status === 'active' ? s.stored : null));
  const playground = usePlay((s) => (s.session?.status === 'active' ? s.stored : null));
  useEffect(() => { resumeShare(); resumePlay(); }, []);

  // Forget recent cases the backend no longer has.
  useEffect(() => {
    const ctl = new AbortController();
    for (const row of listWorkspaces()) {
      getReport(row.id, ctl.signal).catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        if (!(e instanceof ApiError) || e.status !== 404) return;
        removeWorkspace(row.id);
        setItems((list) => list.filter((x) => x.id !== row.id));
      });
    }
    return () => ctl.abort();
  }, []);

  const open = (w: Pick<Workspace, 'id' | 'name'>) => saveWorkspace({ id: w.id, kind: 'mri', name: w.name, openedAt: Date.now() });
  const resume = review || playground || items.length > 0;

  return (
    <div className={css.page}>
      <header className={css.nav}>
        <Link to="/" className={css.brand} aria-label="Lobe home">
          <img src={brandMark} alt="" width={22} height={23} />
          <span>Lobe</span>
        </Link>
        <nav className={css.links} aria-label="Main">
          <NavLink to="/explore" className={css.link}>Explore scans</NavLink>
          <NavLink to="/play" className={css.link}>Games</NavLink>
          <NavLink to="/upload" className={css.link}>Upload</NavLink>
        </nav>
        <JoinInvite open={joinOpen} onOpenChange={setJoinOpen} />
      </header>

      <main className={css.main}>
        <section className={css.hero} aria-labelledby="home-title">
          <div className={css.copy}>
            <h1 id="home-title" className={css.title}>
              <span>A better way</span> <span>to learn</span> <span>the brain.</span>
            </h1>
            <p className={css.lede}>
              Lobe turns real brain MRIs into 3D models you can turn, slice and study together, then lets you practice on the same scans with quick games.
            </p>
            <p className={css.try}>The scan here is a real one. Tap or move across it to see what you are pointing at.</p>
          </div>
          <ScanHero />
        </section>

        <section className={css.destinations} aria-label="Start here">
          <article className={`${css.workspace} ${css.tilt}`} onPointerMove={tilt} onPointerLeave={untilt}>
            <div className={css.planes}>
              <Plane src={sagittalUrl} plane="sagittal" label="Sagittal" />
              <Plane src={coronalUrl} plane="coronal" label="Coronal" />
            </div>
            <div className={`${css.destBody} ${css.parallax}`}>
              <h2 className={css.destTitle}>Workspace</h2>
              <p className={css.destText}>Rotate the brain in 3D, step through all three slice planes, pin notes, and share one live view with your study group.</p>
              <div className={css.destActions}>
                <Link className={css.primary} to={`/jobs/${SAMPLE.id}/3d`} onClick={() => open(SAMPLE)}>Enter the workspace</Link>
                <Link className={css.quiet} to="/explore">Choose a scan</Link>
                <Link className={css.quiet} to="/upload">Upload your MRI</Link>
              </div>
            </div>
          </article>

          <article className={`${css.games} ${css.tilt}`} onPointerMove={tilt} onPointerLeave={untilt}>
            <div className={css.gamesHead}>
              <h2 className={css.destTitle}>Games</h2>
              <p className={css.destText}>Short rounds on real scans. Play alone, or start a playground and race your group.</p>
            </div>
            <ul className={`${css.gameList} ${css.parallax}`}>
              {GAMES.map((g) => (
                <li key={g.kind}>
                  <Link className={css.game} to={`/play?game=${g.kind}`}>
                    <span className={css.glyph} aria-hidden="true">{g.glyph}</span>
                    <span className={css.gameText}><b>{g.name}</b><span>{g.line}</span></span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link className={css.gamesCta} to="/play">Open games</Link>
          </article>
        </section>

        {resume && (
          <section className={css.resume} aria-labelledby="resume-title">
            <h2 id="resume-title" className={css.sectionTitle}>Pick up where you left off</h2>
            <ul className={css.resumeList}>
              {review && (
                <li><Link className={`${css.resumeItem} ${css.live}`} to={`/jobs/${review.jobId}/3d`}>
                  <b>Your study session</b><span>{review.role === 'host' ? 'You are hosting' : 'You joined'}, case {review.jobId}</span>
                </Link></li>
              )}
              {playground && (
                <li><Link className={`${css.resumeItem} ${css.live}`} to="/play">
                  <b>Your playground</b><span>{playground.role === 'host' ? 'You are hosting' : 'You joined'}, back to the games</span>
                </Link></li>
              )}
              {items.slice(0, 6).map((w) => (
                <li key={w.id}><Link className={css.resumeItem} to={hrefOf(w)} onClick={() => open(w)}>
                  <b>{w.name}</b><span>Opened {ago(w.openedAt)}</span>
                </Link></li>
              ))}
            </ul>
          </section>
        )}

        <BrainFact />
      </main>
    </div>
  );
}
