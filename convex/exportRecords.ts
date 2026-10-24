import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { appError } from "./lib/errors";

/** Shared by the human-button and MCP builder; never callable by a browser. */
export const setState = internalMutation({
  args: {
    exportId: v.id("exports"),
    status: v.union(v.literal("ready"), v.literal("failed")),
    fileId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.status === "ready" && !args.fileId) {
      throw appError("INVALID_ARGUMENT", "A ready export requires fileId.");
    }
    if (args.status === "failed" && !args.error?.trim()) {
      throw appError("INVALID_ARGUMENT", "A failed export requires an error message.");
    }
    const row = await ctx.db.get(args.exportId);
    if (!row) throw appError("NOT_FOUND", "Export not found.");
    if (row.status !== "pending") {
      throw appError("INVALID_ARGUMENT", "Only a pending export may change state.");
    }
    await ctx.db.patch(args.exportId, {
      status: args.status,
      fileId: args.status === "ready" ? args.fileId : undefined,
      error: args.status === "failed" ? args.error : undefined,
    });
  },
});
