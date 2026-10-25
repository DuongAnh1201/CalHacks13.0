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

Explicit general-education questions about supported terms may receive Claude's server-side `web_search_20260209` tool with dynamic filtering, limited to three searches per request (`max_uses: 3`, plan D9). Scan-specific questions are not offered it; general web requests omit the patient job ID, snapshot and history. General answers require provider citations and the label "General information, not from this scan"; missing citations produce an explicit unavailable reply. Server web-search blocks are logged as `tool:"web_search"` steps (kind mcp denotes the knowledge channel here, not an MCP transport invocation), so eval can detect a search on a scan question. An unexpected provider search on a scan question is logged as a failure and does not produce a factual reply. The conservative general-question gate is not the final live routing eval.

## Rate/spend limits

`canStartRun` enforces one queued/running run per client and 10 runs per rolling minute. Separate `agentDailyUsage` rows indexed by UTC day enforce a deployment-wide conservative reservation cap: **100 potentially paid runs/day by default**. Set Convex AGENT_DAILY_RUN_LIMIT to an integer from 0 to 10000 to change it. A reservation is not refunded on cancellation/network failure. No-key or code-classified medical/off-topic runs do not consume it. Claim rechecks/reserves if a key appears after queuing or the day changes. This bounds runs, not dollars; six turns and token/search limits further bound each run.

## Verification and eval

Unit/integration tests inject fake Claude clients. They exercise viewer steps, Navigator handoff, MCP exact sample volumes/certainty, max turns, no-key, untrusted chat envelopes, guarded replies, pages, rate/spend limits, duplicate delivery, cancellation and safe failures. The real scheduled no-key flow was also checked on an isolated anonymous local Convex deployment at 3360/3361. Temporary internal probes verified the real in-memory SDK MCP client returned exact sample metrics and the full fake-client loop emitted a viewer step in that runtime; the probe source and generated references were removed before commit.

`convex/agent/evalRunner.ts` exposes createEvalRunner for #125's `score(CASES, runner)`. It wraps the actual runLoop and accepts a client/MCP dependency factory. A scripted fake-client smoke over all 175 cases passed the scorer; it exercises wiring with expected fake responses and is **not a model-accuracy result**. The live ≥90% tool-call check remains pending the API key. No actual Anthropic requests have been made.

## Scribe live notes (#60, agent side)

Scribe keeps a short running note of the session and feeds it to the Router/Navigator. Notes live in `sessionSummaries` (author agent, authorName `Scribe`, `jobId`, `text`, `coversUpTo`, `version`). Helpers `insertSummary`/`latestSummary` in `convex/lib/summaries.ts` are shared with #59.

**Scope.** `agent.ask` takes an optional `participantToken`. It is verified inside the mutation: the token must belong to a member of `sessionId`, and the session's scan must be the run's `jobId`. Only then the run stores `sessionVerified: true` and the resolved `sessionParticipantId` (never the token) and joins the **session note**: one shared note built from all participants' verified runs, the session's human chat (`messages` by_session_time, read-only) and annotations. Any other run, including one that merely names a session, is client scope: a private note per `clientId + jobId`, no human chat. The browser panel must pass the `participantToken` it already holds.

**Updating.** After each finished run with a `jobId`, `notes.schedule` books `notes.update`, debounced to one update per scope per 60 s (a finish inside the window books one trailing update; later finishes while it is pending add nothing). `update` sends the previous note plus the events since `coversUpTo` (runs: text, reply, tool steps; chat; annotations; all truncated, all wrapped as untrusted data) to `claude-opus-5-5`, effort low, 400 output tokens, with no tools. The reply goes through `checkReply`; a rejected or empty reply leaves the old note. Each success writes version + 1. `coversUpTo` never passes a run still queued or running.

**Final summary.** `sessions.end` schedules `notes.finalizeSession` (one scheduler line, server-side, no token). The final note is **derived**, not stored: the latest version whose `coversUpTo` is at least the session's end time. It covers the whole meeting up to the end time, ignores any open debounce window, and does nothing if such a version exists (if nothing is new it restates the last note at the end time, without a model call). `notes.forSession({sessionId, participantToken})` lets any member (also after the meeting ended) read the latest note with `isFinal`; non-members are refused.

**No key means no summary.** Without `ANTHROPIC_API_KEY` nothing is scheduled, read, reserved or written, including the final summary. Every update counts against the daily run reservation (`AGENT_DAILY_RUN_LIMIT`); at the limit the note is simply not updated.

**Router/Navigator.** The envelope's `untrusted_request.session_notes` carries the latest note (AI-written, untrusted). It is `null` for web-allowed general-education runs, like history and snapshot.

**MCP.** `summarize({job_id, scope, session_id, participant_token})`: `session` returns the running note (refreshed first if there is new activity), `since_last` returns it only if a new version was just written, otherwise `{unchanged:true}`. Both need the session capability; the service token alone is not membership. Not registered for the in-app agent.

Tests use the fake Claude client (`convex/tests/notes.test.ts`, `mcpSummarize.test.ts`); no real API request has been made.

## Live transcript (#135)

Speech-to-text runs in each member's browser (Web Speech API, `frontend/src/agent/transcribe.ts`); no audio reaches our servers, only final text.

- **Tables (agent-owned, shared tables untouched):** `transcriptSegments` (`by_session_time`, `by_participant`) and `transcriptSettings` (one row per session: the host's on/off switch).
- **`transcript.setEnabled`:** host only. **`transcript.append`:** active session, verified member, switch on, text 1–500 chars, 30 segments per participant per minute. The speaker is the token's participant and times are server-stamped; the client only reports `durationMs`, so `startedAt` is unique and increasing per session and works as the `after` cursor.
- **`transcript.list` / `transcript.state`:** members only, also after the session ended. Segments are kept until the session is deleted.
- **MCP `get_transcript`:** read-only; needs `session_id` and `participant_token` for the case. The service token alone is refused. Output carries an untrusted-data notice.

## Transcript in the live notes (#136)

- **Input:** Scribe's session note also reads transcript segments newer than `coversUpTo` (`events.transcript`, speaker kept, untrusted data). The watermark is `endedAt` (the append time), so a long utterance that started before the last covered time is not missed. A transcript alone is enough to trigger an update; with nothing new there is no model call.
- **Quotes (T3a):** the note may quote a participant's own words with attribution. `checkNote` runs the Guard on AI-authored text only: a double-quoted span is exempt only when it is verbatim (case and spacing aside) inside a transcript segment of this update, or was already a quoted span of the previous note (which passed the same check). Text the model merely puts in quotes is still checked.
- **`update_notes`:** a Router step, offered only to verified session runs when an API key exists (never on web-allowed runs). It goes through `notes:schedule`, so it shares the 60 s debounce.
- **Cadence:** when the host turns transcription on (and a key exists), `notes:tick` runs about every 60 s through the same debounce until transcription is turned off or the session ends. `transcriptSettings.tickAt` identifies the live chain, so a stale tick ends itself and toggling twice never starts a second chain. No key: nothing is scheduled.
