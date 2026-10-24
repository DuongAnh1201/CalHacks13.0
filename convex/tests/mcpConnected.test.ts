import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import schema from "../schema";
import type { Id } from "../_generated/dataModel";

const token = "connected-handler-test-token";
afterEach(() => vi.unstubAllEnvs());

async function connect(t: ReturnType<typeof convexTest>, agentRun?: string) {
  const paths: string[] = [];
  const client = new Client({ name: "desktop-integration-test", version: "1" });
  const transport = new StreamableHTTPClientTransport(new URL("https://test.convex.site/api/mcp"), {
    requestInit: { headers: {
      authorization: `Bearer ${token}`,
      ...(agentRun ? { "X-Neuro-Agent-Run": agentRun } : {}),
    } },
    fetch: async (input, init) => {
      const request = new Request(input, init);
      paths.push(new URL(request.url).pathname);
      expect(new URL(request.url).pathname).toBe("/api/mcp");
      // convex-test addresses our app router directly; deployment's defineApp
      // httpPrefix supplies /api in production, before the same /mcp handler.
      return t.fetch("/mcp", { method: request.method, headers: request.headers,
        body: request.method === "POST" ? await request.text() : undefined });
    },
  });
  await client.connect(transport);
  return { client, paths };
}

describe("combined /api/mcp HTTP adapter", () => {
  it("SDK tools/list includes knowledge tools AND export_document via the actual HTTP action", async () => {
    vi.stubEnv("MCP_TOKEN", token);
    const t = convexTest({ schema });
    const { client, paths } = await connect(t);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "explain_finding", "explain_structure", "export_document", "get_report", "get_tumor_metrics", "search",
      ]);
      expect(tools.find((tool) => tool.name === "export_document")?.description).toContain("session_id AND participant_token");
      const report = await client.callTool({ name: "get_tumor_metrics", arguments: { job_id: "sample" } });
      expect(report.isError).not.toBe(true);
      expect(report.structuredContent).toMatchObject({ metrics: { volumesCm3: { whole: 136.28 } } });
      expect(paths.length).toBeGreaterThan(1);
      expect(await t.run((ctx) => ctx.db.query("mcpRateLimits").collect())).toHaveLength(1);
    } finally { await client.close(); }
  });

  it("builds an export through the real handler with authenticated caller attribution", async () => {
    vi.stubEnv("MCP_TOKEN", token);
    const t = convexTest({ schema });
    const { client } = await connect(t);
    try {
      const result = await client.callTool({ name: "export_document", arguments: { job_id: "sample", format: "md", sections: ["case", "report"] } });
      expect(result.isError).not.toBe(true);
      const data = JSON.parse((result.content as { text: string }[])[0].text) as { exportId: Id<"exports">; url: string };
      expect(data.url).toMatch(/^https?:\/\//);
      await t.run(async (ctx) => {
        const row = await ctx.db.get(data.exportId);
        expect(row).toMatchObject({ status: "ready", author: "agent", authorName: "Claude Desktop", source: "mcp", trigger: "manual" });
        const file = await ctx.storage.get(row!.fileId!);
        expect(await file!.text()).toContain("whole | 136.28 | 0.94 | 0.89");
        expect(JSON.stringify(row)).not.toContain(token);
      });
    } finally { await client.close(); }
  });

  it("keeps service auth separate from private-section capabilities and trusted specialist names", async () => {
    vi.stubEnv("MCP_TOKEN", token);
    const t = convexTest({ schema });
    const { client } = await connect(t, JSON.stringify({ agentName: "Scribe", runId: "server-run" }));
    try {
      const privateResult = await client.callTool({ name: "export_document", arguments: { job_id: "sample", sections: ["conversation"] } });
      expect(privateResult.isError).toBe(true);
      expect(await t.run((ctx) => ctx.db.query("exports").collect())).toHaveLength(0);
      const publicResult = await client.callTool({ name: "export_document", arguments: { job_id: "atlas", sections: ["case", "report"] } });
      expect(publicResult.isError).not.toBe(true);
      const rows = await t.run((ctx) => ctx.db.query("exports").collect());
      expect(rows[0]).toMatchObject({ authorName: "Scribe", status: "ready" });
    } finally { await client.close(); }
  });
});
