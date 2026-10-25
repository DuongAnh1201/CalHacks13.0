import { useMemo } from 'react';
import { flairUrl, segUrl } from '../api/client';
import css from './Game.module.css';
import { SliceCanvas } from './SliceCanvas';
import { axial, largestSlice, tumorArea, tumorMask } from './slices';
import type { GamePrompt, Pick } from './types';
import { useVolumes } from './useVolumes';
import type { RoundProps } from './view';
import type { Volume } from './volume';

const cm2 = (seg: Volume, k: number) => (tumorArea(seg)[k] * seg.spacing[0] * seg.spacing[1]) / 100;

/** Two tumors, each at its largest cross-section: which one is bigger in 3D? */
export function Bigger({ prompt, revealed, secret, mine, others, canAnswer, onAnswer }: RoundProps<Extract<GamePrompt, { kind: 'bigger' }>>) {
  const { vols, error, retry } = useVolumes([flairUrl(prompt.jobA), segUrl(prompt.jobA), flairUrl(prompt.jobB), segUrl(prompt.jobB)]);
  const picked = mine?.answer.kind === 'bigger' ? mine.answer.pick : null;
  const truth = revealed && secret?.kind === 'bigger' ? secret : null;

  // Whole-volume scans: once per pair of cases, not per render.
  const slices = useMemo(() => vols && ([['A', vols[0], vols[1]], ['B', vols[2], vols[3]]] as const).map(([pick, flair, seg]) => {
    const k = largestSlice(seg);
    return { pick, k, plane: axial(flair, k), tumor: tumorMask(seg, k), area: cm2(seg, k) };
  }), [vols]);

  if (error) return <div className={css.game}><p className={css.error}>{error}</p><button type="button" className={css.ghost} onClick={retry}>Retry</button></div>;
  const misleading = truth && slices && (slices[0].area > slices[1].area ? 'A' : 'B') !== truth.bigger;

  return (
    <div className={css.game}>
      <h2 className={css.ask}>Which tumor is bigger in 3D?</h2>
      <p className={css.hint}>Each scan shows the slice where its tumor (red) is widest. Volume counts every slice, so think about how far each tumor extends up and down.</p>
      {slices
        ? (
          <div className={css.pair}>
            {slices.map(({ pick, plane, tumor, area }, n) => (
              <button key={pick} type="button" className={css.choice} aria-pressed={picked === pick} disabled={!canAnswer || !!mine}
                onClick={() => onAnswer({ kind: 'bigger', pick: pick as Pick })}>
                <span className={css.choiceLabel}>
                  Tumor {pick}{truth ? ` · ${truth.volumesCm3[n].toFixed(0)} cm³ in 3D · ${area.toFixed(1)} cm² on this slice` : ''}
                  {truth?.bigger === pick ? ' · bigger' : ''}
                </span>
                <SliceCanvas plane={plane} overlays={[{ mask: tumor, color: [235, 87, 87], style: 'fill' }]} label={pick} />
              </button>
            ))}
          </div>
        )
        : <p className={css.note}>Loading both scans…</p>}
      {truth && slices && (
        <div className={`${css.verdict} ${picked ? (picked === truth.bigger ? css.good : css.bad) : ''}`}>
          <strong>{picked ? (picked === truth.bigger ? 'Correct!' : 'Not quite.') : 'Answer'} Tumor {truth.bigger} is bigger: {Math.max(...truth.volumesCm3).toFixed(0)} vs {Math.min(...truth.volumesCm3).toFixed(0)} cm³.</strong>
          <p>{misleading
            ? `Tricky one: tumor ${truth.bigger === 'A' ? 'B' : 'A'} has the wider slice, but tumor ${truth.bigger} spans more slices. One slice can mislead.`
            : `Tumor ${truth.bigger} also has the wider slice here, so the slice was a fair guide this time.`}</p>
          {others && others.length > 0 && <p>{others.filter((o) => o.result.correct).length} of {others.length} got it right.</p>}
        </div>
      )}
    </div>
  );
}
