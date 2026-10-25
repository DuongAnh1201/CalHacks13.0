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
import { AgentPanel } from '../components/agent/AgentPanel';
import { demoMessages } from '../components/agent/demo';
import { ExplodeSlider } from '../components/ExplodeSlider';
import { HomeIcon, InfoIcon, PinIcon, SlidersIcon, SparkIcon, TargetIcon } from '../components/workspace/icons';
import { Workspace, type Tool } from '../components/workspace/Workspace';
import { useCameraShare } from '../share/cameraSync';
import { setDraft, setPlacing, useNoteUi } from '../share/notes';
import { NotesPanel } from '../share/NotesPanel';
import { useNotes } from '../share/useNotes';
import { useShare } from '../share/store';
import { useShareSync } from '../share/useShareSync';
import { LAYERS, type Layer } from '../viewer/layers';
import { CaseCanvas } from '../viewer/CaseCanvas';
import { CaseInfo } from './CaseInfo';
import { caseTitle, cm3, sideLabel } from './summary';
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
  const notes = useNotes(id);
  const placing = useNoteUi((s) => s.placing);
  const pinning = useNoteUi((s) => s.placing || !!s.draft);
  const live = useShare((s) => s.stored?.jobId === id && s.session?.status === 'active');

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
  const camera = useCameraShare(id);
  if (result?.kind === 'pending') return <Navigate to={`/jobs/${id}/processing`} replace />;

  const act = (a: Parameters<typeof dispatch>[0]) => setMessage(dispatch(a, 'pointer'));
  const report = result?.kind === 'ready' ? result.report : null;
  const modelFailed = failedId === id;
  const anyAvailable = LAYERS.some((l) => available[l.layer]);
  const anyLayer = LAYERS.some((l) => available[l.layer] && layers[l.layer]);
  const focusTumor = () => { const again = useViewer.getState().cameraTarget === 'tumor'; act({ type: 'focusTumor' }); if (again) viewEvents.dispatchEvent(new Event('focus')); };

  const view = report && (
    <div className={css.controls}>
      <section className={css.group}>
        <h3 className={css.label}>Brain</h3>
        <div className={css.segmented} role="group" aria-label="Brain display">
          <button type="button" aria-pressed={mode === 'whole'} disabled={modelFailed} onClick={() => act({ type: 'setMode', mode: 'whole' })}>Solid</button>
          <button type="button" aria-pressed={mode === 'xray'} disabled={modelFailed} onClick={() => act({ type: 'setMode', mode: 'xray' })}>X-ray</button>
        </div>
        {mode === 'xray' && (
          <label className={css.slider}>Opacity <span className={css.mono}>{Math.round(brainOpacity * 100)}%</span>
            <input type="range" min={0} max={100} value={Math.round(brainOpacity * 100)} aria-label="Brain opacity"
              onChange={(e) => act({ type: 'setOpacity', value: Number(e.target.value) / 100 })} />
          </label>
        )}
        <div className={css.chips}>
          {(['left', 'right'] as const).map((side) => (
            <button key={side} type="button" className={css.chip} aria-pressed={!hidden[side]} disabled={modelFailed}
              onClick={() => act({ type: 'setHemisphereVisible', side, visible: hidden[side] })}>
              {side === 'left' ? 'Left' : 'Right'} hemisphere
            </button>
          ))}
        </div>
      </section>
      <section className={css.group}>
        <h3 className={css.label}>Tumor layers</h3>
        <div className={css.chips}>
          {report.tumorDetected && (
            <button type="button" className={`${css.chip} ${css.tumorChip}`} aria-pressed={anyLayer} disabled={!anyAvailable}
              onClick={() => LAYERS.forEach((l) => available[l.layer] && act({ type: 'setLayerVisible', layer: l.layer, visible: !anyLayer }))}>
              All ({cm3(report.volumesCm3.whole)})
            </button>
          )}
          {LAYERS.map((l) => (
            <button key={l.layer} type="button" className={css.chip} aria-pressed={!!layers[l.layer] && !!available[l.layer]}
              disabled={!available[l.layer]} title={available[l.layer] ? undefined : report.tumorDetected ? 'Not in this case' : 'No tumor detected in this scan'}
              onClick={() => act({ type: 'setLayerVisible', layer: l.layer, visible: !layers[l.layer] })}>
              <span className={css.swatch} style={{ background: l.color }} />{l.label}
            </button>
          ))}
        </div>
        {!report.tumorDetected && <p className={css.note}>No tumor detected in this scan</p>}
      </section>
      <section className={css.group}><ExplodeSlider /></section>
    </div>
  );

  const tools: Tool[] = report ? [
    { id: 'info', label: 'Case info', icon: <InfoIcon />, panel: <CaseInfo report={report} /> },
    { id: 'notes', label: 'Notes', icon: <PinIcon />, badge: notes.length, panel: <NotesPanel report={report} notes={notes} mode="3d" /> },
    { id: 'view', label: 'View', icon: <SlidersIcon />, panel: view },
    { id: 'agent', label: 'Assistant', icon: <SparkIcon />, panel: <div className={css.agent}><AgentPanel messages={demoMessages(report, '3d')} status="offline" /></div> },
  ] : [];

  const dock = report && !modelFailed && (
    <>
      <button type="button" className={css.dockBtn} onClick={() => act({ type: 'resetView' })}><HomeIcon />Reset</button>
      <button type="button" className={css.dockBtn} disabled={!report.tumorDetected} title={report.tumorDetected ? undefined : 'No tumor detected in this scan'} onClick={focusTumor}><TargetIcon />Focus tumor</button>
      <button type="button" className={css.dockBtn} aria-pressed={placing} disabled={!live} title={live ? undefined : 'Share this case to pin notes'} onClick={() => setPlacing(!placing)}><PinIcon />{placing ? 'Click the brain…' : 'Pin note'}</button>
    </>
  );

  return (
    <Workspace jobId={id} title={report ? caseTitle(report) : 'Loading case…'} tools={tools} initialTool="info" focusTool={pinning ? 'notes' : null}
      onToolClose={(t) => { if (t === 'notes') setDraft(null); }} dock={dock}>
      <div className={placing ? `${css.stage} ${css.placing}` : css.stage} aria-label="3D brain">
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
                <CaseCanvas jobId={id} report={report} onLayers={setAvailable} camera={camera} notes={notes} />
              </Suspense>
            </LoadBoundary>
            {!modelFailed && report.tumorDetected && tumorRevealed && (
              <div className={css.toast} role="status">
                <img src={checkIcon} alt="" width={14} height={14} />
                Tumor placed · {sideLabel(report.side)} · {cm3(report.volumesCm3.whole)}
                <button type="button" className={css.undo} onClick={() => act({ type: 'resetView' })}>Undo</button>
              </div>
            )}
            {message && !message.ok && <p className={css.status} role="status">{message.message}</p>}
          </>
        )}
      </div>
    </Workspace>
  );
}
