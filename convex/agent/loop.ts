import { redactToolArgs } from "./redact";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import type { ClaudeClient, ClaudeRequest } from "./anthropic";
import {
  allowedTools,
  checkReply,
  classifyHint,
  MEDICAL_REFUSAL,
  NO_KEY,
  offTopicReply,
  GENERAL_INFO_LABEL,
  type Page,
} from "./guard";
import { viewerSchemas, viewerDescriptions, toolRegistry } from "./viewerTools";
import { ROUTER_PROMPT, NAVIGATOR_PROMPT } from "../agentPrompts";

export const MODEL = "claude-opus-5-5";
export const MAX_TURNS = 6;
export interface Step {
  id: string;
  tool: string;
  args: unknown;
  ok: boolean;
  message: string;
  ms: number;
  kind: "viewer" | "mcp";
}
export interface LoopInput {
  runId: string;
  text: string;
  page: Page;
  jobId?: string;
  availableTools?: string[];
  snapshot?: unknown;
  history?: { role: "user" | "assistant"; text: string }[];
  /** Scribe's latest running note (#60); untrusted AI-written text. */
  sessionNotes?: string | null;
}
export interface McpSession {
  tools: {
    name: string;
    description?: string;
    inputSchema: { type: "object"; [key: string]: unknown };
  }[];
  call(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{
    isError?: boolean;
    content?: unknown;
    structuredContent?: unknown;
  }>;
  close(): Promise<void>;
}
export interface LoopDeps {
  client?: ClaudeClient;
  openMcp(): Promise<McpSession>;
  active(): Promise<boolean>;
  step(step: Step): Promise<void>;
  handoff(agent: "Navigator"): Promise<void>;
}
export function safeReply(reply: string) {
  return checkReply(reply).ok ? reply : MEDICAL_REFUSAL;
}
const chips: Record<Page, readonly string[]> = {
  learn: ["zoom in", "reset view", "explain the hippocampus"],
  mri: ["zoom in", "reset view", "how big is the tumor?"],
  "3d": ["zoom in", "reset view", "show the tumor"],
};
/** Conservative server-side gate: only explicit general questions get web tools. */
function generalEducation(text: string) {
  return (
    !/\b\d+(?:[.,]\d+)?\b/.test(text) &&
    /^(what (is|are)|explain|tell me about)\b/i.test(text.trim()) &&
    /\b(glioblastoma|glioma|edema|tumou?r core|enhancing tumou?r|segmentation|flair|t1|t2|mri)\b/i.test(
      text,
    ) &&
    !/\b(this|my|our|patient|scan|volume|size|side|lesion|certainty|confidence|distance|close|outline|report|dice)\b/i.test(
      text,
    )
  );
}
const asRecord = (input: unknown): Record<string, unknown> =>
  input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
function closedSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(closedSchema);
  if (schema && typeof schema === "object") {
    const next = Object.fromEntries(
      Object.entries(schema)
        .filter(([key]) => key !== "$schema")
        .map(([key, value]) => [key, closedSchema(value)]),
    );
    if (next.type === "object") next.additionalProperties = false;
    return next;
  }
  return schema;
}
export async function runLoop(input: LoopInput, deps: LoopDeps) {
  const hint = classifyHint(input.text);
  // Fixed refusal is sent verbatim; do not re-check its word "diagnose".
  if (hint === "medical")
    return { reply: MEDICAL_REFUSAL, agent: "Router", error: null };
  if (hint === "offtopic")
    return {
      reply: safeReply(offTopicReply(chips[input.page])),
      agent: "Router",
      error: null,
    };
  if (!deps.client)
    return { reply: safeReply(NO_KEY), agent: "Router", error: null };
  let mcp: McpSession | undefined;
  let agent: "Router" | "Navigator" = "Router";
  try {
    if (!(await deps.active())) return null;
    mcp = await deps.openMcp(); // SDK lists the server's tools exactly once here.
    const webAllowed = generalEducation(input.text);
    const permitted = webAllowed
      ? []
      : allowedTools(
          input.page,
          input.availableTools ?? Object.keys(toolRegistry),
          toolRegistry,
        );
    const viewerNames = permitted.filter((name) =>
      Object.hasOwn(viewerSchemas, name),
    );
    const mcpTools = mcp.tools.filter((tool) => permitted.includes(tool.name));
    const tools: (Anthropic.Tool | Anthropic.WebSearchTool20260209)[] = [
      ...viewerNames.map((name) => ({
        name,
        description: viewerDescriptions[name as keyof typeof viewerSchemas],
        input_schema: closedSchema(
          z.toJSONSchema(viewerSchemas[name as keyof typeof viewerSchemas]),
        ) as Anthropic.Tool.InputSchema,
        strict: true,
      })),
      ...mcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: closedSchema(
          tool.inputSchema,
        ) as Anthropic.Tool.InputSchema,
        strict: true,
      })),
      ...(webAllowed
        ? [
            {
              type: "web_search_20260209" as const,
              name: "web_search" as const,
              max_uses: 3,
            },
          ]
        : []),
      {
        name: "handoff_to_navigator",
        description: "Hand this navigation request to Navigator.",
        input_schema: {
          type: "object" as const,
          properties: {},
          additionalProperties: false,
        },
        strict: true,
      },
    ].sort((a, b) => a.name.localeCompare(b.name));
    // Stable prompt and sorted tools precede untrusted, explicitly labelled data.
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: JSON.stringify({
          untrusted_request: {
            text: input.text,
            history: webAllowed ? [] : (input.history ?? []),
            snapshot: webAllowed ? null : (input.snapshot ?? null),
            session_notes: webAllowed ? null : (input.sessionNotes ?? null),
          },
          context: {
            page: input.page,
            jobId: webAllowed ? null : (input.jobId ?? null),
          },
        }),
      },
    ];
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (!(await deps.active())) return null;
      const request: ClaudeRequest = {
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: "low" },
        system: [
          {
            type: "text",
            text: agent === "Router" ? ROUTER_PROMPT : NAVIGATOR_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools,
        tool_choice: { type: "auto" },
        messages: structuredClone(messages),
      };
      const modelStart = Date.now();
      const response = await deps.client.complete(request);
      if (!(await deps.active())) return null;
      let unexpectedSearch = false;
      for (const block of response.content) {
        if (block.type === "server_tool_use" && block.name === "web_search") {
          await deps.step({
            id: `${input.runId}:${turn}:${block.id}`,
            tool: "web_search",
            args: redactToolArgs(block.input),
            ok: webAllowed,
            message: webAllowed
              ? "Server web search completed."
              : "Web search is not available for scan questions.",
            ms: Math.max(0, Date.now() - modelStart),
            kind: "mcp",
          });
          if (!webAllowed) unexpectedSearch = true;
        }
      }
      if (unexpectedSearch)
        return {
          reply: safeReply(
            "Web search is not available for scan questions. Please use the report tools.",
          ),
          agent,
          error: "UNEXPECTED_SEARCH",
        };
      const calls = response.content.filter(
        (block) => block.type === "tool_use",
      );
      if (!calls.length) {
        if (response.stop_reason === "pause_turn") {
          messages.push({ role: "assistant", content: response.content });
          continue;
        }
        let reply = response.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        if (webAllowed) {
          const citations = response.content
            .filter((block) => block.type === "text")
            .flatMap((block) => block.citations ?? [])
            .filter(
              (citation) =>
                "url" in citation && /^https?:\/\//.test(citation.url),
            );
          reply = citations.length
            ? `${GENERAL_INFO_LABEL}\n${reply}\n${citations.map((citation) => ("url" in citation ? citation.url : "")).join("\n")}`
            : `${GENERAL_INFO_LABEL}. Cited general-education sources are unavailable. Please try again.`;
        }
        return {
          reply: safeReply(
            reply || "Please clarify what you want to do in the brain viewer.",
          ),
          agent,
          error: null,
        };
      }
      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        if (!(await deps.active())) return null;
        const start = Date.now();
        let ok = false,
          message: string,
          content: string;
        if (call.name === "handoff_to_navigator") {
          if (!z.object({}).strict().safeParse(call.input).success) {
            results.push({
              type: "tool_result",
              tool_use_id: call.id,
              is_error: true,
              content: "Handoff expects an empty object.",
            });
            continue;
          }
          agent = "Navigator";
          await deps.handoff(agent);
          results.push({
            type: "tool_result",
            tool_use_id: call.id,
            content: "Navigator is handling this request.",
          });
          continue;
        }
        let args = asRecord(call.input);
        let kind: "viewer" | "mcp" = Object.hasOwn(viewerSchemas, call.name)
          ? "viewer"
          : "mcp";
        if (
          !call.input ||
          typeof call.input !== "object" ||
          Array.isArray(call.input)
        ) {
          message = "Tool arguments must be an object.";
          content = message;
        } else if (!permitted.includes(call.name)) {
          message = "Tool is not available on this page.";
          content = message;
        } else if (kind === "viewer") {
          const parsed = viewerSchemas[
            call.name as keyof typeof viewerSchemas
          ].safeParse(call.input);
          if (!parsed.success) {
            message = "Invalid viewer tool arguments.";
            content = message;
          } else {
            args = parsed.data;
            ok = true;
            message = "sent to viewer";
            content = message;
          }
        } else if (!mcpTools.some((tool) => tool.name === call.name)) {
          message = "Unknown MCP tool.";
          content = message;
        } else {
          try {
            // Patient identity/page come from the run, never model-supplied args.
            if (
              [
                "get_report",
                "get_tumor_metrics",
                "explain_finding",
                "search",
              ].includes(call.name)
            ) {
              const { job_id: _job, ...rest } = args;
              args = {
                ...rest,
                ...(input.jobId ? { job_id: input.jobId } : {}),
                page: input.page === "learn" ? "learn" : "explore",
              };
            }
            if (call.name === "export_document") {
              if (input.page !== "learn" && !input.jobId)
                throw new Error("No report");
              args = {
                ...args,
                job_id: input.page === "learn" ? "atlas" : input.jobId!,
              };
            }
            const value = await mcp.call(call.name, args);
            ok = !value.isError;
            content = JSON.stringify(
              value.structuredContent ?? value.content ?? null,
            );
            message = ok ? "MCP tool completed." : "MCP tool failed.";
          } catch {
            message = "MCP tool unavailable.";
            content = message;
          }
        }
        const step: Step = {
          id: `${input.runId}:${turn}:${call.id}`,
          tool: call.name,
          args: redactToolArgs(args),
          ok,
          message,
          ms: Math.max(0, Date.now() - start),
          kind,
        };
        await deps.step(step);
        results.push({
          type: "tool_result",
          tool_use_id: call.id,
          is_error: !ok,
          content,
        });
      }
      messages.push({ role: "user", content: results });
    }
    return {
      reply: safeReply("Reached the six-turn limit. Try a shorter request."),
      agent,
      error: "TURN_LIMIT",
    };
  } catch {
    return { reply: safeReply(NO_KEY), agent, error: "AGENT_ERROR" };
  } finally {
    await mcp?.close();
  }
}
