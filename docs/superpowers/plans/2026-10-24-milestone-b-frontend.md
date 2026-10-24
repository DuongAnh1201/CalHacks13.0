# Milestone B Frontend (B5 + B6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, inline, with the overrides in "Worker rules" below. Steps use checkbox (`- [ ]`) syntax. Tick your own boxes in this file when a step is done, and commit the tick with your task.

**Goal:** A sample case runs Upload → Processing → Results → Explore (3D Whole Brain with the tumor) against Tom's FastAPI backend, with no developer step.

**Architecture:** `api/` holds hand-written contract types and a thin `fetch` client. Three routes (Upload, Processing, Results) follow Figma frames 01–03 for layout and SPEC/contract for content. `viewer/loadCase.ts` turns `model.glb` + `report` into the SPEC §6 scene graph, `viewer/CaseCanvas.tsx` renders it in Whole Brain mode, and `routes/Explore.tsx` assembles it. Every view change goes through the existing `dispatch()`.

**Tech Stack:** Vite + React 19 + TS, react-router-dom 7, R3F 9 + drei 10 (`useGLTF`, `CameraControls`), three 0.186, Zustand 5, vitest (node environment, `src/**/*.test.ts` only, no DOM).

**Issues:** B5 = #9, B6 = #10. Spec: `docs/SPEC.md` §3, §4, §6, §7, §9, §10, §11. Contract: `docs/BACKEND_CONTRACT.md` §1, §2, §5.

## Global Constraints

- Plain CSS: tokens `--nv-*` in `frontend/src/styles/tokens.css` + one CSS module per component. **No Tailwind. Never create a `lib/` directory.**
- Figma file `rHjTVYYISZzHWvWNeSKaVE`. References: `docs/figma/01-upload.ref.tsx` (43:3), `02-processing.ref.tsx` (44:99), `03-workspace.ref.tsx` (43:767, truncated at the right column; use `03-workspace.png` for the rest), `04-explore.ref.tsx` (43:1149). Screenshots `docs/figma/0N-*.png`. The `.ref.tsx` files are Tailwind **references**: convert to CSS modules. Never paste Tailwind classes.
- Icons: copy the exact file from `docs/figma/assets/` into `frontend/src/assets/figma/` and import it. Never redraw or inline an SVG.
- **Layout and visuals come from Figma. Content and copy come from SPEC + contract.** Where they disagree, SPEC wins:
  - Upload accepts **NIfTI only** (`.nii`, `.nii.gz`), 4 labelled slots T1c / T1 / T2 / FLAIR. Drop Figma's DICOM, ZIP and 2D-slice cards. Drop "Choose DICOM folder".
  - **Sample cases are listed first** (above the dropzone).
  - Drop Figma's "Stays on this device" card: scans go to the backend. Replace it with the educational notice.
  - Processing shows **no percentages** and no fake progress bar. Only real `status` + `stage`.
  - Drop Figma's voice/agent tips ("say … to the Neuro agent"): Jarvis is milestone D.
- Copy rules (contract §5): "No tumor detected", **never the word "healthy"** anywhere in `frontend/src` (a test enforces it). "Educational visualization; not clinically validated." "Shown where the model segmented it, in the scan's own coordinates."
- Contract message for non-NIfTI (verbatim): `Images and screenshots don't contain 3D scan data. Upload 4 NIfTI sequences (T1c, T1, T2, FLAIR) or use a sample case.`
- **No keyboard shortcuts.** Every action is an on-screen control that calls `dispatch(action, 'pointer')`.
- Base URL `API_URL` from `frontend/src/api/client.ts` (`VITE_API_URL`, default `http://localhost:8000`). No Vite proxy.
- Backend: `docker compose up` from the repo root (port 8000). Seeded jobs `sample` (side right) and `sample-2` (side left). No endpoint lists samples, so their ids are hardcoded.
- Commands run from `/Users/kaydee/Developer/CalHacks13.0/frontend`: `npm test`, `npx tsc -b`, `npm run build`, `npm run lint`.

## Worker rules (every worker, every task)

- **One shared checkout** at `/Users/kaydee/Developer/CalHacks13.0`, branch `viewer/anatomy-explorer-30`. Never `git switch`, `checkout`, `stash`, `reset`, `rebase`, `push`, or `git add -A` / `git add .`. Stage only your task's files by path.
- executing-plans overrides: **no worktree, no ledger, no final review, no finishing-a-development-branch, no push.**
- GitNexus: run `impact({target, direction: "upstream"})` before editing an existing function/component, and `detect_changes()` before every commit. Never run `gitnexus analyze` (the lead re-indexes).
- Commit message ends with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01K7M6bvo7e35QCzCUTFpjvw
  ```
- Messaging: `hc send <label> "<msg>"`. Message the **lead** only with: task done (commit hash + test count), a blocker, or a decision that changes this plan. Message **qa** when a task is ready for review. Message a peer only when you need something from them.
- Labels: `lead` (orchestrator), `fe`, `ai`, `be`, `qa`.

## Ownership and order

| Task | Owner | Depends on | Files |
|---|---|---|---|
| T1 API client + types + guards | be | – | `api/*` |
| T2 Backend up + smoke | be | – | none (report only) |
| T3 FlowStepper + Upload | fe | T1 | `components/FlowStepper*`, `components/FlowPage*`, `routes/Upload*` |
| T4 Processing | fe | T1, T3 | `routes/Processing*`, `routes/stages*` |
| T5 Results | fe | T1, T3 | `routes/Results*`, `routes/summary*`, `copy.test.ts` |
| T6 loadCase | ai | T1 | `viewer/loadCase*` |
| T7 CaseCanvas | ai | T6 | `viewer/CaseCanvas*` |
| T8 Explore route | ai | T5 (`routes/summary.ts`), T7 | `routes/Explore*`, delete `components/StubPage*` |
| T9 Review each task | qa | each task | none |
| T11 Figma alignment | fe (01–03, header/footer), ai (04, /learn) | own feature tasks PASS | CSS modules + screenshots |
| T10 Browser verification | qa | T2–T8, T11 | `docs/qa/2026-10-24-milestone-b/` |

fe and ai may start before T1 lands by coding against the T1 interfaces below; run tests only after be reports T1 done.

All paths below are relative to `frontend/src/` unless they start with `docs/` or `backend/`.

---

### Task 1: API types, client and upload guards (be)

**Files:**
- Modify: `api/types.ts`, `api/client.ts`
- Create: `api/upload.ts`, `api/upload.test.ts`

**Interfaces:**
- Produces (exact):
  ```ts
  // api/types.ts
  export type JobState = 'queued' | 'running' | 'done' | 'failed';
  export type Stage = 'validating' | 'inferring' | 'meshing';
  export interface JobError { code: string; message: string }
  export interface JobStatus { jobId: string; status: JobState; stage: Stage | null; error: JobError | null; createdAt: string }
  export interface Report { … }   // contract §2.2, see Step 1
  // api/client.ts
  export class ApiError extends Error { status: number; code: string }
  export function createJob(files: Record<Sequence, File>): Promise<string>   // jobId
  export function getJob(id: string, signal?: AbortSignal): Promise<JobStatus>
  export function getReport(id: string, signal?: AbortSignal): Promise<Report>
  export const modelUrl: (id: string) => string
  // api/upload.ts
  export const SEQUENCES: readonly Sequence[]   // ['t1c','t1','t2','flair']
  export type Sequence = 't1c' | 't1' | 't2' | 'flair'
  export const SEQUENCE_LABEL: Record<Sequence, string>
  export const INVALID_FORMAT_MESSAGE: string
  export function isNifti(name: string): boolean
  export function guessSequence(name: string): Sequence | null
  export interface SampleCase { id: string; title: string; detail: string }
  export const SAMPLES: readonly SampleCase[]
  ```

- [x] **Step 1: Types.** Replace `api/types.ts` with:

```ts
// Mirrors docs/BACKEND_CONTRACT.md §2 by hand (SPEC §6: no codegen).
import type { Vec3 } from '../viewer/transform';

export interface Health { ok: boolean; model: string; version: string }

export type JobState = 'queued' | 'running' | 'done' | 'failed';
export type Stage = 'validating' | 'inferring' | 'meshing';
export interface JobError { code: string; message: string }
export interface JobStatus { jobId: string; status: JobState; stage: Stage | null; error: JobError | null; createdAt: string }

export interface BBoxMm { min: Vec3; max: Vec3 }
export interface Report {
  jobId: string;
  coordinateFrame: 'RAS_mm';
  model: { name: string; arch: string; version: string };
  segmentationSource: 'model' | 'expert';
  tumorDetected: boolean;
  side: 'left' | 'right' | 'bilateral' | null;
  lesionCount: number;
  centroidMm: Vec3 | null;
  bboxMm: BBoxMm | null;
  volumesCm3: { whole: number; core: number; enhancing: number };
  brain: { centroidMm: Vec3; bboxMm: BBoxMm };
  input: { shape: [number, number, number]; spacingMm: Vec3; sequences: string[] };
  expertDice?: { whole: number; core: number; enhancing: number };
}
```

- [x] **Step 2: Failing test** `api/upload.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { guessSequence, INVALID_FORMAT_MESSAGE, isNifti, SAMPLES, SEQUENCES } from './upload';

describe('upload guards', () => {
  it('accepts only .nii and .nii.gz', () => {
    expect(isNifti('BraTS_001_t1.nii')).toBe(true);
    expect(isNifti('x.NII.GZ')).toBe(true);
    for (const n of ['scan.jpg', 'scan.png', 'scan.dcm', 'scan.zip', 'scan.nii.zip', 'nii', 'scan.gz']) expect(isNifti(n)).toBe(false);
  });
  it('guesses the sequence from the file name', () => {
    expect(guessSequence('BraTS20_001_t1ce.nii.gz')).toBe('t1c');
    expect(guessSequence('case_T1c.nii')).toBe('t1c');
    expect(guessSequence('case_t1gd.nii.gz')).toBe('t1c');
    expect(guessSequence('case_t1.nii.gz')).toBe('t1');
    expect(guessSequence('case_T2.nii.gz')).toBe('t2');
    expect(guessSequence('case_flair.nii.gz')).toBe('flair');
    expect(guessSequence('brain.nii.gz')).toBeNull();
  });
  it('keeps the contract message and sample ids', () => {
    expect(INVALID_FORMAT_MESSAGE).toBe("Images and screenshots don't contain 3D scan data. Upload 4 NIfTI sequences (T1c, T1, T2, FLAIR) or use a sample case.");
    expect(SEQUENCES).toEqual(['t1c', 't1', 't2', 'flair']);
    expect(SAMPLES.map((s) => s.id)).toEqual(['sample', 'sample-2']);
  });
});
```

- [x] **Step 3:** `npm test -- src/api/upload.test.ts` → FAIL (module not found).

- [x] **Step 4: Implement** `api/upload.ts`:

```ts
export type Sequence = 't1c' | 't1' | 't2' | 'flair';
export const SEQUENCES: readonly Sequence[] = ['t1c', 't1', 't2', 'flair'];
export const SEQUENCE_LABEL: Record<Sequence, string> = { t1c: 'T1c', t1: 'T1', t2: 'T2', flair: 'FLAIR' };

// Contract §2 "Input guard". The backend check stays the trust boundary.
export const INVALID_FORMAT_MESSAGE =
  "Images and screenshots don't contain 3D scan data. Upload 4 NIfTI sequences (T1c, T1, T2, FLAIR) or use a sample case.";

export const isNifti = (name: string) => /\.nii(\.gz)?$/i.test(name);

export function guessSequence(name: string): Sequence | null {
  const n = name.toLowerCase();
  if (n.includes('flair')) return 'flair';
  if (/t1[-_+]?(ce|c|gd)/.test(n)) return 't1c';
  if (n.includes('t2')) return 't2';
  if (n.includes('t1')) return 't1';
  return null;
}

export interface SampleCase { id: string; title: string; detail: string }
// No backend endpoint lists samples; ids match backend/seed/.
export const SAMPLES: readonly SampleCase[] = [
  { id: 'sample', title: 'Sample case A', detail: 'BraTS glioma, right hemisphere. Model segmentation with expert-label Dice.' },
  { id: 'sample-2', title: 'Sample case B', detail: 'BraTS glioma, left hemisphere. Model segmentation with expert-label Dice.' },
];
```

- [x] **Step 5: Client.** Replace `api/client.ts` with:

```ts
import type { Health, JobStatus, Report } from './types';
import type { Sequence } from './upload';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

/** Non-2xx response. 422 bodies are {code, message}; FastAPI 404/409 bodies are {detail}. */
// Fields declared explicitly: tsconfig has erasableSyntaxOnly, so no constructor parameter properties.
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function json<T>(r: Response): Promise<T> {
  if (r.ok) return r.json() as Promise<T>;
  const b = (await r.json().catch(() => null)) as { code?: string; message?: string; detail?: unknown } | null;
  const detail = typeof b?.detail === 'string' ? b.detail : undefined;
  throw new ApiError(r.status, b?.code ?? `HTTP_${r.status}`, b?.message ?? detail ?? `HTTP ${r.status}`);
}

export const getHealth = (signal?: AbortSignal) => fetch(`${API_URL}/health`, { signal }).then((r) => json<Health>(r));
export const getJob = (id: string, signal?: AbortSignal) => fetch(`${API_URL}/jobs/${encodeURIComponent(id)}`, { signal }).then((r) => json<JobStatus>(r));
export const getReport = (id: string, signal?: AbortSignal) => fetch(`${API_URL}/jobs/${encodeURIComponent(id)}/report`, { signal }).then((r) => json<Report>(r));
export const modelUrl = (id: string) => `${API_URL}/jobs/${encodeURIComponent(id)}/model.glb`;

export async function createJob(files: Record<Sequence, File>): Promise<string> {
  const body = new FormData();
  for (const [seq, f] of Object.entries(files)) body.append(seq, f, f.name);
  const r = await fetch(`${API_URL}/jobs`, { method: 'POST', body });
  return (await json<{ jobId: string }>(r)).jobId;
}
```

`BackendBanner` already uses `getHealth().then(h => h.ok)`; behaviour is unchanged. Run `impact({target: "getHealth", direction: "upstream"})` first and report the result.

- [x] **Step 6:** `npm test` (all pass), `npx tsc -b`, `npm run lint`.
- [x] **Step 7: Commit** `api/types.ts api/client.ts api/upload.ts api/upload.test.ts` as `feat(api): contract types, job client, NIfTI guard (#9)`. Then `hc send fe "T1 done at <hash>"`, the same to `ai` and `qa`, and to `lead`.

---

### Task 2: Backend up and smoke-checked (be)

**Files:** none committed. Report only.

- [ ] **Step 1:** From the repo root: `docker compose up -d --build` (arm64). Wait for `curl -s localhost:8000/health` → `{"ok":true,…}`.
- [ ] **Step 2: Smoke** (all must match):
  - `curl -s localhost:8000/jobs/sample` → `status: "done"`.
  - `curl -s localhost:8000/jobs/sample/report | jq .side` → `"right"`; `sample-2` → `"left"`.
  - `curl -sI localhost:8000/jobs/sample/model.glb` → 200, `content-type` glb/octet-stream.
  - `curl -s -o /dev/null -w '%{http_code}' localhost:8000/jobs/nope` → 404.
  - `curl -s -H 'Origin: http://localhost:5173' -I localhost:8000/health | grep -i access-control-allow-origin` → present.
  - `curl -s -F t1c=@/etc/hosts\;filename=a.jpg -F t1=@/etc/hosts\;filename=b.jpg -F t2=@/etc/hosts\;filename=c.jpg -F flair=@/etc/hosts\;filename=d.jpg localhost:8000/jobs` → 422 `INVALID_FORMAT`.
- [ ] **Step 3:** Find where the container's `jobs/` directory lives on the host (compose volume or bind mount). qa needs it in T10 to seed a broken GLB job named `sample-broken` (names starting with `sample` survive restarts).
- [ ] **Step 4:** Leave the backend running. `hc send lead` and `hc send qa` with: pass/fail per smoke line, and the host path of `jobs/`. Afterwards, answer contract questions from fe/ai.

---

### Task 3: FlowStepper, FlowPage shell, Upload page (fe)

**Files:**
- Create: `components/FlowStepper.tsx`, `components/FlowStepper.module.css`, `components/FlowPage.tsx`, `components/FlowPage.module.css`, `routes/Upload.module.css`
- Modify: `routes/Upload.tsx` (replace the stub)
- Copy into `assets/figma/`: `47363.svg` (upload), `3f40b.svg` (browse/file), `d5c9a.svg` (sample flask), `f8d34.svg` (check), `b1141.svg` (arrow right)

**Interfaces:**
- Consumes: T1 `createJob`, `ApiError`, `SEQUENCES`, `SEQUENCE_LABEL`, `isNifti`, `guessSequence`, `INVALID_FORMAT_MESSAGE`, `SAMPLES`, `Sequence`.
- Produces:
  ```ts
  export function FlowStepper({ step }: { step: 1 | 2 | 3 }): JSX.Element
  export function FlowPage({ step, title, lede, children }: { step: 1 | 2 | 3; title: string; lede: string; children: ReactNode }): JSX.Element
  ```

**Figma mapping (frame 01, `docs/figma/01-upload.ref.tsx`):**
- Page: `TopNavBar active="workspace"` + centered column (max 880px, gap 28px, padding-top below the floating header) + `Footer`. Background `#f6f9ff` (add token `--nv-flow-bg: #f6f9ff`).
- Stepper (44:2): pills 1 "Upload MRI", 2 "Segment & review", 3 "Explore in 3D", 48px connectors `#c1c7ce`. Current: bg `--nv-primary-soft-2`, index circle `--nv-primary`, text white. Done (frame 02, 44:102): bg `--nv-success-bg`, circle `--nv-success-2`, glyph `✓`. Future: 1px border `#c1c7ce`, text `--nv-text-3`. Render as `<ol aria-label="Progress">` with `aria-current="step"` on the current item.
- Heading (44:17): h1 36px bold `--nv-text`; lede 15px medium `--nv-text-3`, max 640px, centered.
- Dropzone (44:20): white 0.92, 2px dashed `rgba(31,86,115,.55)`, radius 16px, 72px round icon well `--nv-primary-soft-2` with the 32px upload icon, title 22px bold, sub 14px. Primary button (44:29): `--nv-primary`, radius 8px, 12px 20px padding, 18px icon.
- Cards (44:50 / 44:83): radius 12px, 1px border `#c1c7ce`, padding 16px; sample card bg `--nv-primary-soft-2` with border `rgba(31,86,115,.6)`; secondary button white with border (44:90).

**Content (SPEC §3 wins):**
1. Stepper step 1. h1 "Load an MRI study". Lede: "Pick a sample case, or upload the 4 MRI sequences of one study. NeuroVision segments the tumor and places it on the 3D brain."
2. **Sample cases first**: one card per `SAMPLES` entry (flask icon, title, detail, button "Use sample" → `navigate(`/jobs/${id}/processing`)`).
3. Dropzone: title "Drag & drop 4 NIfTI files here", sub "T1c, T1, T2 and FLAIR · .nii or .nii.gz · BraTS-style preprocessed MRI only", button "Browse files" (hidden `<input type="file" multiple accept=".nii,.nii.gz">`), footnote "Max 200 MB per file".
4. Four labelled slots under the dropzone (one row each: label T1c/T1/T2/FLAIR, file name or "No file", "Choose" button with its own single-file input). Dropped / browsed files are assigned with `guessSequence`; unmatched NIfTI files fill the first empty slot in `SEQUENCES` order.
5. Any non-NIfTI file in a pick or drop: reject the **whole** pick, keep existing slots, show `INVALID_FORMAT_MESSAGE` in a `role="alert"` box with a "Use sample case" button (→ `/jobs/sample/processing`). **No request is sent.**
6. "Start" primary button, disabled until all 4 slots are filled and while uploading ("Uploading…"). On success → `/jobs/${jobId}/processing`. On `ApiError` show `e.message` in the alert box and **keep the files**. On network failure show "Backend offline — start docker compose up".
7. Educational notice card (replaces Figma "Stays on this device"): title "Educational visualization", body "Not clinically validated. Not for diagnosis or surgical planning."
8. Keep `<BackendBanner />` at the top of the column.
9. Two format cards under the dropzone, built from the Figma **Format Card** symbol (`docs/figma/symbol-format-card.ref.tsx`, node `44:39`) as one `FormatCard` component inside `routes/Upload.tsx` (not exported): "NIfTI volume" (badge "3D", extensions `.nii  .nii.gz`, text "Full 3D volume. The tumor is placed on the 3D brain.") and "Images & screenshots" (badge "Not accepted", warm badge `--nv-accent-warm` on `#ffdad3`, extensions `.jpg  .png  .heic`, text "2D pictures don't contain 3D scan data.").

- [x] **Step 1:** Write `FlowStepper` + CSS module per the mapping. Write `FlowPage` (TopNavBar + main column with `FlowStepper`, h1, lede, children + Footer).
- [x] **Step 2:** Write the Upload page. Skeleton (fill the JSX per the content list above):

```tsx
const empty = (): Partial<Record<Sequence, File>> => ({});

export default function Upload() {
  const navigate = useNavigate();
  const [slots, setSlots] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function take(list: FileList | File[], only?: Sequence) {
    const files = [...list];
    if (files.some((f) => !isNifti(f.name))) { setError(INVALID_FORMAT_MESSAGE); return; }
    setError(null);
    setSlots((prev) => {
      const next = { ...prev };
      for (const f of files) {
        const seq = only ?? guessSequence(f.name) ?? SEQUENCES.find((s) => !next[s]);
        if (seq) next[seq] = f;
      }
      return next;
    });
  }

  async function start() {
    setBusy(true); setError(null);
    try { navigate(`/jobs/${await createJob(slots as Record<Sequence, File>)}/processing`); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Backend offline — start docker compose up'); }
    finally { setBusy(false); }
  }
  const ready = SEQUENCES.every((s) => slots[s]);
  // JSX: FlowPage step 1 → BackendBanner, samples, dropzone (onDragOver preventDefault, onDrop take(e.dataTransfer.files)), slots, error alert, Start, notice
}
```

- [x] **Step 3:** `npx tsc -b`, `npm test`, `npm run lint`, `npm run build`. Open `http://localhost:5173/` (`npm run dev`) and compare against `docs/figma/01-upload.png`. Pick a `.jpg`: alert shows the contract message; DevTools Network shows **no** `POST /jobs`.
- [x] **Step 4: Commit** only the files listed in this task as `feat(upload): Figma 01 upload page with NIfTI guard and samples (#9)`. `hc send qa "T3 ready at <hash>"`.

---

### Task 4: Processing page (fe)

**Files:**
- Create: `routes/stages.ts`, `routes/stages.test.ts`, `routes/Processing.module.css`
- Modify: `routes/Processing.tsx` (replace the stub)
- Copy into `assets/figma/`: `a6f94.svg` (file icon), `7e35a.svg` (step check), `0ee3b.svg` (running state ring)

**Interfaces:**
- Consumes: T1 `getJob`, `ApiError`, `JobStatus`, `Stage`; T3 `FlowPage`.
- Produces:
  ```ts
  export type RowState = 'done' | 'active' | 'pending' | 'failed';
  export interface StageRow { stage: Stage; label: string; state: RowState }
  export function stageRows(job: Pick<JobStatus, 'status' | 'stage'>): StageRow[]
  ```

- [x] **Step 1: Failing test** `routes/stages.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { stageRows } from './stages';

const states = (j: Parameters<typeof stageRows>[0]) => stageRows(j).map((r) => r.state);

describe('stageRows', () => {
  it('queued: all pending', () => expect(states({ status: 'queued', stage: null })).toEqual(['pending', 'pending', 'pending']));
  it('running inferring: validating done, inferring active', () =>
    expect(states({ status: 'running', stage: 'inferring' })).toEqual(['done', 'active', 'pending']));
  it('done: all done', () => expect(states({ status: 'done', stage: null })).toEqual(['done', 'done', 'done']));
  it('failed while meshing: earlier done, meshing failed', () =>
    expect(states({ status: 'failed', stage: 'meshing' })).toEqual(['done', 'done', 'failed']));
  it('failed with no stage: nothing marked done', () =>
    expect(states({ status: 'failed', stage: null })).toEqual(['pending', 'pending', 'pending']));
  it('labels are real backend stages, no percentages', () =>
    expect(stageRows({ status: 'queued', stage: null }).map((r) => r.label).join(' ')).not.toMatch(/%/));
});
```

- [x] **Step 2:** `npm test -- src/routes/stages.test.ts` → FAIL.
- [x] **Step 3: Implement** `routes/stages.ts`:

```ts
import type { JobStatus, Stage } from '../api/types';

export type RowState = 'done' | 'active' | 'pending' | 'failed';
export interface StageRow { stage: Stage; label: string; state: RowState }

const ORDER: readonly { stage: Stage; label: string }[] = [
  { stage: 'validating', label: 'Check the 4 sequences' },
  { stage: 'inferring', label: 'Segment the tumor (SegResNet)' },
  { stage: 'meshing', label: 'Build the 3D brain and tumor meshes' },
];

export function stageRows({ status, stage }: Pick<JobStatus, 'status' | 'stage'>): StageRow[] {
  const at = stage ? ORDER.findIndex((o) => o.stage === stage) : -1;
  return ORDER.map((o, i) => {
    let state: RowState = 'pending';
    if (status === 'done' || i < at) state = 'done';
    else if (i === at) state = status === 'failed' ? 'failed' : 'active';
    return { ...o, state };
  });
}
```

- [x] **Step 4:** test passes.
- [x] **Step 5: Page.** Poll `getJob(id)` immediately, then every **1 s** (`setTimeout` after each response, `AbortController` on unmount; stop on `done`/`failed`). Behaviour:
  - `done` → `navigate(`/jobs/${id}/results`, { replace: true })`.
  - `failed` → `role="alert"` box with `job.error.message`, buttons "Retry" (→ `/`, Upload) and "Use sample case" (→ `/jobs/sample/processing`).
  - `ApiError` 404 → alert "Unknown job." + "Use sample case".
  - Network error → alert "Backend offline — start docker compose up" + "Retry" (restarts polling) + "Use sample case".
  - While `queued`/`running`: card per frame 02 (44:218): file row shows "Job `<id>`" in mono + status pill ("Queued" / "Running" / "Failed"); stage rows from `stageRows` (done = 22px green circle + check icon; active = running ring icon + bold `--nv-primary` label; pending = 1.5px grey ring; failed = `--nv-accent-warm` ring). **No progress bar, no %.** A "Use sample case" secondary button stays visible (SPEC §9 "Inference slow").
  - Stepper step 2, h1 "Preparing your study", lede "The results open as soon as segmentation finishes."
- [x] **Step 6:** tsc, test, lint, build. With the backend up, `/jobs/sample/processing` must land on `/jobs/sample/results` without a click; `/jobs/nope/processing` shows "Unknown job.".
- [x] **Step 7: Commit** `feat(processing): poll job status and stage every second (#9)`. `hc send qa "T4 ready at <hash>"`.

---

### Task 5: Results page + copy guard (fe)

**Files:**
- Create: `routes/summary.ts`, `routes/summary.test.ts`, `routes/Results.module.css`, `copy.test.ts`
- Modify: `routes/Results.tsx` (replace the stub)

**Interfaces:**
- Consumes: T1 `getReport`, `ApiError`, `Report`; existing `Legend`, `TopNavBar`, `Footer`.
- Produces:
  ```ts
  export function headline(r: Report): 'Tumor detected' | 'No tumor detected'
  export function sideLabel(side: Report['side']): string
  export const cm3: (v: number) => string   // "136.3 cm³"
  ```

- [ ] **Step 1: Failing tests.** `routes/summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Report } from '../api/types';
import { cm3, headline, sideLabel } from './summary';

describe('result summary', () => {
  it('headline never says anything but the two contract phrases', () => {
    expect(headline({ tumorDetected: true } as Report)).toBe('Tumor detected');
    expect(headline({ tumorDetected: false } as Report)).toBe('No tumor detected');
  });
  it('side labels (+x = patient right)', () => {
    expect(sideLabel('left')).toBe('Left hemisphere');
    expect(sideLabel('right')).toBe('Right hemisphere');
    expect(sideLabel('bilateral')).toBe('Both hemispheres');
    expect(sideLabel(null)).toBe('—');
  });
  it('formats volumes', () => expect(cm3(136.28)).toBe('136.3 cm³'));
});
```

`copy.test.ts` (contract §5, issue #9 acceptance):

```ts
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const BANNED = new RegExp(['heal', 'thy'].join(''), 'i'); // split so this file doesn't match itself

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

it('UI source never uses the banned word (contract §5)', () => {
  const hits = files(fileURLToPath(new URL('.', import.meta.url)))
    .filter((p) => /\.(tsx?|css|json)$/.test(p) && !/\.test\.ts$/.test(p))
    .filter((p) => BANNED.test(readFileSync(p, 'utf8')));
  expect(hits).toEqual([]);
});
```

(Test files are skipped because `viewer/atlasData.test.ts` asserts the word is absent and so contains it. The triple-slash reference is needed because `tsconfig.app.json` only loads `vite/client` types; `@types/node` is already installed.)

- [ ] **Step 2:** `npm test` → summary FAIL (module missing); copy test PASS already (it guards regressions).
- [ ] **Step 3: Implement** `routes/summary.ts`:

```ts
import type { Report } from '../api/types';

export const headline = (r: Report) => (r.tumorDetected ? 'Tumor detected' : 'No tumor detected');
const SIDE: Record<NonNullable<Report['side']>, string> = { left: 'Left hemisphere', right: 'Right hemisphere', bilateral: 'Both hemispheres' };
export const sideLabel = (s: Report['side']) => (s ? SIDE[s] : '—');
export const cm3 = (v: number) => `${v.toFixed(1)} cm³`;
```

- [ ] **Step 4: Page** per frame 03 (`docs/figma/03-workspace.png`; ref nodes "Patient Dataset Record Card" line 62, "AI Segmentation Analysis Report" line 776, "Button — Place in 3D" line 306). Three-column grid like `routes/Learn.module.css` (left 350px, centre 1fr, right 340px; single column under 1100px), `TopNavBar active="workspace"`, `FlowStepper step={2}` above the grid is **not** in frame 03, so leave it out.
  - Load: `getReport(id)`. `ApiError` 409 → `<Navigate to={`/jobs/${id}/processing`} replace />`. 404 → "Unknown job." + "Use sample case". Network error → "Backend offline — start docker compose up" + Retry. Loading → "Loading results…".
  - **Left card "Scan"** (frame 03 "Patient Dataset"): Job id (mono), Sequences (`input.sequences` → `SEQUENCE_LABEL`, joined " · "), Matrix (`shape.join(' × ')`), Voxel spacing (`spacingMm` mm), Model (`model.arch` + `v${model.version}`). No patient name, no fake fields.
  - **Centre** `<section aria-label="Slices">`: the slot for SlicePanel (C1). Card with title "Slices", text "Linked axial / sagittal / coronal views arrive with ticket C1.", and `<Legend available={{ edema: r.tumorDetected, core: r.tumorDetected, enhancing: r.volumesCm3.enhancing > 0 }} />`.
  - Right column visuals: `docs/figma/03-workspace-right.ref.tsx` (node `43:1002`, complete export). Keep its card/metric-tile styling; replace every invented value with real report data or drop it. Drop "Glioblastoma Multiforme", "Confidence", "Anatomical Location", "Adjacent to Hippocampus", "Loss", the "Simulated Clinical Data" chip, the progress bar, both secondary buttons and the palm-gesture line. Chip "Prototype Placement" becomes "Educational". Dice badge shows `expertDice.whole` (2 decimals) only when present. "Approximate Dimensions" tile is real: `(bboxMm.max − bboxMm.min) / 10` cm, formatted `3.2 × 2.8 × 2.4 cm` (x × y × z = left-right × front-back × up-down), only when `bboxMm` exists.
  - **Right card** (frame 03 "AI Volumetric Analysis"): `<div data-slot="source-badge" />` (C4 fills it), h2 `headline(r)`. If tumor: rows Whole tumor / Tumor core / Enhancing with `cm3`, Side `sideLabel`, Lesions `lesionCount`. If `expertDice`: row "Model vs expert label (Dice)" `whole 0.89 · core 0.96 · enhancing 0.88` (2 decimals). Limitations list:
    - "Educational visualization; not clinically validated."
    - "Shown where the model segmented it, in the scan's own coordinates."
    - "BraTS-style preprocessed MRI only."
    - Samples only (`SAMPLES.some(s => s.id === id)`): "Sample case from the BraTS dataset; it may be part of the model's training data."
  - **CTA card** (frame 03 "Spatial pipeline action"): primary "Place in 3D" + arrow icon `b1141.svg` → `/jobs/${id}/explore`. No other buttons (Export / Adjust threshold are out of scope).
- [ ] **Step 5:** tsc, test, lint, build. `/jobs/sample/results` shows "Tumor detected", 136.3 / 61.6 / 34.3 cm³, Right hemisphere, 1 lesion, Dice row; "Place in 3D" opens `/jobs/sample/explore`. `sample-2` shows Left hemisphere.
- [ ] **Step 6: Commit** `feat(results): Figma 03 results with volumes, side, Dice and limitations (#9)`. `hc send qa "T5 ready at <hash>"`.

---

### Task 6: `viewer/loadCase.ts` (ai)

**Files:**
- Create: `viewer/loadCase.ts`, `viewer/loadCase.test.ts`

**Interfaces:**
- Consumes: T1 `Report`; existing `LAYERS`, `BRAIN_LAYER`, `Layer` (`viewer/layers.ts`), `worldMatrix`, `rasToScene`, `Vec3` (`viewer/transform.ts`).
- Produces:
  ```ts
  export class MissingNodeError extends Error { readonly missing: string[] }
  export interface CaseScene {
    world: THREE.Group; hemiLeft: THREE.Group; hemiRight: THREE.Group; tumorCenter: THREE.Group; cursorMarker: THREE.Group;
    tumor: Partial<Record<Layer, THREE.Mesh>>;
  }
  export function buildCaseScene(gltfScene: THREE.Object3D, report: Report): CaseScene
  ```

- [x] **Step 1: Failing test** `viewer/loadCase.test.ts`:

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Report } from '../api/types';
import { buildCaseScene, MissingNodeError } from './loadCase';
import { rasToScene, type Vec3 } from './transform';

const mesh = (name: string) => Object.assign(new THREE.Mesh(new THREE.BufferGeometry()), { name });
const glb = (...names: string[]) => { const g = new THREE.Group(); names.forEach((n) => g.add(mesh(n))); return g; };
const ALL = ['brain_left', 'brain_right', 'edema', 'core', 'enhancing'];
const report = (over: Partial<Report> = {}) => ({
  tumorDetected: true, side: 'right', centroidMm: [157.9, 114.3, 67.6],
  brain: { centroidMm: [120.7, 105, 76.3], bboxMm: { min: [53, 21, 10], max: [188, 196, 141] } }, ...over,
}) as Report;

describe('buildCaseScene', () => {
  it('names the missing hemisphere node', () => {
    expect(() => buildCaseScene(glb('brain_right', 'edema'), report())).toThrow(MissingNodeError);
    try { buildCaseScene(glb('core'), report()); } catch (e) {
      expect((e as MissingNodeError).missing).toEqual(['brain_left', 'brain_right']);
      expect((e as Error).message).toContain('brain_left');
    }
  });
  it('puts tumor layers under the hemisphere named by report.side', () => {
    const s = buildCaseScene(glb(...ALL), report({ side: 'right' }));
    expect(s.tumor.edema?.parent).toBe(s.hemiRight);
    expect(buildCaseScene(glb(...ALL), report({ side: 'left' })).tumor.core?.parent?.name).toBe('hemiLeft');
    expect(buildCaseScene(glb(...ALL), report({ side: 'bilateral' })).tumor.enhancing?.parent?.name).toBe('tumorCenter');
  });
  it('maps the tumor centroid through R_yup · T_center (SPEC §5.2)', () => {
    const r = report();
    const s = buildCaseScene(glb(...ALL), r);
    s.world.updateMatrixWorld(true);
    const p = s.tumor.edema!.localToWorld(new THREE.Vector3(...(r.centroidMm as Vec3)));
    const want = rasToScene(r.centroidMm as Vec3, r.brain.centroidMm);
    p.toArray().forEach((v, i) => expect(v).toBeCloseTo(want[i], 6));
  });
  it('no tumor: brain only, no throw', () => {
    const s = buildCaseScene(glb('brain_left', 'brain_right'), report({ tumorDetected: false, side: null, centroidMm: null }));
    expect(s.tumor).toEqual({});
  });
  it('uses layers.ts materials, transparent ones without depth write', () => {
    const s = buildCaseScene(glb(...ALL), report());
    const m = s.tumor.edema!.material as THREE.MeshStandardMaterial;
    expect(m.transparent).toBe(true);
    expect(m.depthWrite).toBe(false);
    expect(s.tumor.edema!.renderOrder).toBe(3);
  });
  it('does not mutate the cached GLB scene', () => {
    const g = glb(...ALL);
    buildCaseScene(g, report());
    expect(g.children.map((c) => c.name)).toEqual(ALL);
  });
});
```

- [x] **Step 2:** `npm test -- src/viewer/loadCase.test.ts` → FAIL.
- [x] **Step 3: Implement** `viewer/loadCase.ts`:

```ts
import * as THREE from 'three';
import type { Report } from '../api/types';
import { BRAIN_LAYER, LAYERS, type Layer } from './layers';
import { worldMatrix } from './transform';

export class MissingNodeError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`3D model is missing node${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
    this.name = 'MissingNodeError';
    this.missing = missing;
  }
}

export interface CaseScene {
  world: THREE.Group; hemiLeft: THREE.Group; hemiRight: THREE.Group; tumorCenter: THREE.Group; cursorMarker: THREE.Group;
  tumor: Partial<Record<Layer, THREE.Mesh>>;
}

const group = (name: string, parent?: THREE.Object3D) => { const g = new THREE.Group(); g.name = name; parent?.add(g); return g; };

/** SPEC §6 scene graph. Clones the GLB so useGLTF's cached scene stays untouched. GLB materials are ignored (SPEC §7.4). */
export function buildCaseScene(gltfScene: THREE.Object3D, report: Report): CaseScene {
  const src = gltfScene.clone(true);
  // A multi-primitive glTF node loads as a Group of Meshes; take its first Mesh.
  const find = (n: string) => { const m = src.getObjectByName(n)?.getObjectByProperty('isMesh', true); return m instanceof THREE.Mesh ? m : null; };
  const left = find('brain_left'), right = find('brain_right');
  const missing = [!left && 'brain_left', !right && 'brain_right'].filter((n): n is string => !!n);
  if (missing.length) throw new MissingNodeError(missing);

  const world = group('world');
  world.matrixAutoUpdate = false;
  world.matrix.copy(worldMatrix(report.brain.centroidMm));
  const hemiLeft = group('hemiLeft', world), hemiRight = group('hemiRight', world), tumorCenter = group('tumorCenter', world);
  const cursorMarker = group('cursorMarker', world); // shortcut: empty, C2 adds the crosshair mesh

  for (const [m, host] of [[left!, hemiLeft], [right!, hemiRight]] as const) {
    m.material = new THREE.MeshStandardMaterial({ color: BRAIN_LAYER.color, roughness: 0.7, metalness: 0 });
    m.renderOrder = BRAIN_LAYER.renderOrder;
    host.add(m);
  }

  const tumor: CaseScene['tumor'] = {};
  if (report.tumorDetected) {
    const host = report.side === 'left' ? hemiLeft : report.side === 'right' ? hemiRight : tumorCenter;
    for (const l of LAYERS) {
      const m = find(l.node);
      if (!m) continue;
      const transparent = l.opacity < 1;
      m.material = new THREE.MeshStandardMaterial({ color: l.color, opacity: l.opacity, transparent, depthWrite: !transparent, roughness: 0.5, metalness: 0 });
      m.renderOrder = l.renderOrder;
      host.add(m);
      tumor[l.layer] = m;
    }
  }
  return { world, hemiLeft, hemiRight, tumorCenter, cursorMarker, tumor };
}
```

- [x] **Step 4:** tests pass. `npx tsc -b`, `npm run lint`.
- [x] **Step 5: Commit** `feat(viewer): loadCase builds the SPEC §6 scene graph, names missing nodes (#10)`. `hc send qa "T6 ready at <hash>"`.

---

### Task 7: `viewer/CaseCanvas.tsx`, Whole Brain mode (ai)

**Files:**
- Create: `viewer/CaseCanvas.tsx`, `viewer/CaseCanvas.module.css`

**Interfaces:**
- Consumes: T1 `Report`, `modelUrl`; T6 `buildCaseScene`, `CaseScene`, `Layer`; existing `useViewer`, `viewEvents`, `rasToScene`. Copy the WebGL-context-lost fallback, lights, `CameraControls` usage and the home/reset pattern from `viewer/AtlasCanvas.tsx` (read it first; run `impact` on nothing there, because you do not edit it).
- Produces:
  ```ts
  export function CaseCanvas(props: { jobId: string; report: Report; onLayers: (available: Partial<Record<Layer, boolean>>) => void }): JSX.Element
  ```
  Throws `MissingNodeError` during render (the route's error boundary shows it).

Behaviour:
- `useGLTF(modelUrl(jobId))` → `useMemo(() => buildCaseScene(scene, report), [scene, report])` → `<primitive object={cs.world} />`. Call `onLayers` once with the keys of `cs.tumor` set to `true`.
- **Whole Brain** (SPEC §4): hemispheres opaque. Tumor meshes `visible = st.tumorRevealed` from `useViewer`. Ignore `st.layers` for now (its initial state is all `false`, and no toggle exists yet); add `// shortcut: st.layers ignored, wire it when the layer toggles ticket lands`.
- **Home camera:** same direction as AtlasCanvas `HOME` (`[-260, 80, -200]` looking at origin; the brain centroid is the scene origin). On first controls ready: `setLookAt(...HOME, false)` then `saveState()`.
- **focusTumor:** when `st.cameraTarget === 'tumor'` and `report.centroidMm` exists, `controls.fitToSphere(new THREE.Sphere(new THREE.Vector3(...rasToScene(report.centroidMm, report.brain.centroidMm)), r), true)` where `r` = half the diagonal of `report.bboxMm` (min 12 mm). Before and after the call log `console.info('[case] tumor world position', v.toArray())` where `v = cs.tumor.edema ?? first tumor mesh` → `localToWorld(new Vector3(...report.centroidMm))`. Both logs must print the same numbers (issue #10 acceptance).
- **Reset:** listen to `viewEvents` `'reset'` exactly like AtlasCanvas and call `controls.reset(true)` so the camera returns to the saved home state. (`resetView` already restores `initialState`, so `tumorRevealed` goes back to `false` and the tumor hides.)
- Background `--nv-canvas-bg` via the CSS module; canvas fills its parent.

- [x] **Step 1:** Implement per the behaviour list. Keep it under ~120 lines; no new state outside `useViewer`.
- [x] **Step 2:** `npx tsc -b`, `npm test`, `npm run lint`, `npm run build`.
- [x] **Step 3: Commit** `feat(viewer): CaseCanvas renders a job in Whole Brain mode (#10)`. `hc send qa "T7 ready at <hash>"`. (Browser check happens after T8 wires the route.)

---

### Task 8: Explore route assembly (ai)

**Files:**
- Modify: `routes/Explore.tsx` (replace the stub)
- Create: `routes/Explore.module.css`
- Delete: `components/StubPage.tsx`, `components/StubPage.module.css` (after T3–T5 land and `grep -rn StubPage src` shows only Explore). Run `impact({target: "StubPage", direction: "upstream"})` first.

**Interfaces:**
- Consumes: T1 `getReport`, `ApiError`, `Report`; T6 `MissingNodeError`; T7 `CaseCanvas`; existing `initCase`, `dispatch`, `Legend`, `TopNavBar`, `Footer`, `useGLTF`.

Behaviour (follow frame 04 `docs/figma/04-explore.png` for the stage + right panel; the agent/voice/webcam panels are out of scope):
- `getReport(id)`; 409 → `<Navigate to={`/jobs/${id}/processing`} replace />`; 404 → "Unknown job." + "Use sample case"; network → "Backend offline — start docker compose up" + Retry.
- On report: `initCase({ jobId: id, hasTumor: report.tumorDetected, structureIds: new Set(), bboxMm: report.brain.bboxMm })`.
- Layout: `TopNavBar active="explore"`, grid `1fr 340px` (stage + right panel), `Footer`.
- Stage: error boundary (copy the `LoadBoundary` pattern from `routes/Learn.tsx`, but render `error.message` so a `MissingNodeError` shows "3D model is missing node: brain_left"; Retry calls `useGLTF.clear(modelUrl(id))`) → `Suspense` "Loading 3D brain…" → `CaseCanvas`.
- Stage bottom toolbar (style like `learn/LearnToolbar.module.css`): **"Show tumor"** → `dispatch({ type: 'focusTumor' }, 'pointer')` (disabled when `!report.tumorDetected`, title "No tumor detected in this scan"), **"Reset view"** → `dispatch({ type: 'resetView' }, 'pointer')`. Show the last `DispatchResult.message` in a `role="status"` line.
- Right panel: h2 `headline(report)` (from T5 `routes/summary.ts`), `sideLabel`, whole volume `cm3`, `<Legend available={layers} />` from `onLayers`, link "Back to results" → `/jobs/${id}/results`.

- [ ] **Step 1:** Implement. **Step 2:** tsc, test, lint, build.
- [ ] **Step 3:** With the backend up, open `/jobs/sample/explore`: brain renders, tumor hidden; "Show tumor" reveals it and flies the camera; the two console logs match; "Reset view" returns to the first frame exactly and hides the tumor; `/jobs/sample-2/explore` puts the tumor on the left.
- [ ] **Step 4: Commit** `feat(explore): job explore page with Whole Brain, Show tumor and Reset (#10)`. `hc send qa "T8 ready at <hash>"` and `hc send lead "T8 done at <hash>"`.

---

### Task 9: Per-task review (qa)

For each "Tn ready at <hash>" message:

- [ ] `git show --stat <hash>`: only that task's files changed.
- [ ] `npm test`, `npx tsc -b`, `npm run lint`, `npm run build` pass at that commit or later.
- [ ] Diff against this plan's task: interfaces match exactly; Global Constraints hold (no Tailwind classes, no `lib/`, no inline SVG, no keyboard shortcuts, no banned word, SPEC-over-Figma content rules).
- [ ] Reply to the owner: `PASS Tn` or `FAIL Tn: <file:line> <problem>` (one line per problem). Send each PASS/FAIL to `lead` too.

### Task 11: Figma alignment pass over every screen (fe, ai)

User request: the whole Figma page `43:2` ("NeuroVision Flow — Upload → Workspace → 3D", <https://www.figma.com/design/rHjTVYYISZzHWvWNeSKaVE/NeuroVision?node-id=43-2>) is the visual source for the app. After your feature tasks pass review, match your screens to it.

**Page contents:** frames `43:3` 01 Upload, `44:99` 02 Processing, `43:767` 03 Results (MRI Workspace), `43:1149` 04 Explore (tumor in 3D); symbols `44:39` Format Card, `45:30` Tool Call (agent panel, out of scope). Every frame shares the Header (`43:345` / `43:1109` / `43:1406`) and Footer (`43:329` / `43:1093` / `43:1387`).

**Sources, in order:** (1) Figma MCP `get_design_context(fileKey "rHjTVYYISZzHWvWNeSKaVE", nodeId <child node>)` if your agent has the Figma MCP. Call it on a section, not a whole frame (whole frames truncate at 100 KB). (2) Otherwise the frozen exports in `docs/figma/*.ref.tsx` + `docs/figma/0N-*.png`; `docs/figma/ASSETS.md` maps every icon. Never paste Tailwind; convert to the CSS module. Never redraw an icon.

| Owner | Screens |
|---|---|
| fe | Upload (01), Processing (02), Results (03), shared `TopNavBar` + `Footer` |
| ai | Explore (04) stage + right panel, `/learn` (also frame 04 layout) |

Per screen:
- [ ] Open the running page and the frame PNG side by side at 1568 px wide. List every difference in spacing, size, font weight, colour, radius, border, shadow and icon.
- [ ] Fix each in the CSS module, reusing `--nv-*` tokens (add a token only when a Figma value repeats in 2+ places). Run `impact` before editing any shared component (`TopNavBar`, `Footer`, `Legend`, `BackendBanner`).
- [ ] SPEC/contract content rules stay above Figma (Global Constraints). Out-of-scope Figma panels (agent, voice, webcam, MPR slices) are **not** cloned; leave the slot or omit.
- [ ] Screenshot after the fix into `docs/qa/2026-10-24-milestone-b/figma-<screen>.jpg`, then tsc, test, lint, build.
- [ ] Commit `style(<screen>): match Figma frame <id>` with only your CSS/TSX files and screenshots. `hc send qa "T11 <screen> ready at <hash>"`. qa compares against the frame PNG and replies PASS/FAIL.

### Task 10: Browser verification (qa)

**Files:** Create `docs/qa/2026-10-24-milestone-b/README.md` + screenshots (`.jpg`) in the same folder. Format: copy `docs/qa/2026-10-23-learn/README.md` (table # / Check / Result / Evidence, HEAD hash, test counts).

Prereq: be's T2 message (backend running, host `jobs/` path). `npm run dev` in `frontend/`.

| # | Check |
|---|---|
| 1 | `/` matches `docs/figma/01-upload.png` layout; samples above the dropzone; NIfTI-only copy; educational notice |
| 2 | Pick a `.jpg`: contract message shown, Network tab shows **no** `POST /jobs` |
| 3 | "Use sample" → Processing → Results with no click; Processing never shows a % |
| 4 | Results for `sample`: Tumor detected, 136.3 / 61.6 / 34.3 cm³, Right hemisphere, 1 lesion, Dice row, limitations incl. training-case line, layout vs `03-workspace.png` |
| 5 | `sample-2`: Left hemisphere |
| 6 | "Place in 3D" → `/jobs/sample/explore`: brain loads, tumor hidden, no console errors |
| 7 | "Show tumor": tumor appears on the patient-right side, camera frames it; the two `[case] tumor world position` logs are identical |
| 8 | Orbit, then "Reset view": camera returns to the first frame exactly (compare screenshots) and tumor hides |
| 9 | Broken GLB: copy `<jobs>/sample` to `<jobs>/sample-broken`, rename node `brain_left` → `brain_LEFT` in its `model.glb` JSON chunk (same length, e.g. Python byte replace), open `/jobs/sample-broken/explore` → error names `brain_left`. Delete `sample-broken` afterwards |
| 10 | Backend stopped (`docker compose stop`): `/` shows "Backend offline — start docker compose up"; Processing/Results show the offline message + Retry. Restart the backend afterwards |
| 11 | Real upload (optional, only if 4 NIfTI files are at hand, e.g. `backend/seed/sample/flair.nii.gz` copied 4× under sequence names): Processing shows live stages `validating → inferring → meshing` |
| 12 | `grep -rni` for the banned word in `frontend/src` (non-test files): none |

- [ ] Commit the README + screenshots as `docs(qa): Milestone B browser verification`. `hc send lead "T10: <n> PASS / <m> FAIL, commit <hash>"`. Send each FAIL to the owning worker too.

---

## Out of scope (other tickets)

SlicePanel/NiiVue (C1), Source badge (C4), X-Ray/Exploded/Cutaway modes and their controls, layer toggles, gestures (E), Jarvis (D), keyboard shortcuts (user decision: none).
