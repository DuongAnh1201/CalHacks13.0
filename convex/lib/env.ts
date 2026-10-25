/**
 * Deployment environment variables (`npx convex env set NAME value`).
 *
 * Convex exposes them on `process.env` at runtime, but this tsconfig has no
 * Node types (the runtime is not Node), so the one global is declared here
 * instead of pulling in @types/node for every file.
 */
declare const process: { env: Record<string, string | undefined> };

/** The variable's value, or undefined when unset or empty. */
export function env(name: string): string | undefined {
  return process.env[name] || undefined;
}
