---
name: neurovision-frontend
description: NeuroVision React frontend (frontend/). Use when editing pages/routes, the zustand viewer store, dispatch/actions, the FastAPI client, upload flow, live-share sync with Convex, the Agent Panel UI, CSS modules/tokens, or frontend tests. For three.js/R3F scene internals also load neurovision-threejs.
---

# NeuroVision frontend

Stack:
- Vite, React 19, TypeScript ~6 (`erasableSyntaxOnly`, so no constructor parameter properties)
- React Router 7 (`createBrowserRouter`), zustand 5, convex 1.48 client
- R3F 9 + drei 10 + three 0.186, NiiVue 0.69.0
- vitest, oxlint, CSS modules, fonts Manrope + Cousine

Commands (from `frontend/`): `npm run dev`, `npm run lint`, `npm test`, `npm run build` (`tsc -b && vite build`).

Vitest runs in **node** env, includes only `src/**/*.test.ts`, and sets `VITE_CONVEX_URL: ''`. Tests are pure-logic. There are no DOM/R3F render tests.

## Routes (`src/App.tsx`)

| Path | Route file | Notes |
|---|---|---|
| `/` | `routes/Home.tsx` | workspace cards (`home/workspaces.ts`) |
| `/upload` | `routes/Upload.tsx` | 4 NIfTI slots → `createJob` |
| `/jobs/:id/processing` | `routes/Processing.tsx` | polls `getJob` |
| `/jobs/:id/mri` | `routes/MriWorkspace.tsx` | NiiVue MPR + report + Agent Panel |
| `/jobs/:id/3d` | `routes/Brain3D.tsx` | `CaseCanvas` + toolbar + Agent Panel |
| `/learn`, `/learn/:wsId` | `routes/Learn.tsx` | atlas (`AtlasCanvas`), no patient report |
| `/join/:code` | `routes/Join.tsx` | live-session guest join |

The old `/results` and `/explore` paths redirect (`legacyRoutes`). Don't reintroduce them.

## Action system: the one way to change the view

- `src/actions/types.ts`:
  - `ViewerState`
  - the `Action` union (setMode, setOpacity, setExplosion, setCutPlane, setLayerVisible, setHemisphereVisible, focusTumor, resetView, …)
  - `Source = 'pointer'|'keyboard'|'gesture'|'voice'`
  - `DispatchResult {ok, message}`
  - `CaseContext {jobId, hasTumor, structureIds, bboxMm}`
- `src/actions/store.ts`:
  - `useViewer` is a zustand store.
  - `initialState(jobId)` defaults: mode `whole`, brainOpacity 0.3, cut axial disabled, all layers on.
- `src/actions/dispatch.ts`:
  - `dispatch(action, source)` is **the only writer** of `useViewer`. It clamps numbers, rejects tumor actions on no-tumor cases with "No tumor detected in this scan", and in cutaway writes `cursorRas`.
  - `initCase(ctx)` sets the validation context and must run after the report loads.
  - `viewEvents` (EventTarget) carries the `'reset'` and `'focus'` camera events. The camera listens; the store doesn't hold camera pose.
- Rules:
  - UI, keyboard, gesture, voice and agent tools all go through `dispatch`. Never `useViewer.setState` from a component.
  - New behaviour = new `Action` member + a dispatch case + a test in `dispatch.test.ts`.
  - Clamp out-of-range numbers. Reject unknown targets with a message. Don't throw.

## API client (`src/api/`)

- `client.ts`:
  - `API_URL = VITE_API_URL ?? 'http://localhost:8000'`. There is no Vite proxy and no `/api` prefix on FastAPI.
  - Functions: `getHealth`, `getJob`, `getReport`, `modelUrl`, `segUrl`, `flairUrl`, `createJob(files)`.
  - Non-2xx responses throw `ApiError {status, code, message}`. 422 has `{code,message}`; 404/409 have `{detail}`.
- `types.ts` mirrors `docs/BACKEND_CONTRACT.md` (Report, JobStatus, Health). Update it when the contract changes.
- Pages map: 409 → pending, 404 → unknown, network error → offline banner ("Backend offline — start docker compose up").

## Live share (`src/share/`)

- `client.ts`: a `ConvexClient` is created **only if `VITE_CONVEX_URL` is set**, so the app must work without it. It uses `anyApi` (untyped refs), so the types in `share/types.ts` are hand-mirrored from Convex.
- `store.ts`: the `useShare` zustand store plus an `onUpdate` subscription to `api.sessions.get`.
- `sceneSync.ts`: `Scene`, `DEFAULT_SCENE`, `sceneOf`, `sceneCommands`, `sceneActions`, and `sceneSender` (150 ms throttle).
  - The host streams Scene diffs as `ViewerCommand`s to `sessions.updateView`. The guest applies them through `dispatch`.
- `useShareSync.ts` is currently enabled only for jobId `sample`. `mprSync.ts` / `useMprShare.ts` handle the slice cursor.
- Never stream camera pose or gesture frames to Convex (guardrail 7). Only semantic state is shared.
- Adding a shared field requires all of:
  - `convex/lib/viewCommands.ts` (Scene, vScene, ViewerCommand, applyCommand)
  - `share/types.ts`
  - `sceneSync.ts`
  - tests on both sides

## Agent Panel

`components/agent/AgentPanel.tsx` is **UI only, demo content** (`demo.ts`). Display names are `['Orchestrator','Vision','Spatial UI','Clinical']`. Real agent wiring is P1/P3; see `neurovision-multi-agents`.

## UI conventions

- CSS modules per component (`X.module.css`). Tokens live in `src/styles/tokens.css`; use variables, not hex.
- Figma-exported icons live in `src/assets/figma/*.svg`. Figma refs are in `docs/figma/`.
- Copy rules:
  - Never "healthy".
  - Certainty = "certainty of the outline".
  - Show the "educational, not clinically validated" notice where reports appear.
- Components: `TopNavBar`, `Footer`, `FlowPage`, `FlowStepper`, `BackendBanner`, `Legend`.

## Before done

`npm run lint && npm test && npm run build` in `frontend/`. Add `*.test.ts` for any new pure logic (parsers, reducers, sync).
