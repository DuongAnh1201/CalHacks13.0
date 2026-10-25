/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as agent_anthropic from "../agent/anthropic.js";
import type * as agent_eval_cases from "../agent/eval/cases.js";
import type * as agent_eval_score from "../agent/eval/score.js";
import type * as agent_evalRunner from "../agent/evalRunner.js";
import type * as agent_guard from "../agent/guard.js";
import type * as agent_loop from "../agent/loop.js";
import type * as agent_mcpClient from "../agent/mcpClient.js";
import type * as agent_redact from "../agent/redact.js";
import type * as agent_scribe from "../agent/scribe.js";
import type * as agent_validators from "../agent/validators.js";
import type * as agent_viewerTools from "../agent/viewerTools.js";
import type * as agentPrompts from "../agentPrompts.js";
import type * as annotations from "../annotations.js";
import type * as call from "../call.js";
import type * as cursors from "../cursors.js";
import type * as exportDoc from "../exportDoc.js";
import type * as exportRecords from "../exportRecords.js";
import type * as games from "../games.js";
import type * as http from "../http.js";
import type * as jobs from "../jobs.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_author from "../lib/author.js";
import type * as lib_clinicalReport from "../lib/clinicalReport.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_env from "../lib/env.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_exportMarkdown from "../lib/exportMarkdown.js";
import type * as lib_exportReport from "../lib/exportReport.js";
import type * as lib_exportScreenshots from "../lib/exportScreenshots.js";
import type * as lib_finalSummary from "../lib/finalSummary.js";
import type * as lib_games from "../lib/games.js";
import type * as lib_meetingEnd from "../lib/meetingEnd.js";
import type * as lib_messages from "../lib/messages.js";
import type * as lib_screenshotImage from "../lib/screenshotImage.js";
import type * as lib_screenshotPolicy from "../lib/screenshotPolicy.js";
import type * as lib_summaries from "../lib/summaries.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_transform from "../lib/transform.js";
import type * as lib_viewCommands from "../lib/viewCommands.js";
import type * as mcp_annotationTools from "../mcp/annotationTools.js";
import type * as mcp_config from "../mcp/config.js";
import type * as mcp_data from "../mcp/data.js";
import type * as mcp_definitions from "../mcp/definitions.js";
import type * as mcp_exportTools from "../mcp/exportTools.js";
import type * as mcp_handler from "../mcp/handler.js";
import type * as mcp_knowledge from "../mcp/knowledge.js";
import type * as mcp_messageTools from "../mcp/messageTools.js";
import type * as mcp_rateLimit from "../mcp/rateLimit.js";
import type * as mcp_screenshotTools from "../mcp/screenshotTools.js";
import type * as mcp_server from "../mcp/server.js";
import type * as mcp_summaryTools from "../mcp/summaryTools.js";
import type * as mcp_transcriptTools from "../mcp/transcriptTools.js";
import type * as mcp_types from "../mcp/types.js";
import type * as mcpTokens from "../mcpTokens.js";
import type * as messageMcp from "../messageMcp.js";
import type * as messages from "../messages.js";
import type * as notes from "../notes.js";
import type * as presence from "../presence.js";
import type * as reportMail from "../reportMail.js";
import type * as scans from "../scans.js";
import type * as screenshots from "../screenshots.js";
import type * as seed from "../seed.js";
import type * as sessionParticipants from "../sessionParticipants.js";
import type * as sessions from "../sessions.js";
import type * as transcript from "../transcript.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  "agent/anthropic": typeof agent_anthropic;
  "agent/eval/cases": typeof agent_eval_cases;
  "agent/eval/score": typeof agent_eval_score;
  "agent/evalRunner": typeof agent_evalRunner;
  "agent/guard": typeof agent_guard;
  "agent/loop": typeof agent_loop;
  "agent/mcpClient": typeof agent_mcpClient;
  "agent/redact": typeof agent_redact;
  "agent/scribe": typeof agent_scribe;
  "agent/validators": typeof agent_validators;
  "agent/viewerTools": typeof agent_viewerTools;
  agentPrompts: typeof agentPrompts;
  annotations: typeof annotations;
  call: typeof call;
  cursors: typeof cursors;
  exportDoc: typeof exportDoc;
  exportRecords: typeof exportRecords;
  games: typeof games;
  http: typeof http;
  jobs: typeof jobs;
  "lib/auth": typeof lib_auth;
  "lib/author": typeof lib_author;
  "lib/clinicalReport": typeof lib_clinicalReport;
  "lib/email": typeof lib_email;
  "lib/env": typeof lib_env;
  "lib/errors": typeof lib_errors;
  "lib/exportMarkdown": typeof lib_exportMarkdown;
  "lib/exportReport": typeof lib_exportReport;
  "lib/exportScreenshots": typeof lib_exportScreenshots;
  "lib/finalSummary": typeof lib_finalSummary;
  "lib/games": typeof lib_games;
  "lib/meetingEnd": typeof lib_meetingEnd;
  "lib/messages": typeof lib_messages;
  "lib/screenshotImage": typeof lib_screenshotImage;
  "lib/screenshotPolicy": typeof lib_screenshotPolicy;
  "lib/summaries": typeof lib_summaries;
  "lib/tokens": typeof lib_tokens;
  "lib/transform": typeof lib_transform;
  "lib/viewCommands": typeof lib_viewCommands;
  "mcp/annotationTools": typeof mcp_annotationTools;
  "mcp/config": typeof mcp_config;
  "mcp/data": typeof mcp_data;
  "mcp/definitions": typeof mcp_definitions;
  "mcp/exportTools": typeof mcp_exportTools;
  "mcp/handler": typeof mcp_handler;
  "mcp/knowledge": typeof mcp_knowledge;
  "mcp/messageTools": typeof mcp_messageTools;
  "mcp/rateLimit": typeof mcp_rateLimit;
  "mcp/screenshotTools": typeof mcp_screenshotTools;
  "mcp/server": typeof mcp_server;
  "mcp/summaryTools": typeof mcp_summaryTools;
  "mcp/transcriptTools": typeof mcp_transcriptTools;
  "mcp/types": typeof mcp_types;
  mcpTokens: typeof mcpTokens;
  messageMcp: typeof messageMcp;
  messages: typeof messages;
  notes: typeof notes;
  presence: typeof presence;
  reportMail: typeof reportMail;
  scans: typeof scans;
  screenshots: typeof screenshots;
  seed: typeof seed;
  sessionParticipants: typeof sessionParticipants;
  sessions: typeof sessions;
  transcript: typeof transcript;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  staticHosting: import("@convex-dev/static-hosting/_generated/component.js").ComponentApi<"staticHosting">;
  presence: import("@convex-dev/presence/_generated/component.js").ComponentApi<"presence">;
  agentmail: import("@agentmail/convex/_generated/component.js").ComponentApi<"agentmail">;
};
