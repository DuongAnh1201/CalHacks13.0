import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { internal } from "../_generated/api";
import { tokenHash } from "../mcp/handler";
import schema from "../schema";

function call(t: ReturnType<typeof convexTest>, token: string, runHeader?: string, method = "tools/list", params: unknown = {}) {
  return t.fetch("/mcp", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      ...(runHeader === undefined ? {} : { "X-Neuro-Agent-Run": runHeader }) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}
async function exportAs(t: ReturnType<typeof convexTest>, token: string, header?: string) {
  const response = await call(t, token, header, "tools/call", { name: "export_document", arguments: { job_id: "sample", sections: ["case", "report"] } });
  expect(response.status).toBe(200);
  const { result } = await response.json();
  expect(result.isError).not.toBe(true);
  return JSON.parse(result.content[0].text) as { exportId: string };
}
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("personal MCP token lifecycle", () => {
  it("issues a high-entropy token once and stores only SHA-256 plus metadata", async () => {
    const t = convexTest({ schema });
    const issued = await t.action(internal.mcpTokens.issue, { label: " Tom Desktop ", ttlDays: 30 });
    expect(issued.token).toMatch(/^neuro_mcp_[a-f0-9]{64}$/);
    const rows = await t.run((ctx) => ctx.db.query("mcpTokens").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "Tom Desktop", tokenHash: await tokenHash(issued.token), lastUsedAt: 0 });
    expect(rows[0].expiresAt! - rows[0].createdAt).toBeGreaterThan(29 * 86_400_000);
    expect(rows[0].expiresAt).toBe(issued.expiresAt);
    expect(JSON.stringify(rows)).not.toContain(issued.token);
    expect(Object.keys(rows[0]).sort()).toEqual(["_creationTime", "_id", "createdAt", "expiresAt", "label", "lastUsedAt", "tokenHash"]);
    const second = await t.action(internal.mcpTokens.issue, { label: "Other Desktop" });
    expect(second.token).not.toBe(issued.token);
    expect((await t.run((ctx) => ctx.db.get(second.id)))?.expiresAt).toBeUndefined();
  });

  it("rejects blank labels and invalid expiry durations before storing anything", async () => {
    const t = convexTest({ schema });
    await expect(t.action(internal.mcpTokens.issue, { label: " " })).rejects.toThrow(/label/);
    for (const ttlDays of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      await expect(t.action(internal.mcpTokens.issue, { label: "Desktop", ttlDays })).rejects.toThrow(/ttlDays/);
    }
    expect(await t.run((ctx) => ctx.db.query("mcpTokens").collect())).toHaveLength(0);
  });

  it("authenticates Desktop without an env secret and keys quota by its hash", async () => {
    vi.stubEnv("MCP_TOKEN", "");
    const t = convexTest({ schema });
    const issued = await t.action(internal.mcpTokens.issue, { label: "Tom Desktop" });
    const response = await call(t, issued.token);
    expect(response.status).toBe(200);
    expect((await response.json()).result.tools.some((tool: { name: string }) => tool.name === "export_document")).toBe(true);
    const counters = await t.run((ctx) => ctx.db.query("mcpRateLimits").collect());
    expect(counters).toHaveLength(1);
    expect(counters[0].tokenHash).toBe(await tokenHash(issued.token));
    expect(JSON.stringify(counters)).not.toContain(issued.token);
    expect((await t.run((ctx) => ctx.db.get(issued.id)))!.lastUsedAt).toBeGreaterThan(0);
  });

  it.each([JSON.stringify({ agentName: "Scribe", runId: "spoofed" }), "{malformed run header"])(
    "ignores a Desktop run header and always writes Claude Desktop (%s)", async (header) => {
      vi.stubEnv("MCP_TOKEN", "in-app-service-test-secret");
      const t = convexTest({ schema });
      // Even a label that looks like a specialist does not become attribution.
      const issued = await t.action(internal.mcpTokens.issue, { label: "Navigator" });
      await exportAs(t, issued.token, header);
      const exports = await t.run((ctx) => ctx.db.query("exports").collect());
      expect(exports).toHaveLength(1);
      expect(exports[0]).toMatchObject({ author: "agent", authorName: "Claude Desktop", source: "mcp", status: "ready" });
      expect(JSON.stringify(exports)).not.toContain(issued.token);
    },
  );

  it("revokes immediately, idempotently, before rate consumption", async () => {
    const t = convexTest({ schema });
    const issued = await t.action(internal.mcpTokens.issue, { label: "Revoked Desktop" });
    expect((await call(t, issued.token)).status).toBe(200);
    await t.mutation(internal.mcpTokens.revoke, { id: issued.id });
    const revokedAt = (await t.run((ctx) => ctx.db.get(issued.id)))!.revokedAt;
    await t.mutation(internal.mcpTokens.revoke, { id: issued.id });
    expect((await t.run((ctx) => ctx.db.get(issued.id)))!.revokedAt).toBe(revokedAt);
    const before = await t.run((ctx) => ctx.db.query("mcpRateLimits").collect());
    const denied = await call(t, issued.token);
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toBe("Bearer");
    expect(await denied.text()).not.toContain(issued.token);
    expect(await t.run((ctx) => ctx.db.query("mcpRateLimits").collect())).toEqual(before);
    expect(await t.mutation(internal.mcpTokens.touch, { id: issued.id })).toBe(false);
  });

  it("rejects an expired token at the exact expiry boundary", async () => {
    const t = convexTest({ schema });
    const issued = await t.action(internal.mcpTokens.issue, { label: "Expiring Desktop", ttlDays: 1 });
    const clock = vi.spyOn(Date, "now");
    clock.mockReturnValue(issued.expiresAt! - 1);
    expect((await call(t, issued.token)).status).toBe(200);
    clock.mockReturnValue(issued.expiresAt!);
    expect((await call(t, issued.token)).status).toBe(401);
    expect(await t.mutation(internal.mcpTokens.touch, { id: issued.id })).toBe(false);
  });

  it("updates usage at most once per minute and skips touch between updates", async () => {
    const t = convexTest({ schema });
    const issued = await t.action(internal.mcpTokens.issue, { label: "Active Desktop" });
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const hash = await tokenHash(issued.token);
    expect((await t.query(internal.mcpTokens.lookup, { tokenHash: hash }))?.needsTouch).toBe(true);
    expect((await call(t, issued.token)).status).toBe(200);
    expect((await t.run((ctx) => ctx.db.get(issued.id)))!.lastUsedAt).toBe(now);
    clock.mockReturnValue(now + 59_999);
    expect((await t.query(internal.mcpTokens.lookup, { tokenHash: hash }))?.needsTouch).toBe(false);
    expect((await call(t, issued.token)).status).toBe(200);
    await t.mutation(internal.mcpTokens.touch, { id: issued.id });
    expect((await t.run((ctx) => ctx.db.get(issued.id)))!.lastUsedAt).toBe(now);
    clock.mockReturnValue(now + 60_000);
    expect((await call(t, issued.token)).status).toBe(200);
    expect((await t.run((ctx) => ctx.db.get(issued.id)))!.lastUsedAt).toBe(now + 60_000);
    clock.mockReturnValue(now + 60_001);
    await t.mutation(internal.mcpTokens.touch, { id: issued.id });
    expect((await t.run((ctx) => ctx.db.get(issued.id)))!.lastUsedAt).toBe(now + 60_000);
  });

  it("keeps service run headers and independent hash-keyed quotas unchanged", async () => {
    const service = "in-app-service-test-secret";
    vi.stubEnv("MCP_TOKEN", service);
    const t = convexTest({ schema });
    const issued = await t.action(internal.mcpTokens.issue, { label: "Desktop" });
    await exportAs(t, service, JSON.stringify({ agentName: "Scribe", runId: "in-app-run" }));
    await exportAs(t, issued.token, JSON.stringify({ agentName: "Navigator", runId: "ignored" }));
    const exports = await t.run((ctx) => ctx.db.query("exports").collect());
    expect(exports.map((row) => row.authorName)).toEqual(["Scribe", "Claude Desktop"]);
    const counters = await t.run((ctx) => ctx.db.query("mcpRateLimits").collect());
    expect(counters.map((row) => row.tokenHash).sort()).toEqual([await tokenHash(service), await tokenHash(issued.token)].sort());
    expect((await call(t, service, "{invalid")).status).toBe(400);
    const serialized = JSON.stringify({ exports, counters, tokens: await t.run((ctx) => ctx.db.query("mcpTokens").collect()) });
    expect(serialized).not.toContain(service);
    expect(serialized).not.toContain(issued.token);
  });

  it("does not turn Desktop authentication into private session authority", async () => {
    const t = convexTest({ schema });
    const issued = await t.action(internal.mcpTokens.issue, { label: "Desktop" });
    const response = await call(t, issued.token, undefined, "tools/call", { name: "export_document", arguments: { job_id: "sample", sections: ["conversation"] } });
    expect(response.status).toBe(200);
    expect((await response.json()).result.isError).toBe(true);
    expect(await t.run((ctx) => ctx.db.query("exports").collect())).toHaveLength(0);
  });
});
