import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { appError } from "./lib/errors";

const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/** Hash-only persistence. Raw Desktop credentials never cross a mutation boundary. */
export const issueRecord = internalMutation({
  args: { tokenHash: v.string(), label: v.string(), expiresAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!/^[a-f0-9]{64}$/.test(args.tokenHash) || !args.label.trim()) {
      throw appError("INVALID_ARGUMENT", "A SHA-256 hash and non-empty label are required.");
    }
    if (args.expiresAt !== undefined && (!Number.isSafeInteger(args.expiresAt) || args.expiresAt <= Date.now())) {
      throw appError("INVALID_ARGUMENT", "Expiry must be a future timestamp.");
    }
    const duplicate = await ctx.db.query("mcpTokens").withIndex("by_hash", (q) => q.eq("tokenHash", args.tokenHash)).unique();
    if (duplicate) throw appError("INVALID_ARGUMENT", "Token already exists.");
    return ctx.db.insert("mcpTokens", { ...args, label: args.label.trim(), createdAt: Date.now(), lastUsedAt: 0 });
  },
});

type IssuedToken = { id: Id<"mcpTokens">; token: string; expiresAt?: number };

/** Admin CLI: npx convex run mcpTokens:issue '{"label":"Tom Desktop","ttlDays":30}'. */
export const issue = internalAction({
  args: { label: v.string(), ttlDays: v.optional(v.number()) },
  handler: async (ctx, { label, ttlDays }): Promise<IssuedToken> => {
    if (!label.trim() || (ttlDays !== undefined && (!Number.isFinite(ttlDays) || ttlDays <= 0))) {
      throw appError("INVALID_ARGUMENT", "Supply a non-empty label and positive ttlDays when setting an expiry.");
    }
    const expiresAt = ttlDays === undefined ? undefined : Date.now() + Math.round(ttlDays * DAY_MS);
    if (expiresAt !== undefined && (!Number.isSafeInteger(expiresAt) || expiresAt <= Date.now())) {
      throw appError("INVALID_ARGUMENT", "ttlDays must produce a valid future expiry.");
    }
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const raw = "neuro_mcp_" + Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    const tokenHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const id = await ctx.runMutation(internal.mcpTokens.issueRecord, { tokenHash, label, expiresAt });
    // This response is the ONLY retrieval path. Do not log raw or add a token query.
    return { id, token: raw, ...(expiresAt === undefined ? {} : { expiresAt }) };
  },
});

export const revoke = internalMutation({
  args: { id: v.id("mcpTokens") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    if (!row) throw appError("NOT_FOUND", "MCP token not found.");
    if (row.revokedAt === undefined) await ctx.db.patch(id, { revokedAt: Date.now() });
  },
});

/** Indexed read on each Desktop request. Only the occasional touch needs a write. */
export const lookup = internalQuery({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const row = await ctx.db.query("mcpTokens").withIndex("by_hash", (q) => q.eq("tokenHash", tokenHash)).unique();
    const now = Date.now();
    if (!row || row.revokedAt !== undefined || (row.expiresAt !== undefined && row.expiresAt <= now)) return null;
    return { id: row._id, needsTouch: row.lastUsedAt === 0 || now - row.lastUsedAt >= MINUTE_MS };
  },
});

/** Rechecks validity and time in the transaction; concurrent requests cannot over-write. */
export const touch = internalMutation({
  args: { id: v.id("mcpTokens") },
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get(id);
    const now = Date.now();
    if (!row || row.revokedAt !== undefined || (row.expiresAt !== undefined && row.expiresAt <= now)) return false;
    if (row.lastUsedAt === 0 || now - row.lastUsedAt >= MINUTE_MS) await ctx.db.patch(id, { lastUsedAt: now });
    return true;
  },
});
