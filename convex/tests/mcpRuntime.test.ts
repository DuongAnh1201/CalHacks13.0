import { expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';

it('runs the actual MCP Web Standard transport in the Convex edge runtime', async () => {
  const server = new McpServer({name:'neuro-mcp',version:'0.1.0'});
  const transport = new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  await server.connect(transport);
  try {
    const response = await transport.handleRequest(new Request('https://test.convex.site/mcp', {
      method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},
      body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'edge-test',version:'1'}}})
    }));
    expect(response.status).toBe(200);
    expect((await response.json()).result.serverInfo.name).toBe('neuro-mcp');
    expect(response.headers.has('mcp-session-id')).toBe(false);
  } finally { await server.close(); }
});
