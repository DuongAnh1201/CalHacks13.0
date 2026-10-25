import type { GameAnswer, GamePrompt, GameResult, GameSecret } from './types';

/** What every game view gets, solo or in a session. */
export interface RoundProps<P extends GamePrompt = GamePrompt> {
  prompt: P;
  /** The answer and everyone's results are visible. Solo: right after answering. */
  revealed: boolean;
  secret: GameSecret | null;
  mine: { answer: GameAnswer; result: GameResult | null } | null;
  /** Other players' answers after a session reveal; null solo. */
  others: { displayName: string; answer: GameAnswer; result: GameResult }[] | null;
  /** False for the session host, who runs the round. */
  canAnswer: boolean;
  onAnswer: (a: GameAnswer) => void;
}
