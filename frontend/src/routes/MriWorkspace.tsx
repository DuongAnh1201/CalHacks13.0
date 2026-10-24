import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ApiError, getReport, segUrl } from '../api/client';
import type { Report } from '../api/types';
import { SAMPLES, SEQUENCE_LABEL, SEQUENCES, type Sequence } from '../api/upload';
import arrowIcon from '../assets/figma/77060.svg';
import exportIcon from '../assets/figma/79880.svg';
import thresholdIcon from '../assets/figma/76bfc.svg';
import { initCase } from '../actions/dispatch';
import { AgentPanel } from '../components/agent/AgentPanel';
import { demoMessages } from '../components/agent/demo';
import type { AgentMessage } from '../components/agent/types';
import { useMprShare } from '../share/useMprShare';
import { useShareSync } from '../share/useShareSync';
import { MprPanel } from '../viewer/MprPanel';
import { Footer } from '../components/Footer';
import { Legend } from '../components/Legend';
import { TopNavBar } from '../components/TopNavBar';
import css from './MriWorkspace.module.css';
import { certaintyText, cm3, headline, sideLabel } from './summary';

type Phase = 'loading' | 'ready' | 'redirect' | 'unknown' | 'offline' | 'api';

function sequenceLine(names: string[]) {
  return names.map((n) => (SEQUENCES.includes(n as Sequence) ? SEQUENCE_LABEL[n as Sequence] : n)).join(' · ');
}

function dimensions(r: Report) {
  const box = r.bboxMm;
  if (!box) return null;
  const parts = box.max.map((v, i) => ((v - box.min[i]) / 10).toFixed(1));
  return `${parts[0]} × ${parts[1]} × ${parts[2]} cm`;
}

export default function MriWorkspace() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [apiMessage, setApiMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [ticket, setTicket] = useState({ id, attempt });
  const share = useMprShare(id);
  useShareSync(id, 'mri', phase === 'ready');
  if (ticket.id !== id || ticket.attempt !== attempt) {
    setTicket({ id, attempt });
    setReport(null);
    setPhase(id ? 'loading' : 'unknown');
    setApiMessage('');
  }

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    getReport(id, ac.signal).then((r) => {
      if (ac.signal.aborted) return;
      initCase({ jobId: id, hasTumor: r.tumorDetected, structureIds: new Set(), bboxMm: r.brain.bboxMm });
      setMessages(demoMessages(r, 'mri'));
      setReport(r);
      setPhase('ready');
    }).catch((e: unknown) => {
      if (ac.signal.aborted) return;
      if (e instanceof ApiError && e.status === 409) setPhase('redirect');
      else if (e instanceof ApiError && e.status === 404) setPhase('unknown');
      else if (e instanceof ApiError) { setApiMessage(e.message); setPhase('api'); }
      else setPhase('offline');
    });
    return () => ac.abort();
  }, [id, attempt]);

  if (phase === 'redirect') return <Navigate to={`/jobs/${id}/processing`} replace />;

  const sample = SAMPLES.some((s) => s.id === id);
  const dims = report ? dimensions(report) : null;
  const certainty = report ? certaintyText(report.certainty) : null;

  return (
    <div className={css.page}>
      <TopNavBar />
      {phase === 'loading' && <main className={css.status}><p>Loading results…</p></main>}
      {phase === 'unknown' && (
        <main className={css.status}>
          <div className={css.alert} role="alert">
            <p>Unknown job.</p>
            <Link className={css.ghost} to="/jobs/sample/processing">Use sample case</Link>
          </div>
        </main>
      )}
      {phase === 'offline' && (
        <main className={css.status}>
          <div className={css.alert} role="alert">
            <p>Backend offline — start docker compose up</p>
            <button className={css.ghost} type="button" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </div>
        </main>
      )}
      {phase === 'api' && (
        <main className={css.status}>
          <div className={css.alert} role="alert">
            <p>{apiMessage}</p>
            <button className={css.ghost} type="button" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </div>
        </main>
      )}
      {report && phase === 'ready' && (
        <main className={css.grid}>
          <div className={css.left}>
            <article className={css.card} aria-label="Patient dataset">
              <header className={css.cardHead}>
                <h2 className={css.cardTitle}>Patient Dataset</h2>
                <span className={css.badge}>Verified NIfTI</span>
              </header>
              <dl className={css.fields}>
                <div><dt>Subject</dt><dd className={css.mono}>{sample ? SAMPLES.find((s) => s.id === id)!.title : report.jobId}</dd></div>
                <div><dt>Shown</dt><dd>FLAIR</dd></div>
                <div><dt>Sequences</dt><dd>{sequenceLine(report.input.sequences)}</dd></div>
                <div><dt>Matrix</dt><dd>{report.input.shape.join(' × ')}</dd></div>
                <div><dt>Voxel spacing</dt><dd>{report.input.spacingMm.join(' × ')} mm</dd></div>
                <div><dt>Model</dt><dd>{report.model.arch} v{report.model.version}</dd></div>
              </dl>
            </article>
            <AgentPanel messages={messages} status="offline"
              onConfirm={() => navigate(`/jobs/${id}/3d`)}
              onDismiss={() => setMessages((m) => m.filter((x) => x.kind !== 'confirm'))} />
          </div>
          <MprPanel jobId={id} onCrosshair={share.onCrosshair} onMaskVisible={share.onMaskVisible} remote={share.remote} />
          <div className={css.right}>
            <article className={css.card}>
              <div data-slot="source-badge" />
              <header className={css.reportHead}>
                <p className={css.kicker}><span className={css.dot} />AI Volumetric Analysis</p>
                {report.expertDice && <span className={css.dice}>Dice: {report.expertDice.whole.toFixed(2)}</span>}
              </header>
              <span className={css.chip}>Educational</span>
              <h2 className={css.headline}>{headline(report)}</h2>
              {report.tumorDetected && (
                <dl className={css.metrics}>
                  <div className={css.tile}><dt>Whole tumor</dt><dd>{cm3(report.volumesCm3.whole)}</dd></div>
                  <div className={css.tile}><dt>Tumor core</dt><dd>{cm3(report.volumesCm3.core)}</dd></div>
                  <div className={css.tile}><dt>Enhancing</dt><dd>{cm3(report.volumesCm3.enhancing)}</dd></div>
                  <div className={css.tile}><dt>Side</dt><dd>{sideLabel(report.side)}</dd></div>
                  <div className={css.tile}><dt>Lesions</dt><dd>{report.lesionCount}</dd></div>
                  {dims && (
                    <div className={css.tile}>
                      <dt>Approximate Dimensions</dt>
                      <dd>{dims}</dd>
                      <p className={css.axis}>Left–right × front–back × up–down</p>
                    </div>
                  )}
                  {report.expertDice && (
                    <div className={css.tile}>
                      <dt>Model vs expert label (Dice)</dt>
                      <dd>whole {report.expertDice.whole.toFixed(2)} · core {report.expertDice.core.toFixed(2)} · enhancing {report.expertDice.enhancing.toFixed(2)}</dd>
                    </div>
                  )}
                  {certainty && (
                    <div className={css.tile}>
                      <dt>Model certainty (not calibrated)</dt>
                      <dd>{certainty}</dd>
                      <p className={css.axis}>Model certainty of the outline, not a diagnosis or a probability of disease.</p>
                    </div>
                  )}
                </dl>
              )}
              <Legend available={{ edema: report.tumorDetected, core: report.tumorDetected, enhancing: report.volumesCm3.enhancing > 0 }} />
              <ul className={css.limits}>
                <li>Educational visualization; not clinically validated.</li>
                <li>Shown where the model segmented it, in the scan's own coordinates.</li>
                <li>BraTS-style preprocessed MRI only.</li>
                {sample && <li>Sample case from the BraTS dataset; it may be part of the model's training data.</li>}
              </ul>
            </article>
            <article className={css.ctaCard}>
              <p className={css.ctaKicker}>Spatial pipeline action</p>
              <Link className={css.cta} to={`/jobs/${id}/3d`}>
                Place Tumor in 3D Interactive Brain
                <img src={arrowIcon} alt="" width={16} height={16} />
              </Link>
              <div className={css.ctaRow}>
                <a className={css.ghost} href={segUrl(id)} download={`${id}-seg.nii.gz`}>
                  <img src={exportIcon} alt="" width={12} height={12} />Export NIfTI Mask
                </a>
                <button className={css.ghost} type="button" disabled title="Not available: the model has no threshold setting">
                  <img src={thresholdIcon} alt="" width={12} height={12} />Adjust Threshold
                </button>
              </div>
            </article>
          </div>
        </main>
      )}
      <Footer />
    </div>
  );
}
