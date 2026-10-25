/**
 * Study games: round shapes and scoring (convex/games.ts holds the functions).
 *
 * A ROUND has a public `prompt` everyone sees and, for the quiz kinds, a
 * `secret` answer the server keeps until the host reveals. Scoring happens
 * here, on the server, from the stored prompt/secret, so a client never grades
 * itself. The one exception is beatAi: the outline is drawn and compared in
 * the browser (the masks are NIfTI files on the imaging service, not in
 * Convex), so the client reports its own Dice and the server only clamps it.
 *
 *   findSlice  a point is shown in 3D; players find it on the MRI slices.
 *              Points fall 2 per mm of error, 0 from 50 mm.
 *   whichSide  one axial slice; which hemisphere holds the tumor?
 *   bigger     two cases; which tumor has the larger volume?
 *   beatAi     outline the tumor on a slice; Dice vs the expert outline.
 *
 * Positions are "scan mm" (voxel index × spacing), the frontend viewers'
 * frame. A distance does not care which frame both points share.
 *
 * KNOWN LIMIT: the host's client generates whichSide/bigger rounds from the
 * public GET /library data, so a determined player could look the answer up.
 * Fine for a study game; the secret only stops the answer arriving in the
 * same subscription that shows the question.
 */

import { v, type Infer } from "convex/values";

const vPoint = v.array(v.number());
const vSide = v.union(v.literal("left"), v.literal("right"), v.literal("bilateral"));
const vPick = v.union(v.literal("A"), v.literal("B"));

export const vGamePrompt = v.union(
  v.object({ kind: v.literal("findSlice"), jobId: v.string(), targetMm: vPoint }),
  v.object({ kind: v.literal("whichSide"), jobId: v.string() }),
  v.object({ kind: v.literal("bigger"), jobA: v.string(), jobB: v.string() }),
  v.object({ kind: v.literal("beatAi"), jobId: v.string(), slice: v.number() }),
);

export const vGameSecret = v.union(
  v.object({ kind: v.literal("whichSide"), side: vSide }),
  v.object({ kind: v.literal("bigger"), bigger: vPick, volumesCm3: v.array(v.number()) }),
);

export const vGameAnswer = v.union(
  v.object({ kind: v.literal("findSlice"), mm: vPoint }),
  v.object({ kind: v.literal("whichSide"), side: vSide }),
  v.object({ kind: v.literal("bigger"), pick: vPick }),
  v.object({ kind: v.literal("beatAi"), dice: v.number() }),
);

export const vGameResult = v.object({
  points: v.number(),
  correct: v.optional(v.boolean()),
  distanceMm: v.optional(v.number()),
  dice: v.optional(v.number()),
});

export type GamePrompt = Infer<typeof vGamePrompt>;
export type GameSecret = Infer<typeof vGameSecret>;
export type GameAnswer = Infer<typeof vGameAnswer>;
export type GameResult = Infer<typeof vGameResult>;

/** Same id rule as jobs.registerScan: a path segment on the imaging service. */
const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_MM = 5000;
const MAX_SLICE = 2048;

export const MM_PER_POINT = 0.5; // 2 points lost per mm
export const FULL_POINTS = 100;

const isPoint = (p: number[]) => p.length === 3 && p.every((n) => Number.isFinite(n) && Math.abs(n) <= MAX_MM);

/** Why a prompt/secret pair is unusable, or null. Kinds must match; quiz kinds need their secret. */
export function invalidRound(prompt: GamePrompt, secret: GameSecret | undefined): string | null {
  const jobs = prompt.kind === "bigger" ? [prompt.jobA, prompt.jobB] : [prompt.jobId];
  if (!jobs.every((j) => JOB_ID.test(j))) return "That case id is not valid.";
  switch (prompt.kind) {
    case "findSlice":
      if (!isPoint(prompt.targetMm)) return "The target must be three finite millimetre values.";
      return secret ? "This game has no hidden answer." : null;
    case "beatAi":
      if (!Number.isInteger(prompt.slice) || prompt.slice < 0 || prompt.slice > MAX_SLICE) return "That slice is not valid.";
      return secret ? "This game has no hidden answer." : null;
    case "whichSide":
      return secret?.kind === "whichSide" ? null : "A which-side round needs the tumor's side.";
    case "bigger":
      if (prompt.jobA === prompt.jobB) return "Pick two different cases.";
      if (secret?.kind !== "bigger") return "A bigger-or-smaller round needs the answer.";
      if (secret.volumesCm3.length !== 2 || !secret.volumesCm3.every((n) => Number.isFinite(n) && n >= 0)) return "The volumes are not valid.";
      return null;
  }
}

/** Scores one answer. Assumes `answer.kind === prompt.kind` (checked by the caller). */
export function score(prompt: GamePrompt, secret: GameSecret | undefined, answer: GameAnswer): GameResult {
  if (prompt.kind === "findSlice" && answer.kind === "findSlice") {
    const d = Math.hypot(...prompt.targetMm.map((t, i) => t - answer.mm[i]));
    const distanceMm = Math.round(d * 10) / 10;
    return { points: Math.max(0, Math.round(FULL_POINTS - d / MM_PER_POINT)), distanceMm };
  }
  if (answer.kind === "beatAi") {
    const dice = Math.min(1, Math.max(0, answer.dice));
    return { points: Math.round(FULL_POINTS * dice), dice: Math.round(dice * 1000) / 1000 };
  }
  const correct = (secret?.kind === "whichSide" && answer.kind === "whichSide" && secret.side === answer.side)
    || (secret?.kind === "bigger" && answer.kind === "bigger" && secret.bigger === answer.pick);
  return { points: correct ? FULL_POINTS : 0, correct };
}

/** Why an answer cannot be accepted for this prompt, or null. */
export function invalidAnswer(prompt: GamePrompt, answer: GameAnswer): string | null {
  if (answer.kind !== prompt.kind) return "That answer is for a different game.";
  if (answer.kind === "findSlice" && !isPoint(answer.mm)) return "The guess must be three finite millimetre values.";
  if (answer.kind === "beatAi" && !Number.isFinite(answer.dice)) return "The score is not a number.";
  return null;
}
