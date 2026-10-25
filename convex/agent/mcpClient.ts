import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { makeFunctionReference } from "convex/server";
import type { ActionCtx } from "../_generated/server";
import { fileData } from "../mcp/data";
import { config } from "../mcp/config";
import { tokenHash } from "../mcp/handler";
import { createServer } from "../mcp/server";
import { registerExportTools } from "../mcp/exportTools";
import type { McpSession } from "./loop";

const consume = makeFunctionReference<
  "mutation",
  { tokenHash: string },
  { allowed: boolean; retryAfter: number }
>("mcp/rateLimit:consume");
/** D7=A: use the same server through SDK RPC, not direct knowledge handlers. */
export async function openAgentMcp(
  ctx: ActionCtx,
  clientId: string,
  runId: string,
): Promise<McpSession> {
  const hash = await tokenHash(`agent:${clientId}`);
  const charge = async () => {
    if (!(await ctx.runMutation(consume, { tokenHash: hash })).allowed)
      throw new Error("MCP rate limit");
  };
  await charge();
  const server = createServer(
    {
      data: fileData(config.IMAGING_API_URL),
      ctx,
      caller: {
        kind: "service",
        tokenHash: hash,
        agentName: "Navigator",
        authorName: "Navigator",
        agentRunId: runId,
      },
    },
    [registerExportTools],
  );
  const client = new Client({ name: "neuro-convex-agent", version: "0.1.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const close = async () => {
    await Promise.allSettled([client.close(), server.close()]);
  };
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    await charge();
    const { tools } = await client.listTools();
    return {
      tools,
      async call(name, args) {
        await charge();
        const result = await client.callTool({ name, arguments: args });
        return {
          isError: result.isError === true,
          content: result.content,
          structuredContent: result.structuredContent,
        };
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
