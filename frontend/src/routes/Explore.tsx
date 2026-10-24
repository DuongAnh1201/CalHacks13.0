import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { dispatch, initCase } from '../actions/dispatch';
import type { DispatchResult } from '../actions/types';
import { ApiError, getReport, modelUrl } from '../api/client';
import type { Report } from '../api/types';
import { Footer } from '../components/Footer';
import { Legend } from '../components/Legend';
import { TopNavBar } from '../components/TopNavBar';
import type { Layer } from '../viewer/layers';
import { CaseCanvas } from '../viewer/CaseCanvas';
import { cm3, headline, sideLabel } from './summary';
import css from './Explore.module.css';

type Result =
  | { kind: 'ready'; report: Report }
  | { kind: 'pending' }   // 409: job not done yet
  | { kind: 'unknown' }   // 404
  | { kind: 'offline' }   // network failure
  | { kind: 'error'; message: string };

const OFFLINE = 'Backend offline — start docker compose up';

/** Shows error.message so a MissingNodeError names the node ("3D model is missing node: brain_left"). */
class LoadBoundary extends Component<{ id: string; onFail: (failed: boolean) => void; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch() { this.props.onFail(true); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className={css.error} role="alert">
        <p>{this.state.error.message}</p>
        <button className={css.retry} onClick={() => { useGLTF.clear(modelUrl(this.props.id)); this.setState({ error: null }); this.props.onFail(false); }}>Retry</button>
      </div>
    );
  }
}

export default function Explore() {
  const { id = '' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const key = `${id}:${attempt}`;
  const [res, setRes] = useState<{ key: string; result: Result } | null>(null);
  const [layers, setLayers] = useState<Partial<Record<Layer, boolean>>>({});
  const [failedId, setFailedId] = useState<string | null>(null); // the 3D model for this job failed to load
  const [message, setMessage] = useState<DispatchResult | null>(null);

  useEffect(() => {
    const ctl = new AbortController();
    const done = (result: Result) => { if (!ctl.signal.aborted) setRes({ key, result }); };
    getReport(id, ctl.signal).then((report) => {
      if (ctl.signal.aborted) return;
      initCase({ jobId: id, hasTumor: report.tumorDetected, structureIds: new Set(), bboxMm: report.brain.bboxMm });
      done({ kind: 'ready', report });
    }).catch((e: unknown) => {
      if (!(e instanceof ApiError)) done({ kind: 'offline' });
      else if (e.status === 409) done({ kind: 'pending' });
      else if (e.status === 404) done({ kind: 'unknown' });
      else done({ kind: 'error', message: e.message });
    });
    return () => ctl.abort();
  }, [id, key]);

  const result = res?.key === key ? res.result : null;
  if (result?.kind === 'pending') return <Navigate to={`/jobs/${id}/processing`} replace />;

  const act = (a: Parameters<typeof dispatch>[0]) => setMessage(dispatch(a, 'pointer'));
  const report = result?.kind === 'ready' ? result.report : null;
  const modelFailed = failedId === id;

  return (
    <div className={css.page}>
      <TopNavBar active="explore" />
      <main className={css.grid}>
        <section className={css.stage} aria-label="3D brain">
          {!result && <p className={css.loading}>Loading results…</p>}
          {result?.kind === 'unknown' && (
            <div className={css.error} role="alert">
              <p>Unknown job.</p>
              <Link className={css.link} to="/jobs/sample/explore">Use sample case</Link>
            </div>
          )}
          {(result?.kind === 'offline' || result?.kind === 'error') && (
            <div className={css.error} role="alert">
              <p>{result.kind === 'offline' ? OFFLINE : result.message}</p>
              <button className={css.retry} onClick={() => setAttempt((n) => n + 1)}>Retry</button>
            </div>
          )}
          {report && (
            <>
              <LoadBoundary key={id} id={id} onFail={(f) => setFailedId(f ? id : null)}>
                <Suspense fallback={<p className={css.loading}>Loading 3D brain…</p>}>
                  <CaseCanvas jobId={id} report={report} onLayers={setLayers} />
                </Suspense>
              </LoadBoundary>
              <div className={css.bottom}>
                <p className={css.status} role="status">{message?.message}</p>
                <div className={css.bar}>
                  <button className={`${css.chip} ${css.tumor}`} disabled={!report.tumorDetected || modelFailed} title={report.tumorDetected ? undefined : 'No tumor detected in this scan'}
                    onClick={() => act({ type: 'focusTumor' })}>Show tumor</button>
                  <button className={css.chip} disabled={modelFailed} onClick={() => act({ type: 'resetView' })}>Reset view</button>
                </div>
              </div>
            </>
          )}
        </section>
        <aside className={css.side} aria-label="Case summary">
          {report && (
            <>
              <h2>{headline(report)}</h2>
              <dl className={css.rows}>
                <dt>Side</dt><dd>{sideLabel(report.side)}</dd>
                {report.tumorDetected && <><dt>Whole tumor</dt><dd>{cm3(report.volumesCm3.whole)}</dd></>}
              </dl>
              {!modelFailed && <Legend available={layers} />}
              <Link className={css.back} to={`/jobs/${id}/results`}>Back to results</Link>
            </>
          )}
        </aside>
      </main>
      <Footer />
    </div>
  );
}
