---
name: neurovision-convex
description: NeuroVision Convex backend (convex/ at repo root) — schema, scans, live sessions and shared view commands, participant/invite auth, shared human+agent tables (annotations, messages, summaries, exports), Markdown export, the neuro-mcp HTTP server at /api/mcp, MCP tokens and rate limits, static hosting, and Convex tests. Use when writing or changing any Convex query/mutation/action/http route, schema, or the MCP tools.
---

# NeuroVision Convex backend

Docs: `docs/CONVEX_BACKEND.md` (phases, decisions, mismatches M1–M6, frontend quick ref §9–§10) and `mcp/README.md`.

## Commands (repo root; the root package.json IS the Convex package)

```sh
npm ci
CONVEX_AGENT_MODE=anonymous npx convex dev --once   # push to a local/anon dev deployment
npx convex run seed:seedSampleScan                  # idempotent; jobId "sample"
npm run typecheck                                   # tsc --noEmit -p convex
npm test                                            # vitest (convex-test) + test:mcp-stdio
npm run mcp:stdio                                   # stdio proxy (needs NEURO_MCP_URL, MCP_TOKEN)
```

- `convex/_generated/` **is committed**. Run codegen (`npm run codegen` / `convex dev`) after adding functions, and commit the result.
- `convex.config.ts`: `defineApp({ httpPrefix: "/api" })` plus `@convex-dev/static-hosting` at `/`. HTTP routes are written as `/mcp` but are served at `/api/mcp`. The SPA is served at `/`.
- Prod: `https://laudable-salmon-957.convex.site`. CI on main runs `npm run deploy` (frontend build + `convex deploy`) and then the seed.

## Convex rules that bite

- Queries are reactive subscriptions and must be deterministic. In mutations, `Date.now()` is frozen to the transaction start.
- Never filter without an index. Use `.withIndex(...)`, and add the index to `schema.ts`.
- The browser can't call `internal*` functions. Secrets (`ANTHROPIC_API_KEY`, `MCP_TOKEN`, `IMAGING_API_URL`) are read only inside actions/http actions via `process.env`.
- Validate every arg with `v.*`. Shared validators live in `schema.ts` (`vVec3`, `vMat4RowMajor`, `vPlane`, `vAnnotationAnchor`, `vToolStep`) and `lib/viewCommands.ts` (`vScene`, `vViewerCommand`).
- Throw errors with `appError(code, message)` from `lib/errors.ts` (a ConvexError `{code,message}`). The codes are:
  - `NOT_PRESENTER`, `NOT_AUTHENTICATED`, `NOT_A_MEMBER`
  - `INVALID_INVITE`, `NOT_FOUND`, `SESSION_ENDED`
  - `INVALID_ARGUMENT`, `BAD_SCAN_GEOMETRY`
  - Add new codes to the `AppErrorCode` union.

## Schema (`convex/schema.ts`)

| Table | Key indexes | Notes |
|---|---|---|
| `scans` | `by_jobId` | geometry (dims, spacing, `affineRowMajor`), asset **paths**, status. No imagery (D9) |
| `sessions` | `by_inviteCode`, `by_scan` | `plane`, `cursorRasMm`, `tumorVisible`, optional `scene`, `viewVersion`, `status` |
| `sessionParticipants` | `by_token`, `by_session` | role presenter/guest, follow mode; the token is a bearer capability |
| `annotations` | — | human or agent author (`lib/author.ts`); agent ones start `suggested` (D10) |
| `messages` | search index | chat; `runId` → `agentRuns` (**table not created yet, #67**) |
| `sessionSummaries`, `exports` | — | Scribe/export output |
| `mcpTokens` | `by_hash` | stores SHA-256 hashes only, never raw tokens |
| `mcpRateLimits` | `by_token_hash` | 120 req / 60 s per token |

## Modules

- `scans.ts`: `list`, `get`, `getByJobId`; internal `register`, `setStatus`, `getInternal`.
- `sessions.ts`: `create`, `join`, `get`, `getInviteCode`, `updateView`, `setFollowMode`, `end`.
- `sessionParticipants.ts`: `list`.
- `lib/auth.ts`: `requireParticipant`, `requireActiveSession`, `requireSessionMember`, `requirePresenter`, `toPublicParticipant`. **Never return raw tokens** in a query result.
- `lib/tokens.ts`: `newInviteCode`, `newParticipantToken`. Invite codes and participant tokens are bearer capabilities; there are no user accounts.
- `lib/transform.ts`: pure geometry (`voxelToRasMm`, `rasMmToVoxel`, `sliceIndexFromCursor`, `cursorForSliceIndex`, `clampToBoxMm`, …).
  - `affineRowMajor` is row-major; THREE.Matrix4 `.elements` is column-major.
- `lib/viewCommands.ts`: the `ViewerCommand` union, plus the pure `applyCommand(view, cmd, scan)` and `viewsEqual`.
  - The commands are: setPlane, setSlice, stepSlice (|delta| ≤ 32), setTumorVisible, setCursor, setPage, setMode, setOpacity, setExplosion, setHemisphereVisible, setLayerVisible, setCameraTarget, resetView.
  - The `Scene` type mirrors frontend `initialState()`.
  - **The LLM never writes the DB.** It proposes a command, and the command is validated here exactly like a click.
- `seed.ts`: `seedSampleScan` (internal); `SAMPLE_JOB_ID = "sample"`.
- `exportDoc.ts` / `exportRecords.ts` / `lib/exportMarkdown.ts`:
  - Markdown sections: `case`, `report`, `annotations`, `summary`, `conversation`, `tool_steps`, `suggested_annotations`.
  - Private sections need a matching `session_id` + `participant_token`.
  - Output is stored in Convex file storage.
- `mcpTokens.ts`: `issue`, `revoke`, `lookup`, `touch` (per-user Desktop tokens, #70). `mcp/rateLimit.ts`: `consume`.

## neuro-mcp (`convex/http.ts`, `convex/mcp/*`)

- `POST /api/mcp` uses the Streamable HTTP transport, stateless, JSON-response mode. GET/DELETE return 405 after auth.
- Auth is either `Bearer MCP_TOKEN` (service) or a personal `mcpTokens` token. Bad, revoked or expired credentials → 401. The quota is 120 req / 60 s → 429 with `Retry-After`.
- `mcp/handler.ts` builds the server per request. `mcp/types.ts` defines:
  - `McpDependencies.caller {kind: service|user, tokenHash, agentName, authorName, agentRunId?}`
  - `AgentName = 'Claude Desktop'|'Navigator'|'Anatomy tutor'|'Scribe'`
  - The agent name is fixed by the adapter, never by tool args.
- Tools (zod strict schemas in `mcp/definitions.ts`, snake_case):
  - `knowledge.ts`: `explain_structure`, `explain_finding`, `get_tumor_metrics`, `get_report`, `search`
  - `exportTools.ts`: `export_document`
  - Resources: `atlas://structures`, `report://{jobId}`
- Data (`mcp/data.ts`):
  - Reports come from `IMAGING_API_URL/jobs/{id}/report`. Without that env, only the bundled `backend/seed/{sample,sample-2}/report.json` are used.
  - `page: "learn"` always suppresses the report.
  - There is no silent sample fallback.
  - The constants `NO_REPORT`, `MISSING_REPORT`, `NO_TUMOR`, `NOTICE` are fixed wording.
- Add a tool by:
  1. Adding a zod schema in `definitions.ts`.
  2. Registering it in a `ToolModule`.
  3. Adding the module to `http.ts` `modules`.
  4. Adding tests in `tests/mcp*.test.ts`.

## Tests (`convex/tests/`)

- Test files: `sessions`, `viewCommands`, `transform`, `sharedTables`, `exportDoc`, `mcp`, `mcpRuntime`, `mcpConnected`, `mcpTokens`, `guard`, `agentEval`.
- They use `convex-test` (`convexTest(schema, modules)`) and plain vitest for the pure libs. Every new function gets a test, including the auth-failure path.

## Rules (from sage_context/AGENTS.md)

- Do collaborative state in Convex, not FastAPI. Don't add new infra (no custom WebSockets, no new hosts).
- Don't stream camera or gesture frames. Send only semantic commands, and throttle them (the frontend `sceneSender` uses 150 ms).
- Chat context stays scoped to one session. LLM keys stay server-side, and features must keep working when the key is absent (D8).
- Coordinate changes to function signatures with the frontend owners: `frontend/src/share/types.ts` hand-mirrors these via `anyApi`.
