import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ActionCtx } from '../_generated/server';
import type { KnowledgeData } from './data';

export type AgentName = 'Claude Desktop' | 'Navigator' | 'Anatomy tutor' | 'Scribe';
export interface McpDependencies {
  data: KnowledgeData;
  /** Verified service or Desktop identity; neither implies session membership. */
  caller: {
    readonly kind: 'service' | 'user';
    readonly tokenHash: string;
    /** Fixed by the authenticated adapter, never by tool arguments. */
    readonly agentName: AgentName;
    /** Alias for writers using authorFor({ kind:'agent', name:authorName, source:'mcp' }). */
    readonly authorName: AgentName;
    readonly agentRunId?: string;
  };
  /** Actual HTTP action context; omitted only for isolated knowledge-tool tests. */
  ctx?: ActionCtx;
  /** Untrusted request capabilities: shared message helpers validate membership/job. */
  sessionCapability?: { sessionId?: string; participantToken?: string };
}
export type ToolModule = (server: McpServer, deps: McpDependencies) => void;
