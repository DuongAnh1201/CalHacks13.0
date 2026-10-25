---
name: neurovision-repo-overview
description: Start here for any work in the NeuroVision (CalHacks13.0) repo. Gives the repo map, locked decisions, cross-layer contracts, team lanes, branch/PR rules, and which specialised skill to load next (frontend, threejs, backend, model, convex, multi-agents). Use when starting a task, when unsure which part of the repo owns something, or before changing anything that crosses frontend/backend/Convex.
---

# NeuroVision: repo overview

An educational brain-MRI tumor viewer. Four NIfTI sequences go in. A MONAI SegResNet segments the tumor. The browser shows a 3D brain with the tumor placed inside it, plus MPR slices, a shared live session and a Claude agent panel. **The app is not clinically validated.** It never diagnoses.

## Source of truth (read before changing contracts)

| Doc | Owns |
|---|---|
| `docs/SPEC.md` (v1.2) | Product, routes, ViewerState/Action, keyboard/gesture/Jarvis, errors, tests, **Decision Log §14** |
| `docs/BACKEND_CONTRACT.md` | FastAPI endpoints, `report.json`, `model.glb` and `seg.nii.gz` rules |
| `docs/CONVEX_BACKEND.md` | Convex sessions, shared tables, MCP, exports, run commands |
| `docs/MultiAgents_brief.md` (v7) | Agent plan, tool catalog, phases P1–P8 (issues #64–#73, tracker #74) |
| `CONTRIBUTING.md` | Lanes, branch naming, PR rules |

If code and doc disagree, the doc is the contract. Fix the code, or change the doc **with a Decision Log line in SPEC §14**.

## Repo map

```
frontend/          Vite + React 19 + R3F viewer (→ neurovision-frontend, neurovision-threejs)
backend/           FastAPI + MONAI SegResNet, Docker (→ neurovision-backend, neurovision-model)
convex/            Convex backend at repo ROOT: sessions, shared tables, MCP, agent guard/eval (→ neurovision-convex, neurovision-multi-agents)
mcp/stdio.mjs      stdio proxy for Claude Desktop / Claude Code → Convex /api/mcp
docs/              SPEC, contracts, briefs, figma exports
.github/workflows/ci.yml   convex + frontend + backend checks; deploys from main only
```

The root `package.json` is the **Convex** package (`neurovision-convex-backend`). The frontend has its own `frontend/package.json`.

## Locked decisions (don't relitigate without a §14 line)

- D1: the input is exactly 4 NIfTI files (t1c, t1, t2, flair). JPG/PNG are rejected.
- D3: the brain mesh is built from the same scan, so `T_register = I`. No atlas-to-patient registration.
- D4: an expert-mask fallback is allowed (`segmentationSource`).
- D5: one R3F scene, plus NiiVue for slices.
- D6: hemispheres only on patient cases. No per-structure anatomy on patient scans.
- D8 (amended): the deterministic parser runs first. Claude agents in Convex come second.
- D9: imagery never leaves the backend. Convex stores asset **paths**, not pixels.
- D10: feature freeze at h29. Agent-made annotations start `suggested`.
- D11: `model.glb` has exactly 5 named nodes: `brain_left`, `brain_right`, `edema`, `core`, `enhancing`.

## Cross-layer contracts (break one = break three folders)

- **Coordinates**: everything is stored in **RAS millimetres**. Three.js scene = `R_yup · T_center · p_ras`, where `R_yup(x,y,z) = (x, z, −y)`. Slice indices are derived from the RAS cursor and are never stored as truth.
- **Seg labels**: 0 background, 1 edema (WT), 2 core (TC), 3 enhancing (ET). Nested: ET ⊂ TC ⊂ WT.
- **Layer colours**: edema `#F2C94C`, core `#F2994A`, enhancing `#EB5757`, brain `#D9D4CF`. They live in `backend/src/pipeline.py` COLORS and `frontend/src/viewer/layers.ts`. Change both or neither.
- **Shared Scene** (`convex/lib/viewCommands.ts` `Scene`) mirrors frontend `initialState()` (`frontend/src/actions/store.ts`). Change both together.
- **Wording**: never "healthy". Say "No tumor detected in this scan". No diagnosis or prognosis. "Certainty" means certainty of the outline, and it is uncalibrated.

## Env

`.env.example` lists names only:
- Root `.env.local`: written by the Convex CLI.
- `frontend/.env.local`: `VITE_CONVEX_URL`, `VITE_API_URL`.
- Convex server env (`npx convex env set`): `ANTHROPIC_API_KEY`, `MCP_TOKEN`, `IMAGING_API_URL`.

Secrets never go in files, and never reach the browser.

## Team workflow

- Lanes:
  - `lane:ml-backend` (Tom: ML backend, multi-agent merges)
  - `lane:viewer`
  - `lane:app`
  - Ben owns frontend pages; Sage owns human-side Convex functions.
- Branch: `<lane>/<short-desc>-<issue#>`, e.g. `agents/eval-73`. `main` is protected. PR body has `Closes #n`.
- Commit style: `area: imperative summary`, e.g. `viewer: add cutaway clip plane`, `convex: agent eval set + scorer (#73 part 1)`.
- This repo is indexed by GitNexus. Run `impact` before editing a symbol, and `detect_changes` before committing (see root `CLAUDE.md`).

## Verify before claiming done (mirror CI)

```sh
npm ci && npm run typecheck && npm test                   # convex (root)
cd frontend && npm ci && npm run lint && npm test && npm run build
cd backend && uv sync --frozen && uv run pytest -q
```

Report exactly what passed or failed. Never claim untested features work.

## Which skill next

| Task touches | Load |
|---|---|
| React pages, routing, stores, API client, share sync | `neurovision-frontend` |
| R3F / three.js scene, GLB loading, transforms, camera, NiiVue | `neurovision-threejs` |
| FastAPI endpoints, jobs, validation, Docker, deploy | `neurovision-backend` |
| SegResNet inference, masks, meshing, report numbers | `neurovision-model` |
| Convex schema, queries/mutations, sessions, auth, MCP server, exports | `neurovision-convex` |
| Agent Router/Navigator/Tutor/Scribe, Guard, tools, eval, phases P1–P8 | `neurovision-multi-agents` |
