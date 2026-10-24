import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, getJob } from '../api/client';
import type { JobStatus } from '../api/types';
import fileIcon from '../assets/figma/a6f94.svg';
import ringIcon from '../assets/figma/0ee3b.svg';
import checkIcon from '../assets/figma/7e35a.svg';
import { FlowPage } from '../components/FlowPage';
import css from './Processing.module.css';
import { stageRows } from './stages';

const STATUS: Record<JobStatus['status'], string> = {
  queued: 'Queued',
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

type Problem = { kind: 'unknown' } | { kind: 'offline' } | { kind: 'api'; message: string };

export default function Processing() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<JobStatus | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ticket, setTicket] = useState({ id, attempt });
  if (ticket.id !== id || ticket.attempt !== attempt) {
    setTicket({ id, attempt });
    setJob(null);
    setProblem(null);
  }

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    let timer = 0;
    let live = true;
    const tick = async () => {
      if (!live) return;
      try {
        const next = await getJob(id, ac.signal);
        if (!live) return;
        setJob(next);
        setProblem(null);
        if (next.status === 'done') { navigate(`/jobs/${id}/mri`, { replace: true }); return; }
        if (next.status === 'failed') return;
        timer = window.setTimeout(() => { void tick(); }, 1000);
      } catch (e) {
        if (!live || ac.signal.aborted) return;
        if (e instanceof ApiError && e.status === 404) setProblem({ kind: 'unknown' });
        else if (e instanceof ApiError) setProblem({ kind: 'api', message: e.message });
        else setProblem({ kind: 'offline' });
      }
    };
    void tick();
    return () => { live = false; window.clearTimeout(timer); ac.abort(); };
  }, [id, attempt, navigate]);

  const showCard = job && job.status !== 'done';

  return (
    <FlowPage step={2} title="Preparing your study" lede="The results open as soon as segmentation finishes.">
      <div className={css.stack}>
        {id && !job && !problem && <p className={css.wait}>Checking job…</p>}
        {(!id || problem?.kind === 'unknown') && (
          <div className={css.alert} role="alert">
            <p>Unknown job.</p>
            <Link className={css.ghost} to="/jobs/sample/processing">Use sample case</Link>
          </div>
        )}
        {problem?.kind === 'offline' && (
          <div className={css.alert} role="alert">
            <p>Backend offline — start docker compose up</p>
            <button className={css.ghost} type="button" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
            <Link className={css.ghost} to="/jobs/sample/processing">Use sample case</Link>
          </div>
        )}
        {problem?.kind === 'api' && (
          <div className={css.alert} role="alert">
            <p>{problem.message}</p>
            <button className={css.ghost} type="button" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
            <Link className={css.ghost} to="/jobs/sample/processing">Use sample case</Link>
          </div>
        )}
        {job?.status === 'failed' && (
          <div className={css.alert} role="alert">
            <p>{job.error?.message ?? 'Segmentation failed.'}</p>
            <Link className={css.ghost} to="/">Retry</Link>
            <Link className={css.ghost} to="/jobs/sample/processing">Use sample case</Link>
          </div>
        )}
        {showCard && (
          <section className={css.card}>
            <div className={css.file}>
              <span className={css.fileWell}><img src={fileIcon} alt="" width={20} height={20} /></span>
              <p className={css.job}>Job {id}</p>
              <span className={`${css.pill} ${css[job.status]}`}>{STATUS[job.status]}</span>
            </div>
            <ul className={css.stages}>
              {stageRows(job).map((row) => (
                <li key={row.stage} className={css.stage}>
                  {row.state === 'done' && <span className={css.doneMark}><img src={checkIcon} alt="" width={12} height={12} /></span>}
                  {row.state === 'active' && <img className={css.ring} src={ringIcon} alt="" width={22} height={22} />}
                  {row.state === 'pending' && <span className={css.pendingMark} />}
                  {row.state === 'failed' && <span className={css.failedMark} />}
                  <span className={css[`label_${row.state}`]}>{row.label}</span>
                </li>
              ))}
            </ul>
            {(job.status === 'queued' || job.status === 'running') && (
              <div className={css.actions}>
                <Link className={css.ghost} to="/jobs/sample/processing">Use sample case</Link>
              </div>
            )}
          </section>
        )}
      </div>
    </FlowPage>
  );
}
