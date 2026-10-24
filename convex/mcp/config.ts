import { env } from '../_generated/server';
/** Convex-only environment variables; never imported by the browser client. */
export const config = env as typeof env & { MCP_TOKEN?: string; IMAGING_API_URL?: string };
