# NeuroVision — Product & Technical Spec

**Version 1.2 · 2026-10-23 · Status: LOCKED for the hackathon**

This is the single source of truth for *what* we build.
- The **backend API and `model.glb` format** are in [`BACKEND_CONTRACT.md`](BACKEND_CONTRACT.md); this spec points to it rather than repeating it.
- If code, a ticket, or a conversation disagrees with these two files, the files win until changed through a PR (see [CONTRIBUTING.md](../CONTRIBUTING.md#changing-the-spec)).
- Every change adds a line to the [Decision Log](#14-decision-log).

Work items live in [GitHub Issues](https://github.com/DuongAnh1201/CalHacks13.0/issues). Each ticket cites the spec section (`§`) it implements.

---

## 1. What we are building

NeuroVision takes a brain MRI (4 standard sequences), segments the tumor with a pretrained AI model, and shows the result in linked 2D slices and a 3D brain the user can explore in four modes. Everything is driven by mouse/keyboard, hand gestures, and a voice assistant ("Jarvis").

**Core promise:** the tumor is shown **where the model segmented it, in the scan's own coordinates**.
- Brain and tumor meshes come from the same scan and the same affine.
- This guarantees the brain and tumor line up with each other. It does **not** guarantee the segmentation is correct, and the UI never claims that it does.

**Audience:** hackathon judges, students, people learning brain anatomy.

**Non-goals:** this is an educational visualization; it is **not clinically validated**. It does not:
- diagnose
- plan surgery
- estimate risk
- handle patient care

**Demo success:**
- A sample case runs end to end with no developer touching anything.
- The segmentation-source badge is always visible.
- All four modes work.
- A judge can follow the explanation unaided.

## 2. Locked decisions

| # | Decision | Why |
|---|----------|-----|
| D1 | **Input = 4 NIfTI sequences (T1c, T1, T2, FLAIR), BraTS-style preprocessed** (co-registered, skull-stripped, 1 mm). **JPG / PNG / screenshots are rejected** at the frontend and the backend. The 2D classifier path is P2 stretch. | A JPG has no raw intensities, no sequence identity, no spacing, no depth. No preprocessing recovers them. |
| D2 | **Demo data = 2–3 cases from Medical Segmentation Decathlon Task01_BrainTumour.** Sequences are reordered into the model's channel order. The expert mask is kept for comparison and as the fallback. License and training-set overlap are verified in ticket A1. | Public NIfTI with all 4 sequences plus expert labels. |
| D3 | **The brain surface is built from the same scan as the tumor** (backend), so `T_register = I` (identity). | No registration step, no coordinate drift. |
| D4 | **Segmentation = MONAI `brats_mri_segmentation` (SegResNet), owned by Tom.** **Fallback** if inference isn't working by hour 8: the expert mask goes through the same mesh script, badged "Expert segmentation (dataset label)". **Never** fall back to 2D. | A real 3D segmentation is the AI story. The fallback leaves the frontend unchanged. |
| D5 | **Renderer = one Three.js scene via React Three Fiber.** Brain + tumor live in it. 2D slices = NiiVue panel beside it. | One camera, one transform. |
| D6 | **Exploded mode = left/right hemispheres**, split by the backend into `brain_left` / `brain_right` nodes. Named atlas structures are P2. | An atlas would need registration. |
| D7 | **Stack:** frontend = Vite + React + TS, R3F + drei, Zustand, NiiVue, MediaPipe Tasks Vision. Backend = Tom's FastAPI + MONAI + PyTorch (CPU) in Docker, with jobs on a mounted volume. | Matches the backend Tom is building. |
| D8 | **Jarvis = deterministic.** Speech → rule-based parser → typed `Action` → dispatcher. `explainFinding` = template over the report. LLM intent fallback is P1 (text only). RAG medical answers are P2. | Works offline, can't invent a diagnosis. |
| D9 | **Uploaded imagery never leaves our backend.** No imagery goes to a third-party model service. | Data policy. |
| D10 | **Feature freeze at hour 29.** After that, only P0 bugs get fixed. | Rehearsal and submission buffer. |
| D11 | **`model.glb` has exactly five named nodes:** `brain_left`, `brain_right`, `edema`, `core`, `enhancing` (details in the contract §1). The frontend finds meshes by name. | One file, one loader, one contract. |

## 3. Screens and routes

| Route | Purpose | Must show |
|-------|---------|-----------|
| `/` Upload | Pick 4 sequences or a sample case | **Sample cases listed first.** 4 labelled slots (T1c, T1, T2, FLAIR), `.nii`/`.nii.gz` only, the note "BraTS-style preprocessed MRI only", educational-scope notice, Start. Non-NIfTI files are rejected before upload with the contract §2 message |
| `/jobs/:id/processing` | Show real progress | Backend `status` + `stage` (validating → inferring → meshing). On failure: `error.message`, Retry, Use sample case. No fake percentages |
| `/jobs/:id/mri` | MRI workspace (frame 03). `/jobs/:id/results` redirects here | Header **"Tumor detected"** or **"No tumor detected"** (never "healthy"). Volumes in cm³ (whole / core / enhancing), side, lesion count. 3 NiiVue views (FLAIR + 3-colour overlay) + legend. Source badge. On sample cases: model-vs-expert Dice. Limitations. **Place in 3D** |
| `/jobs/:id/3d` | 3D page (frame 04). `/jobs/:id/explore` redirects here | 3D canvas, linked slice panel, 4 mode tabs, layer toggles + legend, opacity / explode / cut controls, Reset, source badge, report panel, Jarvis transcript + text box, gesture status |
| `/learn` Learning Mode | Explore healthy anatomy, no patient data | CerebrA atlas (95 structures) in template space. Structure tree + search, click → fly-to + info panel, double-click → isolate, hover label, Solid / X-Ray + opacity, explode slider, hide left / right, Reset. Load failure shows Retry. Never mixed into a patient scene (D6) |

## 4. Exploration modes

All modes share one `ViewerState` (§7.2). Switching mode never changes the job, the tumor position, the cursor, layer visibility, or the selection. Explode and clip change **appearance only**.

| Mode | Behaviour | Release gate |
|------|-----------|--------------|
| **1 Whole Brain** | Opaque hemispheres; tumor hidden until revealed. `focusTumor` points the camera at `report.centroidMm`; the tumor itself does not move | Reset restores the exact initial view |
| **2 X-Ray** | Brain opacity 0–100% (default 30%). Tumor layers keep their own opacities (§7.4) and stay legible | Works from pointer, keyboard, gesture and voice |
| **3 Exploded** | Hemispheres slide apart along RAS x by `explodeAmount` × 40 mm. Tumor layers ride with the hemisphere in `report.side`; if `bilateral`, they stay centred. The crosshair keeps the true RAS position | `explodeAmount = 0` restores exact alignment |
| **4 Cutaway** | Clip plane on the brain nodes only (tumor never clipped), on the chosen axis (default sagittal), at `offsetMm`, limited to `report.brain.bboxMm`. Either hemisphere can be hidden. **The cut plane and the matching 2D slice are the same plane** | Plane, slice and tumor agree; Reset works |

**No tumor detected:** brain-only scene. Tumor controls are disabled with the reason shown; all modes still work.

## 5. Imaging and coordinate contract

### 5.1 Input and model

- Input rules and validation errors: contract §2.
- Model checks (channel order, output channels, training overlap, Dice attribution): contract §4.
- Ticket A1 verifies the channel order **before** anything else is built on the model. A wrong order still produces a confident-looking mask, so this fails silently.

### 5.2 Transform — defined once, in `frontend/src/viewer/transform.ts`

```
p_scene = R_yup · T_center · p_ras         (homogeneous 4×4)
```

| Term | Meaning |
|------|---------|
| `p_ras` | GLB vertices and every report coordinate are already RAS+ mm. The backend applies the NIfTI affine; `T_register = I` (D3) |
| `T_center` | Translate by `−report.brain.centroidMm`. Visual only; never used for reported numbers |
| `R_yup` | −90° about X: `(x, y, z)_RAS → (x, z, −y)_three` |

- The GLB node transforms are identity. The frontend never edits vertices.
- NiiVue works in RAS mm natively.
- The **physical cursor is stored in RAS mm** and is the single shared position.
- The 3D marker = `R_yup · T_center · cursor`.
- Slice indices are derived from the cursor, never stored.
- Scene units are mm (a brain is about 170 units across); camera near/far are set to match.

### 5.3 Alignment check (ticket C3)

These must agree within 2 mm between the NiiVue crosshair and the 3D marker:
- `report.centroidMm`, which must also sit inside the `edema` mesh and on the overlay in all 3 views
- 3 landmarks taken from `report.brain.bboxMm`: the most anterior, most superior and most left points

This must hold under orbit, clip, mode switch, and explode = 0. If it fails, stop building new modes until it's fixed.

### 5.4 Stretch: 2D path (P2)

The Kaggle classifier + Grad-CAM path (tickets E4/E5) runs only after the demo is stable. If built:
- it is badged *Illustrative*
- it gives no mm measurements
- it rejects colour images
- it never feeds Tom's model

## 6. Architecture

```
Browser (Vite/React, VITE_API_URL)                     Docker: Tom's FastAPI (CPU PyTorch)
┌───────────────────────────────────────────┐         ┌──────────────────────────────────────┐
│ routes/ Upload → Processing → Results → Explore     │ POST /jobs  (4 NIfTI)  → 422 guard    │
│ api/client.ts ── poll 1 s ───────────────────────────│ GET  /jobs/{id}        status+stage   │
│ viewer/loadCase.ts ◄── report + model.glb ───────────│ GET  /jobs/{id}/report                │
│ viewer/layers.ts  (shared colours / opacities)      │ GET  /jobs/{id}/model.glb  (5 nodes) │
│ store (Zustand ViewerState)                         │ GET  /jobs/{id}/seg.nii.gz            │
│   ▲  actions/dispatch.ts ◄── pointer · keyboard     │ GET  /jobs/{id}/flair.nii.gz          │
│                          ◄── gestures · Jarvis      │ predict.py → pipeline.py →            │
│ viewer/ R3F Scene + NiiVue SlicePanel ◄── store     │   mask_to_mesh.py ; jobs/ (volume)    │
└───────────────────────────────────────────┘         │ jobs/sample*/ seeded, no inference    │
                                                       └──────────────────────────────────────┘
```

**Scene graph** (built by `loadCase.ts`, ticket B6):

```
world   ← R_yup · T_center
 ├─ hemiLeft    (x −explode·40 mm) ── brain_left  [+ tumor layers if side = left]
 ├─ hemiRight   (x +explode·40 mm) ── brain_right [+ tumor layers if side = right]
 ├─ tumorCenter (no offset)        ── tumor layers if side = bilateral
 └─ cursorMarker
```

**Repo layout**

```
frontend/src/{routes,viewer,actions,api}/
backend/                 # Tom: predict.py, pipeline.py, mask_to_mesh.py, app/, tests/, Dockerfile
docker-compose.yml
jobs/sample*/            # seeded sample jobs (license in data/sample/LICENSE)
docs/SPEC.md · docs/BACKEND_CONTRACT.md
```

- Frontend types in `frontend/src/api/types.ts` mirror contract §2 by hand. No codegen.
- No Vite `/api` proxy. The client calls `VITE_API_URL` directly; CORS is set on the backend.

## 7. Contracts

### 7.1 Backend

See [`BACKEND_CONTRACT.md`](BACKEND_CONTRACT.md):
- §1 GLB
- §2 endpoints, status, input guard, report
- §3 `seg.nii.gz` labels

The frontend renders only what the contract provides. Missing optional data hides the matching UI; it never gets faked.

### 7.2 ViewerState (Zustand)

```ts
type Axis = 'sagittal' | 'coronal' | 'axial';       // RAS x, y, z
type Mode = 'whole' | 'xray' | 'exploded' | 'cutaway';
type Layer = 'edema' | 'core' | 'enhancing';
interface ViewerState {
  jobId: string;
  mode: Mode;
  cursorRas: [number, number, number];     // the single shared position, mm
  tumorRevealed: boolean;
  selected: 'tumor' | 'left' | 'right' | null;
  brainOpacity: number;                    // 0..1
  explodeAmount: number;                   // 0..1
  cut: { axis: Axis; offsetMm: number; enabled: boolean };
  hidden: { left: boolean; right: boolean };
  layers: Record<Layer, boolean>;          // visibility; absent layers stay false + disabled
  cameraTarget: 'brain' | 'tumor';
  selectedStructure: string | null;        // atlas node id, /learn only
  isolate: boolean;                        // show only selectedStructure
  hiddenStructures: Record<string, boolean>;
}
```

### 7.3 Action interface — one schema for every input

```ts
type Action =
  | { type: 'focusTumor' }                          // also sets tumorRevealed = true
  | { type: 'setMode'; mode: Mode }
  | { type: 'setOpacity'; value: number }           // clamp 0..1
  | { type: 'setExplosion'; value: number }         // clamp 0..1
  | { type: 'setCutPlane'; axis?: Axis; offsetMm?: number; deltaMm?: number; enabled?: boolean }
  | { type: 'setHemisphereVisible'; side: 'left' | 'right'; visible: boolean }
  | { type: 'setLayerVisible'; layer: Layer; visible: boolean }
  | { type: 'setSlice'; axis: Axis; offsetMm: number }   // writes cursorRas[axis]
  | { type: 'select'; target: 'tumor' | 'left' | 'right' | null }
  | { type: 'resetView' }
  | { type: 'explainFinding' }
  | { type: 'selectStructure'; id: string | null }  // id must be in the case's structureIds
  | { type: 'setStructureVisible'; id: string; visible: boolean }
  | { type: 'setIsolate'; on: boolean };

type Source = 'pointer' | 'keyboard' | 'gesture' | 'voice';
function dispatch(a: Action, source: Source): { ok: boolean; message: string };
```

- The dispatcher validates and clamps every value; `offsetMm` is clamped to `report.brain.bboxMm`.
- Tumor actions on a no-tumor job return `{ok: false, message: "No tumor detected in this scan"}`.
- In Cutaway, `setCutPlane` also writes the matching `cursorRas` component.
- Nothing outside `dispatch` mutates the store, except camera orbit damping.

### 7.4 Layer table — `frontend/src/viewer/layers.ts` (ticket L1)

One table drives the NiiVue overlay colours, the 3D materials and the legend. The GLB's own materials are ignored.

| Layer | GLB node | seg value | Colour | 3D opacity | Render order |
|-------|----------|-----------|--------|-----------|--------------|
| Edema (whole tumor) | `edema` | 1 | `#F2C94C` | 0.35 | 3 |
| Tumor core | `core` | 2 | `#F2994A` | 0.70 | 2 |
| Enhancing | `enhancing` | 3 | `#EB5757` | 1.00 | 1 |
| Brain | `brain_left` / `brain_right` | — | `#D9D4CF` | `brainOpacity` | 4 |

- Transparent materials use `depthWrite: false`.
- Render order goes innermost first, so the nested shells don't flicker.

## 8. Interactions

### 8.1 Keyboard / pointer — every demo action works without camera or mic

| Key | Action |
|-----|--------|
| `1` `2` `3` `4` | `setMode` whole / xray / exploded / cutaway |
| `T` | `focusTumor` |
| `[` / `]` | opacity −/+ 10% |
| `-` / `=` | explosion −/+ 0.1 |
| `↑` / `↓` | cut `deltaMm` +2 / −2 |
| `S` `C` `A` | cut axis sagittal / coronal / axial |
| `L` / `R` | toggle left / right hemisphere |
| `7` `8` `9` | toggle edema / core / enhancing |
| `0` or `Esc` | `resetView` |
| hold `Space` | push-to-talk |
| `/` | focus the Jarvis text box |
| `?` | help overlay |

Mouse: orbit / zoom / pan (drei `OrbitControls`). Click a mesh = `select`. Every action also has an on-screen control.

### 8.2 Gestures (MediaPipe HandLandmarker)

| Gesture | Action | Guardrail |
|---------|--------|-----------|
| One hand, open palm, move | Orbit (camera controls; the camera is not part of ViewerState) | Smoothed (EMA); tracking status always visible |
| Pinch (thumb tip ↔ index tip) | Select / drag the focused control (incl. cut handle) | Hysteresis: enter < 0.30, exit > 0.45 × palm width (tune in E1) |
| Two hands, after both pinch (P1) | Distance → explosion or zoom | Values bounded; off when landmarks are lost |

Gestures emit `Action`s through `dispatch(…, 'gesture')`.

### 8.3 Jarvis

**Flow:** push-to-talk → Web Speech API transcript (or the text box) → `parseIntent(text): Action | null` → `dispatch`.

**Must parse** (these are tested):
- "show the tumor"
- "set opacity to 50 percent"
- "open the left hemisphere"
- "move the cut deeper"
- "focus on the tumor"
- "reset everything"
- "show the enhancing tumor"
- "hide the edema"

**Display:** the transcript and the dispatch `message` are always visible. Unrecognized input gets: "I can't do that yet — try: …".

**`explainFinding`:** a template over the report, for example:
> "The model segmented one region of about 42 cm³ in the right hemisphere: 30 cm³ edema, 12 cm³ core, 6 cm³ enhancing. This is an educational view, not a diagnosis."

With no tumor:
> "The model did not detect a tumor in this scan."

**Not allowed:**
- diagnosis
- prognosis
- surgical-risk statements
- calling a scan "healthy"

**Risk:** Chrome's Web Speech API uses a network service, and the hall will be noisy. The text box is the fallback and must always work.

## 9. Error handling

| Situation | Behaviour |
|-----------|-----------|
| JPG / PNG / other non-NIfTI picked | Rejected client-side before upload with the contract §2 message + Use sample case. The backend also rejects it (`INVALID_FORMAT`) |
| 422 from `POST /jobs` (`BAD_SEQUENCE_COUNT`, `SEQUENCE_MISMATCH`, `NOT_3D`, `LOW_DYNAMIC_RANGE`, `BAD_SPACING`, `TOO_LARGE`) | Upload page shows `message` and keeps the selected files |
| Job `failed` (`INFERENCE_ERROR`, `MESH_ERROR`) | Processing page shows `message`, Retry, Use sample case |
| Inference slow | Processing shows the live `stage`. Use sample case stays one click away |
| No tumor detected | Not an error: "No tumor detected" header, brain-only scene |
| GLB missing `brain_left`/`brain_right` | 3D panel error naming the missing node; slices still work |
| Backend unreachable | Banner "Backend offline — start `docker compose up`". No venue network needed |
| Camera / mic denied or lost | Chip shows "Gestures off" / "Voice off". Keyboard and text keep working. No modal dialogs |
| WebGL context lost | Message + reload button |

## 10. Testing

| Layer | Test |
|-------|------|
| Backend (pytest, Tom) | One test per contract error code. Channel-order assertion. Synthetic cube mask → known volume. Load `model.glb` with trimesh and assert the five node names, identity transforms, and no tumor nodes when the mask is empty. `seg.nii.gz` values ⊂ {0, 1, 2, 3} |
| Frontend (vitest) | `transform.ts` known-point + round trip. Dispatcher clamps values, and tumor actions are refused on no-tumor jobs. `parseIntent` covers the 8 phrases in §8.3. `loadCase` reports missing nodes |
| Alignment | §5.3, recorded in ticket C3 with screenshots |
| Demo | Full §11 script run twice in a row on the demo laptop, Wi-Fi off, on the seeded sample job |

## 11. Acceptance criteria — first complete demo

- [ ] A sample case runs Upload → Processing → Results → Place in 3D with no manual developer step.
- [ ] The badge reads **"Model segmentation · SegResNet (MONAI) · not clinically validated"** or **"Expert segmentation (dataset label)"**, driven only by `report.segmentationSource`.
- [ ] A JPG upload is refused with guidance. Nothing non-NIfTI reaches the model.
- [ ] 3 linked orthogonal views with the 3-colour overlay and legend. 3D colours match the 2D overlay.
- [ ] All 4 modes work on the same job, with visible controls and Reset. Cutaway gives a straight-on internal view.
- [ ] The tumor centroid, the 3D marker and the slice crosshair stay aligned under orbit, clip, explode = 0, and mode changes.
- [ ] At least 1 gesture and 2 Jarvis commands change the scene. Keyboard/pointer can do the same.
- [ ] Results and pitch state the educational scope, the data source, and that the sample may be a training case.

## 12. Timeline (elapsed hours from kickoff)

Milestones on GitHub = Checkpoints A–H. Lanes: **ML/Backend (Tom)**, **Viewer**, **App/Interaction**.

| Hours | Checkpoint | Gate | Stop rule |
|-------|-----------|------|-----------|
| 0–3 | **A** Location contract | Tom signs off the contract; channel order verified on a demo case; renderer spike passes; transform written | Channel order unresolved → expert-mask fallback is the plan for B |
| 3–8 | **B** Job flows to viewer | Seeded `jobs/sample` serves the five-node `model.glb`; `/explore` shows brain + tumor layers | Inference not working by h8 → switch to the expert-mask fallback (D4). Networking h6–7 (one integrator on call) |
| 8–14 | **C** Same target in 2D and 3D | Linked slices with overlay, X-Ray, alignment check passes | Alignment fails → no new modes until fixed |
| 14–20 | **D** Four modes by pointer | Exploded + Cutaway + layer toggles + keyboard map | Food/rest rotation; networking h18–19 |
| 20–26 | **E** Judge can run the script | Gestures, Jarvis, error states | LLM / RAG frozen unless validated |
| 26–31 | **F** Reliable twice | Hardening, Wi-Fi-off run, backup recording | **Feature freeze h29** |
| 31–34 | **G** Timed pitch | Script, slides, Devpost, credits | Networking h31–32 (rotate) |
| 34–36 | **H** Submitted | Submission with ≥ 1 h buffer | — |

## 13. Risks

| Risk | Trigger | Response |
|------|---------|----------|
| Wrong channel order | Dice vs the expert mask is near zero on the demo case | Fix in `predict.py`. Ticket A1 asserts the order |
| Inference too slow or broken | CPU time > ~2 min, or it crashes | Demo the seeded sample; if still broken at h8, use the expert-mask fallback |
| Judge wants to upload their own image | They have a JPG or a DICOM | Polite refusal message + sample cases; explain why on the pitch slide |
| Sample is a training case | Decathlon ⊂ BraTS training | Disclose in Results + pitch; prefer a confirmed held-out case |
| Coordinates drift | Alignment check fails | Stop features; fix `transform.ts` or the backend affine |
| Docker slow on the demo laptop | amd64 image under emulation | Native-arch image, prebuilt before the venue (contract §6) |
| Gesture / mic failure | Lighting, permissions, noise | Keyboard + text cover the whole pitch |
| Scope creep | Ideas mid-hackathon | Idea issue → checkpoint triage; freeze at h29 |

## 14. Decision Log

Append-only. Format: `date · hour · decision · why · PR`.

- 2026-10-23 · h0 · v1.1: locked D1–D10 (volume primary + 2D fallback, brain from same scan, R3F, hemispheres only, deterministic Jarvis) · resolves the v1.0 open decisions · #32
- 2026-10-23 · h0 · v1.2: adopt Tom's SegResNet backend + `BACKEND_CONTRACT.md`. Five-node `model.glb` (D11); 4-sequence NIfTI input only, JPG rejected (D1); expert-mask fallback replaces the 2D fallback (D4); routes renamed to `/jobs/:id/*`; layer table + `setLayerVisible` added · real 3D segmentation; a JPG cannot carry the data the model needs · #32
- 2026-10-24 · h2 · Contract notes: `lesionCount` counts WT components ≥ 100 voxels; `side: bilateral` = ≥ 20% of WT voxels on each side of the brain midline; `flair.nii.gz` is served as soon as the job exists; `TOO_LARGE` returns 422 like the other input errors · fills the thresholds the contract left to the backend, and gives the input errors one status code · #36
- 2026-10-24 · h? · Learning Mode `/learn`: CerebrA atlas (CC0, template space, never mixed into patient space so D6 holds); ViewerState + selectedStructure/isolate/hiddenStructures; actions selectStructure/setStructureVisible/setIsolate · S4 delivered as a standalone page; same dispatch door for gestures/Jarvis later · #43
- 2026-10-24 · h3 · Backend contract signed off by Tom (v1.1 = v1.0 + the #36 notes). Every field is delivered by the backend on `main` (#37, #41, #40, #46, #47), so none is marked optional · closes the contract sign-off (#33) · #48
- 2026-10-24 · h4 · W1: Explore tab removed; `/jobs/:id/results` → `/jobs/:id/mri` (MRI workspace, frame 03), `/jobs/:id/explore` → `/jobs/:id/3d` (3D page, frame 04); old paths redirect · user request, spec `docs/superpowers/specs/2026-10-24-w1-mri-workspace-design.md` · #88
