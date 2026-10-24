import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerKnowledge } from './knowledge';
import type { McpDependencies, ToolModule } from './types';

/** New server per request. Add registerAnnotations/Messages/Summaries/ExportTools here. */
export function createServer(deps: McpDependencies, modules: ToolModule[] = []) {
  const server = new McpServer({ name: 'neuro-mcp', version: '0.1.0' }, { instructions: 'Use only file-backed facts. Atlas mode has no patient report. Educational visualization; not clinically validated.' });
  registerKnowledge(server, deps.data);
  for (const registerModule of modules) registerModule(server, deps);
  return server;
}
