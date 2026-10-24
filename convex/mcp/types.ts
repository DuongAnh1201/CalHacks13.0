import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ActionCtx } from '../_generated/server';
import type { KnowledgeData } from './data';

export type AgentName = 'Claude Desktop' | 'Navigator' | 'Anatomy tutor' | 'Scribe';
export interface McpDependencies {
  data: KnowledgeData;
  /** Verified service identity. Never infer participant/session permission from it. */
  caller: {
    readonly kind: 'service';
    readonly tokenHash: string;
    /** Fixed by the authenticated adapter, never by tool arguments. */
    readonly agentName: AgentName;
    /** Alias for writers using authorFor({ kind:'agent', name:authorName, source:'mcp' }). */
    readonly authorName: AgentName;
    readonly agentRunId?: string;
  };
  /** Actual HTTP action context; omitted only for isolated knowledge-tool tests. */
  ctx?: ActionCtx;
}
export type ToolModule = (server: McpServer, deps: McpDependencies) => void;
