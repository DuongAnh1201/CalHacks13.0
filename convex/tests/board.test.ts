import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MAX_STROKE_POINTS } from "../board";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import schema from "../schema";

async function expectAppError(promise: Promise<unknown>, code: AppErrorCode): Promise<AppErrorData> {
  try { await promise; } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    const data = (error as ConvexError<AppErrorData>).data;
    expect(data.code).toBe(code);
    return data;
  }
  throw new Error(`expected ${code}`);
}

async function setUpRoom() {
  const t = convexTest({ schema });
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: host.inviteCode, displayName: "Judge" });
  const other = await t.mutation(api.sessions.join, { email: "o@example.com", inviteCode: host.inviteCode, displayName: "Other" });
  const asHost = { sessionId: host.sessionId, participantToken: host.participantToken };
  const asViewer = { sessionId: viewer.sessionId, participantToken: viewer.participantToken };
  const asOther = { sessionId: other.sessionId, participantToken: other.participantToken };
  return { t, scanId, asHost, asViewer, asOther };
}

const anchor = { kind: "point" as const, ras_mm: [10, -20, 5] };
const sticky = { kind: "sticky" as const, anchor, text: "Check T2", color: "yellow" as const };
const stroke = (n = 2) => ({
  kind: "stroke" as const, camera: { position: [0, 0, 300], target: [0, 0, 0] },
  points: Array.from({ length: n * 2 }, (_, i) => (i % 10) / 10), color: "#ff0000", width: 3, mode: "pen" as const,
});

describe("board", () => {
  it("a sticky one member creates is listed for the others", async () => {
    const { t, asHost, asViewer } = await setUpRoom();
    const { itemId } = await t.mutation(api.board.create, { ...asViewer, item: sticky });
    const rows = await t.query(api.board.list, asHost);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ itemId, item: sticky, authorName: "Judge", mine: false, canRemove: true });
    const mine = await t.query(api.board.list, asViewer);
    expect(mine[0]).toMatchObject({ mine: true, canRemove: true });
  });

  it("any member edits; a stale expectedUpdatedAt is rejected", async () => {
    const { t, asViewer, asOther } = await setUpRoom();
    const { itemId, updatedAt } = await t.mutation(api.board.create, { ...asViewer, item: sticky });
    const r = await t.mutation(api.board.update, { ...asOther, itemId, expectedUpdatedAt: updatedAt, patch: { text: "Edited" } });
    expect(r.updatedAt).toBeGreaterThanOrEqual(updatedAt);
    await expectAppError(t.mutation(api.board.update, { ...asViewer, itemId, expectedUpdatedAt: updatedAt - 1, patch: { color: "pink" } }), "STALE");
    expect((await t.query(api.board.list, asViewer))[0].item).toMatchObject({ text: "Edited", color: "yellow" });
  });

  it("only the author or the host removes", async () => {
    const { t, asHost, asViewer, asOther } = await setUpRoom();
    const a = await t.mutation(api.board.create, { ...asViewer, item: sticky });
    await expectAppError(t.mutation(api.board.remove, { ...asOther, itemId: a.itemId }), "NOT_ALLOWED");
    await t.mutation(api.board.remove, { ...asHost, itemId: a.itemId });
    const b = await t.mutation(api.board.create, { ...asViewer, item: sticky });
    await expectAppError(t.mutation(api.board.remove, { ...asViewer, itemId: b.itemId, expectedUpdatedAt: b.updatedAt - 1 }), "STALE");
    await t.mutation(api.board.remove, { ...asViewer, itemId: b.itemId, expectedUpdatedAt: b.updatedAt });
    expect(await t.query(api.board.list, asHost)).toHaveLength(0);
  });

  it("validates text, color, stroke shape and anchor", async () => {
    const { t, asViewer } = await setUpRoom();
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...sticky, text: "  " } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...sticky, text: "x".repeat(281) } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...stroke(), color: "red" } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...stroke(), width: 40 } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...stroke(), points: [0.1, 0.2, 0.3] } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...stroke(), points: [0.1, 1.5] } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: stroke(MAX_STROKE_POINTS + 1) }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...sticky, anchor: { kind: "point", ras_mm: [0, 0, 999] } } }), "INVALID_ARGUMENT");
  });

  it("strokes cannot be updated", async () => {
    const { t, asViewer } = await setUpRoom();
    const s = await t.mutation(api.board.create, { ...asViewer, item: stroke() });
    await expectAppError(t.mutation(api.board.update, { ...asViewer, itemId: s.itemId, expectedUpdatedAt: s.updatedAt, patch: { text: "x" } }), "INVALID_ARGUMENT");
  });

  it("an id from another session is NOT_FOUND", async () => {
    const { t, scanId, asViewer } = await setUpRoom();
    const other = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Elsewhere" });
    const s = await t.mutation(api.board.create, { ...asViewer, item: sticky });
    await expectAppError(t.mutation(api.board.remove, { sessionId: other.sessionId, participantToken: other.participantToken, itemId: s.itemId }), "NOT_FOUND");
  });
});


describe("board bounds", () => {
  it("enforces the total and stroke caps without blocking non-strokes at the stroke cap", async () => {
    const { t, asViewer } = await setUpRoom();
    const { itemId } = await t.mutation(api.board.create, { ...asViewer, item: stroke() });
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...row } = (await ctx.db.get(itemId))!;
      for (let i = 1; i < 300; i++) await ctx.db.insert("boardItems", row);
    });
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: stroke() }), "INVALID_ARGUMENT");
    const text = await t.mutation(api.board.create, { ...asViewer, item: { kind: "text", anchor, text: "Still allowed" } });
    await t.run(async (ctx) => {
      const { _id, _creationTime, ...row } = (await ctx.db.get(text.itemId))!;
      for (let i = 301; i < 500; i++) await ctx.db.insert("boardItems", row);
    });
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: sticky }), "INVALID_ARGUMENT");
    expect(await t.query(api.board.list, asViewer)).toHaveLength(500);
  });

  it("requires membership for reads and writes", async () => {
    const { t, asViewer } = await setUpRoom();
    const auth = { ...asViewer, participantToken: "invalid" };
    await expectAppError(t.query(api.board.list, auth), "NOT_AUTHENTICATED");
    await expectAppError(t.mutation(api.board.create, { ...auth, item: sticky }), "NOT_AUTHENTICATED");
  });
});
