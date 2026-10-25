import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import schema from "../schema";

const sendFetch = vi.fn<typeof fetch>();

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
  vi.stubEnv("AGENTMAIL_INBOX_ID", "reports+room@example.com");
  sendFetch.mockReset().mockImplementation(async () => Response.json({ message_id: "out-1" }));
  vi.stubGlobal("fetch", sendFetch);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("report mail", () => {
  it("sends one report per recipient, once", async () => {
    const spy = sendFetch;
    const { t, host, end, rows } = await room();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken };
    await t.mutation(api.board.create, { ...auth, item: { kind: "sticky", anchor: { kind: "tumor" }, text: "Board reminder", color: "pink" } });
    const { annotationId } = await t.mutation(api.annotations.create, { ...auth, anchor: { kind: "tumor" }, text: "Comment root" });
    await t.mutation(api.annotations.reply, { ...auth, annotationId, text: "Thread reply" });
    await t.mutation(api.annotations.resolve, { ...auth, annotationId });
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      "https://api.agentmail.to/v0/inboxes/reports%2Broom%40example.com/messages/send",
      "https://api.agentmail.to/v0/inboxes/reports%2Broom%40example.com/messages/send",
    ]);
    expect(spy.mock.calls[0][1]).toMatchObject({ method: "POST", headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" } });
    expect(spy.mock.calls.map((c) => JSON.parse(c[1]!.body as string).to).sort()).toEqual(["sage@example.com", "tom@example.com"]);
    const args = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(args.text).toContain("Board reminder");
    expect(args.text).toContain("Thread reply");
    expect(args.text).toContain("resolved");
    expect(args.subject).toBe("Neuro Imaging Session Report — sample");
    expect(args.html).toContain("Educational visualization; not clinically validated");
    expect(args.attachments?.map((a: { filename: string }) => a.filename)).toEqual(["report.md", "report.docx"]);
    expect(args.attachments.map((a: { content_type: string }) => a.content_type)).toEqual(["text/markdown", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
    expect(args.attachments.every((a: object) => !("contentType" in a))).toBe(true);
    expect(atob(args.attachments[0].content)).toContain("# Neuro Imaging Session Report");
    expect(atob(args.attachments[1].content).slice(0, 2)).toBe("PK");
    expect(await rows()).toEqual([
      expect.objectContaining({ status: "sent", outboundId: "out-1" }),
      expect.objectContaining({ status: "sent", outboundId: "out-1" }),
    ]);
    expect((await rows()).every((r) => r.email === undefined)).toBe(true);
  });

  it("keeps email text unescaped while escaping the markdown attachment", async () => {
    const spy = sendFetch;
    const { t, host, end } = await room();
    await t.run(async (ctx) => {
      await ctx.db.patch(host.participantId, { displayName: "Host (learner) <notes> & malignant" });
    });
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    const args = JSON.parse(spy.mock.calls[0][1]!.body as string);
    expect(args.text).toContain("Host (learner) <notes> & [redacted]");
    expect(args.text).not.toContain("malignant");
    const md = args.attachments!.find((a: { filename: string }) => a.filename === "report.md")!;
    const text = new TextDecoder().decode(Uint8Array.from(atob(md.content!), (c) => c.charCodeAt(0)));
    expect(text).toContain(String.raw`Host \(learner\) &lt;notes&gt; &amp; \[redacted\]`);
  });

  it("runs from finalizeSession", async () => {
    const spy = sendFetch;
    const { t, host, end } = await room();
    await end();
    await t.action(finalize, { sessionId: host.sessionId });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it.each(["AGENTMAIL_INBOX_ID", "AGENTMAIL_API_KEY"])("does nothing without %s", async (name) => {
    vi.stubEnv(name, "");
    const spy = sendFetch;
    const { t, host, end, rows } = await room();
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    expect(spy).not.toHaveBeenCalled();
    expect((await rows()).map((r) => r.status)).toEqual(["pending", "pending"]);
  });

  it("keeps sending when one recipient fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    sendFetch.mockImplementation(async (_url, init) => {
      if (JSON.parse(init!.body as string).to === "tom@example.com") return new Response("upstream test-key " + "x".repeat(400), { status: 500 });
      return Response.json({ message_id: "out-2" });
    });
    const { t, host, end, rows } = await room();
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    const byEmail = await rows();
    expect(byEmail.find((r) => r.status === "failed")?.email).toBe("tom@example.com");
    expect(byEmail.filter((r) => r.status === "sent")).toHaveLength(1);
    expect(log).toHaveBeenCalledWith("reportMail: send failed", 500, expect.stringMatching(/^upstream \[redacted\] x+$/));
    expect(log.mock.calls[0][2]).toHaveLength(300);
    expect(JSON.stringify(log.mock.calls)).not.toContain("test-key");
  });

  it("marks recipients failed on a network exception without retrying", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendFetch.mockRejectedValue(new Error("network failed"));
    const { t, host, end, rows } = await room();
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    expect(sendFetch).toHaveBeenCalledTimes(2);
    expect((await rows()).map((r) => r.status)).toEqual(["failed", "failed"]);
  });

  it("loads session chat and screenshots for the report", async () => {
    const { t, host } = await room();
    await t.mutation(api.messages.send, { sessionId: host.sessionId, participantToken: host.participantToken, text: "Room chat" });
    await t.run(async (ctx) => {
      const session = (await ctx.db.get(host.sessionId))!;
      const storageId = await ctx.storage.store(new Blob(["image"], { type: "image/png" }));
      await ctx.db.insert("screenshots", { jobId: "sample", sessionId: host.sessionId, storageId, caption: "Room view", reason: "manual", width: 100, height: 100, takenAt: session._creationTime });
    });
    const loaded = await t.query(internal.reportMail.load, { sessionId: host.sessionId });
    expect(loaded?.data.messages.map((m) => m.text)).toEqual(["Room chat"]);
    expect(loaded?.data.screenshots).toMatchObject([{ caption: "Room view", url: expect.any(String) }]);
  });

  it("keeps accepted, suggested and dismissed annotations with their statuses", async () => {
    const { t, host } = await room();
    for (const status of ["accepted", "suggested", "dismissed"] as const) {
      const { annotationId } = await t.mutation(api.annotations.create, { sessionId: host.sessionId, participantToken: host.participantToken, anchor: { kind: "tumor" }, text: status });
      await t.run((ctx) => ctx.db.patch(annotationId, { status }));
    }
    const loaded = await t.query(internal.reportMail.load, { sessionId: host.sessionId });
    expect(loaded?.data.annotations.map((a) => a.status)).toEqual(["accepted", "suggested", "dismissed"]);
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
