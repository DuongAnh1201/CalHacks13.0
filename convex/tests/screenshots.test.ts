import { convexTest } from 'convex-test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { api, internal } from '../_generated/api';
import schema from '../schema';
import { SCREENSHOT_MAX_BYTES, screenshotReason, screenshotRequest } from '../lib/screenshotPolicy';
import { viewerSchemas, toolRegistry } from '../agent/viewerTools';
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA3sAAAAASUVORK5CYII='), c => c.charCodeAt(0));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest({ schema });
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: 'Presenter' });
  const guest = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: 'Guest' });
  const scope = { jobId: 'sample', sessionId: host.sessionId, participantToken: host.participantToken };
  const file = (blob = new Blob([png], { type: 'image/png' })) => t.run(ctx => ctx.storage.store(blob));
  return { t, host, guest, scope, file };
}
async function capture(s: Awaited<ReturnType<typeof setup>>) {
  const storageId = await s.file();
  return s.t.action(api.screenshots.recordScreenshot, { ...s.scope, storageId, caption: 'Current view', reason: 'Tumor focused', width: 1, height: 1 });
}
describe('screenshot access and lifecycle', () => {
  it('records validated image metadata, no token, and permits members to list URLs', async () => {
    const s = await setup();
    expect(await s.t.mutation(api.screenshots.generateUploadUrl, s.scope)).toMatch(/^https?:/);
    const id = await capture(s);
    const row = await s.t.run(ctx => ctx.db.get(id));
    expect(row).toMatchObject({ jobId: 'sample', sessionId: s.host.sessionId, width: 1, height: 1 });
    expect(row).not.toHaveProperty('participantToken');
    const list = await s.t.query(api.screenshots.list, { ...s.scope, participantToken: s.guest.participantToken });
    expect(list).toHaveLength(1);
    expect(list[0].url).toMatch(/^https?:/);
  });
  it('only the presenter may generate or record; non-members and wrong jobs are refused', async () => {
    const s = await setup();
    for (const args of [{ ...s.scope, participantToken: s.guest.participantToken }, { ...s.scope, participantToken: 'bad' }, { ...s.scope, jobId: 'other' }]) {
      await expect(s.t.mutation(api.screenshots.generateUploadUrl, args)).rejects.toThrow();
      await expect(s.t.action(api.screenshots.recordScreenshot, { ...args, storageId: await s.file(), caption: '', reason: 'test', width: 1, height: 1 })).rejects.toThrow();
    }
    await expect(s.t.query(api.screenshots.list, { ...s.scope, participantToken: 'bad' })).rejects.toThrow();
  });
  it('enforces 30 seconds and cleans a losing concurrent upload', async () => {
    const s = await setup();
    const first = await capture(s);
    await s.t.run(ctx => ctx.db.patch(first, { takenAt: Date.now() - 29_000 }));
    await expect(s.t.mutation(api.screenshots.generateUploadUrl, s.scope)).rejects.toThrow(/30 seconds/);
    const storageId = await s.file();
    await expect(s.t.action(api.screenshots.recordScreenshot, { ...s.scope, storageId, caption: '', reason: 'test', width: 1, height: 1 })).rejects.toThrow(/30 seconds/);
    expect(await s.t.run(ctx => ctx.storage.get(storageId))).toBeNull();
    await s.t.run(ctx => ctx.db.patch(first, { takenAt: Date.now() - 30_001 }));
    await capture(s);
    expect(await s.t.query(api.screenshots.list, s.scope)).toHaveLength(2);
  });
  it('caps each meeting at 20 across clients', async () => {
    const s = await setup();
    for (let i = 0; i < 20; i++) { const id = await capture(s); await s.t.run(ctx => ctx.db.patch(id, { takenAt: Date.now() - 30_001 })); }
    await expect(s.t.mutation(api.screenshots.generateUploadUrl, s.scope)).rejects.toThrow(/20/);
  });
  it.each(['mime','bytes','signature','dimensions','reason'] as const)('deletes invalid %s uploads', async bad => {
    const s = await setup();
    let blob = new Blob([png], { type: 'image/png' });
    if (bad === 'mime') blob = new Blob([png], { type: 'image/gif' });
    if (bad === 'bytes') blob = new Blob([new Uint8Array(SCREENSHOT_MAX_BYTES + 1)], { type: 'image/png' });
    if (bad === 'signature') blob = new Blob(['JPG bytes renamed PNG'], { type: 'image/png' });
    const storageId = await s.file(blob);
    await expect(s.t.action(api.screenshots.recordScreenshot, { ...s.scope, storageId, caption: '', reason: bad === 'reason' ? 'x'.repeat(121) : 'test', width: bad === 'dimensions' ? 1281 : 1, height: 1 })).rejects.toThrow();
    expect(await s.t.run(ctx => ctx.storage.get(storageId))).toBeNull();
  });
  it('does not delete existing screenshot or export files on replay', async () => {
    const s = await setup(); const id = await capture(s);
    const row = (await s.t.run(ctx => ctx.db.get(id)))!;
    await expect(s.t.action(api.screenshots.recordScreenshot, { ...s.scope, storageId: row.storageId, caption: '', reason: 'replay', width: 1, height: 1 })).rejects.toThrow(/belongs/);
    expect(await s.t.run(async ctx => Boolean(await ctx.storage.get(row.storageId)))).toBe(true);
  });
  it('server decides fixed events without an LLM key', async () => {
    const s = await setup();
    for (const event of [{ kind: 'report', jobId: 'sample' }, { kind: 'user_text', text: 'take a screenshot' }, { kind: 'action', action: { type: 'focusTumor' } }, { kind: 'action', action: { type: 'setMode', mode: 'xray' } }]) {
      expect(await s.t.mutation(api.screenshots.requestCapture, { ...s.scope, event })).toHaveProperty('reason');
    }
    expect(await s.t.mutation(api.screenshots.requestCapture, { ...s.scope, event: { kind: 'action', action: { type: 'setMode', mode: 'whole' } } })).toBeNull();
  });
  it('run and annotation events are scoped and include explicit captures', async () => {
    const s = await setup();
    await s.t.run(async ctx => {
      await ctx.db.insert('agentRuns', { clientId: 'client', sessionId: s.scope.sessionId, jobId: 'sample', text: 'screenshot please', source: 'chat', page: 'mri', sessionVerified: true, sessionParticipantId: s.host.participantId, status: 'done', steps: [
        { id: 's', tool: 'capture_screenshot', args: { reason: 'Useful view' }, kind: 'viewer', ok: true, message: 'sent', ms: 0 },
        { id: 'm', tool: 'get_tumor_metrics', args: {}, kind: 'mcp', ok: true, message: 'metrics', ms: 0 },
      ], reply: '', agent: 'Scribe', error: null, availableTools: [], createdAt: Date.now() });
      await ctx.db.insert('annotations', { sessionId: s.scope.sessionId, jobId: 'sample', text: 'Note', anchor: { kind: 'tumor' }, status: 'accepted', author: 'human', authorName: 'Presenter', source: 'ui', createdAt: Date.now() });
    });
    const events = await s.t.query(api.screenshots.events, { ...s.scope, since: 0 });
    expect(events.map(e => e.reason).sort()).toEqual(['Annotation added','Screenshot requested','Tumor metrics requested','Useful view'].sort());
  });
  it('ignores unverified runs that merely name a session and rejects their file linkage', async () => {
    const s = await setup();
    const runId = await s.t.run(ctx => ctx.db.insert('agentRuns', {
      clientId: 'unverified', sessionId: s.scope.sessionId, jobId: 'sample', text: 'screenshot please',
      source: 'chat', page: 'mri', status: 'done', steps: [], reply: '', agent: 'Navigator', error: null,
      availableTools: [], createdAt: Date.now(),
    }));
    expect(await s.t.query(api.screenshots.events, { ...s.scope, since: 0 })).toEqual([]);
    const storageId = await s.file();
    await expect(s.t.action(api.screenshots.recordScreenshot, { ...s.scope, storageId, runId,
      caption: '', reason: 'Unverified run', width: 1, height: 1 })).rejects.toThrow(/does not match/);
    expect(await s.t.run(ctx => ctx.storage.get(storageId))).toBeNull();
  });
  it('tool schema and fixed trigger policy are page-limited', () => {
    expect(toolRegistry.capture_screenshot.pages).toEqual(['mri','3d']);
    expect(viewerSchemas.capture_screenshot.safeParse({ reason: 'x'.repeat(121) }).success).toBe(false);
    expect(screenshotReason('set_mode', { mode: 'exploded' })).toContain('exploded');
    expect(screenshotReason('set_mode', { mode: 'cutaway' })).toContain('cutaway');
    expect(screenshotReason('get_report', {})).toBe('Report requested');
    expect(screenshotReason('add_annotation', {})).toBe('Annotation added');
    expect(screenshotRequest('capture this view')).toBe(true);
  });
  it('MCP list_screenshots returns URLs to verified members and refuses invalid tokens', async () => {
    vi.stubEnv('MCP_TOKEN', 'screenshots-test-service');
    const s = await setup(); await capture(s);
    const client = new Client({ name: 'screenshot-test', version: '1' });
    await client.connect(new StreamableHTTPClientTransport(new URL('https://test.convex.site/api/mcp'), {
      requestInit: { headers: { authorization: 'Bearer screenshots-test-service' } },
      fetch: async (input, init) => { const r = new Request(input, init); return s.t.fetch('/mcp', { method: r.method, headers: r.headers, body: r.method === 'POST' ? await r.text() : undefined }); },
    }));
    try {
      expect((await client.listTools()).tools.some(t => t.name === 'list_screenshots')).toBe(true);
      const result = await client.callTool({ name: 'list_screenshots', arguments: { job_id: 'sample', session_id: s.scope.sessionId, participant_token: s.guest.participantToken } });
      expect(result.isError).not.toBe(true);
      expect(JSON.parse((result.content as { text: string }[])[0].text).screenshots[0].url).toMatch(/^https?:/);
      expect((await client.callTool({ name: 'list_screenshots', arguments: { job_id: 'sample', session_id: s.scope.sessionId, participant_token: 'bad' } })).isError).toBe(true);
    } finally { await client.close(); }
  });
});
