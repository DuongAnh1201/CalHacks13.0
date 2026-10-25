import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

const clientId = "agent-panel-client-capability";
async function running(t: ReturnType<typeof convexTest>, overrides: Partial<Doc<"agentRuns">> = {}) {
  return t.run((ctx) => ctx.db.insert("agentRuns", {
    clientId, jobId: "sample", text: "Show the outline", source: "chat", page: "3d",
    status: "running", steps: [], reply: "", agent: "Navigator", error: null,
    availableTools: [], createdAt: Date.now(), ...overrides,
  }));
}
const finish = (t: ReturnType<typeof convexTest>, runId: Id<"agentRuns">, error: string | null = null, reply = "Outline shown.") =>
  t.mutation(internal.agent.finish, { runId, reply, agent: "Navigator", error });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("Agent Panel chat is separate from session chat", () => {
  it.each([null, "AGENT_ERROR"])("atomically persists two rows once on completion (%s)", async (error) => {
    const t = convexTest({ schema });
    const runId = await running(t);
    await finish(t, runId, error);
    await finish(t, runId, error, "Duplicate delivery must not replace the reply.");
    const rows = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ clientId, jobId: "sample", runId, role: "user", author: "human", authorName: "You", source: "ui", text: "Show the outline" });
    expect(rows[1]).toMatchObject({ clientId, jobId: "sample", runId, role: "assistant", author: "agent", authorName: "Navigator", source: "agent", text: "Outline shown.", toolSteps: [] });
    for (const row of rows) expect(row).not.toHaveProperty("sessionId");
    expect((await t.run((ctx) => ctx.db.get(runId)))?.status).toBe(error ? "failed" : "done");
  });

  it("never copies a run sessionId or model-supplied scope into messages", async () => {
    const t = convexTest({ schema });
    const scanId = await t.mutation(internal.seed.seedSampleScan, {});
    const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
    const human = await t.mutation(api.messages.send, { sessionId: host.sessionId, participantToken: host.participantToken, text: "Human session chat" });
    // Even an old row with both tags stays in SessionChat, outside the panel.
    await t.run((ctx) => ctx.db.patch(human.messageId, { clientId }));
    const before = await t.query(api.messages.list, { sessionId: host.sessionId, participantToken: host.participantToken, paginationOpts: { numItems: 50, cursor: null } });
    const runId = await running(t, { sessionId: host.sessionId });
    await t.mutation(internal.agent.appendStep, { runId, step: {
      id: "scope", tool: "list_messages", kind: "mcp", args: { clientId: "attacker", jobId: "other-job", session_id: host.sessionId }, ok: false, message: "Not applied", ms: 1,
    } });
    await finish(t, runId);
    const after = await t.query(api.messages.list, { sessionId: host.sessionId, participantToken: host.participantToken, paginationOpts: { numItems: 50, cursor: null } });
    expect(after).toEqual(before);
    const chat = await t.query(api.agent.listChat, { clientId, jobId: "sample", limit: 50 });
    expect(chat).toHaveLength(2);
    expect(await t.query(api.agent.listChat, { clientId: "attacker", limit: 50 })).toEqual([]);
    const persisted = await t.run((ctx) => ctx.db.query("messages").withIndex("by_client_time", (q) => q.eq("clientId", clientId)).collect());
    const runMessages = persisted.filter((row) => row.runId === runId);
    expect(runMessages).toHaveLength(2);
    for (const row of runMessages) {
      expect(row).not.toHaveProperty("sessionId");
      expect(row.jobId).toBe("sample");
    }
  });

  it.each(["queued", "running"] as const)("does not persist cancelled %s runs or late finish output", async (status) => {
    const t = convexTest({ schema });
    const runId = await running(t, { status });
    await t.mutation(api.agent.cancel, { runId, clientId });
    await finish(t, runId);
    expect(await t.run((ctx) => ctx.db.query("messages").collect())).toEqual([]);
    expect((await t.run((ctx) => ctx.db.get(runId)))?.status).toBe("cancelled");
  });

  it("uses atlas for learn without a jobId", async () => {
    const t = convexTest({ schema });
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const runId = await running(t, { page: "learn", jobId: undefined, status: "queued" });
    await t.action(internal.agent.run, { runId });
    await t.action(internal.agent.run, { runId });
    const rows = await t.query(api.agent.listChat, { clientId, jobId: "atlas", limit: 50 });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.jobId === "atlas")).toBe(true);
  });

  it.each(["mri", "3d"] as const)("skips persistence on %s without jobId while finishing the run", async (page) => {
    const t = convexTest({ schema });
    const runId = await running(t, { page, jobId: undefined });
    await finish(t, runId);
    expect(await t.run((ctx) => ctx.db.query("messages").collect())).toEqual([]);
    expect((await t.run((ctx) => ctx.db.get(runId)))?.status).toBe("done");
  });

  it("bounds long replies with an ellipsis and keeps the run/message text identical", async () => {
    const t = convexTest({ schema });
    const runId = await running(t);
    await finish(t, runId, null, "x".repeat(2500));
    const run = await t.run((ctx) => ctx.db.get(runId));
    const rows = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(run?.reply.length).toBe(2000);
    expect(run?.reply.endsWith("…")).toBe(true);
    expect(rows[1].text).toBe(run?.reply);
  });

  it("persists no pair for an empty reply", async () => {
    const t = convexTest({ schema });
    const runId = await running(t);
    await finish(t, runId, null, "   ");
    expect(await t.run((ctx) => ctx.db.query("messages").collect())).toEqual([]);
  });

  it("lists only this client's agent chat with a job filter and bounded limit", async () => {
    const t = convexTest({ schema });
    await finish(t, await running(t));
    await finish(t, await running(t, { jobId: "sample-2" }));
    await finish(t, await running(t, { clientId: "other-client" }));
    expect(await t.query(api.agent.listChat, { clientId: "other-unrelated-client", limit: 50 })).toEqual([]);
    expect(await t.query(api.agent.listChat, { clientId, limit: 50 })).toHaveLength(4);
    expect(await t.query(api.agent.listChat, { clientId, jobId: "sample", limit: 50 })).toHaveLength(2);
    const last = await t.query(api.agent.listChat, { clientId, limit: 1 });
    expect(last).toHaveLength(1);
    expect(last[0].role).toBe("assistant");
    expect(last[0]).not.toHaveProperty("clientId");
    expect(last[0]).not.toHaveProperty("sessionId");
    for (const limit of [0, 101, 1.5]) await expect(t.query(api.agent.listChat, { clientId, limit })).rejects.toThrow(/limit/);
    await expect(t.query(api.agent.listChat, { clientId: "", limit: 50 })).rejects.toThrow(/capability/);
  });

  it("persists a queued-to-failed daily-limit reply exactly once", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "injected-fake-key");
    vi.stubEnv("AGENT_DAILY_RUN_LIMIT", "0");
    const t = convexTest({ schema });
    const runId = await running(t, { status: "queued", page: "learn", jobId: undefined, spendDay: "2000-01-01", text: "Explain the hippocampus" });
    expect(await t.mutation(internal.agent.claim, { runId })).toBeNull();
    expect(await t.mutation(internal.agent.claim, { runId })).toBeNull();
    const run = await t.run((ctx) => ctx.db.get(runId));
    expect(run).toMatchObject({ status: "failed", error: "DAILY_LIMIT" });
    expect(await t.query(api.agent.listChat, { clientId, jobId: "atlas", limit: 50 })).toHaveLength(2);
  });
});

describe("step persistence-boundary redaction", () => {
  it("recursively redacts direct appendStep calls and copies only safe tool summaries", async () => {
    const t = convexTest({ schema });
    const runId = await running(t);
    const step = { id: "credentials", tool: "list_messages", kind: "mcp" as const,
      args: { participant_token: "private-participant", nested: [{ API_KEY: "private-api", Authorization: "private-header", password: "private-password", query: "allowed data" }] },
      ok: true, message: "Read room chat", ms: 12 };
    await t.mutation(internal.agent.appendStep, { runId, step });
    await t.mutation(internal.agent.appendStep, { runId, step });
    const run = await t.run((ctx) => ctx.db.get(runId));
    expect(run?.steps).toHaveLength(1);
    expect(run?.steps[0].args).toEqual({ participant_token: "[redacted]", nested: [{ API_KEY: "[redacted]", Authorization: "[redacted]", password: "[redacted]", query: "allowed data" }] });
    await finish(t, runId);
    const rows = await t.run((ctx) => ctx.db.query("messages").collect());
    expect(rows[1].toolSteps).toHaveLength(1);
    expect(rows[1].toolSteps?.[0]).not.toHaveProperty("kind");
    expect(rows[1].toolSteps?.[0].args).toEqual(run?.steps[0].args);
    expect(JSON.stringify({ run, rows })).not.toMatch(/private-participant|private-api|private-header|private-password/);
  });
});
