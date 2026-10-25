import Anthropic from "@anthropic-ai/sdk";
export type ClaudeRequest = Anthropic.MessageCreateParamsNonStreaming;
export type ClaudeResponse = Pick<Anthropic.Message, "content" | "stop_reason">;
export interface ClaudeClient {
  complete(request: ClaudeRequest): Promise<ClaudeResponse>;
}
/** Server-only adapter; tests inject a fake ClaudeClient instead of calling the API. */
export function createClaudeClient(apiKey: string): ClaudeClient {
  const client = new Anthropic({ apiKey, timeout: 20000, maxRetries: 0 });
  return { complete: (request) => client.messages.create(request) };
}
