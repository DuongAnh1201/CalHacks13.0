import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ActionCtx } from '../_generated/server';
import type { KnowledgeData } from './data';

export interface McpDependencies {
  data: KnowledgeData;
  /** Verified service identity. Never infer participant/session permission from it. */
  caller: { kind: 'service'; tokenHash: string };
  /** Actual HTTP action context; omitted only for isolated knowledge-tool tests. */
  ctx?: ActionCtx;
}
export type ToolModule = (server: McpServer, deps: McpDependencies) => void;
