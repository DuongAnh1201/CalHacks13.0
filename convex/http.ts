import { httpRouter, makeFunctionReference } from 'convex/server';
import { httpAction } from './_generated/server';
import { handleMcp } from './mcp/handler';
import { config } from './mcp/config';

const consume = makeFunctionReference<'mutation', { tokenHash: string }, { allowed: boolean; retryAfter: number }>('mcp/rateLimit:consume');
const mcp = httpAction((ctx, request) => handleMcp(request, {
  token: config.MCP_TOKEN,
  ctx,
  rateCheck: tokenHash => ctx.runMutation(consume, { tokenHash }),
}));
const http = httpRouter();
for (const method of ['POST', 'GET', 'DELETE'] as const) http.route({ path: '/mcp', method, handler: mcp });
export default http;
