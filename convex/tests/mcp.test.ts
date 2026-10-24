import { afterEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { makeFunctionReference } from 'convex/server';
import schema from '../schema';
import sample from '../../backend/seed/sample/report.json';
import sample2 from '../../backend/seed/sample-2/report.json';
import { handleMcp, tokenHash } from '../mcp/handler';
import { fileData, reportSchema, type KnowledgeData } from '../mcp/data';

const token = 'injected-test-token';
const headers = { authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-03-26' };
function request(method: string, params: unknown = {}) {
  return new Request('https://test.convex.site/mcp', { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
}
async function rpc(method: string, params: unknown = {}, data: KnowledgeData = fileData()) {
  const response = await handleMcp(request(method, params), { token, data, rateCheck: async () => ({ allowed: true, retryAfter: 0 }) });
  expect(response.status).toBe(200);
  return response.json();
}
async function tool(name: string, args: unknown, data?: KnowledgeData) {
  const response = await rpc('tools/call', { name, arguments: args }, data);
  expect(response.error).toBeUndefined();
  expect(response.result.isError).not.toBe(true);
  return response.result.structuredContent;
}
afterEach(() => vi.unstubAllEnvs());

describe('neuro-mcp tools over the real stateless SDK transport', () => {
  it('lists five snake_case tools with closed JSON schemas and both resource types', async () => {
    const { result } = await rpc('tools/list');
    expect(result.tools.map((t: {name: string}) => t.name).sort()).toEqual(['explain_finding','explain_structure','get_report','get_tumor_metrics','search']);
    for (const entry of result.tools) {
      expect(entry.name).toMatch(/^[a-z_]+$/);
      expect(entry.inputSchema.additionalProperties).toBe(false);
    }
    expect((await rpc('resources/list')).result.resources[0].uri).toBe('atlas://structures');
    expect((await rpc('resources/templates/list')).result.resourceTemplates[0].uriTemplate).toBe('report://{jobId}');
  });
  it.each([sample, sample2])('passes exact report numbers for $jobId including certainty', async report => {
    const { metrics } = await tool('get_tumor_metrics', { job_id: report.jobId });
    expect(metrics.volumesCm3).toEqual(report.volumesCm3);
    expect(metrics.certainty).toEqual(report.certainty);
    expect(metrics.expertDice).toEqual(report.expertDice);
    expect(metrics.side).toBe(report.side);
    expect(metrics.lesionCount).toBe(report.lesionCount);
    expect(metrics.sizeCm).toEqual(report.bboxMm.max.map((max, i) => (max - report.bboxMm.min[i]) / 10));
    expect((await tool('get_report', {job_id: report.jobId})).report).toEqual(report);
    expect((await tool('explain_finding', {job_id: report.jobId})).message).toContain(String(report.volumesCm3.whole));
  });
  it('has no patient report on /learn, even if a job ID was supplied', async () => {
    const readReport = vi.fn();
    for (const name of ['get_report', 'get_tumor_metrics', 'explain_finding']) {
      const output = await tool(name, { page: '/learn', job_id: 'sample' }, { readReport });
      expect(output.message).toContain('no patient report');
      expect(JSON.stringify(output)).not.toContain('136.28');
    }
    expect(readReport).not.toHaveBeenCalled();
    expect((await tool('get_tumor_metrics', {})).message).toContain('no patient report');
  });
  it('distinguishes missing reports, no tumor and unavailable certainty', async () => {
    expect((await tool('get_report', {job_id:'missing'})).message).toBe('There is no report for this case.');
    const empty = reportSchema.parse({...sample, tumorDetected:false, volumesCm3:{whole:0,core:0,enhancing:0}, lesionCount:0, side:null, bboxMm:null, centroidMm:null, certainty:{whole:null,core:null,enhancing:null}, segmentationSource:'expert'});
    const data = {readReport:async () => empty};
    const output = await tool('get_tumor_metrics',{job_id:'sample'},data);
    expect(output.message).toBe('No tumor detected in this scan');
    expect(output.metrics.sizeCm).toBeNull();
    expect(output.certaintyNote).toContain('not available');
    expect((await tool('explain_finding',{job_id:'sample'},data)).message).toBe('No tumor detected in this scan');
  });
  it('resolves atlas side/name, returns file values, searches with provenance', async () => {
    const output = await tool('explain_structure',{name:'left hippocampus',depth:'detailed'});
    expect(output.structures).toHaveLength(1);
    expect(output.structures[0].id).toBe('lh_hippocampus');
    expect(output.structures[0].whenDamaged).toBeTruthy();
    expect((await tool('explain_structure',{name:'hippocampus'})).structures).toHaveLength(2);
    expect((await tool('search',{query:'temporal',sources:['atlas']})).matches.length).toBeGreaterThan(1);
    const matches = (await tool('search',{query:'volumes',sources:['report'],job_id:'sample'})).matches;
    expect(matches.find((m:{path:string})=>m.path==='volumesCm3.whole')).toEqual({source:'report://sample',path:'volumesCm3.whole',value:sample.volumesCm3.whole});
  });
  it('reads report and atlas resources and explicitly reports unavailable cases', async () => {
    const read = async (uri: string) => JSON.parse((await rpc('resources/read',{uri})).result.contents[0].text);
    expect(await read('report://sample')).toEqual(sample);
    expect((await read('atlas://structures')).structures).toHaveLength(95);
    expect((await read('report://missing')).message).toContain('no report');
  });
  it('rejects unknown fields, unknown sources and path traversal', async () => {
    for (const args of [{job_id:'sample',extra:true},{job_id:'../../secret'}]) {
      const { result } = await rpc('tools/call',{name:'get_report',arguments:args});
      expect(result.isError).toBe(true);
    }
    expect((await rpc('tools/call',{name:'search',arguments:{query:'test',sources:['chat']}})).result.isError).toBe(true);
  });
  it('guards returned file text and does not echo unsafe search phrases', async () => {
    const data = {readReport:async () => reportSchema.parse({...sample,model:{...sample.model,name:'healthy malignant prognosis'}})};
    const report = await tool('get_report',{job_id:'sample'},data);
    expect(JSON.stringify(report)).not.toMatch(/healthy|malignant|prognosis/i);
    expect(JSON.stringify(await tool('search',{query:'healthy',sources:['atlas']}))).not.toMatch(/healthy/i);
  });
  it('fetches reports only from configured imaging service, preserving file numbers', async () => {
    const fetchMock = vi.spyOn(globalThis,'fetch').mockResolvedValue(Response.json(sample));
    try {
      expect((await fileData('https://imaging.example/').readReport('sample'))?.certainty).toEqual(sample.certainty);
      expect(String(fetchMock.mock.calls[0][0])).toBe('https://imaging.example/jobs/sample/report');
      expect(await fileData('https://imaging.example/').readReport('../bad')).toBeNull();
      fetchMock.mockResolvedValueOnce(new Response('',{status:404}));
      expect(await fileData('https://imaging.example/').readReport('missing')).toBeNull();
    } finally { fetchMock.mockRestore(); }
  });
});

describe('Convex HTTP auth and durable rate limiting', () => {
  it('401 for bad/missing/unconfigured token; invalid tokens never consume quota', async () => {
    vi.stubEnv('MCP_TOKEN',token);
    const t = convexTest(schema);
    for (const authorization of ['Bearer wrong','']) {
      const response = await t.fetch('/mcp',{method:'POST',headers:{authorization}});
      expect(response.status).toBe(401);
    }
    expect(await t.run(ctx=>ctx.db.query('mcpRateLimits').collect())).toHaveLength(0);
    vi.stubEnv('MCP_TOKEN','');
    expect((await t.fetch('/mcp',{method:'POST',headers})).status).toBe(401);
  });
  it('routes actual authenticated SDK calls and stores only the token hash', async () => {
    vi.stubEnv('MCP_TOKEN',token);
    const t = convexTest(schema);
    const response = await t.fetch('/mcp',{method:'POST',headers,body:await request('tools/call',{name:'get_tumor_metrics',arguments:{job_id:'sample'}}).text()});
    expect(response.status).toBe(200);
    expect((await response.json()).result.structuredContent.metrics.certainty).toEqual(sample.certainty);
    const rows = await t.run(ctx=>ctx.db.query('mcpRateLimits').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).toBe(await tokenHash(token));
    expect(JSON.stringify(rows)).not.toContain(token);
  });
  it('rate-limits at 120 requests/minute and resets a stale window', async () => {
    const t = convexTest(schema);
    const consume = makeFunctionReference<'mutation',{tokenHash:string},{allowed:boolean;retryAfter:number}>('mcp/rateLimit:consume');
    const hash = await tokenHash(token);
    for (let i=0;i<120;i++) expect((await t.mutation(consume,{tokenHash:hash})).allowed).toBe(true);
    expect((await t.mutation(consume,{tokenHash:hash})).allowed).toBe(false);
    vi.stubEnv('MCP_TOKEN',token);
    const response = await t.fetch('/mcp',{method:'POST',headers,body:await request('tools/list').text()});
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    await t.run(async ctx=>{ const row=(await ctx.db.query('mcpRateLimits').collect())[0]; await ctx.db.patch(row._id,{windowStart:Date.now()-61000}); });
    expect((await t.mutation(consume,{tokenHash:hash})).allowed).toBe(true);
  });
});


it('sets writer identity only from authenticated service context, never tool args', async () => {
  const captured: import('../mcp/types').McpDependencies[] = [];
  const module: import('../mcp/types').ToolModule = (_server, deps) => { captured.push(deps); };
  const options = { token, modules: [module], rateCheck: async () => ({ allowed: true, retryAfter: 0 }) };
  await handleMcp(request('tools/list'), options);
  expect(captured[0].caller.agentName).toBe('Claude Desktop');
  expect(captured[0].caller.authorName).toBe('Claude Desktop');
  const scribe = request('tools/list');
  scribe.headers.set('X-Neuro-Agent-Run', JSON.stringify({ agentName: 'Scribe', runId: 'trusted-run' }));
  await handleMcp(scribe, options);
  expect(captured[1].caller).toEqual({kind:'service',tokenHash:await tokenHash(token),agentName:'Scribe',authorName:'Scribe',agentRunId:'trusted-run'});
  const invalid = request('tools/list');
  invalid.headers.set('X-Neuro-Agent-Run', JSON.stringify({agentName:'User-supplied author',runId:'run'}));
  expect((await handleMcp(invalid,options)).status).toBe(400);
  invalid.headers.set('authorization','Bearer wrong');
  expect((await handleMcp(invalid,options)).status).toBe(401);
  expect(captured).toHaveLength(2);
  expect((await rpc('tools/call',{name:'get_report',arguments:{job_id:'sample',authorName:'Scribe'}})).result.isError).toBe(true);
});
