import { defineConfig } from "vitest/config";

/**
 * Vitest config for the Convex backend.
 *
 * Vitest is the JS equivalent of JUnit + Surefire. `npm test` runs every
 * `*.test.ts` under `convex/tests/`.
 *
 * TWO SETTINGS THAT ARE NOT OPTIONAL
 * ----------------------------------
 * `environment: "edge-runtime"` — `convex-test` runs your real function code
 *   against an in-memory mock of the Convex backend, and it does so inside an
 *   environment that matches the production Convex runtime: a V8 isolate with
 *   web APIs and NO Node built-ins. If these tests ran under the default `node`
 *   environment, code that accidentally depends on `fs` or `Buffer` would pass
 *   here and fail on deploy. Running them in the edge runtime means a test that
 *   passes is evidence the code can actually run in Convex.
 *
 * `server.deps.inline: ["convex-test"]` — forces Vite to transform
 *   `convex-test` rather than loading it as an external CommonJS dependency,
 *   which it needs because it uses `import.meta.glob` to discover your Convex
 *   function modules.
 *
 * WHAT THESE TESTS DO AND DO NOT PROVE
 * ------------------------------------
 * `convex-test` executes the genuine handlers, validators, indexes and
 * transaction semantics. What it does NOT simulate is the websocket push: it has
 * no open subscriptions, so a test cannot observe "the second tab re-rendered".
 *
 * The tests therefore verify the half that can be verified here — that two
 * different participants, reading with their own credentials, observe the same
 * shared state after a presenter's write, and that the write was authorized.
 * Confirming the push itself needs a real deployment and two browser tabs; that
 * manual check is written up in docs/CONVEX_BACKEND.md and is the actual
 * Phase 1 acceptance gate.
 */
export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/tests/**/*.test.ts"],
  },
});
