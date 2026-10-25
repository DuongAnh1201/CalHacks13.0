/** Hand-written mirror of convex/lib/games.ts and convex/games.ts (SPEC §6: no codegen). */
export type Side = 'left' | 'right' | 'bilateral';
export type Pick = 'A' | 'B';

export type GamePrompt =
  | { kind: 'findSlice'; jobId: string; targetMm: number[] }
  | { kind: 'whichSide'; jobId: string }
  | { kind: 'bigger'; jobA: string; jobB: string }
  | { kind: 'beatAi'; jobId: string; slice: number };
export type GameKind = GamePrompt['kind'];

export type GameSecret =
  | { kind: 'whichSide'; side: Side }
  | { kind: 'bigger'; bigger: Pick; volumesCm3: number[] };

export type GameAnswer =
  | { kind: 'findSlice'; mm: number[] }
  | { kind: 'whichSide'; side: Side }
  | { kind: 'bigger'; pick: Pick }
  | { kind: 'beatAi'; dice: number };

export interface GameResult { points: number; correct?: boolean; distanceMm?: number; dice?: number }

export interface PublicRound {
  roundId: string;
  prompt: GamePrompt;
  status: 'open' | 'revealed';
  startedAt: number;
  answered: { participantId: string; displayName: string }[];
  mine: { answer: GameAnswer; result: GameResult | null } | null;
  secret: GameSecret | null;
  answers: { participantId: string; displayName: string; answer: GameAnswer; result: GameResult }[] | null;
}
export interface LeaderboardRow { participantId: string; displayName: string; points: number; rounds: number }
export interface GameState { round: PublicRound | null; leaderboard: LeaderboardRow[] }
