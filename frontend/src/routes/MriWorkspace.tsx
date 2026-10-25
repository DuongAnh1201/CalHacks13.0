import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ApiError, getReport } from '../api/client';
import type { Report } from '../api/types';
import { initCase } from '../actions/dispatch';
import { MeetingOverlay, MeetingPanel } from '../agent/MeetingNotes';
import { useNoteTaker } from '../agent/useNoteTaker';
import { InfoIcon, PinIcon, SparkIcon } from '../components/workspace/icons';
import { Workspace, type Tool } from '../components/workspace/Workspace';
import { scanMmToIndices, useNoteUi } from '../share/notes';
import { NotesPanel } from '../share/NotesPanel';
import { useNotes } from '../share/useNotes';
import { useMprShare } from '../share/useMprShare';
import { useShareSync } from '../share/useShareSync';
import type { SliceIndices } from '../share/types';
import { MprPanel } from '../viewer/MprPanel';
import { CaseInfo } from './CaseInfo';
import css from './MriWorkspace.module.css';
import { caseTitle } from './summary';

type Phase = 'loading' | 'ready' | 'redirect' | 'unknown' | 'offline' | 'api';

export default function MriWorkspace() {
  const { id = '' } = useParams();
  const noteTaker = useNoteTaker(id);
  const [report, setReport] = useState<Report | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [apiMessage, setApiMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [ticket, setTicket] = useState({ id, attempt });
  const share = useMprShare(id);
  const notes = useNotes(id);
  const goTo = useNoteUi((s) => s.goTo);
  useShareSync(id, 'mri', phase === 'ready');
  if (ticket.id !== id || ticket.attempt !== attempt) {
    setTicket({ id, attempt });
    setReport(null);
    setPhase(id ? 'loading' : 'unknown');
    setApiMessage('');
  }

  // The crosshair, for "Pin at crosshair". A ref: it changes on every click and nothing renders from it.
  const crosshair = useRef<SliceIndices | null>(null);
  const shareCrosshair = share.onCrosshair;
  const onCrosshair = useCallback((idx: SliceIndices) => { crosshair.current = idx; shareCrosshair(idx); }, [shareCrosshair]);
  const readCrosshair = useCallback(() => crosshair.current, []);

  useEffect(() => {
    if (!id) return;
    const ac = new AbortController();
    getReport(id, ac.signal).then((r) => {
      if (ac.signal.aborted) return;
      initCase({ jobId: id, hasTumor: r.tumorDetected, structureIds: new Set(), bboxMm: r.brain.bboxMm });
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

  const ready = report && phase === 'ready' ? report : null;
  const tools: Tool[] = ready ? [
    { id: 'info', label: 'Case info', icon: <InfoIcon />, panel: <CaseInfo report={ready} /> },
    { id: 'notes', label: 'Notes', icon: <PinIcon />, badge: notes.length, panel: <NotesPanel report={ready} notes={notes} mode="mri" crosshair={readCrosshair} /> },
    ...(!noteTaker.hidden ? [{ id: 'agent', label: 'Assistant', icon: <SparkIcon />, panel: <div className={css.agent}><MeetingPanel binding={noteTaker} /></div> }] : []),
  ] : [];

  return (
    <Workspace jobId={id} title={ready ? caseTitle(ready) : 'Loading case…'} tools={tools}>
      <MeetingOverlay binding={noteTaker} />
      {phase === 'loading' && <p className={css.status}>Loading results…</p>}
      {phase === 'unknown' && (
        <div className={css.status}>
          <div className={css.alert} role="alert">
            <p>Unknown job.</p>
            <Link className={css.ghost} to="/jobs/sample/processing">Use sample case</Link>
          </div>
        </div>
      )}
      {(phase === 'offline' || phase === 'api') && (
        <div className={css.status}>
          <div className={css.alert} role="alert">
            <p>{phase === 'offline' ? 'Backend offline — start docker compose up' : apiMessage}</p>
            <button className={css.ghost} type="button" onClick={() => setAttempt((n) => n + 1)}>Retry</button>
          </div>
        </div>
      )}
      {ready && (
        <div className={css.views}>
          <MprPanel jobId={id} fill onCrosshair={onCrosshair} onMaskVisible={share.onMaskVisible} remote={share.remote}
            goTo={goTo && { indices: scanMmToIndices(goTo.mm, ready), n: goTo.n }} />
        </div>
      )}
    </Workspace>
  );
}
