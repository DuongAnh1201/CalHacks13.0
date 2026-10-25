import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('Claude Desktop stdio proxy calls the same HTTP server and file-backed answers', { timeout: process.env.MCP_INSPECTOR_CHECK ? 120000 : 20000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(),'neuro-mcp-test-'));
  const output = await build({entryPoints:['convex/mcp/handler.ts'],bundle:true,platform:'browser',format:'esm',write:false});
  const file = join(dir,'handler.mjs');
  await writeFile(file,output.outputFiles[0].text);
  const {handleMcp} = await import(pathToFileURL(file).href);
  const token='injected-stdio-test-token';
  const sessionCapability='injected-session-capability';
  const participantCapability='injected-participant-capability';
  let capabilityForwarded=false;
  const http = createServer(async (req,res)=>{
    try {
      const chunks=[];
      for await (const chunk of req) chunks.push(chunk);
      const web = new Request(`http://127.0.0.1:${http.address().port}${req.url}`,{
        method:req.method,headers:req.headers,
        ...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})
      });
      assert.equal(web.headers.get('X-Neuro-Session-Id'),sessionCapability);
      assert.equal(web.headers.get('X-Neuro-Participant-Token'),participantCapability);
      capabilityForwarded=true;
      const response=await handleMcp(web,{token,rateCheck:async()=>({allowed:true,retryAfter:0})});
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    } catch { res.writeHead(500);res.end(); }
  });
  await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const client=new Client({name:'desktop-blackbox-test',version:'1'});
  const transport=new StdioClientTransport({command:process.execPath,args:[resolve('mcp/stdio.mjs')],env:{...process.env,IMAGING_API_URL:'',MCP_TOKEN:token,NEURO_SESSION_ID:sessionCapability,NEURO_PARTICIPANT_TOKEN:participantCapability,NEURO_MCP_URL:`http://127.0.0.1:${http.address().port}/api/mcp`},stderr:'pipe'});
  let stderr='';
  transport.stderr?.on('data',chunk=>stderr+=chunk);
  try {
    await client.connect(transport);
    const tools=await client.listTools();
    assert.equal(tools.tools.length,5);
    const sample=JSON.parse(await readFile('backend/seed/sample/report.json','utf8'));
    const answer=await client.callTool({name:'get_tumor_metrics',arguments:{job_id:'sample'}});
    assert.deepEqual(answer.structuredContent.metrics.volumesCm3,sample.volumesCm3);
    assert.deepEqual(answer.structuredContent.metrics.certainty,sample.certainty);
    const atlas=await client.callTool({name:'get_report',arguments:{page:'/learn',job_id:'sample'}});
    assert.match(atlas.structuredContent.message,/no patient report/);
    assert.equal((await client.listResources()).resources[0].uri,'atlas://structures');
    assert.equal((await client.listResourceTemplates()).resourceTemplates[0].uriTemplate,'report://{jobId}');
    const report=await client.readResource({uri:'report://sample'});
    assert.deepEqual(JSON.parse(report.contents[0].text),sample);
    assert.doesNotMatch(stderr,new RegExp(token));
    assert.doesNotMatch(stderr,new RegExp(participantCapability));
    assert.equal(capabilityForwarded,true);
    if (process.env.MCP_INSPECTOR_CHECK === '1') {
      const inspectorConfig = join(dir, 'inspector.json');
      await writeFile(inspectorConfig, JSON.stringify({mcpServers:{'neuro-test':{command:process.execPath,args:[resolve('mcp/stdio.mjs')],env:{NEURO_MCP_URL:`http://127.0.0.1:${http.address().port}/api/mcp`,MCP_TOKEN:token,NEURO_SESSION_ID:sessionCapability,NEURO_PARTICIPANT_TOKEN:participantCapability}}}}));
      const run = promisify(execFile);
      const inspect = async (method, extra = []) => {
        const {stdout} = await run('npx', ['--yes','@modelcontextprotocol/inspector@2.5.0','--cli','--config',inspectorConfig,'--server','neuro-test','--method',method,'--format','json',...extra], {env:{...process.env,IMAGING_API_URL:'',MCP_TOKEN:token,NEURO_SESSION_ID:sessionCapability,NEURO_PARTICIPANT_TOKEN:participantCapability,NEURO_MCP_URL:`http://127.0.0.1:${http.address().port}/api/mcp`},timeout:60000});
        const parsed=JSON.parse(stdout);
        return parsed.result ?? parsed;
      };
      assert.equal((await inspect('tools/list')).tools.length,5);
      assert.equal((await inspect('resources/list')).resources[0].uri,'atlas://structures');
      assert.equal((await inspect('resources/templates/list')).resourceTemplates[0].uriTemplate,'report://{jobId}');
      const metrics=await inspect('tools/call',['--tool-name','get_tumor_metrics','--tool-arg','job_id=sample']);
      assert.deepEqual(metrics.structuredContent.metrics.certainty,sample.certainty);
      console.log('Inspector 2.5.0: tools, resources, templates and exact sample metrics passed.');
    }
  } finally {
    await client.close();
    http.closeAllConnections();
    await new Promise(resolve=>http.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
