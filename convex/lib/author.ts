import { v, type Infer } from "convex/values";

/** Shared flat attribution fields; display labels are never authorization. */
export const vAuthor = v.object({
  author: v.union(v.literal("human"), v.literal("agent")),
  authorName: v.string(),
  source: v.union(v.literal("ui"), v.literal("rest"), v.literal("mcp"), v.literal("agent")),
  createdAt: v.number(),
});

export type Author = Infer<typeof vAuthor>;

/**
 * Construct ONLY after resolving a participant or authenticating an agent on
 * the server. Never expose this type as a public function's argument validator,
 * or copy author/name/source fields from a request body into it.
 */
export type ResolvedCaller =
  | { kind: "human"; displayName: string; source: "ui" | "rest" }
  | { kind: "agent"; name: string; source: "mcp" | "agent" };

/** Stamp every shared record from the server's caller, including server time. */
export function authorFor(caller: ResolvedCaller): Author {
  return {
    author: caller.kind,
    authorName: caller.kind === "human" ? caller.displayName : caller.name,
    source: caller.source,
    createdAt: Date.now(),
  };
}

/** D10: new agent notes need human acceptance; this is not an update helper. */
export function annotationFor(caller: ResolvedCaller) {
  return {
    ...authorFor(caller),
    status: caller.kind === "agent" ? "suggested" as const : "accepted" as const,
  };
}
