import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createServer } from './server';
import { fileData, type KnowledgeData } from './data';
import { config } from './config';
import type { ActionCtx } from '../_generated/server';
import type { ToolModule } from './types';
import { z } from 'zod';

export type RateCheck = (tokenHash: string) => Promise<{ allowed: boolean; retryAfter: number }>;
export async function tokenHash(token: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function handleMcp(request: Request, options: { token?: string; authenticateUserToken?: (hash: string) => Promise<boolean>; rateCheck: RateCheck; data?: KnowledgeData; ctx?: ActionCtx; modules?: ToolModule[] }) {
  // The env secret is service-only; Desktop credentials resolve by their hash.
  const provided = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!provided) return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  const hash = await tokenHash(provided);
  const isService = Boolean(options.token) && hash === await tokenHash(options.token!);
  const isDesktop = !isService && await options.authenticateUserToken?.(hash);
  if (!isService && !isDesktop) {
    return new Response('Unauthorized', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
  }
  // Non-browser MCP clients omit Origin. Browser clients must use this origin.
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return new Response('Forbidden origin', { status: 403 });
  // This header is trusted only after matching the deployment's service secret.
  // Ignore even malformed run headers on personal tokens: they are always Desktop.
  const runHeader = isService ? request.headers.get('x-neuro-agent-run') : null;
  let run: { agentName: 'Navigator' | 'Anatomy tutor' | 'Scribe'; runId: string } | undefined;
  if (runHeader) {
    try {
      run = z.object({ agentName: z.enum(['Navigator', 'Anatomy tutor', 'Scribe']), runId: z.string().min(1).max(128) }).strict().parse(JSON.parse(runHeader));
    } catch { return new Response('Invalid agent run header', { status: 400 }); }
  }
  const limit = await options.rateCheck(hash);
  if (!limit.allowed) return new Response('Rate limit exceeded', { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } });
  // Stateless JSON response mode is part of Streamable HTTP; no long-lived SSE.
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  const server = createServer({ data: options.data ?? fileData(config.IMAGING_API_URL), caller: { kind: isService ? 'service' : 'user', tokenHash: hash, agentName: run?.agentName ?? 'Claude Desktop', authorName: run?.agentName ?? 'Claude Desktop', ...(run ? { agentRunId: run.runId } : {}) }, ctx: options.ctx, sessionCapability: {
    sessionId: request.headers.get('x-neuro-session-id') ?? undefined,
    participantToken: request.headers.get('x-neuro-participant-token') ?? undefined,
  } }, options.modules);
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
