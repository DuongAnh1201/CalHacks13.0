###MultiAgents Brief Ideas

1. Chat Systems
2. Voice System
3. Tool calls
    - Annotation
    - Summarization
    - Search - Explain system
    - Export Document - which can beside passively export what the user ask, can auto export after a phase.
    - Zoom in/ zoom out by default or set the percentage the 3D model.
    - Rotating
    - Opacity
    - Switch mode(Xray or Turn on solid)
    - Explode the 3D
    - Isolate specific part.
    

---

> **Everything below this line was added by the lead (claude) on 2026-10-24, from Tom's brief above.**
> The brief above is unchanged. Markers: **🆕** = new content, **✏️** = an item of the brief clarified or reinterpreted.
> Status: **DRAFT plan for Tom's approval.** Nothing here is built yet. The full list of changes is in the [Change log](#11-change-log) at the end.

# 🆕 Multi-agent assistant: detailed plan

## 1. 🆕 Goal

Chat and voice both drive the same set of **tool calls**. The tools run on **Convex**, so every change shows up on every connected screen. The same tools are also served over **MCP**, so an outside agent (Claude Desktop, Claude Code) can drive the viewer too. A small **multi-agent** system routes each request to the right specialist.

## 2. 🆕 Core idea: one tool registry, three ways in

```
 Chat panel / "/jarvis ..."  ─┐
 Voice (push-to-talk → STT)  ─┼─► Convex: agent.submit ─► Router agent ─► specialist agent ─┐
 MCP client (Claude, etc.)   ─┘          │                                                 │
                                         └─► fast path: deterministic parser ──────────────┤
                                                                                           ▼
                                                    executeTool (one door: auth, validate, clamp, rate-limit, log)
                                                                                           ▼
                                                         Convex shared state ─► every browser re-renders
```

- **One registry.** Every tool is defined once, in `convex/tools/registry.ts`: name, description, typed argument schema, permission (presenter or anyone), handler.
- **One door.** Every tool call, from any source, goes through one `executeTool` mutation. It checks the session token and role, validates and clamps arguments, applies rate limits, writes the change, and logs the call in `agentRuns`.
- **No extra privileges.** Chat, voice, the in-app agents and MCP clients all get exactly the same checks. LLM output never writes to the database directly; it can only request a registered tool. (Matches `sage_context/BACKEND_CONTEXT.md` guardrail 6.)

## 3. 🆕 First change: widen the shared view (open item M6)

The agents run on the server (Convex actions), so they can only change what a browser shows by writing **shared state** the browser subscribes to. Today Convex syncs only `plane`, `cursorRasMm` and `tumorVisible` (`docs/CONVEX_BACKEND.md` §4, M6).

Add to `sessions.view`:

| Field | Values | Notes |
|---|---|---|
| `mode` | `whole` · `xray` · `exploded` · `cutaway` | SPEC §4 modes |
| `brainOpacity` | 0–1 | existing `setOpacity` |
| `layerOpacity` | `{ edema, core, enhancing }`, each 0–1 | new; defaults from SPEC §7.4 |
| `explodeAmount` | 0–1 | existing `setExplosion` |
| `layers`, `hidden` | visibility per layer and hemisphere | existing actions |
| `isolate` | `{ on, target }` | target = `tumor`, `left`, `right`, a layer, or an atlas structure id |
| `camera` | `{ zoomPct, yawDeg, pitchDeg, spin, version }` | new; see the rule below |

**Camera rule:** `camera` is written only by deliberate commands ("zoom to 150%", "left view"). Mouse orbiting stays local to each browser, so there are never 60 writes per second. Each browser applies a new `camera.version` once, through the existing `dispatch()`.

## 4. ✏️ Tool catalog (the brief's tool list, mapped)

| Brief item | Tool | Arguments | Maps to | Who can call |
|---|---|---|---|---|
| ✏️ Zoom in/out, default or set % | `viewer.zoom` | `in` · `out` · `set` (+ `percent`) · `fit`. Default step 20%, clamped to 25–400% | `camera.zoomPct` | presenter |
| ✏️ Rotating | `viewer.rotate` | `preset` (front, back, left, right, top, bottom) **or** `yawDeg` / `pitchDeg` **or** `spin` on/off | `camera` | presenter |
| ✏️ Opacity | `viewer.setOpacity` | `target` (brain, edema, core, enhancing) + `percent` | `brainOpacity` / `layerOpacity` | presenter |
| ✏️ Switch mode (X-ray or solid) | `viewer.setMode` | `xray` · `solid` · `exploded` · `cutaway`. **"Solid" = SPEC's `whole` mode** | `mode` | presenter |
| ✏️ Explode the 3D | `viewer.explode` | `percent` 0–100 | `explodeAmount` | presenter |
| ✏️ Isolate specific part | `viewer.isolate` | `target` + `on` | `isolate` (+ `selectStructure` on `/learn`) | presenter |
| 🆕 (existing actions) | `viewer.focusTumor`, `viewer.resetView`, `viewer.setCutPlane`, `viewer.setSlice` | as in SPEC §7.3 | existing | presenter |
| ✏️ Annotation | `annotation.create` / `list` / `remove` | `anchor` (cursor, tumor centroid, voxel `[i,j,k]`, or RAS mm point) + `text` (≤ 280 chars) | new `annotations` table, stored in **voxel** coordinates | anyone; remove = author or host |
| ✏️ Summarization | `chat.summarize` | `scope`: session, since last summary, or a topic | new `sessionSummaries` table | anyone |
| ✏️ Search | `search.query` | `query` + `sources` (chat, report, atlas, help) | Convex full-text search on messages + lookup over `report.json` and the atlas `structures.json` | anyone |
| ✏️ Explain system | `explain.topic` | `topic`: how the app works, a mode, an anatomy structure, or a finding | template over report + Knowledge agent. **No diagnosis** (contract §5) | anyone |
| ✏️ Export document (on request) | `export.document` | `format` (Markdown or PDF), `sections`, `trigger: manual` | Convex file storage → download link | anyone |
| ✏️ Export document (auto after a phase) | same tool, `trigger: auto` | fired by the Scribe agent; see §6 | same | system |
| 🆕 Review phases | `session.setPhase` | `orientation` · `findings` · `discussion` · `wrapUp` | `sessions.phase` | presenter |

**Clamp vs reject** (same house rule as `docs/CONVEX_BACKEND.md` §3.3): out-of-range values from a real interaction are clamped ("zoom to 900%" → 400%); impossible input (NaN, unknown target, tumor tool on a no-tumor case) is rejected with `{ code, message }`.

## 5. 🆕 Multi-agent architecture

| Agent | Job | Tools | Model setting |
|---|---|---|---|
| **Fast path** (code, not an LLM) | Deterministic parser for common phrases: "zoom in", "x-ray mode", "show the tumor", "left view", "explode 50%" | any `viewer.*` | none. Instant, works with no LLM provider (keeps SPEC D8 true for basics) |
| **Router** | Classifies the request and hands it to one specialist; answers trivial single-tool requests itself | `handoff(specialist)` + a few `viewer.*` | low effort, for speed |
| **Viewer Control** | Multi-step view requests ("compare the left and right side at 40% opacity") | all `viewer.*` | low |
| **Annotation** | Places and manages anchored notes | `annotation.*`, `viewer.focusTumor` | low |
| **Knowledge** | Search and explain, grounded in the report, atlas notes, help text and session chat | `search.query`, `explain.topic` | medium |
| **Scribe** | Summaries and documents, incl. auto-export | `chat.summarize`, `export.document` | medium |
| **Guard** (code, not an LLM) | Permissions, rate limits, a per-session LLM spend cap, medical-wording rules (contract §5) | inside `executeTool` and the reply path | none |

**How a request flows**

1. Chat text, a voice transcript, or an MCP call arrives. Chat and voice go through `agent.submit`, which stores an `agentRuns` row and schedules the agent action.
2. The fast-path parser tries first. A match calls `executeTool` directly and the run ends with no LLM call.
3. Otherwise the Router runs and hands off to one specialist.
4. The specialist calls tools in a bounded loop (**max 6 tool turns**). Every call goes through `executeTool`.
5. The run's status, tool calls and final reply are written to `agentRuns`. The UI subscribes, so everyone sees "Jarvis is zooming…" and the result.

**Concurrency:** one active run per session; later requests queue. A user can cancel the active run.

**Context:** each agent gets the latest rolling summary, a bounded window of recent messages, the current shared view, and the case report. Chat text is treated as untrusted content, never as instructions (`BACKEND_CONTEXT.md` §8).

**LLM implementation** (needs Tom's decision on provider and key, §9):
- Claude via the official Anthropic TypeScript SDK (`@anthropic-ai/sdk`), called from a Convex **action** (actions are the only Convex functions that may call external APIs).
- Default model `claude-opus-5-5`. Effort `low` for the Router, Viewer Control and Annotation agents (fast, for voice); `medium` for Knowledge and Scribe. Option for Tom: `claude-haiku-5-5` for the Router to cut cost and latency.
- Hand-written tool loop rather than the SDK's tool runner, so each call can be permission-checked and logged by `executeTool`.
- Tool schemas use `strict: true`. Forced `tool_choice` is not supported on this model, so prompts steer tool use with `tool_choice: auto`.
- Prompt caching: a frozen system prompt and a fixed, sorted tool list first; per-request content after the cache breakpoint.
- If the provider is down or no key is set: the fast path, chat, annotations and manual controls still work, and the agent replies "assistant unavailable" instead of failing.

## 6. ✏️ Export document, including auto-export after a phase

**On request:** "export the findings as PDF" → Scribe calls `export.document` → a Convex action builds the document → stored in Convex file storage → a download link is posted in chat.

**Document contents** (all from real data, nothing invented): case and segmentation source badge, report numbers (volumes, side, lesion count, `expertDice` on samples), annotations with their anchors, chat summary, decisions, and the "educational, not clinically validated" notice. Optional: 3D/2D snapshots captured by the presenter's browser.

**Auto-export triggers** (Tom decides which to turn on):

| Trigger | When |
|---|---|
| Job finished | a job reaches `done` (Results page ready) |
| Phase change | `session.setPhase` moves to the next review phase |
| Session end | `sessions.end` |
| Summary checkpoint | every ~15 new chat messages, when the rolling summary updates |

Auto-exports are versioned per session (`export-v1`, `export-v2`, …) and never overwrite each other.

## 7. 🆕 MCP server

- **Package:** new `mcp/` directory, TypeScript, using the official MCP TypeScript SDK (`@modelcontextprotocol/sdk`).
- **Tools:** the same registry as §4, imported from `convex/tools/registry.ts`, so names and schemas never drift.
- **Resources (read-only):** current session view, case report, annotations, latest summary.
- **Path to Convex:** one public Convex mutation, `tools.execute({ sessionId, participantToken, name, args })`, called with the Convex HTTP client. Same `executeTool` checks as chat and voice.
- **Auth:** the MCP server is configured with a participant token (presenter for view control, viewer for read and annotate). No Convex admin key in the MCP server.
- **Transports:** stdio (Claude Desktop, Claude Code) and HTTP (remote clients).
- **Demo moment:** in Claude Desktop, "rotate to the left view and isolate the tumor" → every browser in the session updates.
- **Option (not planned by default):** the in-app agents could call this same MCP server through the Claude API's MCP connector. That needs a public URL and adds a network hop, so the in-app agents call the registry directly instead.

## 8. 🆕 Voice

- **Input:** push-to-talk (hold Space, SPEC §8.1) → Web Speech API transcript → posted as a message with `source: "voice"`. The text box is always the fallback (SPEC §8.3 risk: noisy hall, network STT).
- **Processing:** fast-path parser first; the agents only when no fast-path match.
- **Output:** the reply shows in the transcript; optional spoken reply with the browser's built-in speech synthesis.
- **Latency targets:** fast-path commands feel instant (< ~300 ms to a visible change); agent requests show a "thinking" state at once and answer within a few seconds.

## 9. 🆕 Conflicts and decisions for Tom

| # | Item | Why it matters | Proposed resolution |
|---|---|---|---|
| D1 | **SPEC D8** is locked: "Jarvis = deterministic; LLM intent fallback is P1" | This plan makes LLM agents a core feature | Spec PR amending D8 + Decision Log line: deterministic fast path stays, LLM agents added on top |
| D2 | **M6**: the shared view must grow (§3) | Changes the Convex contract the frontend reads | Spec/contract PR, heads-up to the viewer and app owners |
| D3 | **M4**: annotations need the scan's affine in `report.json` | Our backend contract is signed (v1.1) | Contract v1.2: add `affineRowMajor` (16 numbers, `p_ras = A·[i,j,k,1]ᵀ`) |
| D4 | LLM provider, API key, and Router model | Nothing LLM-based runs without it | Claude (`claude-opus-5-5`); decide Router model; key in Convex env vars only |
| D5 | Which auto-export triggers (§6) | Avoids surprise documents | Proposed default: job finished + session end |
| D6 | Feature freeze at h29 (SPEC D10) | P5–P8 below may not fit | Aim for P0–P4 before freeze; rest is stretch |
| D7 | Product name: NeuroVision vs NeuroLens (`CONVEX_BACKEND.md` M2) | Agent replies and exported documents show the name | Pick one before the pitch |

## 10. 🆕 Build phases

Each phase is its own GitHub issue with acceptance criteria. Every PR is reviewed by the lead and **merged only by Tom**.

| # | Phase | Suggested owner | Done when |
|---|---|---|---|
| P0 | Decisions D1–D7, spec/contract PRs | lead + Tom | Decision Log entries merged |
| P1 | Tool registry, `executeTool`, wider shared view, deterministic parser | codex1 | `/jarvis zoom 150%` and "x-ray mode" change both tabs, no LLM involved; tests per tool |
| P2 | Convex chat (`messages`, paginated) + `agentRuns` + frontend hooks | codex2 + frontend | chat appears in two tabs with no refresh; run status visible |
| P3 | Router + Viewer Control agent | claude2 | ≥ 90% correct tool calls on a ~40-phrase eval set; LLM-off still works |
| P4 | MCP server (stdio + HTTP) | codex1 | Claude Desktop controls the viewer; MCP inspector lists all tools |
| P5 | Annotations (needs D3) | codex2 | marker within 2 mm in 2D and 3D on both tabs (SPEC §5.3) |
| P6 | Knowledge agent: search + explain | claude-old | answers cite the report, atlas or chat; no diagnosis wording |
| P7 | Scribe agent: summarize + export + auto-export | claude2 | manual and triggered exports download correctly; summaries only use this session |
| P8 | Voice polish + demo hardening | frontend + lead | demo script runs twice; fast-path commands work with the LLM switched off |

**Tests across all phases:** schema tests per tool; clamp/reject tests; permission tests (viewer cannot change the presenter's view); parser phrase tests; agent eval set; two-tab manual check (`CONVEX_BACKEND.md` §5); MCP inspector run; LLM-off run.

## 11. Change log

All changes by the lead (claude), 2026-10-24, as a draft for Tom's review:

- 🆕 Added a separator and a status note under Tom's original brief. **The brief itself is unchanged.**
- 🆕 Added §1 Goal and §2 architecture (one tool registry, one `executeTool` door, three inputs: chat, voice, MCP).
- 🆕 Added §3: widen the Convex shared view (M6) so server-side agents can change what browsers show.
- ✏️ §4 turned each brief tool into a typed tool with arguments, permissions and storage. Clarifications:
  - "Turn on solid" = SPEC's `whole` mode.
  - "Zoom by default or set the percentage" = 20% default step, or an exact % clamped to 25–400%.
  - "Search - Explain system" split into two tools, `search.query` and `explain.topic`.
  - "Isolate specific part" covers the tumor, a hemisphere, a tumor layer, or an atlas structure.
- 🆕 Added `viewer.focusTumor`, `resetView`, `setCutPlane`, `setSlice` (already in SPEC §7.3) and `session.setPhase` (needed for auto-export).
- 🆕 Added §5 multi-agent architecture: fast path, Router, four specialists, Guard.
- ✏️ §6 defined "a phase" (job finished, review phase change, session end, summary checkpoint) and what an exported document contains.
- 🆕 Added §7 MCP server, §8 voice, §9 conflicts and decisions, §10 build phases.
