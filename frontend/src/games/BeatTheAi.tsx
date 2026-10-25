import { useMemo, useState } from 'react';
import { flairUrl, segUrl } from '../api/client';
import css from './Game.module.css';
import { SliceCanvas } from './SliceCanvas';
import { axial, dice, fillHoles, tumorMask } from './slices';
import type { GamePrompt } from './types';
import { useVolumes } from './useVolumes';
import type { RoundProps } from './view';
import { expertUrl } from './volume';

const EXPERT: [number, number, number] = [39, 174, 96];
const AI: [number, number, number] = [86, 160, 255];
const swatch = (c: [number, number, number]) => ({ background: `rgb(${c.join(',')})` });

/**
 * Outline the tumor on one slice. Scored with Dice against the expert's outline, next to the
 * AI model's Dice on the same slice. The AI outline is this case's seg.nii.gz (model output);
 * the expert's is expert.nii.gz, served only for cases that have both (rounds.ts BEAT_AI_CASES).
 */
export function BeatTheAi({ prompt, revealed, mine, others, canAnswer, onAnswer }: RoundProps<Extract<GamePrompt, { kind: 'beatAi' }>>) {
  const { vols, error, retry } = useVolumes([flairUrl(prompt.jobId), segUrl(prompt.jobId), expertUrl(prompt.jobId)]);
  const view = useMemo(() => {
    if (!vols) return null;
    const [flair, ai, expert] = vols;
    const k = prompt.slice;
    const expertMask = tumorMask(expert, k), aiMask = tumorMask(ai, k);
    return { plane: axial(flair, k), expertMask, aiMask, aiDice: dice(aiMask, expertMask) };
  }, [vols, prompt.slice]);

  const [paint, setPaint] = useState<{ key: string; mask: Uint8Array } | null>(null);
  const [brush, setBrush] = useState(4);
  const [erase, setErase] = useState(false);
  const key = `${prompt.jobId}:${prompt.slice}`;
  const mask = view && paint?.key === key ? paint.mask : null;
  const [, setStrokes] = useState(0); // the mask is edited in place; this re-renders the Submit state

  if (error) return <div className={css.game}><p className={css.error}>{error}</p><button type="button" className={css.ghost} onClick={retry}>Retry</button></div>;
  if (!view) return <div className={css.game}><p className={css.note}>Loading the scan and both outlines…</p></div>;

  const { w, h } = view.plane;
  const current = mask ?? new Uint8Array(w * h);
  const painted = current.some((v) => v);
  const submit = () => onAnswer({ kind: 'beatAi', dice: dice(fillHoles(current, w, h), view.expertMask) });
  const myDice = mine?.answer.kind === 'beatAi' ? mine.answer.dice : null;
  const done = mine !== null || !canAnswer;

  return (
    <div className={css.game}>
      <h2 className={css.ask}>Beat the AI: outline the tumor</h2>
      <p className={css.hint}>
        Paint over everything you think is tumor on this FLAIR slice (the bright, swollen region counts). A closed ring is filled in for you.
        You are scored against an expert radiologist's outline, and so is the AI.
      </p>
      <div className={css.stage}>
        <SliceCanvas plane={view.plane} label={`Axial · slice ${prompt.slice + 1}`}
          overlays={[
            ...(done && painted ? [{ mask: current, color: [242, 153, 74] as [number, number, number], style: 'fill' as const }] : []),
            ...(revealed ? [{ mask: view.expertMask, color: EXPERT, style: 'outline' as const }, { mask: view.aiMask, color: AI, style: 'outline' as const }] : []),
          ]}
          paint={done ? undefined : { mask: current, brush, erase, onPaint: (m) => { setPaint({ key, mask: m }); setStrokes((n) => n + 1); } }} />
      </div>
      {!done && (
        <div className={css.tools}>
          <label>Brush <input type="range" min={1} max={14} value={brush} onChange={(e) => setBrush(Number(e.target.value))} /></label>
          <button type="button" className={css.ghost} aria-pressed={erase} onClick={() => setErase((x) => !x)}>Eraser</button>
          <button type="button" className={css.ghost} onClick={() => setPaint({ key, mask: new Uint8Array(w * h) })}>Clear</button>
          <button type="button" className={css.primary} disabled={!painted} onClick={submit}>Submit outline</button>
        </div>
      )}
      {mine && !revealed && <p className={css.note}>Outline locked in. Waiting for the host to reveal.</p>}
      {revealed && (
        <>
          <div className={css.legend}>
            <span><i style={swatch(EXPERT)} />Expert</span>
            <span><i style={swatch(AI)} />AI model</span>
            {myDice !== null && <span><i style={{ background: '#f2994a' }} />You</span>}
          </div>
          <dl className={css.scores}>
            {myDice !== null && <div className={css.score}><dt>You</dt><dd>{myDice.toFixed(2)}</dd></div>}
            <div className={css.score}><dt>AI model</dt><dd>{view.aiDice.toFixed(2)}</dd></div>
            <div className={css.score}><dt>Expert</dt><dd>1.00</dd></div>
          </dl>
          <div className={`${css.verdict} ${myDice === null ? '' : myDice >= view.aiDice ? css.good : css.bad}`}>
            <strong>{myDice === null ? 'Dice score: 1.00 is a perfect match with the expert.' : myDice >= view.aiDice ? 'You beat the AI on this slice!' : 'The AI wins this slice.'}</strong>
            <p>Dice = 2 × overlap ÷ (your area + the expert's area). It is how segmentation models are graded.</p>
            {others && others.length > 0 && <p>Best in the room: {Math.max(...others.map((o) => o.result.dice ?? 0)).toFixed(2)}.</p>}
          </div>
        </>
      )}
    </div>
  );
}
