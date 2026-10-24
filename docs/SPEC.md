# NeuroVision — Product & Technical Spec

**Version 1.1 · 2026-10-23 · Status: LOCKED for the hackathon**

This is the single source of truth. If code, a ticket, or a conversation disagrees with this file, this file wins until someone changes it through a PR (see [CONTRIBUTING.md](../CONTRIBUTING.md#changing-the-spec)). Every change adds a line to the [Decision Log](#14-decision-log).

Work items live in [GitHub Issues](https://github.com/DuongAnh1201/CalHacks13.0/issues). Each ticket cites the spec section (`§`) it implements.

---

## 1. What we are building

NeuroVision lets a user upload a brain MRI, read the result in linked 2D slice views, then explore the tumor inside a 3D brain in four modes. They drive it with mouse/keyboard, hand gestures, and a voice assistant ("Jarvis").

**The core promise is an honest link between the scan and the 3D scene.**
- **Volumetric scan + segmentation mask → *Measured* placement.** Real millimetres, real location.
- **Single 2D image → *Illustrative* placement.** The user picks the depth. No measurements.

The UI must never let a user confuse the two.

**Audience:** hackathon judges, students, people learning brain anatomy.

**Non-goals:** this is an educational visualization. It does **not**:
- diagnose
- plan surgery
- estimate risk
- handle patient care

**Demo success:**
- One known case runs end to end with no developer touching anything.
- The source and certainty badge is always visible.
- All four modes work.
- A judge can follow the explanation unaided.

## 2. Locked decisions

These replace the "open decisions" from the v1.0 doc.

| # | Decision | Why |
|---|----------|-----|
| D1 | **Primary path = volumetric.** NIfTI scan + matching segmentation mask. **Fallback = 2D** classifier + Grad-CAM, always badged *Illustrative*. | Only a mask gives real location and size. |
| D2 | **Demo data = Medical Segmentation Decathlon Task01_BrainTumour**, one case. FLAIR channel for display. Whole tumor = mask label > 0. License verified in ticket A1 before use. | Public, NIfTI, ships with tumor labels. |
| D3 | **The brain surface is built from the same scan as the tumor.** So `T_register = I` (identity). No template brain, no registration step. | Removes the hardest coordinate risk entirely. |
| D4 | **Mask source in P0 = segmentation that comes with the dataset or upload.** A segmentation *model* is P2. The UI labels this as "Segmentation: dataset label", never as model output. | Honest about what is computed. |
| D5 | **Renderer = one Three.js scene via React Three Fiber.** Brain + tumor live in it. 2D slices = NiiVue panel beside it. No WonderSnap renderer fork. Its gesture code may be reused only if its license allows. | One camera, one transform, no cross-engine clipping mismatch. |
| D6 | **Exploded mode = left/right hemispheres only**, split at the midline. Named atlas structures are P2. | Atlas needs registration (see D3). |
| D7 | **Stack:** frontend = Vite + React + TypeScript, R3F + drei, Zustand, NiiVue, MediaPipe Tasks Vision. Backend = FastAPI + nibabel + numpy + scikit-image + trimesh. | Fast to build; every library is well known. |
| D8 | **Jarvis = deterministic.** Speech → rule-based parser → typed `Action` → dispatcher. `explainFinding` = text templated from case measurements. LLM intent fallback is P1 (text only). RAG medical answers are P2. | Works offline, can't hallucinate a diagnosis. |
| D9 | **Uploaded imagery never leaves our backend.** No imagery goes to any third-party model service. | Data policy. |
| D10 | **Feature freeze at hour 29.** After that, only P0 bugs get fixed. | Rehearsal and submission buffer. |

## 3. Screens and routes

| Route | Purpose | Must show |
|-------|---------|-----------|
| `/` Upload | Pick a scan or the bundled sample | Accepted types (`.nii`, `.nii.gz`, + mask; `.png/.jpg` for 2D), **"Use sample case"** button, educational-scope notice, Start |
| `/cases/:id/processing` | Show real pipeline progress | Stages from the backend `status`: validating → meshing → ready / failed. Error message + Retry. No fake progress bars, no fake percentages |
| `/cases/:id/results` | Read the result before 3D | **Volume:** 3 orthogonal NiiVue views + mask overlay, measurements (volume mm³, centroid RAS mm, bounding box mm), source badge, limitations, **Place in 3D**. **2D:** the single image + heatmap, predicted class, "score not calibrated", *Illustrative* badge, **Place in 3D** |
| `/cases/:id/explore` | Shared 2D + 3D workspace | 3D canvas, linked slice panel, 4 mode tabs, opacity / explode / cut controls, Reset, source badge, Jarvis transcript + text box, gesture status indicator |

## 4. Exploration modes

All modes share one `ViewerState` (§7.3). Switching mode never changes the case, the tumor position, the cursor, or the selection. Explode and clip change **appearance only**. They never rewrite MRI-derived coordinates.

| Mode | Behaviour | Release gate |
|------|-----------|--------------|
| **1 Whole Brain** | Opaque brain. The tumor starts hidden. Orbit/zoom. "Reveal" / `focusTumor` moves the camera to the tumor; the tumor itself does not move. | One stable scene; Reset restores the initial view exactly |
| **2 X-Ray** | Brain opacity 0–100% (default 30%). Tumor stays opaque, legible, and in place. | Opacity works from pointer, keyboard, gesture and voice |
| **3 Exploded** | Hemispheres slide apart along the RAS x axis by `explodeAmount` × 40 mm. The tumor moves with the hemisphere that contains its centroid. The slice crosshair keeps showing the *true* RAS position. | `explodeAmount = 0` restores exact alignment |
| **4 Cutaway** | A clipping plane on the chosen axis (default sagittal) at `offsetMm`. Either hemisphere can be hidden. **In this mode the cut plane and the matching 2D slice are the same plane:** moving one moves the other. | Plane, 2D cross-section and tumor agree; Reset works |

## 5. Imaging and coordinate contract

### 5.1 Volumetric path (P0)

**Ingest**
- Accept `.nii` / `.nii.gz`.
- A 4D file is reduced to channel 0.
- Record shape, voxel spacing, affine, and provenance (filename, dataset name, license).

**Validate**
- The mask has the same shape as the scan.
- `allclose(mask.affine, scan.affine, atol=1e-3)`.
- Mask values are integers.
- The mask has at least one voxel > 0.

**Geometry (backend)**
- `tumor.glb`: marching cubes on `mask > 0` in voxel space, vertices mapped through the affine into **RAS+ mm**, light smoothing.
- `brain_left.glb` and `brain_right.glb`: marching cubes on `scan > threshold`. MSD data is skull-stripped; the threshold value is set in ticket A1. The mesh is then split at `x_RAS = brain centroid x` and decimated to under 150k triangles per hemisphere.

**Measurements** come only from the mask and voxel spacing:
- `volume_mm3 = count(mask>0) × prod(spacing)`
- `centroid_ras` = affine × (mean voxel index)
- `bbox_mm` = extent of the mask in RAS

Units are always shown.

**Transform — defined exactly once, in `frontend/src/viewer/transform.ts`:**

```
p_scene = R_yup · T_center · A_mri · p_voxel        (homogeneous 4×4)
```

| Term | Meaning |
|------|---------|
| `A_mri` | NIfTI affine (voxel → RAS mm). Applied **on the backend** when exporting meshes, so meshes ship in RAS mm. |
| `T_register` | Identity, by D3. It is not in the code. |
| `T_center` | Translate by −brain centroid (RAS). Visual only; never used for reported numbers. |
| `R_yup` | RAS is Z-up, Three.js is Y-up: `(x, y, z)_RAS → (x, z, −y)_three`. |

- NiiVue works in RAS mm natively.
- The **physical cursor is stored in RAS mm** and is the single shared position.
- The 3D marker = `R_yup · T_center · cursor`.
- Slice indices are **derived** from the cursor, never stored.

**Alignment check (ticket C3):**
- The tumor centroid and 3 landmarks agree between the NiiVue crosshair and the 3D marker within 2 mm. The landmarks are the brain's most anterior, most superior and most left points.
- This holds under orbit, clip, mode switch, and explode = 0.

If the check fails, stop building new modes. Fix the transform, or switch the badge to *Illustrative*.

### 5.2 2D fallback path (P1)

- Model: the existing Kaggle binary classifier (tumor / no tumor) plus Grad-CAM.
- Before *any* metric is quoted: deduplicate the train/val split with perceptual hashing and hold out a test set. **Do not quote the notebook's 0.97 F1.**
- Output: class, raw score (shown as "not calibrated", no %), heatmap PNG.
- Placement:
  - The heatmap peak gives normalized (u, v) in the image.
  - The user picks a plane (default axial) and a depth slider.
  - A synthetic irregular blob (fixed size, no mm shown) is placed in the **sample case's brain** and badged *Illustrative placement*.
- No measurements, no anatomy or risk claims.
- A single image is **never** shown as three reconstructed views.

## 6. Architecture

```
Browser (Vite/React)                                 FastAPI (local)
┌──────────────────────────────────────────┐        ┌───────────────────────────────┐
│ routes/  Upload → Processing → Results → Explore  │ POST /api/cases     (upload)  │
│ api/client.ts ── fetch / poll 1 s ─────────────────│ POST /api/cases/sample        │
│ store (Zustand ViewerState)                       │ GET  /api/cases/{id}           │
│   ▲                                               │ GET  /api/cases/{id}/files/*   │
│ actions/dispatch.ts  ◄── pointer · keyboard       │ DELETE /api/cases/{id}         │
│                      ◄── gestures (MediaPipe)     │   └ pipeline (BackgroundTask): │
│                      ◄── jarvis (Web Speech/text) │     validate → mesh → measure  │
│ viewer/ R3F Scene + NiiVue panel ◄── store        │ data/cases/{id}/  (local disk) │
└──────────────────────────────────────────┘        └───────────────────────────────┘
```

**Repo layout**

```
frontend/src/{routes,viewer,actions,api}/
backend/app/{main,api,pipeline,validate,geometry,classifier2d}.py
backend/scripts/precompute_sample.py
backend/tests/
data/sample/          # bundled demo case + precomputed artifacts (license in data/sample/LICENSE)
docs/SPEC.md
```

- The sample case is precomputed and served by `POST /api/cases/sample`. So the demo works even if the pipeline breaks.
- Upload storage: `data/cases/{id}/`. Removed by `DELETE`. The server start-up purges every case except the sample.
- Frontend types in `frontend/src/api/types.ts` mirror the backend Pydantic models by hand. No codegen.

## 7. Contracts

### 7.1 Case (`GET /api/cases/{id}`)

```ts
type CaseStatus = 'validating' | 'meshing' | 'inferring2d' | 'ready' | 'failed';
interface Case {
  caseId: string;
  kind: 'volume' | 'image2d';
  status: CaseStatus;
  stages: { name: CaseStatus; startedAt: string; endedAt?: string }[];
  error?: { code: ErrorCode; message: string };
  provenance: { filename: string; dataset?: string; license?: string; isSample: boolean };
  volume?: { shape: number[]; spacingMm: number[]; affine: number[][] };      // kind = volume
  result?: VolumeResult | Image2DResult;
  files: Record<string, string>;   // name → URL: scan, mask, brain_left, brain_right, tumor, heatmap
}
interface VolumeResult {
  locationSource: 'measured';
  segmentationSource: 'dataset_label' | 'uploaded_mask';
  volumeMm3: number; centroidRas: [number, number, number];
  bboxMm: { min: [number, number, number]; max: [number, number, number] };
}
interface Image2DResult {
  locationSource: 'illustrative';
  model: { name: string; version: string };
  predictedClass: 'tumor' | 'no_tumor';
  rawScore: number;                // never shown as a percentage
  heatmapPeakUv: [number, number]; // 0..1
}
type ErrorCode = 'INVALID_FORMAT' | 'NOT_3D' | 'NO_MASK' | 'MASK_MISMATCH'
               | 'EMPTY_MASK' | 'TOO_LARGE' | 'PIPELINE_ERROR';
```

### 7.2 Upload (`POST /api/cases`, multipart)

- Fields: `scan` (required), `mask` (required when `scan` is NIfTI).
- Max 200 MB per file.
- Returns `201 {caseId}` right away. Processing runs in the background.
- Validation failures **return 422 with `{code, message}` before any processing starts**. Errors that happen during processing set `status = failed` instead.

### 7.3 ViewerState (Zustand)

```ts
type Axis = 'sagittal' | 'coronal' | 'axial';     // RAS x, y, z
type Mode = 'whole' | 'xray' | 'exploded' | 'cutaway';
interface ViewerState {
  caseId: string;
  mode: Mode;
  cursorRas: [number, number, number];   // the single shared position, mm
  tumorRevealed: boolean;
  selected: 'tumor' | 'left' | 'right' | null;
  brainOpacity: number;                  // 0..1
  explodeAmount: number;                 // 0..1
  cut: { axis: Axis; offsetMm: number; enabled: boolean };
  hidden: { left: boolean; right: boolean };
  cameraTarget: 'brain' | 'tumor';
}
```

### 7.4 Action interface — one schema for every input

```ts
type Action =
  | { type: 'focusTumor' }                          // also sets tumorRevealed = true
  | { type: 'setMode'; mode: Mode }
  | { type: 'setOpacity'; value: number }           // clamp 0..1
  | { type: 'setExplosion'; value: number }         // clamp 0..1
  | { type: 'setCutPlane'; axis?: Axis; offsetMm?: number; deltaMm?: number; enabled?: boolean }
  | { type: 'setHemisphereVisible'; side: 'left' | 'right'; visible: boolean }
  | { type: 'setSlice'; axis: Axis; offsetMm: number }   // writes cursorRas[axis]
  | { type: 'select'; target: 'tumor' | 'left' | 'right' | null }
  | { type: 'resetView' }
  | { type: 'explainFinding' };

type Source = 'pointer' | 'keyboard' | 'gesture' | 'voice';
function dispatch(a: Action, source: Source): { ok: boolean; message: string };
```

- The dispatcher validates and clamps every value, clamping `offsetMm` to the brain's bounding box.
- `message` is shown as Jarvis confirmation text.
- In Cutaway, `setCutPlane` also writes the matching `cursorRas` component (§4).
- `resetView` restores the initial state for the current case.
- Nothing outside `dispatch` mutates the store, except camera orbit damping.

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
| `0` or `Esc` | `resetView` |
| hold `Space` | push-to-talk |
| `/` | focus the Jarvis text box |

Mouse: orbit / zoom / pan (drei `OrbitControls`). Click a mesh = `select`. Every control in the UI has a matching on-screen widget.

### 8.2 Gestures (MediaPipe HandLandmarker)

| Gesture | Action | Guardrail |
|---------|--------|-----------|
| One hand, open palm, move | Orbit | Smoothed cursor (EMA). Tracking status always visible |
| Pinch (thumb tip ↔ index tip) | Select / drag the focused control (incl. cut handle) | Hysteresis: enter < 0.30 × palm width, exit > 0.45 × palm width (tune in E1) |
| Two hands, after both pinch (P1) | Distance → explosion or zoom | Values bounded; disabled when landmarks are lost |

Gestures emit `Action`s through `dispatch(…, 'gesture')`. They never touch the store directly.

### 8.3 Jarvis

**Flow:** push-to-talk → Web Speech API transcript (or the text box) → `parseIntent(text): Action | null` → `dispatch`.

**Must parse** (these are tested):
- "show the tumor"
- "set opacity to 50 percent"
- "open the left hemisphere"
- "move the cut deeper"
- "focus on the tumor"
- "reset everything"

**Display:** the transcript and the dispatch `message` are always visible. Unrecognized input gets: "I can't do that yet — try: …".

**`explainFinding`:** template over `VolumeResult`, for example:
> "This is a segmented region of about 42 cm³ in the right hemisphere, from the dataset's label. This is an educational view, not a diagnosis."

The 2D path says the location is illustrative.

**Not allowed:**
- diagnosis
- prognosis
- surgical-risk statements
- any medical claim not in a curated source (RAG is P2)

**Risk:** Chrome's Web Speech API uses a network service, and the hall will be noisy. The text box is the fallback and must always work.

## 9. Error handling

| Situation | Behaviour |
|-----------|-----------|
| Invalid file, mask mismatch, empty mask | 422 → Upload page shows the message and keeps the selected files. "Use sample case" stays one click away |
| Pipeline exception | `status=failed`, `PIPELINE_ERROR` + message → Processing page shows Retry and "Use sample case" |
| Backend unreachable | Frontend banner: "Backend offline". The backend runs locally on the demo laptop, so the demo needs no venue network for the sample path |
| Camera / mic denied or lost | Status chip shows "Gestures off" / "Voice off". Keyboard and text keep working. No modal dialogs |
| WebGL context lost | Message + reload button |

## 10. Testing

| Layer | Test |
|-------|------|
| Backend (pytest) | Synthetic 10×10×10 cube mask at 1 mm spacing → `volume_mm3 == 1000`, centroid == affine × center. Mismatched-affine mask → `MASK_MISMATCH`. Empty mask → `EMPTY_MASK` |
| Frontend (vitest) | `transform.ts` maps a known RAS point correctly. Dispatcher clamps out-of-range values. `parseIntent` covers the 6 phrases in §8.3 |
| Alignment | §5.1 alignment check, recorded in ticket C3 with screenshots |
| Demo | Full script (§11) run twice in a row on the demo laptop, with network off for the sample path |

## 11. Acceptance criteria — first complete demo

- [ ] The sample case runs Upload → Processing → Results → Place in 3D with no manual developer step.
- [ ] The source badge reads **Measured · dataset segmentation** or **Illustrative 2D placement**. The two paths can't be confused.
- [ ] A volume shows 3 linked orthogonal views. A 2D image never does.
- [ ] All 4 modes work on the same case, each with visible controls and Reset. Cutaway gives a straight-on internal view.
- [ ] The tumor marker and the slice crosshair stay aligned under orbit, clip, explode = 0, and mode changes.
- [ ] At least 1 gesture and 2 Jarvis commands change the scene. Keyboard/pointer can do the same.
- [ ] The Results screen and the pitch state the educational scope and data source.

## 12. Timeline (elapsed hours from kickoff)

Milestones on GitHub = Checkpoints A–H. Lanes: **ML/Backend**, **Viewer**, **App/Interaction**.

| Hours | Checkpoint | Gate | Stop rule |
|-------|-----------|------|-----------|
| 0–3 | **A** Location contract | Demo case licensed and loaded; renderer spike passes; transform module written | No valid volume + mask → lock the 2D fallback as primary and badge it |
| 3–8 | **B** Case flows to viewer | Sample case reaches `/explore` and shows the brain + tumor | Networking h6–7 (keep one integrator on call) |
| 8–14 | **C** Same target in 2D and 3D | Linked slices, X-Ray, alignment check passes | Alignment fails → stop new modes, fix it |
| 14–20 | **D** Four modes by pointer | Exploded + Cutaway + keyboard map | Food/rest rotation; networking h18–19 |
| 20–26 | **E** Judge can run the script | Gestures, Jarvis, error states | RAG / LLM stays frozen if not validated |
| 26–31 | **F** Reliable twice | Hardening, offline sample, backup recording | **Feature freeze h29** |
| 31–34 | **G** Timed pitch | Script, slides, Devpost, credits | Networking h31–32 (rotate) |
| 34–36 | **H** Submitted | Submission with ≥ 1 h buffer | — |

## 13. Risks

| Risk | Trigger | Response |
|------|---------|----------|
| 2D read as 3D | Only the classifier works | Illustrative badge, user-chosen depth, no mm |
| Coordinates drift | Alignment check fails | Stop features; fix `transform.ts`; worst case, badge *Illustrative* |
| Pipeline down | Bug, slow server, venue network | `POST /api/cases/sample` serves precomputed artifacts, labelled "Sample data" |
| Gesture / mic failure | Lighting, permissions, noise | Keyboard + text cover the whole pitch |
| Mesh too heavy | < 30 fps on the demo laptop | Decimate harder in `precompute_sample.py` |
| Scope creep | Ideas mid-hackathon | Idea issue → triage at the checkpoint (CONTRIBUTING). Freeze at h29 |

## 14. Decision Log

Append-only. Format: `date · hour · decision · why · PR`.

- 2026-10-23 · h0 · v1.1: locked D1–D10 (volume primary + 2D fallback, brain from same scan, R3F, hemispheres only, deterministic Jarvis) · resolves the v1.0 open decisions · initial PR
