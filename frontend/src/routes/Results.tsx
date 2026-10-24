import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError, getReport } from '../api/client';
import type { Report } from '../api/types';
import { SAMPLES, SEQUENCE_LABEL, SEQUENCES, type Sequence } from '../api/upload';
import arrowIcon from '../assets/figma/b1141.svg';
import { Footer } from '../components/Footer';
import { Legend } from '../components/Legend';
import { TopNavBar } from '../components/TopNavBar';
import css from './Results.module.css';
import { cm3, headline, sideLabel } from './summary';

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

export default function Results() {
  const { id = '' } = useParams();
  const [report, setReport] = useState<Report | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [apiMessage, setApiMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [ticket, setTicket] = useState({ id, attempt });
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

  return (
    <div className={css.page}>
      <TopNavBar active="workspace" />
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
          <article className={css.card}>
            <h2 className={css.cardTitle}>Scan</h2>
            <dl className={css.fields}>
              <div><dt>Job id</dt><dd className={css.mono}>{report.jobId}</dd></div>
              <div><dt>Sequences</dt><dd>{sequenceLine(report.input.sequences)}</dd></div>
              <div><dt>Matrix</dt><dd>{report.input.shape.join(' × ')}</dd></div>
              <div><dt>Voxel spacing</dt><dd>{report.input.spacingMm.join(' × ')} mm</dd></div>
              <div><dt>Model</dt><dd>{report.model.arch} v{report.model.version}</dd></div>
            </dl>
          </article>
          <section className={css.card} aria-label="Slices">
            <h2 className={css.cardTitle}>Slices</h2>
            <p className={css.note}>Linked axial / sagittal / coronal views arrive with ticket C1.</p>
            <Legend available={{ edema: report.tumorDetected, core: report.tumorDetected, enhancing: report.volumesCm3.enhancing > 0 }} />
          </section>
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
                </dl>
              )}
              <ul className={css.limits}>
                <li>Educational visualization; not clinically validated.</li>
                <li>Shown where the model segmented it, in the scan's own coordinates.</li>
                <li>BraTS-style preprocessed MRI only.</li>
                {sample && <li>Sample case from the BraTS dataset; it may be part of the model's training data.</li>}
              </ul>
            </article>
            <article className={css.ctaCard}>
              <p className={css.ctaKicker}>Spatial pipeline action</p>
              <Link className={css.cta} to={`/jobs/${id}/explore`}>
                Place in 3D
                <img src={arrowIcon} alt="" width={16} height={16} />
              </Link>
            </article>
          </div>
        </main>
      )}
      <Footer />
    </div>
  );
}
