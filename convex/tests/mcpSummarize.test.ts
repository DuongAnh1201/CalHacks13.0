import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { api, internal } from "../_generated/api";
import * as anthropic from "../agent/anthropic";
import schema from "../schema";

const token = "summarize-mcp-test-token";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

async function setUp(withKey: boolean) {
  vi.stubEnv("MCP_TOKEN", token);
  vi.stubEnv("ANTHROPIC_API_KEY", withKey ? "k" : "");
  const complete = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "Note: they looked at the tumor.", citations: null }], stop_reason: "end_turn" });
  vi.spyOn(anthropic, "createClaudeClient").mockReturnValue({ complete });
  const t = convexTest(schema);
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  await t.mutation(api.annotations.create, { sessionId: host.sessionId, participantToken: host.participantToken, text: "Look at this", anchor: { kind: "structure", id: "lh_hippocampus" } });
  const client = new Client({ name: "summarize-test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL("https://test.convex.site/api/mcp"), {
    requestInit: { headers: { authorization: `Bearer ${token}` } },
    fetch: async (input, init) => {
      const r = new Request(input, init);
      return t.fetch("/mcp", { method: r.method, headers: r.headers, body: r.method === "POST" ? await r.text() : undefined });
    },
  }));
  const cap = { session_id: host.sessionId, participant_token: host.participantToken };
  const call = async (args: Record<string, unknown>) => client.callTool({ name: "summarize", arguments: args });
  return { t, client, cap, call, complete };
}
const body = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0].text);

describe("summarize MCP tool", () => {
  it("creates the session note, then reports since_last as unchanged", async () => {
    const { client, cap, call, complete } = await setUp(true);
    const first = body(await call({ job_id: "sample", scope: "session", ...cap }));
    expect(first).toMatchObject({ status: "updated", version: 1, text: "Note: they looked at the tumor." });
    expect(first.notice).toMatch(/untrusted/i);
    const again = body(await call({ job_id: "sample", scope: "since_last", ...cap }));
    expect(again).toMatchObject({ unchanged: true, version: 1 });
    expect(again.text).toBeUndefined();
    expect(complete).toHaveBeenCalledTimes(1);
    await client.close();
  });

  it("refuses wrong tokens, wrong job, missing capability; no key writes nothing", async () => {
    const { t, client, cap, call } = await setUp(false);
    expect((await call({ job_id: "sample", scope: "session", session_id: cap.session_id, participant_token: "nope" })).isError).toBe(true);
    expect((await call({ job_id: "other", scope: "session", ...cap })).isError).toBe(true);
    expect((await call({ job_id: "sample", scope: "session" })).isError).toBe(true);
    const nokey = body(await call({ job_id: "sample", scope: "session", ...cap }));
    expect(nokey).toMatchObject({ status: "no_key", version: 0 });
    expect(await t.run((ctx) => ctx.db.query("sessionSummaries").collect())).toHaveLength(0);
    await client.close();
  });
});
