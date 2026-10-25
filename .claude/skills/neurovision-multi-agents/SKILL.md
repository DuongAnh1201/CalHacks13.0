---
name: neurovision-multi-agents
description: NeuroVision multi-agent assistant — fast-path parseIntent, Router, Navigator, Anatomy tutor, Scribe, Guard, Claude Desktop via neuro-mcp; the viewer/knowledge tool catalog and per-page tool lists; question kinds 1–5 and refusals; agentRuns; eval set; build phases P1–P8 (issues #64–#73, tracker #74). Use when building or changing agent code in convex/agent/*, frontend/src/agent/*, the Agent Panel wiring, tool definitions, prompts, Guard rules, or eval cases.
---

# NeuroVision multi-agent system

Plan: `docs/MultiAgents_brief.md` v7. Its §0.1 table shows what is built and what is missing, so read that first. The decisions are in §10. **Agent PRs are merged by Tom only.**

## Architecture: two tool paths

- **Viewer tools** run in the **browser**: the tool → `Action`s → `dispatch` (`frontend/src/actions/dispatch.ts`). Camera tools go through `viewEvents`. The agent never writes the store or the DB directly.
- **Knowledge/document tools** run through **neuro-mcp** (`convex/mcp/*`, `POST /api/mcp`). Claude Desktop/Code uses the same server via `mcp/stdio.mjs`.
- `ANTHROPIC_API_KEY` exists **only** in the Convex env. Without a key: "Assistant unavailable for open questions. Commands still work." The fast path keeps working (D8).

## Agents (Convex side, model `claude-opus-5-5`)

| Agent | Effort | Job | Tools |
|---|---|---|---|
| Fast path `parseIntent` (browser, no LLM) | — | instant common commands | all viewer tools |
| Router | low | classify kind 1–5, answer single-tool requests, else `handoff` | `handoff` + page viewer tools |
| Navigator | low | multi-step view requests | page viewer tools |
| Anatomy tutor | medium | explain, metrics, search; general education with citations | MCP `explain_structure`, `explain_finding`, `get_tumor_metrics`, `get_report`, `search`; dispatch `focus_region`; server `web_search` (`max_uses` 3, kind 2 only) |
| Scribe | medium | summaries, annotations, exports | MCP `summarize`, `export_document`; dispatch `add_annotation` |
| Guard (code, `convex/agent/guard.ts`) | — | rules below | — |
| Claude Desktop | — | external MCP client | MCP tools with a personal token |

- MCP `AgentName` (`convex/mcp/types.ts`): `'Claude Desktop'|'Navigator'|'Anatomy tutor'|'Scribe'`.
- The hand-written tool loop is capped at **6 turns**.
- The Agent Panel UI (`frontend/src/components/agent/AgentPanel.tsx`) is display-only demo content for now.

## Guard (`convex/agent/guard.ts`, already built)

- Constants: `MEDICAL_REFUSAL`, `OFF_TOPIC_REDIRECT`, `NO_REPORT`, `NO_KEY`, `GENERAL_INFO_LABEL`.
- `checkReply` runs the BANNED regex on **every** reply. Banned words: diagnosis, prognosis, survival, malignant/benign, "healthy".
- `classifyHint` runs medical/off-topic regexes before the LLM.
- Run limits: `MAX_ACTIVE_RUNS = 1` per client, `MAX_RUNS_PER_MINUTE = 10`, checked with `canStartRun`.
- `allowedTools(page, availableTools, registry)` gives the per-page allow-list. `offTopicReply(tryChips)` builds the kind-5 reply. The Router never offers a tool the page can't apply.

## Question kinds (Router, §6.1)

1. **This scan/brain**: tutor + MCP. Use only numbers from `report.json`/`anatomy.json`, and name the source.
2. **General education**: general knowledge + `web_search` with citations, labelled `GENERAL_INFO_LABEL` ("General information, not from this scan"). Never give numbers about this patient.
3. **Medical judgement** ("is it cancer", "how long", "surgery", "is it healthy"): **always** refuse with `MEDICAL_REFUSAL`. Facts (volumes, side, outline certainty) may still be stated.
4. **About the app**: help text, this page's tools, and "Try saying" chips.
5. **Off-topic**: one line, `OFF_TOPIC_REDIRECT`.

- When unsure, ask back ("Left or right hippocampus?").
- With no report: "There is no patient report on this page (template atlas)."
- Never invent distances. Atlas-to-patient distances are out of scope (D6).

## Tool catalog (§3.2; snake_case is the agent name, and each maps to an Action)

- Viewer tools:
  - `zoom_view {action: in|out|set|fit, percent}`: 100% = home dist ≈338 mm, ±20%, clamp 50–400%.
  - `rotate_view {preset: front|back|left|right|top|bottom | yaw_deg, pitch_deg}`
  - `spin_view {on, speed=20}`
  - `set_mode {solid|xray|exploded|cutaway}`: "solid" = `whole`.
  - `set_opacity {target: cortex|brain, percent}`: switches to x-ray first and says so.
  - `set_explode {percent}`
  - `isolate {target, on}`, `focus_region {region}`
  - `toggle_visibility {targets[], visible}`
  - `reset_view`, `undo` (20-step history in dispatch)
- Knowledge tools (MCP): `explain_structure {name, depth}`, `explain_finding`, `get_tumor_metrics {job_id, fields?}`, `get_report`, `search {query, sources}`.
- Document tools: `add_annotation`/`remove_annotation` (≤280 chars; anchor `selected|tumor|RAS mm`), `summarize`, `export_document {format: md, sections}`.
- Name resolution: a pure `resolveTarget(text, atlas)` in `frontend/src/agent/resolveTarget.ts`, which reuses the `learn/filter.ts` matching plus side words. An ambiguous match picks both sides for show/hide and asks back for focus.
- Clamp vs reject is the same as in dispatch: clamp out-of-range numbers, and reject unknown targets or tumor tools on a no-tumor case with the dispatcher's message.
- Per page (§3.3):
  - `/learn`: the atlas structure tools work, and the patient-report tools answer "template atlas, not a patient scan".
  - `/jobs/:id/3d`: hemispheres, tumor layers, `focus_region tumor`, report tools.
  - Every request carries `page` + `availableTools`.

## Build phases (each one is a GitHub issue)

| Phase | Issue | Scope | Acceptance |
|---|---|---|---|
| P1 | #64, #65 | pure `reduce`, camera commands, zoom/rotate/spin/undo actions, `actionLog`, `tools.ts`, `parseIntent`, `resolveTarget`, panel text box on `/learn` | the 10 phrases work: "zoom to 150%", "left view", "spin", "x-ray", "cortex 20%", "explode 50%", "isolate the left hippocampus", "hide the cortex", "undo", "reset". **No Convex, no LLM** |
| P2 | #66 | push-to-talk, voice chip, suggestion chips, Script tab | same phrases by voice; mic denied → `Voice off` |
| P3 | #67 | frontend Convex client, `agentRuns` table, `agent.ask`/`run`, Router + Navigator | the viewer half of the Figma request works end to end; eval ≥90%; no key → "Assistant unavailable" |
| P4 | #69 (server ✅ #104, #106) | neuro-mcp knowledge tools ✅, Anatomy tutor + Guard | "how big is the tumor?" on `sample` gives the exact cm³; `/learn` says there is no report; banned-word test |
| P5 | #70 | Desktop viewer tools via pairing; per-user tokens | Desktop turns the brain on `/learn` |
| P6 | #71 | `/3d` parity (`CaseCanvas` already applies opacity/hidden/layers/explode) | tool list only |
| P7 | #72 | Scribe: `summarize`, `export_document`, auto-export, MCP annotations | exports download from the panel and from Desktop; pins within 2 mm |
| P8 | #73 | multi-viewer sync, hardening, eval, LLM-off demo | two tabs follow one presenter; the demo runs twice, LLM on and off |

P1–P4 ship before the h29 freeze. P5+ are stretch.

## Eval (`convex/agent/eval/`)

- `cases.ts`: `EvalPage = "/learn"|"/mri"|"/3d"`, `Kind = 1..5`, `ExpectedCall`.
- `score.ts`: `score(cases, runner)` with `PAGE_THRESHOLD = 0.9` per page. **Kinds 3 and 5 must be 100%.** `argsMatch` is a partial match.
- Test: `convex/tests/agentEval.test.ts`. Add a case for every new phrase or tool.

## Rules

- Every agent output goes through `checkReply` before it's shown or stored.
- Agent annotations are written with `status: "suggested"` and an agent author (`lib/author.ts`, `source: 'mcp'`). Humans accept them.
- Tool args are validated twice: zod/`v` at the edge, then dispatch/`applyCommand` semantics.
- Never put imagery or raw NIfTI in a prompt (D9). Reports and anatomy text are fine.
- Keep `parseIntent`, `reduce`, `resolveTarget` and the tool `toActions` pure, with a test for each phrase.
