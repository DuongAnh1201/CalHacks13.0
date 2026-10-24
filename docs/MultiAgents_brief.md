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

> **Everything below this line was added by the lead (claude), from Tom's brief above.**
> Tom's brief is unchanged. Markers: **🆕** = new, **✏️** = an item of the brief clarified, **🔄** = changed in **v2** after reading the frontend code and the Figma frames.
> Status: **DRAFT v2 for Tom's approval. Nothing here is built yet.** The full list of changes is in the [Change log](#13-change-log).

# 🆕 Multi-agent assistant: detailed plan (v2)

## 0. 🔄 What the frontend already gives us (read before the plan)

v1 was planned from the docs. v2 is planned from the code on `main` and in PR #50 (Ben's Milestone B). What exists today:

| Already in the frontend | File | What it means for this plan |
|---|---|---|
| **One action door**: `dispatch(action, source)` validates and clamps every change, and returns `{ ok, message }` | `frontend/src/actions/dispatch.ts` | Every tool call ends as a `dispatch` call. No tool gets its own code path. |
| A `Source` type that already lists `'voice'` | `frontend/src/actions/types.ts` | Voice and chat are planned for; we add `'chat'` and `'mcp'`. |
| 15 typed `Action`s: `setMode`, `setOpacity`, `setExplosion`, `setIsolate`, `selectStructure`, `setStructureVisible`, `setHemisphereVisible`, `setLayerVisible`, `focusTumor`, `resetView`, … | `frontend/src/actions/types.ts` | Most brief items already have an action. Zoom, rotate and undo do not (§3). |
| The viewer state lives in the browser (zustand `useViewer`); the camera is not state (SPEC §8.2) | `frontend/src/actions/store.ts` | Tool calls must be **applied in the browser**. Convex carries them; it does not render them (§2). |
| Camera is drei `CameraControls`, home pose `[-260, 80, -200]`, distance limits 20–900 mm, Reset via `viewEvents` | `viewer/AtlasCanvas.tsx`, `viewer/CaseCanvas.tsx` | Zoom and rotate are camera commands sent through the same `viewEvents` bus as Reset. |
| `/learn`: 95 atlas structures, Solid / X-Ray, cortex opacity, explode, L / R, isolate, search, info panel | `routes/Learn.tsx`, `learn/*` | The richest page. **The assistant ships here first.** |
| `/jobs/:id/explore` (PR #50): brain + tumor, Show tumor, Reset only. `CaseCanvas` ignores `brainOpacity`, `hidden`, `layers` and `explodeAmount` today | `routes/Explore.tsx`, `viewer/CaseCanvas.tsx` | Most viewer tools can't do anything here until the Explore controls land (Milestone D). The agent must only offer tools the page supports (§3.3). |
| Educational text for every structure: description, functions, "when damaged" | `frontend/src/content/anatomy.json` | The ground truth for `explain_structure`. No invented anatomy. |
| Figma frame 04 has a full **"Neuro Agent" panel** (nodes `46:*`) and a **Tool Call** row (`45:30`) | `docs/figma/04-explore.png`, `04-explore.ref.tsx`, `symbol-tool-call.ref.tsx` (PR #50) | That panel is the UI spec for chat and voice (§4). |
| **No Convex client in the frontend** (`convex` is not in `frontend/package.json`) | | Adding it is a P3 task. P1 and P2 work with no Convex and no LLM. |

## 1. 🆕 Goal

Chat and voice both drive the same **tool calls**. A tool call becomes a typed `Action` and goes through the existing `dispatch`, so the panel, the keyboard and the assistant all change the viewer the same way. Claude agents run in **Convex** actions. The same tools are served over **MCP**, so Claude Desktop can drive the viewer as well.

## 2. 🔄 Architecture: tools run in the browser, Convex carries them

```
 AgentPanel text box ─┐
 Push-to-talk (Space) ┤
                      ▼
            parseIntent(text, page)            ← in the browser, no network, no LLM (SPEC D8)
              │ match                │ no match
              ▼                      ▼
        tool calls          Convex mutation agent.ask({ clientId, text, source, snapshot })
              │                      ▼ schedules
              │             internalAction agent.run: Router → one specialist (Claude, ≤ 6 tool turns)
              │               · viewer tool → checked with the SAME pure reducer → tool_result → appended to agentRuns.steps
              │               · knowledge tool → runs on the server (anatomy.json, report.json)
              │                      ▼
              │             agentRuns row (status, steps[], reply)
              │                      │ useQuery subscription: each new step is applied once (by step id)
              ▼                      ▼
        toolToActions(step) ──► dispatch(action, 'voice' | 'chat' | 'mcp') ──► useViewer ──► 3D view
                                     │
                                     └─► actionLog event ──► AgentPanel shows a Tool Call row (✓/✗, message, ms)

 MCP client (Claude Desktop) ─► mcp/ server ─► Convex mutation agent.callTool({ pairCode, name, args })
                                               └─► agentRuns row with one step ─► same browser path as above
```

**Why the browser applies the tools (🔄 replaces v1 §3 "widen `sessions.view` first"):**
- The viewer state (`useViewer`) and the camera live in the browser. A server agent can't move the camera directly.
- Applying the step through `dispatch` keeps the house rule: one door, one validation (SPEC §7.3).
- v1's wider shared view (M6) is still useful for **multi-viewer** live review, but it is no longer needed to ship chat, voice or MCP. It moves to P8.

**Why the server can still answer "did it work?":** the reducer inside `dispatch` is pulled out into a pure function, `reduce(state, action, ctx) → { state, result }` (§5, P1). The Convex action runs the same function on the state snapshot the browser sent, so Claude gets the real `{ ok, message }` (e.g. "No tumor detected in this scan") as its `tool_result`, and the browser gets the same result when it applies the step.

## 3. ✏️ Tool catalog, mapped to the frontend

### 3.1 🔄 Tool names

Claude API tool names may only use letters, digits, `_` and `-`, so v1's `viewer.zoom` style is invalid. v2 uses **snake_case**, matching the names in the Figma panel (`focus_region`, `explain_structure`, `toggle_visibility`). MCP uses the same names.

### 3.2 Tools

| Brief item | Tool | Arguments | Becomes (frontend) | New code needed |
|---|---|---|---|---|
| ✏️ Zoom in/out, default or set % | `zoom_view` | `action`: `in` · `out` · `set` · `fit`; `percent` for `set` | 🆕 `{ type: 'zoom', … }` → `viewEvents` `camera` event → `controls.dollyTo(homeDist × 100 / pct)` | Action + camera module. **100% = home distance (≈ 338 mm)**; step ±20%; clamp 50–400% |
| ✏️ Rotating | `rotate_view` | `preset`: `front` `back` `left` `right` `top` `bottom`, **or** `yaw_deg` / `pitch_deg` (relative) | 🆕 `{ type: 'rotate', … }` → presets: `setLookAt(eye, target)` at the current distance; relative: `controls.rotate(yaw, pitch)` | Action + camera module. Presets in scene axes: front = −z, left = −x, top = +y (from the `HOME` comment) |
| ✏️ Rotating (continuous) | `spin_view` | `on`, `speed` (deg/s, default 20) | 🆕 `{ type: 'spin', … }` → `useFrame` adds to `azimuthAngle`; any pointer drag stops it | Camera module |
| ✏️ Switch mode | `set_mode` | `solid` · `xray` (+ `exploded` · `cutaway` on Explore later) | `setMode` (**"solid" = `whole`**) | none on `/learn` |
| ✏️ Opacity | `set_opacity` | `target`: `cortex` (on `/learn`) or `brain` (Explore); `percent` | `setMode xray` + `setOpacity` | none. 🔄 Opacity only shows in X-Ray (the toolbar slider is disabled in Solid), so the tool switches to X-Ray first and says so |
| ✏️ Explode | `set_explode` | `percent` 0–100 | `setExplosion` | none on `/learn` |
| ✏️ Isolate | `isolate` | `target` (structure or `tumor`), `on` | `/learn`: `selectStructure` + `setIsolate`. Explore: `focusTumor` + hide both hemispheres | none on `/learn` |
| 🆕 (Figma) Focus | `focus_region` | `region`: a structure ("hippocampus"), a group ("right temporal"), or `tumor` | structure → `selectStructure` (camera flies there); group → camera fit to the group's box; `tumor` → `focusTumor` | group fit in camera module |
| 🆕 (Figma) Show / hide | `toggle_visibility` | `targets[]` (`cortex`, a group, a structure, `left`, `right`, `edema`, `core`, `enhancing`), `visible` | many `setStructureVisible` / `setHemisphereVisible` / `setLayerVisible` | none on `/learn` |
| 🆕 | `reset_view` | — | `resetView` | none |
| 🆕 (Figma "Undo") | `undo` | — | 🆕 `{ type: 'undo' }` → restores the last state from a 20-step history kept by `dispatch` | history in `dispatch` |
| ✏️ Explain | `explain_structure` | `name`, `depth`: `brief` · `detailed` | server: text from `content/anatomy.json`; browser: `selectStructure` so the info panel opens too | server tool |
| ✏️ Explain | `explain_finding` | — | server: the SPEC §8.3 template over `report.json` (Explore only) | server tool |
| ✏️ Search | `search` | `query`, `sources`: `atlas` · `report` · `chat` | server: name/group match (same rule as `learn/filter.ts`) + chat history | server tool |
| ✏️ Annotation | `add_annotation` / `remove_annotation` | `text` (≤ 280), `anchor`: `selected` · `tumor` · RAS mm point | 🆕 `annotations` table + a 3D pin component | P7 |
| ✏️ Summarization | `summarize` | `scope`: `session` · `since_last` | server; stored in `sessionSummaries` | P7 |
| ✏️ Export (on request) | `export_document` | `format`: `md` · `pdf`; `sections` | built in the browser from report + transcript + annotations; download | P7 |
| ✏️ Export (auto after a phase) | same, `trigger: auto` | — | §7 | P7 |

**Name → id resolution** ("hippocampus" → `lh_hippocampus` + `rh_hippocampus`; "left hippocampus" → `lh_hippocampus`): one pure function, `resolveTarget(text, atlas)`, in `frontend/src/agent/resolveTarget.ts`. It uses the same matching as `learn/filter.ts` plus side words (left/right/L/R). If two structures match and no side is given, the tool picks both for show/hide and asks back for focus ("Left or right hippocampus?").

**Clamp vs reject** stays as in `dispatch`: out-of-range numbers are clamped ("zoom 900%" → 400%); unknown targets and tumor tools on a no-tumor case are rejected with the dispatcher's own message.

### 3.3 🆕 Tools per page (the agent only sees what the page supports)

Every request carries `page` and `availableTools`. The Router never offers a tool the page can't apply. Today:

| Tool | `/learn` (main) | `/jobs/:id/explore` (PR #50) |
|---|---|---|
| `zoom_view`, `rotate_view`, `spin_view`, `reset_view`, `undo` | ✅ after P1 | ✅ after P1 (same camera module) |
| `set_mode` solid / xray | ✅ | ⏳ needs Explore mode tabs (Milestone D) |
| `set_opacity` | ✅ cortex | ⏳ `CaseCanvas` ignores `brainOpacity` |
| `set_explode` | ✅ | ⏳ `CaseCanvas` ignores `explodeAmount` |
| `toggle_visibility` | ✅ structures, groups, L / R | ⏳ `CaseCanvas` ignores `hidden` and `layers` (marked `shortcut:` in the code) |
| `isolate`, `focus_region` | ✅ | `tumor` only ✅ (`focusTumor`) |
| `explain_structure` | ✅ | — (no atlas on Explore) |
| `explain_finding` | — | ✅ |

⏳ rows turn ✅ as Ben's Explore controls land. The agent picks them up with no agent change: the page's tool list is the switch.

## 4. 🆕 The Agent Panel (Figma frame 04, nodes `46:*`)

The Figma frame already designs the chat and voice UI. Mapping each part to code and data:

| Figma part | Component (new, `frontend/src/agent/`) | Data |
|---|---|---|
| Agent Header: avatar, **"Neuro Agent"**, "Navigates the brain for you", status pill | `AgentHeader` | status: `Listening` (Space held) · `Thinking` (run active) · `Ready` · `Voice off` (no mic / denied) · `Offline` (no Convex or no key; fast path still works) |
| Mode Tabs: **Voice · Script · History** | `AgentPanel` tabs | Voice = live conversation. Script = the demo script as clickable steps (each sends its phrase). History = past runs, export button, MCP pair code (§8) |
| Context chips ("Tumor · focused", "Explode 75%") | `ContextChips` | derived from `useViewer` (mode, explode %, selection, isolate). Also sent to the agent as context |
| Event row ("Pinch · you selected Hippocampus") | `ConversationLog` | 🆕 `actionLog` bus: `dispatch` emits `{ source, action, result }` for **every** source, so pointer and gesture actions show here too |
| User bubble ("You · voice · 10:45") | `ConversationLog` | transcript + source |
| Agent message with its role label and reply | `ConversationLog` | `agentRuns.reply` + which specialist answered. ✏️ Figma says "Neuro · Clinical Reasoner"; proposed **"Neuro · Navigator" / "Neuro · Anatomy tutor" / "Neuro · Scribe"**, since "clinical" clashes with the no-diagnosis rule (D9) |
| **Tool Calls** rows: ✓ + `focus_region("right_temporal")` + "14 ms" | `ToolCallRow` (Figma `45:30`) | one row per step: call text, ✓ or ✗ with the dispatch message, latency = server time + apply time |
| "Try saying" chips | `SuggestionChips` | from state: exploded → "Bring it back together"; X-Ray → "Bring cortex back"; selection → "Explain this"; else the SPEC §8.3 phrases |
| Voice Input Bar: mic, live transcript, waveform, "Hold Space or open palm to talk" | `VoiceInputBar` + `usePushToTalk` | Web Speech API interim results; a text box is always there (SPEC §8.3 fallback) |
| Toast "Tumor placed on the 3D brain … **Undo**" (top of the frame) | `ActionToast` | shown after an agent or voice change, with the `undo` action |

**Where the panel goes (D8):**
- **Explore:** the right column, as in Figma.
- **`/learn`:** the right column already holds the structure info panel. Proposed: right column tabs **Info | Agent**. `explain_structure` switches to Info.

The "Gestures off" chip in `TopNavBar` gets a sibling **voice chip** (SPEC §9: "Voice off").

## 5. 🆕 Frontend work, file by file

| File | Change |
|---|---|
| `actions/reduce.ts` 🆕 | the pure reducer pulled out of `dispatch.ts`: `(state, action, ctx) → { state, result, effects }`. No zustand import, so Convex can import it too |
| `actions/dispatch.ts` | becomes: run `reduce`, set the store, run effects (camera), push history (non-pointer sources), emit `actionLog`. Behaviour and tests unchanged |
| `actions/types.ts` | add actions `zoom`, `rotate`, `spin`, `fitBox`, `undo`; `Source` adds `'chat'` and `'mcp'` |
| `viewer/cameraCommands.ts` 🆕 | one hook used by `AtlasCanvas` and `CaseCanvas`: listens on `viewEvents` for `camera` events and calls `CameraControls`. Shares `HOME` (today copied in both canvases) |
| `agent/tools.ts` 🆕 | **the tool registry**: name, description, JSON schema, `pages`, `toActions(args, ctx)`. Imported by the frontend, Convex and `mcp/`, so names and schemas can't drift |
| `agent/parseIntent.ts` 🆕 + test | the fast path. The 8 SPEC §8.3 phrases + the brief's: "zoom in", "zoom to 150%", "left view", "spin", "x-ray", "solid", "explode 50%", "isolate the hippocampus", "hide the cortex", "undo". Output: tool calls, not actions, so the panel shows the same rows either way |
| `agent/resolveTarget.ts` 🆕 + test | structure / group / side names → ids |
| `agent/AgentPanel.tsx` + parts 🆕 | §4 |
| `agent/usePushToTalk.ts` 🆕 | hold Space (not when typing in an input), Web Speech API, mic-denied → `Voice off` |
| `agent/useAgentRun.ts` 🆕 | P3: `useMutation(api.agent.ask)` + `useQuery(api.agent.getRun)`; applies each new step once by `step.id` |
| `main.tsx` | P3: `ConvexProvider` with `VITE_CONVEX_URL`; with no URL the panel runs fast-path-only |
| `routes/Learn.tsx`, `routes/Explore.tsx` | mount the panel; pass `page` and `availableTools` |
| `components/TopNavBar.tsx` | voice chip |

**Coordination:** Ben owns the frontend (PR #50 open). P1 touches `dispatch.ts`, both canvases and `Explore.tsx`, so **PR #50 merges first** and Ben reviews every frontend PR from this plan (D10).

## 6. 🔄 Multi-agent architecture (Convex side)

| Agent | Job | Tools it gets | Model |
|---|---|---|---|
| **Fast path** (`parseIntent`, browser code) | Common commands, instantly, with no network | all viewer tools | none |
| **Router** | Picks one specialist; answers single-tool requests itself | `handoff` + viewer tools | `claude-opus-5-5`, effort `low` (option: `claude-haiku-5-5`, D4) |
| **Navigator** | Multi-step view requests ("spin to the right side and fade the cortex") | viewer tools for this page | `claude-opus-5-5`, `low` |
| **Anatomy tutor** | Explain and search, only from `anatomy.json`, `structures.json`, `report.json` and session chat | `explain_structure`, `explain_finding`, `search`, `focus_region` | `claude-opus-5-5`, `medium` |
| **Scribe** | Summaries, annotations, exports | `summarize`, `add_annotation`, `export_document` | `claude-opus-5-5`, `medium` |
| **Guard** (code) | Tool allow-list per page, rate limit (1 active run per client, 10 runs/min), spend cap, banned wording (diagnosis, prognosis, "healthy") checked on every reply | inside `agent.run` | none |

The Figma example, as one run: *"Spin to the right side. How close is the hippocampus to the tumor?"*
1. The fast path misses (two requests in one), so the Router hands off to **Navigator**.
2. Navigator calls:
   - `rotate_view({ preset: "right" })` → ✓;
   - `toggle_visibility({ targets: ["cortex"], visible: false })` → ✓.
3. It hands off to **Anatomy tutor**, which calls `explain_structure({ name: "hippocampus", depth: "brief" })` → ✓.
4. Distance numbers come only from real data. On `/learn` there is no tumor, so the tutor says so. On Explore, a distance needs the atlas registered to the patient, which is out of scope (SPEC D6). The agent says it can't measure that, rather than inventing "6.2 mm".

**Convex files (P3):**

| File | Contents |
|---|---|
| `convex/schema.ts` | 🆕 `agentRuns` { clientId, sessionId?, text, source, page, status, steps[ { id, tool, args, ok, message, ms } ], reply, agent, error, createdAt }, index `by_client` |
| `convex/agent.ts` | `ask` (mutation: check rate limit, insert run, `scheduler.runAfter(0, internal.agent.run)`), `run` (internalAction: Claude loop), `getRun` / `listRuns` (queries), `cancel`, `callTool` (MCP) |
| `convex/agentPrompts.ts` | system prompts per agent; frozen text so prompt caching works |
| shared imports | `frontend/src/agent/tools.ts` and `frontend/src/actions/reduce.ts` imported by Convex (check in P3 that the Convex bundler accepts imports from outside `convex/`; if not, move both to a root `shared/` folder) |

**Claude call details:**
- `@anthropic-ai/sdk` inside the action; key in a Convex env var only.
- Hand-written tool loop, max 6 turns, so each call is checked and logged.
- `strict: true` tool schemas and `tool_choice: auto`.
- Prompt caching: system prompt + sorted tool list first.
- The state snapshot, recent chat and the user text go after the cache breakpoint.
- Chat text is untrusted data, never instructions.

## 7. ✏️ Export, and auto-export after a phase

- **On request:** "export this as PDF" → Scribe → `export_document`. The browser builds the file:
  - Markdown first;
  - PDF through the browser's print-to-PDF of a print stylesheet, so no new dependency.

  Figma's share icon (bottom-left of frame 04) is the manual button.
- **Contents:**
  - the case, or "Atlas (template brain, not a patient)" on `/learn`;
  - report numbers;
  - annotations;
  - the conversation;
  - the tool steps;
  - the "Educational, not clinically validated" notice.
- **Auto triggers (D5):**
  - job reaches `done`;
  - leaving Explore;
  - every ~15 messages (with the rolling summary).

  Versioned `export-v1`, `export-v2`, …; nothing is overwritten.

## 8. 🔄 MCP server

- `mcp/` package, `@modelcontextprotocol/sdk`, stdio (Claude Desktop, Claude Code) + Streamable HTTP.
- Tools: generated from `frontend/src/agent/tools.ts` (same names, same schemas).
- 🔄 **Pairing instead of session tokens:** the frontend has no live-review session yet. The Agent Panel's History tab shows a 6-character pair code for this browser tab. The code expires after 10 minutes and is stored in an `agentLinks` table.
  - The user gives the code to Claude Desktop once (`pair` tool).
  - Calls then go to `agent.callTool({ pairCode, name, args })` → an `agentRuns` row → the browser applies it like any other step.
  - Rows show `source: mcp`.
- Resources: current context chips, `report.json`, the atlas list.
- **Demo moment:** in Claude Desktop, "rotate to the left view and isolate the hippocampus" → the browser turns, with the tool rows in the panel.

## 9. ✏️ Voice

- Hold **Space** (SPEC §8.1) → Web Speech API with interim results in the Voice Input Bar → on release the transcript is sent with `source: 'voice'`.
- Fast path first. The agent only runs when there is no match.
- Spoken reply (browser speech synthesis): off by default, with a toggle in the header.
- **Targets:**
  - a fast-path command visibly changes the view < 300 ms after release;
  - an agent request shows `Thinking` at once and finishes in a few seconds.
- **Fallbacks:** no mic or denied → `Voice off` chip; the text box always works (SPEC §8.3 hall-noise risk).

## 10. 🔄 Decisions for Tom

| # | Decision | Proposed |
|---|---|---|
| D1 | SPEC D8 says Jarvis is deterministic; LLM is P1 | Amend D8: fast path stays deterministic and offline; Claude agents added behind it |
| D2 | 🔄 M6 (wider shared view) | Not needed for chat, voice or MCP any more; keep for multi-viewer review (P8) |
| D3 | M4: affine in `report.json` (contract v1.2) | Only needed for P7 annotations on Explore |
| D4 | LLM key and Router model | `claude-opus-5-5`, effort `low`; or `claude-haiku-5-5` for the Router |
| D5 | Auto-export triggers | job done + leaving Explore |
| D6 | What ships before the h29 freeze | P1–P3, plus P5 (MCP) if time |
| D7 | Name: NeuroVision vs NeuroLens | NeuroVision (the UI already uses it) |
| D8 🆕 | Agent panel place on `/learn` | Right column tabs **Info \| Agent** |
| D9 🆕 | Figma label "Clinical Reasoner" | Rename to Navigator / Anatomy tutor / Scribe |
| D10 🆕 | Frontend ownership | PR #50 merges first; Ben reviews the frontend PRs from this plan |

## 11. 🔄 Build phases (each = one GitHub issue, merged only by Tom)

| # | Phase | Owner | Done when (acceptance) |
|---|---|---|---|
| P0 | Decisions D1–D10; SPEC D8 amendment | lead + Tom | Decision Log lines merged |
| **P1** | Pure `reduce` + `cameraCommands` + new actions (zoom, rotate, spin, undo) + `actionLog` + `tools.ts` + `parseIntent` + `resolveTarget` + Agent Panel with a text box, on `/learn` | codex1 (logic) + claude2 (panel), Ben reviews | On `/learn`, typing each of these changes the view and shows a ✓ row with ms: "zoom to 150%", "left view", "spin", "x-ray", "cortex 20%", "explode 50%", "isolate the left hippocampus", "hide the cortex", "undo", "reset". Existing dispatch tests still pass; new tests for every parser phrase and every tool's `toActions`. **No Convex, no LLM** |
| P2 | Push-to-talk + voice chip + suggestion chips + Script tab | claude2 | Same 10 phrases by voice in Chrome; mic denied → `Voice off`, text still works |
| P3 | Convex client in the frontend + `agentRuns` + `agent.ask` / `run` + Router + Navigator | codex2 | The Figma request works end to end; 40-phrase eval ≥ 90% correct tool calls; with no key: "Assistant unavailable", fast path still works |
| P4 | Anatomy tutor: `explain_structure`, `explain_finding`, `search` | claude-old | Answers quote `anatomy.json` / the report; banned-wording test passes |
| P5 | MCP server + pairing | codex1 | MCP Inspector lists all tools; Claude Desktop drives `/learn` after pairing |
| P6 | Explore parity: wire `CaseCanvas` to opacity, hidden, layers, explode (with or after Milestone D) | Ben | the ⏳ rows in §3.3 turn ✅ with no agent change |
| P7 | Scribe: summarize, annotations (needs D3), export + auto-export | claude2 | manual and auto exports download; pins sit within 2 mm |
| P8 | Multi-viewer sync (M6), hardening, demo script twice | lead | two tabs follow one presenter; demo runs twice with the LLM off and on |

## 12. 🆕 Test plan

- **Unit (vitest):**
  - `reduce` (all existing dispatch tests move over);
  - `parseIntent` (every phrase above and the SPEC §8.3 list);
  - `resolveTarget` (sides, groups, ambiguity);
  - each tool's `toActions`;
  - zoom % ↔ distance;
  - undo history.
- **Convex (`convex-test`):**
  - rate limit;
  - page allow-list;
  - a step's `{ ok, message }` equals what the browser's `dispatch` returns for the same snapshot.
- **Eval:** 40 phrases per page with the expected tool calls, run on every prompt change.
- **Manual:**
  - the Figma request;
  - LLM off;
  - mic denied;
  - MCP pairing;
  - a no-tumor case ("show the tumor" → "No tumor detected in this scan").

## 13. Change log

**v1 (2026-10-24):** first draft from the docs: tool registry, `executeTool`, wider shared view, tool catalog, agents, export, MCP, voice, decisions D1–D7, phases P0–P8.

**v2 (2026-10-24), after reading the frontend code (main + PR #50) and the Figma frames:**
- 🆕 §0: inventory of what the frontend already has (dispatch door, `Source: 'voice'`, actions, the Figma Neuro Agent panel, no Convex client yet).
- 🔄 §2: tools are **applied in the browser** through `dispatch`; Convex carries them in `agentRuns`. Replaces v1's "widen `sessions.view` first", which moves to P8.
- 🔄 §3.1: tool names changed to **snake_case** (the Claude API rejects dots) and aligned with the Figma names.
- 🔄 §3.2: every tool now names the exact frontend action. New actions: zoom, rotate, spin, fitBox, undo. Zoom % is defined against the home camera distance. Opacity switches to X-Ray first.
- 🆕 §3.3: tools per page; the agent only gets tools the page supports.
- 🆕 §4: the Figma Agent Panel mapped to components and data, plus the panel location question (D8) and the "Clinical Reasoner" label (D9).
- 🆕 §5: frontend file-by-file plan; PR #50 first.
- 🔄 §6: agents renamed to Navigator / Anatomy tutor / Scribe; the fast path moves into the browser; the Figma example walked through, including what the agent must refuse to invent.
- 🔄 §8: MCP uses a short-lived pair code instead of session tokens.
- 🔄 §10: decisions D8–D10 added; D2 downgraded.
- 🔄 §11: phases reordered: frontend-only P1–P2 first (no LLM needed), the Convex agent in P3.
- 🆕 §12: test plan.
