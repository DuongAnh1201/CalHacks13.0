/**
 * Study games in a shared session (rules and scoring: lib/games.ts).
 *
 * WHAT LIVES HERE
 * ---------------
 *   games.start    public mutation  host opens a round (closes any open one)
 *   games.answer   public mutation  a guest locks in one answer per round
 *   games.reveal   public mutation  host shows the answer and every score
 *   games.current  public query     the latest round + the leaderboard, reactive
 *
 * The host is the quizmaster: they chose the target or know the answer, so
 * they do not answer. While a round is open, `current` shows who has answered
 * but not what, and never the secret; after the reveal it shows everything.
 * Points reach the leaderboard only when a round closes (reveal, or the next
 * start), or a score change would give away who was right.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requirePresenter, requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";
import {
  invalidAnswer, invalidRound, score, vGameAnswer, vGamePrompt, vGameSecret,
  type GameAnswer, type GamePrompt, type GameResult, type GameSecret,
} from "./lib/games";

/** Keeps a session's round list a bounded read. A long study session is a few dozen rounds. */
export const MAX_ROUNDS_PER_SESSION = 300;

const auth = { sessionId: v.id("sessions"), participantToken: v.string() };

export type PublicRound = {
  roundId: Id<"gameRounds">;
  prompt: GamePrompt;
  status: "open" | "revealed";
  startedAt: number;
  /** Who has locked in, never what (while open). */
  answered: { participantId: Id<"sessionParticipants">; displayName: string }[];
  /** The caller's own answer; its result only after the reveal. */
  mine: { answer: GameAnswer; result: GameResult | null } | null;
  /** After the reveal only. */
  secret: GameSecret | null;
  answers: { participantId: Id<"sessionParticipants">; displayName: string; answer: GameAnswer; result: GameResult }[] | null;
};

export type LeaderboardRow = { participantId: Id<"sessionParticipants">; displayName: string; points: number; rounds: number };

export const start = mutation({
  args: { ...auth, prompt: vGamePrompt, secret: v.optional(vGameSecret) },
  handler: async (ctx, args): Promise<{ roundId: Id<"gameRounds"> }> => {
    const { session } = await requirePresenter(ctx, args);
    const bad = invalidRound(args.prompt, args.secret);
    if (bad) throw appError("INVALID_ARGUMENT", bad);

    const rounds = await sessionRounds(ctx, session._id);
    if (rounds.length >= MAX_ROUNDS_PER_SESSION) {
      throw appError("INVALID_ARGUMENT", `A session can hold at most ${MAX_ROUNDS_PER_SESSION} game rounds.`);
    }
    for (const r of rounds) if (r.status === "open") await closeRound(ctx, r);

    const roundId = await ctx.db.insert("gameRounds", {
      sessionId: session._id, prompt: args.prompt, secret: args.secret, status: "open", startedAt: Date.now(),
    });
    return { roundId };
  },
});

export const answer = mutation({
  args: { ...auth, roundId: v.id("gameRounds"), answer: vGameAnswer },
  handler: async (ctx, args): Promise<{ answered: true }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const round = await roundIn(ctx, args.roundId, session._id);
    if (participant.role === "host") throw appError("NOT_ALLOWED", "The host runs the round, so the host does not answer.");
    if (round.status !== "open") throw appError("INVALID_ARGUMENT", "This round is over.");
    const bad = invalidAnswer(round.prompt, args.answer);
    if (bad) throw appError("INVALID_ARGUMENT", bad);

    const existing = await ctx.db
      .query("gameAnswers")
      .withIndex("by_round_participant", (q) => q.eq("roundId", round._id).eq("participantId", participant._id))
      .unique();
    if (existing) throw appError("INVALID_ARGUMENT", "You already locked in an answer for this round.");

    const result = score(round.prompt, round.secret, args.answer);
    await ctx.db.insert("gameAnswers", {
      roundId: round._id, sessionId: session._id, participantId: participant._id, displayName: participant.displayName,
      answer: args.answer, result, answeredAt: Date.now(),
    });
    return { answered: true };
  },
});

export const reveal = mutation({
  args: { ...auth, roundId: v.id("gameRounds") },
  handler: async (ctx, args): Promise<{ revealed: true }> => {
    const { session } = await requirePresenter(ctx, args);
    const round = await roundIn(ctx, args.roundId, session._id);
    if (round.status === "open") await closeRound(ctx, round);
    return { revealed: true };
  },
});

export const current = query({
  args: auth,
  handler: async (ctx, args): Promise<{ round: PublicRound | null; leaderboard: LeaderboardRow[] }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const latest = await ctx.db
      .query("gameRounds")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .order("desc")
      .first();

    const scores = await ctx.db.query("gameScores").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();
    const leaderboard = scores
      .map((s) => ({ participantId: s.participantId, displayName: s.displayName, points: s.points, rounds: s.rounds }))
      .sort((a, b) => b.points - a.points || a.displayName.localeCompare(b.displayName));

    if (latest === null) return { round: null, leaderboard };

    // Bounded by the session's players: one answer each.
    const answers = await ctx.db.query("gameAnswers").withIndex("by_round", (q) => q.eq("roundId", latest._id)).collect();
    const revealed = latest.status === "revealed";
    const mine = answers.find((a) => a.participantId === participant._id);
    return {
      round: {
        roundId: latest._id,
        prompt: latest.prompt,
        status: latest.status,
        startedAt: latest.startedAt,
        answered: answers.map((a) => ({ participantId: a.participantId, displayName: a.displayName })),
        mine: mine ? { answer: mine.answer, result: revealed ? mine.result : null } : null,
        secret: revealed ? (latest.secret ?? null) : null,
        answers: revealed
          ? answers
            .map((a) => ({ participantId: a.participantId, displayName: a.displayName, answer: a.answer, result: a.result }))
            .sort((a, b) => b.result.points - a.result.points)
          : null,
      },
      leaderboard,
    };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function sessionRounds(ctx: QueryCtx, sessionId: Id<"sessions">): Promise<Doc<"gameRounds">[]> {
  return await ctx.db.query("gameRounds").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
}

/** Reveals a round and adds its points to the running totals. Callers check it is open, so points land once. */
async function closeRound(ctx: MutationCtx, round: Doc<"gameRounds">): Promise<void> {
  await ctx.db.patch(round._id, { status: "revealed" });
  const answers = await ctx.db.query("gameAnswers").withIndex("by_round", (q) => q.eq("roundId", round._id)).collect();
  for (const a of answers) {
    const total = await ctx.db.query("gameScores").withIndex("by_participant", (q) => q.eq("participantId", a.participantId)).unique();
    if (total) await ctx.db.patch(total._id, { points: total.points + a.result.points, rounds: total.rounds + 1 });
    else await ctx.db.insert("gameScores", { sessionId: round.sessionId, participantId: a.participantId, displayName: a.displayName, points: a.result.points, rounds: 1 });
  }
}

/** A round from another session answers NOT_FOUND, like annotations.remove. */
async function roundIn(ctx: QueryCtx, roundId: Id<"gameRounds">, sessionId: Id<"sessions">): Promise<Doc<"gameRounds">> {
  const round = await ctx.db.get(roundId);
  if (round === null || round.sessionId !== sessionId) throw appError("NOT_FOUND", "That game round does not exist in this session.");
  return round;
}
