# Convex agent core (#67)

No frontend code is changed here. Browser integration and shared-reducer validation belong to Ben's #64; messages persistence belongs to #58. Viewer results in this phase mean **sent to viewer**, not applied or validated against the browser state.

## Browser contract

`agent.ask({clientId, text, source, page, sessionId?, jobId?, availableTools?, snapshot?, history?})` returns an `Id<"agentRuns">`. `source` is `chat`, `voice` or `text`. Canonical pages are `learn`, `mri`, `3d`; `/learn`, `/mri`, `/3d` are accepted at the boundary and normalized. A request may contain up to 2000 text characters, a 20 KB JSON snapshot and 10 history entries of up to 2000 characters each. Historical roles/text and snapshot values are untrusted data, not system instructions.

Subscribe with `agent.getRun({runId, clientId})`; `agent.listRuns({clientId})` returns the latest 50. `agent.cancel({runId, clientId})` stops queued work and prevents late results/steps from changing a cancelled run. Treat clientId as an unguessable private browser capability; these endpoints do not establish session membership. They never read private session records based on clientId alone.

Runs contain the requested client/session/job metadata, text, source, canonical page, status, steps, reply, agent, error and createdAt, with a `by_client` index. Internal context fields preserve availableTools, history, snapshot and the daily budget reservation date. Status: queued → running → done/failed, or cancelled. Each step has a stable id, tool, args, ok, message, ms, and `kind: viewer | mcp`. Consumers should apply a viewer step once by its id. Repeated scheduled delivery claims a run only once. Known token/secret fields are redacted from stored tool arguments.

Viewer tools have strict Zod-backed JSON schemas in `convex/agent/viewerTools.ts`. Only schema validation runs on the server. A valid viewer call records `{ok:true, message:"sent to viewer", kind:"viewer"}`. Malformed/unavailable calls are logged with `ok:false`. MRI offers zoom, reset, undo, focus and overlay visibility, plus report/search/export tools; its registry excludes 3D rotate, spin, modes, opacity, explosion and isolation. Offered tools are the Guard's intersection of page registry and availableTools.

## Model and MCP

The server-only Anthropic adapter implements a small `ClaudeClient.complete(request)` interface. The hand-written loop makes at most **six Messages API requests total**, counting Router turns, Navigator handoff and any server-tool continuation. Model: `claude-opus-5-5`; effort: `low`; output budget: 1024 tokens/request; timeout: 20 s/request; SDK retries disabled. Frozen Router/Navigator system prefixes and sorted strict tools precede a JSON user-data envelope. The system prefix has an ephemeral prompt-cache marker.

D7=A uses an SDK `Client` over `InMemoryTransport` connected to the same `createServer` as neuro-mcp, registering the export module. It lists tools once, reuses that catalog for all turns, and invokes tools through SDK RPC. No direct knowledge handler shortcut and no Anthropic MCP connector are used. The bridge retains MCP rate-limit charging, trusted Navigator attribution and actual Convex action context. Run page/job override model-supplied patient context. Atlas-mode exports use the atlas case. Private export sections still require their existing session capability arguments.

Every run calls classifyHint before an LLM request. Medical judgement returns MEDICAL_REFUSAL verbatim, off-topic requests use offTopicReply, and absent ANTHROPIC_API_KEY returns NO_KEY without model/MCP calls. Every final reply is checked with checkReply; a replacement MEDICAL_REFUSAL is not re-checked. No production key is set or required for tests.

Explicit general-education questions about supported terms may receive Claude's server-side web_search tool, limited to one search per request. Scan-specific questions are not offered it; general web requests omit the patient job ID, snapshot and history. General answers require provider citations and the label "General information, not from this scan"; missing citations produce an explicit unavailable reply. Server web-search blocks are logged as `tool:"web_search"` steps (kind mcp denotes the knowledge channel here, not an MCP transport invocation), so eval can detect a search on a scan question. An unexpected provider search on a scan question is logged as a failure and does not produce a factual reply. The conservative general-question gate is not the final live routing eval.

## Rate/spend limits

`canStartRun` enforces one queued/running run per client and 10 runs per rolling minute. Separate `agentDailyUsage` rows indexed by UTC day enforce a deployment-wide conservative reservation cap: **100 potentially paid runs/day by default**. Set Convex AGENT_DAILY_RUN_LIMIT to an integer from 0 to 10000 to change it. A reservation is not refunded on cancellation/network failure. No-key or code-classified medical/off-topic runs do not consume it. Claim rechecks/reserves if a key appears after queuing or the day changes. This bounds runs, not dollars; six turns and token/search limits further bound each run.

## Verification and eval

Unit/integration tests inject fake Claude clients. They exercise viewer steps, Navigator handoff, MCP exact sample volumes/certainty, max turns, no-key, untrusted chat envelopes, guarded replies, pages, rate/spend limits, duplicate delivery, cancellation and safe failures. The real scheduled no-key flow was also checked on an isolated anonymous local Convex deployment at 3360/3361. Temporary internal probes verified the real in-memory SDK MCP client returned exact sample metrics and the full fake-client loop emitted a viewer step in that runtime; the probe source and generated references were removed before commit.

`convex/agent/evalRunner.ts` exposes createEvalRunner for #125's `score(CASES, runner)`. It wraps the actual runLoop and accepts a client/MCP dependency factory. A scripted fake-client smoke over all 175 cases passed the scorer; it exercises wiring with expected fake responses and is **not a model-accuracy result**. The live ≥90% tool-call check remains pending the API key. No actual Anthropic requests have been made.
