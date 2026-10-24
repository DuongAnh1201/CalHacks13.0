import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from './server';
import { fileData, type KnowledgeData } from './data';
import { config } from './config';
import type { ActionCtx } from '../_generated/server';
import type { ToolModule } from './types';

export type RateCheck = (tokenHash: string) => Promise<{ allowed: boolean; retryAfter: number }>;
export async function tokenHash(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function handleMcp(request: Request, options: { token?: string; rateCheck: RateCheck; data?: KnowledgeData; ctx?: ActionCtx; modules?: ToolModule[] }) {
  // Fail closed when MCP_TOKEN has not been configured. Never log the token.
  const provided = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!options.token || !provided || await tokenHash(provided) !== await tokenHash(options.token)) {
    return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  // Non-browser MCP clients omit Origin. Browser clients must use this origin.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return new Response('Forbidden origin', { status: 403 });
  const limit = await options.rateCheck(await tokenHash(provided));
  if (!limit.allowed) return new Response('Rate limit exceeded', { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });
  // Stateless JSON response mode is part of Streamable HTTP; no long-lived SSE.
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  const server = createServer({ data: options.data ?? fileData(config.IMAGING_API_URL), caller: { kind: 'service', tokenHash: await tokenHash(provided) }, ctx: options.ctx }, options.modules);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request);
    // Consume before closing: no response stream may outlive the Convex action.
    return new Response(await response.text(), { status: response.status, headers: response.headers });
  } catch {
    return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'MCP request failed' } }, { status: 500 });
  } finally { await server.close(); }
}
