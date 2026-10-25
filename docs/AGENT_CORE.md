# Convex agent core (#67)

No frontend code is changed here. Browser integration and shared-reducer validation belong to Ben's #64; messages persistence belongs to #58. Viewer results in this phase mean **sent to viewer**, not applied or validated against the browser state.

## Browser contract

`agent.ask({clientId, text, source, page, sessionId?, jobId?, availableTools?, snapshot?, history?})` returns an `Id<"agentRuns">`. `source` is `chat`, `voice` or `text`. Canonical pages are `mri` and `3d`; `/mri` and `/3d` are accepted at the boundary and normalized. `learn` and `/learn` are rejected with a `BAD_PAGE` error because Learning Mode was removed (#134). The `agentRuns.page` schema union still lists `learn` only for legacy rows; such a row that is still queued is finished as failed with `PAGE_REMOVED` and never reaches the model. A request may contain up to 2000 text characters, a 20 KB JSON snapshot and 10 history entries of up to 2000 characters each. Historical roles/text and snapshot values are untrusted data, not system instructions.

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

**Updating.** After each finished run with a `jobId`, `notes.schedule` books `notes.update`, debounced to one update per scope per 60 s (a finish inside the window books one trailing update; later finishes while it is pending add nothing). `update` sends the previous note plus the events since `coversUpTo` (runs: text, reply, tool steps; chat; annotations; all truncated, all wrapped as untrusted data) to `claude-haiku-5-5` (`NOTES_MODEL` in `agent/scribe.ts`; Haiku 5.5 supports `output_config.effort`, so effort stays low), 400 output tokens, with no tools. The final meeting summary (#138) stays on the shared `MODEL` (`claude-opus-5-5`). The reply goes through `checkReply`; a rejected or empty reply leaves the old note. Each success writes version + 1. `coversUpTo` never passes a run still queued or running.

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

## Final meeting summary and auto export (#138)

`sessions.end` already schedules `notes:finalizeSession` (server-side, no token). It now does two independent things:

1. **Final summary (needs a key; Opus via the shared `MODEL`, not the Haiku live-notes model).** Code assembles the sections whose facts must be exact: **Attendees** (participant rows), **Key findings** (`reportLines` over report.json, with its source line; the only place numbers come from), **Questions asked** (verified agent-run texts and human chat lines containing `?`, quoted as data). The model returns JSON with only a **Timeline** (≤ 8) and **Action items** (≤ 6, only things a participant proposed). Each item is dropped unless it is single-line, passes `checkNote` (AI-authored banned words blocked; verbatim human quotes exempt) and carries no number that is not in the report findings (numbers inside a verified quote are the human's). Stored as the next `sessionSummaries` version covering the end time, so `isFinal` stays derived. Written once (`prepare` refuses a second). With nothing new since the last running note, the model is not called and that note becomes the timeline if it passes the same checks. A model failure, a limit hit or unusable output writes nothing.
2. **Automatic Markdown export (T4a; runs with or without a key).** `exportDoc.autoReserve` creates one `exports` row per ended session (`trigger: "auto"`, `reason: "checkpoint"`; a failed one may be retried, a pending or ready one blocks a second) and the shared `exportDoc.build` renders it. Sections: case, report, annotations, summary, conversation, plus the new opt-in **screenshots** (ordered, with captions, embedded as images over http(s) only) and **transcript** (speaker, offset from session start). Both new sections are session-private like the other private ones and never part of the default set. Without a key the summary section reads "Summary unavailable: …" and the transcript and screenshots are still included.

`notes.forSession` (members only) returns the final summary fields plus `screenshots` and `export: {version, status, url}`.

**Screenshots (#137):** `lib/exportScreenshots.ts::loadExportScreenshots` reads the `screenshots` table for the session and case, keeps rows taken within the meeting (session start to its end time), orders them by `takenAt` and attaches the storage URL used for embedding. Callers are already member-gated (`notes.forSession`, and the private export snapshot).

## Screenshot server and capture helper (#137; browser wiring is Ben's #139)

The server owns `convex/lib/screenshotPolicy.ts`: tumor focus, report/metrics
request, X-Ray/Exploded/Cutaway, annotation add, user screenshot request, and
the explicit `capture_screenshot({reason})` viewer tool (MRI/3D; 1–120 chars).
No key is needed for fixed event policy. `screenshots.requestCapture` accepts
browser event facts and returns an approved reason or null. `screenshots.events`
provides stable-id run/annotation events; only `sessionVerified` runs qualify.

Uploads/records require an active verified presenter and matching job/session.
Server-time transactions enforce >=30 s between captures and <=20 per meeting.
Actual JPEG/PNG headers/dimensions are checked: width <=1280 and <=600 KiB
(614400 bytes). Invalid new uploads, including quota-race losers, are deleted;
existing screenshot/export references are protected. Captions are <=280 chars.
A linked run must be verified for the same session/case. No member token is stored.
`list_screenshots({job_id,session_id,participant_token})` gives verified members
read-only metadata/Convex storage URLs; MCP authentication alone is not membership.

**Ben's three-line hook** (imports from `frontend/src/agent/screenshot.ts`):

```ts
const decision = await client.mutation(api.screenshots.requestCapture, { ...scope, event });
const image = decision && await captureCanvas(canvas);
if (decision && image) await uploadScreenshot(image, { generateUploadUrl: () => client.mutation(api.screenshots.generateUploadUrl, scope), recordScreenshot: data => client.action(api.screenshots.recordScreenshot, { ...scope, ...data, reason: decision.reason, caption: decision.reason }) });
```

`scope` is `{jobId,sessionId,participantToken}` from verified share state. Run the
listener only for the active presenter and correct case; the server rechecks.
Send facts `{kind:'action',action}` after dispatch, `{kind:'report',jobId}` for
report requests, and `{kind:'user_text',text}` for screenshot requests. For run
steps/annotations subscribe to `screenshots.events({...scope,since})`, dedupe ids
and use the approved reason/runId with the same capture/upload helper.

The helper only captures and uploads: max width 1280, no upscaling, preserved
aspect, JPEG quality fallback to fit the byte cap, upload then record dimensions.
Ben owns render readiness and WebGL buffer preservation/redraw; capture after
the view has painted. Sent viewer steps do not prove applied state. #137 changes
no viewer component, route, AgentPanel, dispatcher, or API-client wiring.

Local #137 smoke after merging main: actual PNG upload/record/download, invalid
image rejection, presenter-only capture, 30-second rejection and member-authorized
MCP listing passed; annotation/message/summary/transcript tools remained present.
The disposable room/token were cleaned up and our recorded CLI/backend PIDs were
stopped explicitly; ports 3380/3381 were confirmed clear. No push or PR.

## /learn cleanup

The agent no longer has a `/learn` page: `Page` is `mri | 3d`, the tool registry and chips have no learn entries, `export_document` always needs the run's job (no atlas export from the panel), and chat persistence needs a `jobId` (there is no `atlas` chat). The eval set has no `/learn` cases: the viewer phrases stay on `/3d` (40, plus two left/right ask-backs) and `/mri` (30 plus 8 off-page refusals), and every question kind has at least 10 cases on those two pages. Kinds 3 and 5 still need 100%. MCP itself still accepts `page: "learn"` as input and treats it as "no report".

## Tumor summary card (panel on /3d)

- **MCP `summarize_tumor({job_id, page?})`:** read-only and code-built (`lib/tumorSummary.ts::buildTumorCard`), no model. Every number is copied from report.json: side, lesion count, volume and outline certainty for whole / core / enhancing, the source line, the 3D layer names, and "No tumor detected in this scan" with no numbers when there is none. Registered for `mri` and `3d`; the Router prompt tells it to prefer this tool for "summarize the tumor" asks (eval kind-1 cases cover it, including the no-tumor job).
- **Fast path:** `tumorSummaryIntent` matches only the exact ask (the panel's "Summarize tumor" script line, "give me a tumor summary", ...). `agent.run` then answers from the card directly: no Claude call, no API key needed, no daily run taken (`reserveSpend` and `claim` skip it). Anything longer ("... and zoom in") and every follow-up goes through the normal loop.
- **Panel binding:** `frontend/src/agent/useAgent.ts` returns exactly AgentPanel's props `{messages, status, onSend, onRun}` (no `onMic` until voice, #66). It calls `agent.ask` with page `3d`, the job, a viewer snapshot, the tools the 3D viewer can actually apply (`applyStep.ts`) and the `participantToken` only when the tab is in an active session for that case; subscribes to `getRun`; maps steps to Tool Call rows; applies viewer steps once per step id through `dispatch`; loads `listChat` history (shown, never re-applied); status is `ready` or `offline`. Viewer tools the viewer cannot do yet (zoom, rotate, spin, undo, structure focus) show as failed rows with the reason.
