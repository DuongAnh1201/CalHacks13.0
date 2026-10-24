/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as annotations from "../annotations.js";
import type * as exportDoc from "../exportDoc.js";
import type * as exportRecords from "../exportRecords.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_author from "../lib/author.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_exportMarkdown from "../lib/exportMarkdown.js";
import type * as lib_exportReport from "../lib/exportReport.js";
import type * as lib_tokens from "../lib/tokens.js";
import type * as lib_transform from "../lib/transform.js";
import type * as lib_viewCommands from "../lib/viewCommands.js";
import type * as mcp_config from "../mcp/config.js";
import type * as mcp_data from "../mcp/data.js";
import type * as mcp_definitions from "../mcp/definitions.js";
import type * as mcp_exportTools from "../mcp/exportTools.js";
import type * as mcp_handler from "../mcp/handler.js";
import type * as mcp_knowledge from "../mcp/knowledge.js";
import type * as mcp_rateLimit from "../mcp/rateLimit.js";
import type * as mcp_server from "../mcp/server.js";
import type * as mcp_types from "../mcp/types.js";
import type * as mcpTokens from "../mcpTokens.js";
import type * as messages from "../messages.js";
import type * as presence from "../presence.js";
import type * as scans from "../scans.js";
import type * as seed from "../seed.js";
import type * as sessionParticipants from "../sessionParticipants.js";
import type * as sessions from "../sessions.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  annotations: typeof annotations;
  exportDoc: typeof exportDoc;
  exportRecords: typeof exportRecords;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  "lib/author": typeof lib_author;
  "lib/errors": typeof lib_errors;
  "lib/exportMarkdown": typeof lib_exportMarkdown;
  "lib/exportReport": typeof lib_exportReport;
  "lib/tokens": typeof lib_tokens;
  "lib/transform": typeof lib_transform;
  "lib/viewCommands": typeof lib_viewCommands;
  "mcp/config": typeof mcp_config;
  "mcp/data": typeof mcp_data;
  "mcp/definitions": typeof mcp_definitions;
  "mcp/exportTools": typeof mcp_exportTools;
  "mcp/handler": typeof mcp_handler;
  "mcp/knowledge": typeof mcp_knowledge;
  "mcp/rateLimit": typeof mcp_rateLimit;
  "mcp/server": typeof mcp_server;
  "mcp/types": typeof mcp_types;
  mcpTokens: typeof mcpTokens;
  messages: typeof messages;
  presence: typeof presence;
  scans: typeof scans;
  seed: typeof seed;
  sessionParticipants: typeof sessionParticipants;
  sessions: typeof sessions;
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
};
