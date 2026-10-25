import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { AppErrorData } from "../lib/errors";
import schema from "../schema";

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ConvexError);
  await promise.catch((e: ConvexError<AppErrorData>) => expect(e.data.code).toBe(code));
}

async function room() {
  const t = convexTest({ schema });
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Judge" });
  const as = (r: { sessionId: Id<"sessions">; participantToken: string }) => ({ sessionId: r.sessionId, participantToken: r.participantToken });
  return { t, host: as(host), viewer: as(viewer), viewerId: viewer.participantId };
}

const AT = { node: "lh_cortex", localMm: [1, 2, 3] };

describe("cursors", () => {
  it("each participant writes only its own row; list excludes the caller", async () => {
    const { t, host, viewer, viewerId } = await room();
    await t.mutation(api.cursors.move, { ...viewer, cursor: AT });
    await t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, localMm: [4, 5, 6] } });
    expect(await t.query(api.cursors.list, host)).toEqual([{ participantId: viewerId, displayName: "Judge", cursor: { ...AT, localMm: [4, 5, 6] } }]);
    expect(await t.query(api.cursors.list, viewer)).toEqual([]);
    await t.mutation(api.cursors.move, { ...viewer, cursor: null });
    expect((await t.query(api.cursors.list, host))[0].cursor).toBeNull();
  });

  it("rejects bad points and node names", async () => {
    const { t, viewer } = await room();
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, localMm: [1, 2] } }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, localMm: [1, Number.NaN, 3] } }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, node: "" } }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, node: "n".repeat(129) } }), "INVALID_ARGUMENT");
  });

  it("end deletes the room's cursors and refuses later moves", async () => {
    const { t, host, viewer } = await room();
    await t.mutation(api.cursors.move, { ...viewer, cursor: AT });
    await t.mutation(api.sessions.end, host);
    expect(await t.run((ctx) => ctx.db.query("cursors").collect())).toEqual([]);
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: AT }), "SESSION_ENDED");
  });
});
