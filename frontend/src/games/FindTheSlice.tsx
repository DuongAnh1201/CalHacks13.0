import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { dispatch, initCase } from '../actions/dispatch';
import { getReport } from '../api/client';
import type { Report } from '../api/types';
import { indicesToScanMm } from '../share/notes';
import type { Marker } from '../share/NotePins';
import type { SliceIndices } from '../share/types';
import { CaseCanvas } from '../viewer/CaseCanvas';
import { MprPanel } from '../viewer/MprPanel';
import type { Vec3 } from '../viewer/transform';
import css from './Game.module.css';
import type { GamePrompt } from './types';
import type { RoundProps } from './view';

const TARGET = '#f2994a', YOU = '#1f5673', OTHER = '#8a96a3';
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

/** A point glows in the 3D brain; put the slice crosshair on the same spot. Scored by distance in mm. */
export function FindTheSlice({ prompt, revealed, mine, others, canAnswer, onAnswer }: RoundProps<Extract<GamePrompt, { kind: 'findSlice' }>>) {
  const [report, setReport] = useState<{ jobId: string; report: Report } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const crosshair = useRef<SliceIndices | null>(null);
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    getReport(prompt.jobId, ac.signal).then((r) => {
      initCase({ jobId: prompt.jobId, hasTumor: r.tumorDetected, structureIds: new Set(), bboxMm: r.brain.bboxMm });
      // See-through brain, so a target inside it is visible.
      dispatch({ type: 'setMode', mode: 'xray' }, 'pointer');
      dispatch({ type: 'setOpacity', value: 0.3 }, 'pointer');
      setReport({ jobId: prompt.jobId, report: r });
    }).catch((e: unknown) => { if (!ac.signal.aborted) setError(e instanceof Error ? e.message : 'Could not load the case.'); });
    return () => ac.abort();
  }, [prompt.jobId]);

  const onCrosshair = useCallback((idx: SliceIndices) => { crosshair.current = idx; setMoved(true); }, []);
  const r = report?.jobId === prompt.jobId ? report.report : null;

  if (error) return <div className={css.game}><p className={css.error}>{error}</p></div>;

  const target = prompt.targetMm as Vec3;
  const myMm = mine?.answer.kind === 'findSlice' ? (mine.answer.mm as Vec3) : null;
  const markers: Marker[] = [{ mm: target, label: '★', color: TARGET, text: revealed ? 'Target' : undefined }];
  if (revealed && myMm) markers.push({ mm: myMm, label: 'You', color: YOU, text: mine?.result?.distanceMm !== undefined ? `${mine.result.distanceMm} mm off` : undefined });
  if (revealed) for (const o of others ?? []) if (o.answer.kind === 'findSlice') markers.push({ mm: o.answer.mm as Vec3, label: initials(o.displayName), color: OTHER });

  const lockIn = () => {
    if (!r || !crosshair.current) return;
    onAnswer({ kind: 'findSlice', mm: indicesToScanMm(crosshair.current, r) });
  };

  return (
    <div className={css.game}>
      <h2 className={css.ask}>Find the slice: put the crosshair on the ★</h2>
      <p className={css.hint}>The orange star marks a spot in the 3D brain. Tap or click the slices until their crosshair sits on that same spot, then lock in. Every millimetre off costs 2 points.</p>
      {r
        ? (
          <div className={css.split}>
            <div className={css.pane}>
              <Suspense fallback={<p className={css.note}>Loading 3D brain…</p>}>
                <CaseCanvas jobId={prompt.jobId} report={r} onLayers={noop} markers={markers} />
              </Suspense>
            </div>
            <div className={css.pane}><MprPanel jobId={prompt.jobId} fill onCrosshair={onCrosshair} /></div>
            <div className={css.scrollRail} aria-hidden="true">↕ Scroll page</div>
          </div>
        )
        : <p className={css.note}>Loading the case…</p>}
      {canAnswer && !mine && <button type="button" className={css.primary} disabled={!moved} title={moved ? undefined : 'Select a point on a slice first'} onClick={lockIn}>Lock in my crosshair</button>}
      {mine && !revealed && <p className={css.note}>Locked in. Waiting for the host to reveal.</p>}
      {revealed && (
        <div className={`${css.verdict} ${mine?.result ? (mine.result.points >= 70 ? css.good : css.bad) : ''}`}>
          <strong>{mine?.result?.distanceMm !== undefined ? `${mine.result.distanceMm} mm from the target: ${mine.result.points} points.` : 'Target revealed.'}</strong>
          <p>The 3D view now shows the target and where each guess landed.</p>
          {others && others.length > 0 && <p>Closest in the room: {Math.min(...others.map((o) => o.result.distanceMm ?? Infinity))} mm.</p>}
        </div>
      )}
    </div>
  );
}

const noop = () => {};
