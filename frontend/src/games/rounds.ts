import type { LibraryCase } from '../api/types';
import type { GameAnswer, GamePrompt, GameResult, GameSecret } from './types';
import { goodSlices } from './slices';
import type { Volume } from './volume';

/** Same rules as convex/lib/games.ts score(); solo rounds are scored here, session rounds on the server. */
export function score(prompt: GamePrompt, secret: GameSecret | null, answer: GameAnswer): GameResult {
  if (prompt.kind === 'findSlice' && answer.kind === 'findSlice') {
    const d = Math.hypot(...prompt.targetMm.map((t, i) => t - answer.mm[i]));
    return { points: Math.max(0, Math.round(100 - d / 0.5)), distanceMm: Math.round(d * 10) / 10 };
  }
  if (answer.kind === 'beatAi') {
    const dice = Math.min(1, Math.max(0, answer.dice));
    return { points: Math.round(100 * dice), dice: Math.round(dice * 1000) / 1000 };
  }
  const correct = (secret?.kind === 'whichSide' && answer.kind === 'whichSide' && secret.side === answer.side)
    || (secret?.kind === 'bigger' && answer.kind === 'bigger' && secret.bigger === answer.pick);
  return { points: correct ? 100 : 0, correct };
}

/** Cases with the expert outline served next to the model's (expert.nii.gz in their backend seed folder). */
export const BEAT_AI_CASES = ['sample', 'sample-2'] as const;

const pickOne = <T,>(xs: readonly T[], rand: () => number) => xs[Math.floor(rand() * xs.length)];

export interface NewRound { prompt: GamePrompt; secret: GameSecret | null }

/** A library case with a known side, not the one just played. */
export function whichSideRound(cases: LibraryCase[], last: string | null, rand = Math.random): NewRound | null {
  const pool = cases.filter((c) => c.tumorDetected && c.side && c.jobId !== last);
  if (pool.length === 0) return null;
  const c = pickOne(pool, rand);
  return { prompt: { kind: 'whichSide', jobId: c.jobId }, secret: { kind: 'whichSide', side: c.side! } };
}

/**
 * Two cases whose volumes differ by 15–100 %: close enough that one slice can mislead,
 * far enough apart that the answer is not a coin flip.
 */
export function biggerRound(cases: LibraryCase[], rand = Math.random): NewRound | null {
  const pool = cases.filter((c) => c.tumorDetected && c.volumesCm3.whole > 0);
  const pairs: [LibraryCase, LibraryCase][] = [];
  for (const a of pool) for (const b of pool) {
    const r = a.volumesCm3.whole / b.volumesCm3.whole;
    if (a.jobId < b.jobId && Math.max(r, 1 / r) >= 1.15 && Math.max(r, 1 / r) <= 2) pairs.push([a, b]);
  }
  if (pairs.length === 0) return null;
  const pair = pickOne(pairs, rand);
  const [a, b] = rand() < 0.5 ? pair : [pair[1], pair[0]];
  return {
    prompt: { kind: 'bigger', jobA: a.jobId, jobB: b.jobId },
    secret: { kind: 'bigger', bigger: a.volumesCm3.whole > b.volumesCm3.whole ? 'A' : 'B', volumesCm3: [a.volumesCm3.whole, b.volumesCm3.whole] },
  };
}

/** One of the planes where the tumor is at least half its largest cross-section. */
export function beatAiRound(jobId: string, expert: Volume, rand = Math.random): NewRound | null {
  const slices = goodSlices(expert);
  return slices.length ? { prompt: { kind: 'beatAi', jobId, slice: pickOne(slices, rand) }, secret: null } : null;
}

/**
 * A target in scan mm: half the time inside the tumor, otherwise anywhere in the brain,
 * so rounds alternate between "where in the tumor" and "where in the brain".
 */
export function findSliceRound(jobId: string, flair: Volume, seg: Volume, rand = Math.random): NewRound | null {
  const [w, h] = flair.dims;
  const tumor = rand() < 0.5;
  const pool: number[] = [];
  for (let n = 0; n < flair.data.length; n += 7) if (tumor ? seg.data[n] > 0 : flair.data[n] > 0) pool.push(n);
  if (pool.length === 0) return null;
  const n = pickOne(pool, rand);
  const i = n % w, j = Math.floor(n / w) % h, k = Math.floor(n / (w * h));
  return { prompt: { kind: 'findSlice', jobId, targetMm: [i * flair.spacing[0], j * flair.spacing[1], k * flair.spacing[2]] }, secret: null };
}
