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
> Tom's brief is unchanged. Markers: **🆕** = new, **✏️** = an item of the brief clarified, **🔄** = changed in **v2** after reading the frontend code and the Figma frames, **🔀** = changed in **v3**: Tom's split, MCP for knowledge and documents, `dispatch` for viewer actions. **🧭** = changed in **v4**: the D1 wording, open questions, model certainty. **✂️** = changed in **v5**: decisions limited to the multi-agent system.
> Status: **DRAFT v5 for Tom's approval. Nothing here is built yet.** The full list of changes is in the [Change log](#13-change-log).

# 🆕 Multi-agent assistant: detailed plan (v5)

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
| Educational text for every structure: description, functions, "when damaged" | `frontend/src/content/anatomy.json` | The ground truth for the MCP `explain_structure` tool. No invented anatomy. |
| Figma frame 04 has a full **"Neuro Agent" panel** (nodes `46:*`) and a **Tool Call** row (`45:30`) | `docs/figma/04-explore.png`, `04-explore.ref.tsx`, `symbol-tool-call.ref.tsx` (PR #50) | That panel is the UI spec for chat and voice (§4). |
| **No Convex client in the frontend** (`convex` is not in `frontend/package.json`) | | Adding it is a P3 task. P1 and P2 work with no Convex and no LLM. |

## 1. 🔀 Goal

Chat and voice share one assistant. Its tools come in **two kinds** (Tom's split, v3):

| Kind | Examples | Runs through | Why |
|---|---|---|---|
| **Viewer actions**: change what is on screen | zoom, rotate, spin, mode, opacity, explode, isolate, show/hide, focus, reset, undo | **`dispatch`** in the browser | the viewer state and the camera live in the browser; they must feel instant |
| **Knowledge and documents**: read real data or build a document, never change the view | explain a brain structure, tumor size and other report numbers, search, summary, export | **MCP server** (`neuro-mcp`) | read-only or document-producing; one server that the in-app agents **and** outside clients (Claude Desktop) share |

The Claude agents run in **Convex** actions and use both kinds in one request: "rotate left and tell me the tumor volume" = `rotate_view` applied in the browser + `get_tumor_metrics` answered by MCP.

## 2. 🔀 Architecture: viewer tools through `dispatch`, knowledge tools through MCP

```
 AgentPanel text box ─┐
 Push-to-talk (Space) ┤
                      ▼
            parseIntent(text, page)            ← browser, no network, no LLM (SPEC D8); viewer commands only
              │ match                │ no match
              ▼                      ▼
        viewer tool calls   Convex mutation agent.ask({ clientId, text, source, snapshot })
              │                      ▼ schedules
              │             internalAction agent.run: Router → specialist (Claude, ≤ 6 tool turns)
              │               │
              │               ├─ VIEWER tool_use → checked with the SAME pure reducer → tool_result
              │               │                    → appended to agentRuns.steps (browser applies it)
              │               │
              │               └─ KNOWLEDGE / DOCUMENT tool → MCP server `neuro-mcp` (Convex HTTP endpoint /mcp)
              │                    explain_structure · get_tumor_metrics · get_report · search ·
              │                    summarize · export_document
              │                    reads ONLY report.json / anatomy.json / structures.json / the session's chat
              │                      ▼
              │             agentRuns row (status, steps[], reply)
              │                      │ useQuery subscription: each viewer step is applied once (by step id)
              ▼                      ▼
        toolToActions(step) ──► dispatch(action, 'voice' | 'chat' | 'mcp') ──► useViewer ──► 3D view
                                     └─► actionLog ──► AgentPanel Tool Call rows (✓/✗, message, ms)
                                                       (MCP steps show as rows too, with an "MCP" tag)

 Claude Desktop / Claude Code ─► neuro-mcp (same server, same knowledge + document tools)
                                 └─ optional: viewer tools, forwarded to a paired browser (§8.3)
```

**Why viewer actions stay on `dispatch`:**
- The viewer state (`useViewer`) and the camera live in the browser. A server can't move the camera directly.
- One door, one validation (SPEC §7.3).
- Viewer commands must feel instant, so they skip the extra MCP hop.
- v1's wider shared view (M6) is still needed for **multi-viewer** live review only; it moves to P8.

**Why the server can still answer "did it work?" for viewer tools:** the reducer inside `dispatch` is pulled out into a pure function, `reduce(state, action, ctx) → { state, result }` (§5, P1). The Convex action runs it on the snapshot the browser sent, so Claude gets the real `{ ok, message }` (e.g. "No tumor detected in this scan") as its `tool_result`, and the browser gets the same result when it applies the step.

**Why knowledge and documents go to MCP:**
- They only read real data or produce a file; nothing on screen changes, so they don't need the browser.
- One server answers both the in-app agents and outside MCP clients: Claude Desktop gets "how big is the tumor?" and "export a summary" for free.
- The data rules live in one place: every number comes from `report.json`; no report (as on `/learn`) = the tool says so.

## 3. ✏️ Tool catalog, mapped to the frontend

### 3.1 🔄 Tool names

Claude API tool names may only use letters, digits, `_` and `-`, so v1's `viewer.zoom` style is invalid. v2 uses **snake_case**, matching the names in the Figma panel (`focus_region`, `explain_structure`, `toggle_visibility`). MCP uses the same names.

🔀 **Where each tool runs** (v3): the **Runs on** column below. `dispatch` = applied in the browser. `MCP` = answered by the `neuro-mcp` server.

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
| ✏️ Explain | `explain_structure` | `name`, `depth`: `brief` · `detailed` | 🔀 **MCP**: text from `content/anatomy.json`. The agent then also calls `focus_region` (dispatch) so the info panel opens | MCP tool |
| ✏️ Explain | `explain_finding` | `job_id` | 🔀 **MCP**: the SPEC §8.3 template over `report.json` | MCP tool |
| 🆕 Tumor size / info | `get_tumor_metrics` | `job_id`, `fields?` | 🔀 **MCP**: from `report.json`: `volumesCm3` (whole, core, enhancing), `side`, `lesionCount`, `centroidMm`, bbox size in cm, `segmentationSource`, `expertDice` when present, 🧭 `certainty` when present (#52). No report or `tumorDetected: false` → says so ("No tumor detected in this scan", never "healthy") | MCP tool |
| 🆕 Case facts | `get_report` | `job_id` | 🔀 **MCP**: the scan facts (shape, spacing, sequences, model name/version) | MCP tool |
| ✏️ Search | `search` | `query`, `sources`: `atlas` · `report` · `chat` | 🔀 **MCP**: name/group match (same rule as `learn/filter.ts`) + chat history | MCP tool |
| ✏️ Annotation | `add_annotation` / `remove_annotation` | `text` (≤ 280), `anchor`: `selected` · `tumor` · RAS mm point | **dispatch** (it puts a pin on screen) + 🆕 `annotations` table | P7 |
| ✏️ Summarization | `summarize` | `scope`: `session` · `since_last` | 🔀 **MCP**: summary of this session's chat + tool steps; stored in `sessionSummaries` | P7 |
| ✏️ Export (on request) | `export_document` | `format`: `md` · `pdf`; `sections` | 🔀 **MCP**: builds the document, stores it in Convex file storage, returns a download link (§7) | P7 |
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
| `explain_structure` (MCP) | ✅ | — (no atlas on Explore) |
| `explain_finding`, `get_tumor_metrics`, `get_report` (MCP) | — (answers "this is the template atlas, not a patient scan") | ✅ |
| `search`, `summarize`, `export_document` (MCP) | ✅ | ✅ |

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
| Agent message with its role label and reply | `ConversationLog` | `agentRuns.reply` + which specialist answered. ✏️ Figma says "Neuro · Clinical Reasoner"; **decided (D6): "Neuro · Navigator" / "Neuro · Anatomy tutor" / "Neuro · Scribe"**; "clinical" is never shown (no-diagnosis rule) |
| **Tool Calls** rows: ✓ + `focus_region("right_temporal")` + "14 ms" | `ToolCallRow` (Figma `45:30`) | one row per step: call text, ✓ or ✗ with the dispatch message, latency = server time + apply time |
| "Try saying" chips | `SuggestionChips` | from state: exploded → "Bring it back together"; X-Ray → "Bring cortex back"; selection → "Explain this"; else the SPEC §8.3 phrases |
| Voice Input Bar: mic, live transcript, waveform, "Hold Space or open palm to talk" | `VoiceInputBar` + `usePushToTalk` | Web Speech API interim results; a text box is always there (SPEC §8.3 fallback) |
| Toast "Tumor placed on the 3D brain … **Undo**" (top of the frame) | `ActionToast` | shown after an agent or voice change, with the `undo` action |

**Where the panel goes (D5):**
- **Explore:** the right column, as in Figma.
- **`/learn`:** the right column already holds the structure info panel. **Decided (D5):** right column tabs **Info | Agent**. `explain_structure` switches to Info.

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

**Coordination:** Ben owns the frontend (PR #50 open). P1 touches `dispatch.ts`, both canvases and `Explore.tsx`, so **PR #50 merges first** and Ben reviews every frontend PR from this plan.

## 6. 🔄 Multi-agent architecture (Convex side)

| Agent | Job | Tools it gets | Model |
|---|---|---|---|
| **Fast path** (`parseIntent`, browser code) | Common commands, instantly, with no network | all viewer tools | none |
| **Router** | Picks one specialist; answers single-tool requests itself | `handoff` + viewer tools | `claude-opus-5-5`, effort `low` (D2: Haiku only if latency or cost needs it later) |
| **Navigator** | Multi-step view requests ("spin to the right side and fade the cortex") | viewer tools for this page | `claude-opus-5-5`, `low` |
| **Anatomy tutor** | Explain, tumor numbers and search: scan facts only from `anatomy.json`, `structures.json`, `report.json` and session chat; general-education questions also from the web with citations (D9) | 🔀 MCP: `explain_structure`, `explain_finding`, `get_tumor_metrics`, `get_report`, `search`; dispatch: `focus_region`; 🧭 Claude server tool `web_search` (general education only, `max_uses` 3) | `claude-opus-5-5`, `medium` |
| **Scribe** | Summaries, annotations, exports | 🔀 MCP: `summarize`, `export_document`; dispatch: `add_annotation` | `claude-opus-5-5`, `medium` |
| **Guard** (code) | Tool allow-list per page, rate limit (1 active run per client, 10 runs/min), spend cap, banned wording (diagnosis, prognosis, "healthy") checked on every reply | inside `agent.run` | none |

The Figma example, as one run: *"Spin to the right side. How close is the hippocampus to the tumor?"*
1. The fast path misses (two requests in one), so the Router hands off to **Navigator**.
2. Navigator calls:
   - `rotate_view({ preset: "right" })` → ✓;
   - `toggle_visibility({ targets: ["cortex"], visible: false })` → ✓.
3. It hands off to **Anatomy tutor**, which calls `explain_structure({ name: "hippocampus", depth: "brief" })` on **MCP** → ✓.
4. Distance numbers come only from real data. On `/learn` there is no tumor, so the tutor says so. On Explore, a distance needs the atlas registered to the patient, which is out of scope (SPEC D6). The agent says it can't measure that, rather than inventing "6.2 mm".

### 6.1 🧭 Open questions: how the Router handles them

The Router sorts every question into one of five kinds before any specialist runs:

| Kind | Example | What happens |
|---|---|---|
| **1. This scan or this brain** | "How big is the tumor?", "Where is the hippocampus?" | Anatomy tutor → MCP tools. Answers only with numbers and text from `report.json` / `anatomy.json`, and names the source |
| **2. General education** | "What is a glioblastoma?", "What does edema mean?" | **Decided by Tom (D9 = B):** Claude answers from general knowledge **plus the Claude API server-side web search tool**, with cited sources shown under the answer, always labelled *"General information, not from this scan"*, never with numbers about this patient. Kind 3 refusal and the Guard still apply to the whole reply |
| **3. Medical judgement** | "Is it cancer?", "How long will he live?", "Should he have surgery?", "Is the scan healthy?" | **Always refused**, fixed text: *"I can't diagnose or predict outcomes. This is an educational view, not clinically validated. Please ask a doctor."* It may still state facts: volumes, side and the model's certainty of the outline (§6.2) |
| **4. About the app** | "What can you do?", "How do I explode the brain?" | Short help text + this page's tool list + "Try saying" chips |
| **5. Off-topic** | "What's the weather?" | One line: "I help with the brain viewer. Try: …" |

**When unsure:**
- It asks back instead of guessing ("Left or right hippocampus?").
- No report → "There is no patient report on this page (template atlas)."
- No LLM key or no network → "Assistant unavailable for open questions. Commands still work."

**The Guard** (code, not a prompt) blocks *diagnosis*, *prognosis*, *survival*, *malignant / benign* and *"healthy"* in every reply.

### 6.2 🧭 Model certainty (Tom approved, issue #52)

What the model does and doesn't give us:
- **What SegResNet gives:** a per-voxel probability for each region (TC, WT, ET).
- **What `predict.py` does with it today:** cuts it at 0.5 and throws the probabilities away, so `report.json` has **no confidence field**.
- **What `expertDice` is:** it exists on the seeded samples only. It measures **agreement with the expert outline**, not how sure the model is.
- **What the model can't do:** decide "cancer or not" or the tumor type. It was trained on glioma scans (BraTS) and only outlines regions.

**Change (contract v1.2, issue #52, codex1):**
- `report.json` gets `"certainty": { "whole", "core", "enhancing" }`: the mean model probability inside each segmented region, 0–1.
- An empty region gives `null`, and so do expert segmentations.
- The seeds are regenerated with it.

**How the agent may use it:** only as *"the model's average certainty for the outlined region is 93%. This measures the outline, not a diagnosis."* It is not calibrated, so it is never called a probability of disease.

**Example answer to "Is it cancer?":** *"I can't diagnose. The model outlined a 136 cm³ region in the right hemisphere, with an average outline certainty of 93%. That describes the outline, not what the tissue is. Please ask a doctor."*

**Convex files (P3):**

| File | Contents |
|---|---|
| `convex/schema.ts` | 🆕 `agentRuns` { clientId, sessionId?, text, source, page, status, steps[ { id, tool, args, ok, message, ms } ], reply, agent, error, createdAt }, index `by_client` |
| `convex/agent.ts` | `ask` (mutation: check rate limit, insert run, `scheduler.runAfter(0, internal.agent.run)`), `run` (internalAction: Claude loop), `getRun` / `listRuns` (queries), `cancel`, `callTool` (forwarded MCP viewer calls, §8.3) |
| `convex/http.ts` + `convex/mcp/*` 🔀 | the `neuro-mcp` server on the Convex HTTP endpoint `/mcp` (Streamable HTTP, stateless). Knowledge and document tools (§8) |
| `convex/agentPrompts.ts` | system prompts per agent; frozen text so prompt caching works |
| shared imports | `frontend/src/agent/tools.ts` and `frontend/src/actions/reduce.ts` imported by Convex (check in P3 that the Convex bundler accepts imports from outside `convex/`; if not, move both to a root `shared/` folder) |

**Claude call details:**
- `@anthropic-ai/sdk` inside the action; the key is the Convex env var `ANTHROPIC_API_KEY` only, never in the frontend or git (D2).
- Hand-written tool loop, max 6 turns, so each call is checked and logged.
- 🔀 **How the agent reaches MCP (D7, decided by Tom: A):**
  - **A:** the Convex action is an MCP client (`@modelcontextprotocol/sdk` `Client`). It lists `neuro-mcp`'s tools once, passes them to Claude next to the viewer tools, and runs each MCP `tool_use` itself. We keep the rate limit, the log row and the latency for every call.
  - Not used: the Claude API's MCP connector (option B). It would have Anthropic call the server, needing a public URL + token, and we could only log the calls after the fact.
- `strict: true` tool schemas and `tool_choice: auto`.
- Prompt caching: system prompt + sorted tool list first.
- The state snapshot, recent chat and the user text go after the cache breakpoint.
- Chat text is untrusted data, never instructions.

## 7. 🔀 Export, and auto-export after a phase (MCP)

- **On request:** "export this as PDF" → Scribe → MCP `export_document`:
  - the server builds Markdown from real data; PDF comes later in P7 from the same Markdown (library chosen then) (D8, decided);
  - the file goes into **Convex file storage**;
  - the tool returns a download link, shown in the panel as a file card.

  Figma's share icon (bottom-left of frame 04) calls the same tool directly.
- **The same tool works from Claude Desktop:** "export a summary of my session" returns the same link.
- **Contents:**
  - the case, or "Atlas (template brain, not a patient)" on `/learn`;
  - report numbers (from `get_tumor_metrics`, so the same numbers as the chat);
  - annotations;
  - the conversation summary (`summarize`) and the tool steps;
  - the "Educational, not clinically validated" notice.
- **Auto triggers (D3, decided):** job reaches `done`; leaving Explore; every ~15 messages (with the rolling summary). Convex calls the MCP tool from a scheduled function, versioned `export-v1`, `export-v2`, …; nothing is overwritten.

## 8. 🔀 MCP server `neuro-mcp`

### 8.1 Where it lives
- On the Convex deployment's HTTP endpoint (`https://<deployment>.convex.site/mcp`), Streamable HTTP, stateless: **no extra server to run or host**.
- Built with `@modelcontextprotocol/sdk`. A thin stdio wrapper in `mcp/` lets Claude Desktop / Claude Code connect locally.
- Tool definitions: one file, shared with the frontend registry, so names and schemas can't drift.

### 8.2 Tools and resources (the core, used by the in-app agents)

| Tool | Reads | Returns |
|---|---|---|
| `explain_structure` | `anatomy.json`, `structures.json` | description, functions, "when damaged", side, group, volume |
| `explain_finding` | `report.json` | the SPEC §8.3 template text |
| `get_tumor_metrics` | `report.json` | volumes (whole, core, enhancing), side, lesions, size, source, Dice when present, 🧭 `certainty` when present |
| `get_report` | `report.json` | scan facts and model version |
| `search` | atlas list, report, chat | matches with where they came from |
| `summarize` | session chat + tool steps | summary text; stored in `sessionSummaries` |
| `export_document` | all of the above | download link (§7) |

Resources (read-only): `report://{jobId}`, `atlas://structures`, `session://{id}/summary`.

**Rules for every tool:**
- Numbers only from the files: no report → "There is no report for this case". `tumorDetected: false` → "No tumor detected in this scan", never "healthy".
- No diagnosis, prognosis or treatment wording (contract §5); the Guard checks every reply.
- Read-only, apart from `summarize` and `export_document`, which write their own rows and files.
- **Auth:** a bearer token on every request: a Convex env secret for the in-app agent, a per-user token for Claude Desktop. Rate limited.

### 8.3 Optional: viewer tools for Claude Desktop
Only for the demo moment "Claude Desktop turns the brain" (P5, stretch):
- `neuro-mcp` also lists the viewer tools, but **does not run them**. It forwards each call to `agent.callTool({ pairCode, name, args })` → an `agentRuns` row → the paired browser applies it through `dispatch`, like any other step.
- Pairing: the Agent Panel's History tab shows a 6-character code (10-minute expiry, stored in `agentLinks`). The user gives it to Claude Desktop once (`pair` tool).
- The in-app agents never use this path; they hand viewer tools to the browser directly (§2).

## 9. ✏️ Voice

- Hold **Space** (SPEC §8.1) → Web Speech API with interim results in the Voice Input Bar → on release the transcript is sent with `source: 'voice'`.
- Fast path first. The agent only runs when there is no match.
- Spoken reply (browser speech synthesis): off by default, with a toggle in the header.
- **Targets:**
  - a fast-path command visibly changes the view < 300 ms after release;
  - an agent request shows `Thinking` at once and finishes in a few seconds.
- **Fallbacks:** no mic or denied → `Voice off` chip; the text box always works (SPEC §8.3 hall-noise risk).

## 10. ✂️ Decisions for Tom (multi-agent system only)

✂️ v5: renumbered. Tom's scope is the multi-agent system, so the items that don't belong to it were removed (listed under the table).

| # | Decision | Proposed |
|---|---|---|
| D1 ✅ #75 | SPEC D8 says Jarvis is deterministic; LLM is P1 | Replace D8 with: *"Jarvis = deterministic first, agents second. Speech/text → rule-based parser → tool call → `dispatch` (offline, always on). No parser match → Claude agents in Convex (Router → Navigator / Anatomy tutor / Scribe), which may only call registered tools: viewer tools via `dispatch`, knowledge tools via `neuro-mcp`. `explainFinding` stays a template over `report.json`; numbers only from the report; no diagnosis, prognosis or 'healthy'. LLM for text and voice. No free-form medical RAG."* Also: SPEC §8.3 flow line gains the agent step; the h20–26 row's "LLM / RAG frozen unless validated" becomes "agents frozen at h29 unless the eval passes"; one Decision Log line |
| D2 ✅ #76 | LLM model and API key | `claude-opus-5-5`, effort `low`, for every agent; Haiku for the Router only if latency or cost needs it later. Key: Convex env var `ANTHROPIC_API_KEY` (Tom provides it before #67) |
| D3 ✅ #77 | Auto-export triggers | job done + leaving Explore (+ the ~15-message summary checkpoint) |
| D4 ✅ #78 | What ships before the h29 freeze | P1–P4 (P4 = the MCP knowledge server); P5 and later are stretch |
| D5 ✅ #79 | Agent panel place on `/learn` | Right column tabs **Info \| Agent** |
| D6 ✅ #80 | Figma label "Clinical Reasoner" | Rename to Navigator / Anatomy tutor / Scribe |
| D7 ✅ #81 | How the in-app agent calls MCP | **A (Tom):** the Convex agent action is the MCP client of `neuro-mcp`, so every call is logged and rate limited. The Claude API MCP connector is not used |
| D8 ✅ #82 | PDF export | Markdown always; PDF built on the server in P7 (pick the library then) |
| D9 ✅ #83 | General-education questions (§6.1 kind 2) | **B (Tom):** general knowledge + the Claude API server-side web search tool, with cited sources, labelled "General information, not from this scan" |
| D10 ✅ #84 | Do agent-authored notes need a human Accept? | Yes: agent rows start `suggested`; exports include only `accepted` unless asked |

**Already decided:**
- ✅ Model certainty in `report.json` (issue #52, PR #55).
- ✅ Agent-authored items need a human Accept (D10): agent annotations start `suggested`; a human Accepts or Dismisses; exports include only `accepted` items unless asked for all; AI summaries are always labelled.
- ✅ One table per record type with an `author` field. We create the tables (#56); Sage writes the human-side functions + REST; Tom owns the MCP agent side.

**✂️ Removed (not part of the multi-agent system; owned elsewhere):**
- The wider Convex shared view for multi-viewer review (old D2, M6).
- The affine in `report.json` (old D3, backend contract). Until it exists, agent annotations use `structure` and `tumor` anchors only.
- The product name (old D7).
- Frontend ownership / PR #50 order (old D10).

## 11. 🔄 Build phases (each = one GitHub issue, merged only by Tom)

**D4 (decided):** P0–P4 ship before the h29 freeze, plus the human/agent tables and functions they need (#56, #53/#54, #57/#58). P5 and later are stretch. Tracking: #74.

| # | Phase | Owner | Done when (acceptance) |
|---|---|---|---|
| P0 | Decisions D1–D10; SPEC D8 amendment (D1 text in §10) | lead + Tom | Decision Log lines merged |
| P0b 🧭 | Model certainty in `report.json` (#52, contract v1.2) | codex1 | **in progress**; acceptance in #52 |
| **P1** | Pure `reduce` + `cameraCommands` + new actions (zoom, rotate, spin, undo) + `actionLog` + `tools.ts` + `parseIntent` + `resolveTarget` + Agent Panel with a text box, on `/learn` | codex1 (logic) + claude2 (panel), Ben reviews | On `/learn`, typing each of these changes the view and shows a ✓ row with ms: "zoom to 150%", "left view", "spin", "x-ray", "cortex 20%", "explode 50%", "isolate the left hippocampus", "hide the cortex", "undo", "reset". Existing dispatch tests still pass; new tests for every parser phrase and every tool's `toActions`. **No Convex, no LLM** |
| P2 | Push-to-talk + voice chip + suggestion chips + Script tab | claude2 | Same 10 phrases by voice in Chrome; mic denied → `Voice off`, text still works |
| P3 | Convex client in the frontend + `agentRuns` + `agent.ask` / `run` + Router + Navigator (viewer tools only) | codex2 | The viewer half of the Figma request works end to end; 40-phrase eval ≥ 90% correct tool calls; with no key: "Assistant unavailable", fast path still works |
| P4 🔀 | **`neuro-mcp`** on Convex `/mcp`: `explain_structure`, `explain_finding`, `get_tumor_metrics`, `get_report`, `search` + Anatomy tutor wired to it (D7) | codex1 (server) + claude-old (agent) | MCP Inspector lists the tools; "how big is the tumor?" on `sample` answers the report's exact cm³; on `/learn` it says there is no patient report; Claude Desktop gets the same answers; banned-wording test passes |
| P5 🔀 | Optional: viewer tools for Claude Desktop through pairing (§8.3) | codex1 | Claude Desktop turns the brain on `/learn` after pairing |
| P6 | Explore parity: wire `CaseCanvas` to opacity, hidden, layers, explode (with or after Milestone D) | Ben | the ⏳ rows in §3.3 turn ✅ with no agent change |
| P7 | Scribe: MCP `summarize` + `export_document` (+ auto-export), annotations via MCP (#54; `structure` / `tumor` anchors) | claude2 | exports download from the panel and from Claude Desktop; same numbers as the chat; pins sit within 2 mm |
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
- **MCP:**
  - each tool against the `sample`, `sample-2` and no-report cases;
  - numbers equal `report.json` exactly;
  - no-tumor and no-report wording;
  - bad token → 401;
  - 🧭 `certainty` passed through exactly; `null` → the tool says the certainty is not available;
  - MCP Inspector run.
- 🧭 **Open questions:** 10 phrases per kind (§6.1). Kind 2 answers carry the label and at least one cited source; a scan question never triggers web search (D9). Kind 3 is always refused, kind 5 always redirected; the Guard word list is tested on replies.
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

**v3 (2026-10-24), Tom's split:**
- 🔀 §1, §2: two kinds of tools. Viewer actions run through `dispatch` in the browser. Knowledge (explain, tumor size, report facts, search) and documents (summary, export) run on the MCP server `neuro-mcp`.
- 🔀 §3: a "Runs on" note for every tool; new MCP tools `get_tumor_metrics` and `get_report`.
- 🔀 §6: the Anatomy tutor and Scribe use MCP tools; the Convex agent acts as the MCP client (D11).
- 🔀 §7: export is built by MCP, stored in Convex file storage, returned as a link; it works from Claude Desktop too.
- 🔀 §8: `neuro-mcp` hosted on Convex's HTTP endpoint (no extra server). Viewer tools over MCP are optional (pairing, P5).
- 🔀 §10: D6 updated; new D11 (how the agent calls MCP) and D12 (PDF).
- 🔀 §11: P4 is now the MCP knowledge server (before the freeze); P5 is optional.

**v4 (2026-10-24), after Tom's Telegram questions:**
- 🧭 §10 D1: the exact replacement text for SPEC D8.
- 🧭 §6.1: how the Router handles open questions (5 kinds). General education is pending Tom (new D13); medical judgement is always refused, with fixed text.
- 🧭 §6.2: model certainty. Today the model's probabilities are discarded. Tom approved a per-region `certainty` field (issue #52, contract v1.2, new D14). The agent may only call it certainty of the outline, never a probability of disease.
- 🧭 §3, §8: `get_tumor_metrics` returns `certainty`. §10 D3 is renumbered to contract v1.3. §11 adds P0b (#52). §12 adds certainty and open-question tests.

**v5 (2026-10-24), Tom: "I only do the multi-agent system":**
- ✂️ §10: decisions renumbered D1–D10 and limited to the multi-agent system.
  - Removed: the wider shared view (old D2), the affine (old D3), the product name (old D7) and frontend ownership (old D10).
  - Added D10: do agent-authored notes need a human Accept?
  - D-references in the text updated to the new numbers. Earlier change-log entries keep the old numbers.
