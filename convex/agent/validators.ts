import { v } from "convex/values";
export const vAgentStep = v.object({
  id: v.string(),
  tool: v.string(),
  args: v.any(),
  ok: v.boolean(),
  message: v.string(),
  ms: v.number(),
  kind: v.union(v.literal("viewer"), v.literal("mcp")),
});
export const vHistory = v.array(
  v.object({
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(),
  }),
);
