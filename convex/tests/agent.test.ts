import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import schema from "../schema";
import * as anthropic from "../agent/anthropic";
import { NO_KEY, MEDICAL_REFUSAL } from "../agent/guard";
import type { ClaudeResponse } from "../agent/anthropic";
import sample from "../../backend/seed/sample/report.json";
const refs = {
  ask: makeFunctionReference<"mutation">("agent:ask"),
  run: makeFunctionReference<"action">("agent:run"),
  get: makeFunctionReference<"query">("agent:getRun"),
  list: makeFunctionReference<"query">("agent:listRuns"),
  cancel: makeFunctionReference<"mutation">("agent:cancel"),
};
const args = {
  clientId: "private-client-capability-a",
  text: "zoom in",
  source: "chat" as const,
  page: "learn" as const,
};
const text = (value: string): ClaudeResponse => ({
  content: [{ type: "text", text: value, citations: null }],
  stop_reason: "end_turn",
});
const tool = (name: string, input: unknown): ClaudeResponse => ({
  content: [
    { type: "tool_use", name, input, id: "call-1", caller: { type: "direct" } },
  ],
  stop_reason: "tool_use",
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ANTHROPIC_API_KEY", "");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.clearAllTimers();
  vi.useRealTimers();
});
describe("Convex agent lifecycle", () => {
  it("inserts/schedules, finishes no-key with NO_KEY, and never constructs an SDK client", async () => {
    const t = convexTest(schema);
    const factory = vi.spyOn(anthropic, "createClaudeClient");
    const runId = await t.mutation(refs.ask, args);
    expect(
      (await t.query(refs.get, { runId, clientId: args.clientId })).status,
    ).toBe("queued");
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    const row = await t.query(refs.get, { runId, clientId: args.clientId });
    expect(row.status).toBe("done");
    expect(row.reply).toBe(NO_KEY);
    expect(row.steps).toEqual([]);
    expect(factory).not.toHaveBeenCalled();
    expect(
      await t.run((ctx) => ctx.db.query("agentDailyUsage").collect()),
    ).toHaveLength(0);
  });
  it("records a fake-client viewer call through the actual internal action", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-injected-key");
    const complete = vi
      .fn()
      .mockResolvedValueOnce(tool("zoom_view", { action: "in" }))
      .mockResolvedValueOnce(text("Zoom command sent."));
    vi.spyOn(anthropic, "createClaudeClient").mockReturnValue({ complete });
    const t = convexTest(schema);
    const runId = await t.mutation(refs.ask, args);
    await t.action(refs.run, { runId });
    const row = await t.query(refs.get, { runId, clientId: args.clientId });
    expect(row.status).toBe("done");
    expect(row.steps).toMatchObject([
      {
        tool: "zoom_view",
        kind: "viewer",
        ok: true,
        message: "sent to viewer",
      },
    ]);
    await t.action(refs.run, { runId });
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it("calls real neuro-mcp over in-memory SDK RPC and gets exact report values", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-injected-key");
    const complete = vi
      .fn()
      .mockResolvedValueOnce(tool("get_tumor_metrics", { job_id: "other-job" }))
      .mockResolvedValueOnce(text("Report facts retrieved."));
    vi.spyOn(anthropic, "createClaudeClient").mockReturnValue({ complete });
    const t = convexTest(schema);
    const runId = await t.mutation(refs.ask, {
      ...args,
      page: "3d",
      jobId: "sample",
      availableTools: ["get_tumor_metrics"],
    });
    await t.action(refs.run, { runId });
    const row = await t.query(refs.get, { runId, clientId: args.clientId });
    expect(row.steps).toMatchObject([
      { kind: "mcp", ok: true, args: { job_id: "sample" } },
    ]);
    const envelope = complete.mock.calls[1][0].messages.at(-1).content;
    expect(JSON.parse(envelope[0].content).metrics.volumesCm3).toEqual(
      sample.volumesCm3,
    );
    expect(JSON.parse(envelope[0].content).metrics.certainty).toEqual(
      sample.certainty,
    );
    const quota = await t.run((ctx) => ctx.db.query("mcpRateLimits").collect());
    expect(quota[0].count).toBe(3);
  });
  it("scopes reads and cancellation to the client capability", async () => {
    const t = convexTest(schema);
    const runId = await t.mutation(refs.ask, args);
    expect(
      await t.query(refs.get, { runId, clientId: "another-client" }),
    ).toBeNull();
    expect(await t.query(refs.list, { clientId: "another-client" })).toEqual(
      [],
    );
    expect(
      await t.mutation(refs.cancel, { runId, clientId: "another-client" }),
    ).toBe(false);
    expect(
      await t.mutation(refs.cancel, { runId, clientId: args.clientId }),
    ).toBe(true);
    await t.action(refs.run, { runId });
    expect(
      (await t.query(refs.get, { runId, clientId: args.clientId })).status,
    ).toBe("cancelled");
  });
  it("uses Guard admission for one active run and ten per rolling minute", async () => {
    const t = convexTest(schema);
    let runId = await t.mutation(refs.ask, args);
    await expect(t.mutation(refs.ask, args)).rejects.toThrow("Wait before");
    for (let n = 1; n < 10; n++) {
      await t.mutation(refs.cancel, { runId, clientId: args.clientId });
      runId = await t.mutation(refs.ask, args);
    }
    await t.mutation(refs.cancel, { runId, clientId: args.clientId });
    await expect(t.mutation(refs.ask, args)).rejects.toThrow("Wait before");
    vi.setSystemTime(Date.now() + 61000);
    expect(await t.mutation(refs.ask, args)).toBeTruthy();
  });
  it("reserves a global daily spend cap transactionally, independent of client", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-injected-key");
    vi.stubEnv("AGENT_DAILY_RUN_LIMIT", "1");
    const t = convexTest(schema);
    await t.mutation(refs.ask, args);
    await expect(
      t.mutation(refs.ask, { ...args, clientId: "client-b" }),
    ).rejects.toThrow("daily run limit");
    vi.setSystemTime(Date.now() + 86400000);
    expect(
      await t.mutation(refs.ask, { ...args, clientId: "client-b" }),
    ).toBeTruthy();
  });
  it("filters availableTools and refuses medical requests without spending", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-injected-key");
    const complete = vi.fn();
    vi.spyOn(anthropic, "createClaudeClient").mockReturnValue({ complete });
    const t = convexTest(schema);
    const runId = await t.mutation(refs.ask, {
      ...args,
      text: "Is it cancer?",
      availableTools: ["get_tumor_metrics", "zoom_view", "made_up"],
    });
    await t.action(refs.run, { runId });
    const row = await t.query(refs.get, { runId, clientId: args.clientId });
    expect(row.availableTools).toEqual(["zoom_view"]);
    expect(row.reply).toBe(MEDICAL_REFUSAL);
    expect(complete).not.toHaveBeenCalled();
    expect(
      await t.run((ctx) => ctx.db.query("agentDailyUsage").collect()),
    ).toHaveLength(0);
  });
  it("finishes safely if SDK creation fails and never persists the thrown secret", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "fake-injected-key");
    vi.spyOn(anthropic, "createClaudeClient").mockImplementation(() => {
      throw new Error("private-key-details");
    });
    const t = convexTest(schema);
    const runId = await t.mutation(refs.ask, args);
    await t.action(refs.run, { runId });
    const row = await t.query(refs.get, { runId, clientId: args.clientId });
    expect(row.status).toBe("failed");
    expect(row.reply).toBe(NO_KEY);
    expect(JSON.stringify(row)).not.toContain("private-key-details");
  });
});

it("enforces the spend cap if a key appears after a no-key request was queued", async () => {
  const t = convexTest(schema);
  const runId = await t.mutation(refs.ask, args);
  vi.stubEnv("ANTHROPIC_API_KEY", "fake-injected-key");
  vi.stubEnv("AGENT_DAILY_RUN_LIMIT", "0");
  const factory = vi.spyOn(anthropic, "createClaudeClient");
  await t.action(refs.run, { runId });
  const row = await t.query(refs.get, { runId, clientId: args.clientId });
  expect(row.status).toBe("failed");
  expect(row.error).toBe("DAILY_LIMIT");
  expect(factory).not.toHaveBeenCalled();
});
it.each(["/learn", "/mri", "/3d"] as const)(
  "normalizes %s to its canonical page",
  async (page) => {
    const t = convexTest(schema);
    const runId = await t.mutation(refs.ask, { ...args, page });
    expect(
      (await t.query(refs.get, { runId, clientId: args.clientId })).page,
    ).toBe(page.slice(1));
  },
);

it("does not persist late model output after cancellation in flight", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "fake-injected-key");
  let release!: (value: ClaudeResponse) => void;
  let markEntered!: () => void;
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve;
  });
  vi.spyOn(anthropic, "createClaudeClient").mockReturnValue({
    complete: async () => {
      markEntered();
      return new Promise<ClaudeResponse>((resolve) => {
        release = resolve;
      });
    },
  });
  const t = convexTest(schema);
  const runId = await t.mutation(refs.ask, args);
  const pending = t.action(refs.run, { runId });
  await entered;
  await t.mutation(refs.cancel, { runId, clientId: args.clientId });
  release(tool("zoom_view", { action: "in" }));
  await pending;
  const row = await t.query(refs.get, { runId, clientId: args.clientId });
  expect(row.status).toBe("cancelled");
  expect(row.reply).toBe("Cancelled.");
  expect(row.steps).toEqual([]);
});
