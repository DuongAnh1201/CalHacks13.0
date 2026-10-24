#!/usr/bin/env node
/** Thin stdio-to-Convex proxy: no local knowledge store or duplicated tool logic. */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ListResourcesRequestSchema, ListResourceTemplatesRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';

async function main() {
  if (!process.env.MCP_URL || !process.env.MCP_TOKEN) throw new Error('Set MCP_URL and MCP_TOKEN in the local client environment.');
  const url = new URL(process.env.MCP_URL);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('MCP_URL must use HTTPS (HTTP allowed only for local testing).');
  const remote = new Client({ name:'neuro-mcp-stdio', version:'0.1.0' });
  await remote.connect(new StreamableHTTPClientTransport(url, { requestInit:{ headers:{ Authorization:`Bearer ${process.env.MCP_TOKEN}` } } }));
  const server = new Server({ name:'neuro-mcp',version:'0.1.0' }, { capabilities:{tools:{},resources:{}} });
  server.setRequestHandler(ListToolsRequestSchema, req=>remote.listTools(req.params));
  server.setRequestHandler(CallToolRequestSchema, req=>remote.callTool(req.params));
  server.setRequestHandler(ListResourcesRequestSchema, req=>remote.listResources(req.params));
  server.setRequestHandler(ListResourceTemplatesRequestSchema, req=>remote.listResourceTemplates(req.params));
  server.setRequestHandler(ReadResourceRequestSchema, req=>remote.readResource(req.params));
  let closing=false;
  const close=async()=>{ if(closing)return; closing=true; await server.close(); await remote.close(); };
  process.on('SIGINT',()=>void close());
  process.on('SIGTERM',()=>void close());
  process.stdin.on('end',()=>void close());
  await server.connect(new StdioServerTransport());
}
main().catch(()=>{ console.error('neuro-mcp could not connect. Check MCP_URL, MCP_TOKEN and server availability.'); process.exitCode=1; });
