import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, getLibrary } from '../api/client';
import type { LibraryCase } from '../api/types';
import { TopNavBar } from '../components/TopNavBar';
import { saveWorkspace } from '../home/workspaces';
import css from './Explore.module.css';
import { FALLBACK, filterCases, sizeOf, type Side, type Size } from './library';
import { cm3, sideLabel } from './summary';

const SIDES: [Side, string][] = [['all', 'Any side'], ['left', 'Left'], ['right', 'Right'], ['bilateral', 'Both']];
const SIZES: [Size, string][] = [['any', 'Any size'], ['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];

type State = { kind: 'loading' } | { kind: 'ready'; cases: LibraryCase[] } | { kind: 'offline' };

/** The study library: ready-made cases a student opens in one click, no upload. */
export default function Explore() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [side, setSide] = useState<Side>('all');
  const [size, setSize] = useState<Size>('any');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const ac = new AbortController();
    getLibrary(ac.signal).then((cases) => setState({ kind: 'ready', cases })).catch((e: unknown) => {
      if (ac.signal.aborted) return;
      setState(e instanceof ApiError && e.status === 404 ? { kind: 'ready', cases: FALLBACK } : { kind: 'offline' });
    });
    return () => ac.abort();
  }, [attempt]);

  const open = (c: LibraryCase) => saveWorkspace({ id: c.jobId, kind: 'mri', name: c.title, openedAt: Date.now() });
  const shown = state.kind === 'ready' ? filterCases(state.cases, side, size, query) : [];

  return (
    <div className={css.page}>
      <TopNavBar />
      <main className={css.main}>
        <header className={css.head}>
          <div>
            <h1 className={css.title}>Explore scans</h1>
            <p className={css.lede}>Real brain MRIs with expert-outlined tumors, ready to study. Open one on your own, or share it with your study group.</p>
          </div>
          <Link className={css.upload} to="/upload">Upload your own</Link>
        </header>

        <div className={css.filters}>
          <input className={css.search} type="search" placeholder="Search cases" aria-label="Search cases" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className={css.group} role="group" aria-label="Tumor side">
            {SIDES.map(([v, label]) => <button key={v} type="button" aria-pressed={side === v} onClick={() => setSide(v)}>{label}</button>)}
          </div>
          <div className={css.group} role="group" aria-label="Tumor size">
            {SIZES.map(([v, label]) => <button key={v} type="button" aria-pressed={size === v} onClick={() => setSize(v)}>{label}</button>)}
          </div>
        </div>

        {state.kind === 'loading' && <p className={css.note}>Loading the library…</p>}
        {state.kind === 'offline' && (
          <div className={css.alert} role="alert">
            <p>The scan library is not reachable right now.</p>
            <button type="button" className={css.retry} onClick={() => { setState({ kind: 'loading' }); setAttempt((n) => n + 1); }}>Retry</button>
          </div>
        )}
        {state.kind === 'ready' && shown.length === 0 && <p className={css.note}>No cases match these filters.</p>}

        <ul className={css.grid}>
          {shown.map((c) => (
            <li key={c.jobId} className={css.card}>
              <div className={css.thumb} data-side={c.side ?? 'none'} aria-hidden="true">
                <span className={css.hemi} /><span className={css.hemi} />
                {c.tumorDetected && <span className={css.spot} data-size={c.volumesCm3.whole ? sizeOf(c) : 'medium'} />}
              </div>
              <div className={css.body}>
                <h2 className={css.name}>{c.title}</h2>
                <p className={css.blurb}>{c.blurb}</p>
                <div className={css.tags}>
                  {c.side && <span>{sideLabel(c.side)}</span>}
                  {c.volumesCm3.whole > 0 && <span>{cm3(c.volumesCm3.whole)}</span>}
                  <span>{c.segmentationSource === 'expert' ? 'Expert outline' : 'AI outline'}</span>
                </div>
              </div>
              <div className={css.actions}>
                <Link className={css.primary} to={`/jobs/${c.jobId}/3d`} onClick={() => open(c)}>Open in 3D</Link>
                <Link className={css.secondary} to={`/jobs/${c.jobId}/mri`} onClick={() => open(c)}>Slices</Link>
              </div>
            </li>
          ))}
        </ul>
        <p className={css.credit}>Cases from the Medical Segmentation Decathlon (BraTS), CC-BY-SA 4.0. For learning only, not for diagnosis.</p>
      </main>
    </div>
  );
}
