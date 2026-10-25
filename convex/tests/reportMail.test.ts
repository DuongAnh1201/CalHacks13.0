import { AgentMail } from "@agentmail/convex";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import schema from "../schema";

const finalize = makeFunctionReference<"action">("notes:finalizeSession");

async function expectAppError(promise: Promise<unknown>, code: AppErrorCode) {
  try { await promise; } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<AppErrorData>).data.code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

async function room() {
  const t = convexTest({ schema });
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Host" });
  await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Tom", email: "tom@example.com" });
  await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Sage", email: "sage@example.com" });
  const end = () => t.mutation(api.sessions.end, { sessionId: host.sessionId, participantToken: host.participantToken });
  const rows = () => t.run((ctx) => ctx.db.query("reportRecipients").collect());
  return { t, host, end, rows };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] }); // Keep DOCX/JSZip setImmediate real; scheduled finalizeSession stays queued.
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AGENTMAIL_API_KEY", "test-key");
  vi.stubEnv("AGENTMAIL_INBOX_ID", "inbox-1");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("report mail", () => {
  it("sends one report per recipient, once", async () => {
    const spy = vi.spyOn(AgentMail.prototype, "sendMessage").mockResolvedValue("out-1" as never);
    const { t, host, end, rows } = await room();
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.map((c) => c[1])).toEqual(["inbox-1", "inbox-1"]);
    expect(spy.mock.calls.map((c) => c[2].to).sort()).toEqual(["sage@example.com", "tom@example.com"]);
    const args = spy.mock.calls[0][2];
    expect(args.subject).toBe("Neuro Imaging Session Report — sample");
    expect(args.html).toContain("Educational visualization; not clinically validated");
    expect(args.attachments?.map((a) => a.filename)).toEqual(["report.md", "report.docx"]);
    expect(await rows()).toEqual([
      expect.objectContaining({ status: "sent", outboundId: "out-1" }),
      expect.objectContaining({ status: "sent", outboundId: "out-1" }),
    ]);
    expect((await rows()).every((r) => r.email === undefined)).toBe(true);
  });

  it("runs from finalizeSession", async () => {
    const spy = vi.spyOn(AgentMail.prototype, "sendMessage").mockResolvedValue("out-1" as never);
    const { t, host, end } = await room();
    await end();
    await t.action(finalize, { sessionId: host.sessionId });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does nothing without AgentMail env", async () => {
    vi.stubEnv("AGENTMAIL_INBOX_ID", "");
    const spy = vi.spyOn(AgentMail.prototype, "sendMessage");
    const { t, host, end, rows } = await room();
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    expect(spy).not.toHaveBeenCalled();
    expect((await rows()).map((r) => r.status)).toEqual(["pending", "pending"]);
  });

  it("keeps sending when one recipient fails", async () => {
    vi.spyOn(AgentMail.prototype, "sendMessage").mockImplementation(async (_ctx, _inbox, args) => {
      if (args.to === "tom@example.com") throw new Error("boom");
      return "out-2" as never;
    });
    const { t, host, end, rows } = await room();
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    const byEmail = await rows();
    expect(byEmail.find((r) => r.status === "failed")?.email).toBe("tom@example.com");
    expect(byEmail.filter((r) => r.status === "sent")).toHaveLength(1);
  });

  it("lets the host add an email, upserting one row", async () => {
    const { t, host, rows } = await room();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken };
    await t.mutation(api.reportMail.setMyEmail, { ...auth, email: "first@example.com" });
    await t.mutation(api.reportMail.setMyEmail, { ...auth, email: "host@example.com" });
    const mine = (await rows()).filter((r) => r.participantId === host.participantId);
    expect(mine).toMatchObject([{ email: "host@example.com", status: "pending" }]);
    await expectAppError(t.mutation(api.reportMail.setMyEmail, { ...auth, email: "nope" }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.reportMail.setMyEmail, { ...auth, participantToken: "bad", email: "host@example.com" }), "NOT_AUTHENTICATED");
  });

  it("refuses a host email after the session ended", async () => {
    const { t, host, end } = await room();
    await end();
    await expectAppError(t.mutation(api.reportMail.setMyEmail, {
      sessionId: host.sessionId, participantToken: host.participantToken, email: "host@example.com",
    }), "SESSION_ENDED");
  });

  it("never exposes addresses through public queries", async () => {
    const { t, host } = await room();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken };
    const view = await t.query(api.sessions.get, auth);
    const roster = await t.query(api.sessionParticipants.list, auth);
    expect(JSON.stringify([view, roster])).not.toContain("@example.com");
  });
});
