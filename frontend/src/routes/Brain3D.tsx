import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { dispatch, initCase, viewEvents } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import type { DispatchResult } from '../actions/types';
import { ApiError, getReport, modelUrl } from '../api/client';
import type { Report } from '../api/types';
import checkIcon from '../assets/figma/7e35a.svg';
import hideIcon from '../assets/figma/73f19.svg';
import focusIcon from '../assets/figma/82e7a.svg';
import intersectIcon from '../assets/figma/e71a8.svg';
import { AgentPanel } from '../components/agent/AgentPanel';
import { demoMessages } from '../components/agent/demo';
import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';
import { ExplodeSlider } from '../learn/ExplodeSlider';
import { useShareSync } from '../share/useShareSync';
import { StatusPill } from '../learn/StatusPill';
import { LAYERS, type Layer } from '../viewer/layers';
import { CaseCanvas } from '../viewer/CaseCanvas';
import { cm3, headline, sideLabel } from './summary';
import css from './Brain3D.module.css';

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

export default function Brain3D() {
  const { id = '' } = useParams();
  const [attempt, setAttempt] = useState(0);
  const key = `${id}:${attempt}`;
  const [res, setRes] = useState<{ key: string; result: Result } | null>(null);
  const [available, setAvailable] = useState<Partial<Record<Layer, boolean>>>({});
  const [failedId, setFailedId] = useState<string | null>(null); // the 3D model for this job failed to load
  const [message, setMessage] = useState<DispatchResult | null>(null);
  const { mode, brainOpacity, hidden, layers, tumorRevealed } = useViewer(useShallow((s) => ({ mode: s.mode, brainOpacity: s.brainOpacity, hidden: s.hidden, layers: s.layers, tumorRevealed: s.tumorRevealed })));

  useEffect(() => {
    const ctl = new AbortController();
    const done = (result: Result) => { if (!ctl.signal.aborted) setRes({ key, result }); };
    getReport(id, ctl.signal).then((report) => {
      if (ctl.signal.aborted) return;
      initCase({ jobId: id, hasTumor: report.tumorDetected, structureIds: new Set(), bboxMm: report.brain.bboxMm });
      if (report.tumorDetected) { // "Place in 3D" lands with the tumor placed, the brain see-through at 40
        dispatch({ type: 'focusTumor' }, 'pointer');
        dispatch({ type: 'setMode', mode: 'xray' }, 'pointer');
        dispatch({ type: 'setOpacity', value: 0.4 }, 'pointer');
      }
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
  useShareSync(id, '3d', result?.kind === 'ready');
  if (result?.kind === 'pending') return <Navigate to={`/jobs/${id}/processing`} replace />;

  const act = (a: Parameters<typeof dispatch>[0]) => setMessage(dispatch(a, 'pointer'));
  const report = result?.kind === 'ready' ? result.report : null;
  const modelFailed = failedId === id;
  const anyAvailable = LAYERS.some((l) => available[l.layer]);
  const anyLayer = LAYERS.some((l) => available[l.layer] && layers[l.layer]);

  return (
    <div className={css.page}>
      <TopNavBar />
      <main className={css.grid}>
        <aside className={css.left} aria-label="Case">
          {report && (
            <>
              <article className={css.card}>
                <p className={css.kicker}>Pathology</p>
                <h2 className={css.headline}>{headline(report)}</h2>
                <dl className={css.rows}>
                  <dt>Side</dt><dd>{sideLabel(report.side)}</dd>
                  {report.tumorDetected && <><dt>Whole tumor</dt><dd>{cm3(report.volumesCm3.whole)}</dd>
                    <dt>Tumor core</dt><dd>{cm3(report.volumesCm3.core)}</dd>
                    <dt>Enhancing</dt><dd>{cm3(report.volumesCm3.enhancing)}</dd>
                    <dt>Lesions</dt><dd>{report.lesionCount}</dd></>}
                </dl>
              </article>
              <section className={css.card} aria-label="Spatial controls">
                <p className={css.kicker}>Spatial toggles</p>
                <div className={css.toggles}>
                  <button type="button" className={css.toggle} aria-pressed={mode === 'xray'} disabled={modelFailed}
                    onClick={() => act({ type: 'setMode', mode: mode === 'xray' ? 'whole' : 'xray' })}>
                    Brain Opacity <span className={css.mono}>{mode === 'xray' ? Math.round(brainOpacity * 100) : 100}</span>
                  </button>
                  <button type="button" className={css.toggle} disabled title="Needs Cutaway (#16)">
                    Slices Intersect <img src={intersectIcon} alt="" width={13} height={13} />
                  </button>
                  <button type="button" className={css.toggle} aria-pressed={hidden.left && hidden.right} disabled={modelFailed}
                    onClick={() => { const show = hidden.left && hidden.right; act({ type: 'setHemisphereVisible', side: 'left', visible: show }); act({ type: 'setHemisphereVisible', side: 'right', visible: show }); }}>
                    Hide Brain <img src={hideIcon} alt="" width={15} height={13} />
                  </button>
                  <button type="button" className={`${css.toggle} ${css.accent}`} disabled={!report.tumorDetected || modelFailed}
                    title={report.tumorDetected ? undefined : 'No tumor detected in this scan'} onClick={() => { const again = useViewer.getState().cameraTarget === 'tumor'; act({ type: 'focusTumor' }); if (again) viewEvents.dispatchEvent(new Event('focus')); }}>
                    Focus Tumor <img src={focusIcon} alt="" width={12} height={12} />
                  </button>
                </div>
                {mode === 'xray' && (
                  <input className={css.slider} type="range" min={0} max={100} value={Math.round(brainOpacity * 100)} aria-label="Brain opacity"
                    onChange={(e) => act({ type: 'setOpacity', value: Number(e.target.value) / 100 })} />
                )}
                {!report.tumorDetected && <p className={css.note}>No tumor detected in this scan</p>}
              </section>
              <article className={`${css.card} ${css.gesture}`}>
                <p className={css.kicker}>Gesture control</p>
                <p className={css.webcam}>Webcam off</p>
                <p className={css.note}>Hand gestures arrive with issue #18.</p>
              </article>
              <Link className={css.back} to={`/jobs/${id}/mri`}>Analyze Cross-Sections</Link>
            </>
          )}
        </aside>

        <section className={css.stage} aria-label="3D brain">
          {!result && <p className={css.loading}>Loading results…</p>}
          {result?.kind === 'unknown' && (
            <div className={css.error} role="alert">
              <p>Unknown job.</p>
              <Link className={css.link} to="/jobs/sample/3d">Use sample case</Link>
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
                  <CaseCanvas jobId={id} report={report} onLayers={setAvailable} />
                </Suspense>
              </LoadBoundary>
              {!modelFailed && (
                <>
                  <div className={css.pill}><StatusPill /></div>
                  {report.tumorDetected && tumorRevealed && (
                    <div className={css.toast} role="status">
                      <img src={checkIcon} alt="" width={14} height={14} />
                      Tumor placed on the 3D brain · {sideLabel(report.side)} · {cm3(report.volumesCm3.whole)}
                      <button type="button" className={css.undo} onClick={() => act({ type: 'resetView' })}>Undo</button>
                    </div>
                  )}
                  <div className={css.explode}><ExplodeSlider /></div>
                  <div className={css.structures} role="group" aria-label="Structures">
                    <span className={css.structuresLabel}>Structures:</span>
                    {report.tumorDetected && (
                      <button type="button" className={`${css.layer} ${css.tumorChip}`} aria-pressed={anyLayer} disabled={!anyAvailable}
                        onClick={() => LAYERS.forEach((l) => available[l.layer] && act({ type: 'setLayerVisible', layer: l.layer, visible: !anyLayer }))}>
                        Tumor ({cm3(report.volumesCm3.whole)})
                      </button>
                    )}
                    {LAYERS.map((l) => (
                      <button key={l.layer} type="button" className={css.layer} aria-pressed={!!layers[l.layer] && !!available[l.layer]}
                        disabled={!available[l.layer]} title={available[l.layer] ? undefined : report.tumorDetected ? 'Not in this case' : 'No tumor detected in this scan'}
                        onClick={() => act({ type: 'setLayerVisible', layer: l.layer, visible: !layers[l.layer] })}>
                        <span className={css.swatch} style={{ background: l.color }} />{l.label}
                      </button>
                    ))}
                    {(['left', 'right'] as const).map((side) => (
                      <button key={side} type="button" className={css.layer} aria-pressed={!hidden[side]}
                        onClick={() => act({ type: 'setHemisphereVisible', side, visible: hidden[side] })}>
                        {side === 'left' ? 'Left' : 'Right'} hemisphere
                      </button>
                    ))}
                  </div>
                </>
              )}
              {message && !message.ok && <p className={css.status} role="status">{message.message}</p>}
            </>
          )}
        </section>

        <aside className={css.right} aria-label="Assistants">
          {report && <div className={css.agent}><AgentPanel messages={demoMessages(report, '3d')} status="offline" /></div>}
        </aside>
      </main>
      <Footer />
    </div>
  );
}
