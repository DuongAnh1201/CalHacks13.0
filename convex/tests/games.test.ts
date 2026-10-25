/**
 * Study games: a host runs rounds, guests answer, the server scores and hides
 * the answer until the reveal. Auth for every function is in authorization.test.ts.
 */

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import { score } from "../lib/games";
import schema from "../schema";

async function expectAppError(promise: Promise<unknown>, code: AppErrorCode): Promise<AppErrorData> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    const data = (error as ConvexError<AppErrorData>).data;
    expect(data.code).toBe(code);
    return data;
  }
  throw new Error(`expected a ConvexError with code ${code}, but the call succeeded`);
}

async function setUpRoom() {
  const t = convexTest({ schema });
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Tutor" });
  const ana = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Ana" });
  const ben = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Ben" });
  const as = (p: { sessionId: typeof host.sessionId; participantToken: string }) => ({ sessionId: p.sessionId, participantToken: p.participantToken });
  return { t, host: as(host), ana: as(ana), ben: as(ben) };
}

describe("games: a which-side round", () => {
  it("hides the answer and others' choices until the reveal, then scores everyone", async () => {
    const { t, host, ana, ben } = await setUpRoom();
    const { roundId } = await t.mutation(api.games.start, {
      ...host, prompt: { kind: "whichSide", jobId: "lib-03" }, secret: { kind: "whichSide", side: "right" },
    });

    await t.mutation(api.games.answer, { ...ana, roundId, answer: { kind: "whichSide", side: "right" } });

    const open = await t.query(api.games.current, ben);
    expect(open.round?.status).toBe("open");
    expect(open.round?.secret).toBeNull();
    expect(open.round?.answers).toBeNull();
    expect(open.round?.answered.map((a) => a.displayName)).toEqual(["Ana"]); // who, not what
    expect(open.round?.mine).toBeNull();
    expect((await t.query(api.games.current, ana)).round?.mine).toEqual({ answer: { kind: "whichSide", side: "right" }, result: null });
    expect(open.leaderboard).toEqual([]); // a score change before the reveal would say who was right

    await t.mutation(api.games.answer, { ...ben, roundId, answer: { kind: "whichSide", side: "left" } });
    await t.mutation(api.games.reveal, { ...host, roundId });

    const done = await t.query(api.games.current, ben);
    expect(done.round?.secret).toEqual({ kind: "whichSide", side: "right" });
    expect(done.round?.answers?.map((a) => [a.displayName, a.result.correct, a.result.points])).toEqual([["Ana", true, 100], ["Ben", false, 0]]);
    expect(done.round?.mine?.result).toEqual({ points: 0, correct: false });
    expect(done.leaderboard.map((r) => [r.displayName, r.points, r.rounds])).toEqual([["Ana", 100, 1], ["Ben", 0, 1]]);
  });

  it("takes one answer per player, none from the host, and none after the reveal", async () => {
    const { t, host, ana, ben } = await setUpRoom();
    const { roundId } = await t.mutation(api.games.start, {
      ...host, prompt: { kind: "whichSide", jobId: "lib-03" }, secret: { kind: "whichSide", side: "left" },
    });
    await t.mutation(api.games.answer, { ...ana, roundId, answer: { kind: "whichSide", side: "left" } });
    await expectAppError(t.mutation(api.games.answer, { ...ana, roundId, answer: { kind: "whichSide", side: "right" } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.games.answer, { ...host, roundId, answer: { kind: "whichSide", side: "left" } }), "NOT_ALLOWED");
    await expectAppError(t.mutation(api.games.answer, { ...ben, roundId, answer: { kind: "bigger", pick: "A" } }), "INVALID_ARGUMENT");
    await t.mutation(api.games.reveal, { ...host, roundId });
    await expectAppError(t.mutation(api.games.answer, { ...ben, roundId, answer: { kind: "whichSide", side: "left" } }), "INVALID_ARGUMENT");
  });
});

describe("games: rounds and totals", () => {
  it("a new round closes the open one, counting its points once, and totals add up across kinds", async () => {
    const { t, host, ana } = await setUpRoom();
    const first = await t.mutation(api.games.start, {
      ...host, prompt: { kind: "bigger", jobA: "lib-01", jobB: "lib-09" }, secret: { kind: "bigger", bigger: "A", volumesCm3: [121, 13] },
    });
    await t.mutation(api.games.answer, { ...ana, roundId: first.roundId, answer: { kind: "bigger", pick: "A" } });

    const second = await t.mutation(api.games.start, { ...host, prompt: { kind: "findSlice", jobId: "sample", targetMm: [100, 70, 98] } });
    await expectAppError(t.mutation(api.games.answer, { ...ana, roundId: first.roundId, answer: { kind: "bigger", pick: "A" } }), "INVALID_ARGUMENT");
    await t.mutation(api.games.answer, { ...ana, roundId: second.roundId, answer: { kind: "findSlice", mm: [103, 74, 98] } }); // 5 mm off

    await t.mutation(api.games.reveal, { ...host, roundId: second.roundId });
    await t.mutation(api.games.reveal, { ...host, roundId: second.roundId }); // a second reveal adds nothing
    const { round, leaderboard } = await t.query(api.games.current, ana);
    expect(round?.answers?.[0].result).toEqual({ points: 90, distanceMm: 5 });
    expect(leaderboard).toEqual([expect.objectContaining({ displayName: "Ana", points: 190, rounds: 2 })]);
  });

  it("refuses malformed rounds before storing anything", async () => {
    const { t, host } = await setUpRoom();
    const bad = [
      { prompt: { kind: "whichSide" as const, jobId: "lib-03" } }, // no secret
      { prompt: { kind: "findSlice" as const, jobId: "sample", targetMm: [1, 2] } },
      { prompt: { kind: "findSlice" as const, jobId: "../etc", targetMm: [1, 2, 3] } },
      { prompt: { kind: "bigger" as const, jobA: "lib-01", jobB: "lib-01" }, secret: { kind: "bigger" as const, bigger: "A" as const, volumesCm3: [1, 2] } },
      { prompt: { kind: "beatAi" as const, jobId: "sample", slice: 1.5 } },
      { prompt: { kind: "beatAi" as const, jobId: "sample", slice: 70 }, secret: { kind: "whichSide" as const, side: "left" as const } },
    ];
    for (const args of bad) await expectAppError(t.mutation(api.games.start, { ...host, ...args }), "INVALID_ARGUMENT");
    expect((await t.query(api.games.current, host)).round).toBeNull();
  });

  it("does not let a round id from another room be answered or revealed", async () => {
    const { t, host } = await setUpRoom();
    const { roundId } = await t.mutation(api.games.start, { ...host, prompt: { kind: "beatAi", jobId: "sample", slice: 70 } });
    const scanId = await t.mutation(internal.seed.seedSampleScan, {});
    const other = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Elsewhere" });
    const guest = await t.mutation(api.sessions.join, { inviteCode: other.inviteCode, displayName: "Cara" });
    const g = { sessionId: guest.sessionId, participantToken: guest.participantToken };
    await expectAppError(t.mutation(api.games.answer, { ...g, roundId, answer: { kind: "beatAi", dice: 0.9 } }), "NOT_FOUND");
    await expectAppError(t.mutation(api.games.reveal, { sessionId: other.sessionId, participantToken: other.participantToken, roundId }), "NOT_FOUND");
  });
});

describe("games: scoring", () => {
  it("findSlice loses 2 points per mm and bottoms out at 0", () => {
    const p = { kind: "findSlice" as const, jobId: "sample", targetMm: [0, 0, 0] };
    expect(score(p, undefined, { kind: "findSlice", mm: [0, 0, 0] })).toEqual({ points: 100, distanceMm: 0 });
    expect(score(p, undefined, { kind: "findSlice", mm: [3, 4, 0] })).toEqual({ points: 90, distanceMm: 5 });
    expect(score(p, undefined, { kind: "findSlice", mm: [80, 0, 0] }).points).toBe(0);
  });

  it("beatAi clamps a client-reported Dice into 0..1", () => {
    const p = { kind: "beatAi" as const, jobId: "sample", slice: 70 };
    expect(score(p, undefined, { kind: "beatAi", dice: 0.8123 })).toEqual({ points: 81, dice: 0.812 });
    expect(score(p, undefined, { kind: "beatAi", dice: 7 })).toEqual({ points: 100, dice: 1 });
    expect(score(p, undefined, { kind: "beatAi", dice: -1 })).toEqual({ points: 0, dice: 0 });
  });
});
