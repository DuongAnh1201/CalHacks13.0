import { useMemo } from 'react';
import { flairUrl, segUrl } from '../api/client';
import css from './Game.module.css';
import { SliceCanvas } from './SliceCanvas';
import { axial, largestSlice, tumorMask } from './slices';
import type { GamePrompt, Side } from './types';
import { useVolumes } from './useVolumes';
import type { RoundProps } from './view';

const OPTIONS: [Side, string][] = [['left', 'Left hemisphere'], ['right', 'Right hemisphere'], ['bilateral', 'Both']];
const NAME: Record<Side, string> = { left: 'the left hemisphere', right: 'the right hemisphere', bilateral: 'both hemispheres' };

/** One axial slice, shown the radiological way: which hemisphere holds the tumor? */
export function WhichSide({ prompt, revealed, secret, mine, others, canAnswer, onAnswer }: RoundProps<Extract<GamePrompt, { kind: 'whichSide' }>>) {
  const { vols, error, retry } = useVolumes([flairUrl(prompt.jobId), segUrl(prompt.jobId)]);
  const picked = mine?.answer.kind === 'whichSide' ? mine.answer.side : null;
  const truth = revealed && secret?.kind === 'whichSide' ? secret.side : null;

  // largestSlice scans the whole volume: once per case, not per render.
  const view = useMemo(() => {
    if (!vols) return null;
    const [flair, seg] = vols;
    const k = largestSlice(seg);
    return k < 0 ? null : { k, plane: axial(flair, k, 'radiological'), tumor: tumorMask(seg, k, 'radiological') };
  }, [vols]);

  if (error) return <div className={css.game}><p className={css.error}>{error}</p><button type="button" className={css.ghost} onClick={retry}>Retry</button></div>;

  return (
    <div className={css.game}>
      <h2 className={css.ask}>Which side is the tumor on?</h2>
      <p className={css.hint}>
        This axial slice is shown <b>radiologically</b>, like most hospital viewers: as if you are facing the patient, so
        <b> their right is on your left</b>. Top of the image is the front of the head.
      </p>
      <div className={css.stage}>
        {view
          ? (
            <SliceCanvas plane={view.plane} label={`Axial · slice ${view.k + 1}`}
              overlays={truth ? [{ mask: view.tumor, color: [235, 87, 87], style: 'fill' }] : []}>
              <span className={`${css.compass} ${css.top}`}>Front</span>
              <span className={`${css.compass} ${css.bottom}`}>Back</span>
              {truth && <><span className={`${css.compass} ${css.left}`}>Patient R</span><span className={`${css.compass} ${css.rightSide}`}>Patient L</span></>}
            </SliceCanvas>
          )
          : <p className={css.note}>Loading the scan…</p>}
      </div>
      <div className={css.options} role="group" aria-label="Your answer">
        {OPTIONS.map(([side, label]) => (
          <button key={side} type="button" className={truth === side ? `${css.option} ${css.right}` : css.option}
            aria-pressed={picked === side} disabled={!canAnswer || !!mine || !vols} onClick={() => onAnswer({ kind: 'whichSide', side })}>
            {label}
          </button>
        ))}
      </div>
      {truth && (
        <div className={`${css.verdict} ${picked ? (picked === truth ? css.good : css.bad) : ''}`}>
          <strong>{picked ? (picked === truth ? 'Correct!' : 'Not quite.') : 'Answer'} The tumor is in {NAME[truth]}.</strong>
          <p>On a radiological image the patient's right is on the screen's left. The labels on the image now show which side is which.</p>
          {others && others.length > 0 && <p>{others.filter((o) => o.result.correct).length} of {others.length} got it right.</p>}
        </div>
      )}
    </div>
  );
}
