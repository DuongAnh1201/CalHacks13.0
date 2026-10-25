import { httpRouter, makeFunctionReference } from 'convex/server';
import { httpAction } from './_generated/server';
import { handleMcp } from './mcp/handler';
import { config } from './mcp/config';
import { registerExportTools } from './mcp/exportTools';
import { registerAnnotationTools } from './mcp/annotationTools';
import { registerMessageTools } from './mcp/messageTools';
import { registerScreenshotTools } from './mcp/screenshotTools';
import { registerSummaryTools } from './mcp/summaryTools';
import { registerTranscriptTools } from './mcp/transcriptTools';
import { internal } from './_generated/api';

const consume = makeFunctionReference<'mutation', { tokenHash: string }, { allowed: boolean; retryAfter: number }>('mcp/rateLimit:consume');
const mcp = httpAction((ctx, request) => handleMcp(request, {
  token: config.MCP_TOKEN,
  ctx,
  authenticateUserToken: async (tokenHash) => {
    const personal = await ctx.runQuery(internal.mcpTokens.lookup, { tokenHash });
    if (!personal) return false;
    return personal.needsTouch ? ctx.runMutation(internal.mcpTokens.touch, { id: personal.id }) : true;
  },
  modules: [registerExportTools, registerAnnotationTools, registerMessageTools, registerSummaryTools, registerTranscriptTools, registerScreenshotTools],
  rateCheck: tokenHash => ctx.runMutation(consume, { tokenHash }),
}));
const http = httpRouter();
for (const method of ['POST', 'GET', 'DELETE'] as const) http.route({ path: '/mcp', method, handler: mcp });
export default http;
