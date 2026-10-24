# Backend ↔ Frontend Contract (Tom's AI backend)

**Status: SIGNED OFF v1.1 (2026-10-24) by Tom, backend owner (`lane:ml-backend`). Changes go through a PR plus a heads-up to the viewer and app owners.**

Tom's pipeline (MONAI `brats_mri_segmentation` SegResNet → masks → meshes → FastAPI jobs) is the backend. The frontend builds against **exactly** what this file specifies.

- If something here is wrong or inconvenient, change it **here** in a PR and tell the viewer + app owners.
- Don't drift silently.

Each `- [ ]` item is something the backend needs to do or confirm. Tick it in the PR that delivers it.

## ⚠️ Action required first: restructure `model.glb`

The current output is one `model.glb` with brain + edema + core + enhancing layers. It must be refined into **exactly these five named nodes**:

```
model.glb
├─ brain_left    ← brain mask, x_RAS < brain midline   (closed mesh)
├─ brain_right   ← brain mask, x_RAS ≥ brain midline   (closed mesh)
├─ edema         ← surface of whole tumor (WT)          (outer shell)
├─ core          ← surface of tumor core (TC)
└─ enhancing     ← surface of enhancing tumor (ET)      (omit if no ET)
```

- [ ] Five nodes with these exact names. RAS mm, input affine, identity node transforms (details in §1).
- [ ] Brain split at the midline **before** marching cubes, so each half is closed.
- [ ] The sample job's `model.glb` is regenerated in this format **by checkpoint B (hour 8)**. The viewer lane builds against it from then on.

**If inference isn't working by hour 8:** run `mask_to_mesh.py` on the demo case's **expert mask** to produce the same five-node `model.glb`. The frontend doesn't change at all, and the badge switches to "Expert segmentation (dataset label)". We do **not** fall back to 2D input.

---

## 1. The GLB is the contract

`GET /jobs/{id}/model.glb` is the main output. The frontend finds meshes **by node name**. A missing name means that feature is turned off in the UI.

### 1.1 Node names (exact strings)

| Node | Mesh of | Required |
|------|---------|----------|
| `brain_left` | Brain mask, patient-left half (x_RAS < brain midline) | yes |
| `brain_right` | Brain mask, patient-right half (x_RAS ≥ brain midline) | yes |
| `edema` | Surface of **whole tumor** (WT, any tumor label) — the outer shell | if tumor detected |
| `core` | Surface of **tumor core** (TC) | if tumor detected |
| `enhancing` | Surface of **enhancing tumor** (ET) | if tumor detected and ET present |

- [ ] **Split the brain at the midline before marching cubes**, so each hemisphere is a closed mesh with a flat inner face. Exploded and Cutaway modes need two separate hemisphere nodes. Midline = x of the brain-mask centroid, **not** x = 0 (the scanner origin is arbitrary).
- [ ] Tumor layers are **nested shells** (ET ⊂ TC ⊂ WT): each node is the surface of its own whole region, not "WT minus TC". The frontend makes the outer layers translucent so the inner ones show through.
- [ ] No tumor detected → omit `edema` / `core` / `enhancing`. Don't export empty meshes.

### 1.2 Geometry rules

- [ ] Vertices are in **RAS+ millimetres**, mapped through the **same affine** as the input MRI. This is what keeps the 3D view aligned with the 2D slices.
- [ ] **No transform on any node or the root** (identity matrices). The frontend applies the −90° X rotation and the centering itself.
- [ ] Materials are optional. The frontend replaces them so 3D colours match the 2D overlay (§3).
- [ ] Size budget: ≤ 150k triangles per hemisphere and ≤ 50k per tumor layer. Total `model.glb` ≤ 15 MB. Decimate or smooth as needed.

## 2. Endpoints

Base URL comes from `VITE_API_URL` (e.g. `http://localhost:8000`). Routes have no `/api` prefix.

| Endpoint | Returns | Status |
|----------|---------|--------|
| `POST /jobs` | multipart `t1c`, `t1`, `t2`, `flair` (`.nii`/`.nii.gz`) → `201 {"jobId"}` | in Tom's doc |
| `GET /jobs/{id}` | job status (§2.1) | in Tom's doc — **add `stage` + `error`** |
| `GET /jobs/{id}/report` | report JSON (§2.2) | in Tom's doc — **add fields** |
| `GET /jobs/{id}/model.glb` | §1 | in Tom's doc |
| `GET /jobs/{id}/seg.nii.gz` | label map (§3) | in Tom's doc — **fix label values** |
| `GET /jobs/{id}/flair.nii.gz` | the FLAIR input, unchanged | **NEW — needed** |
| `GET /health` | `{"ok": true, "model": "...", "version": "..."}` | in Tom's doc |

- [ ] **`flair.nii.gz`**: the 2D slice panel needs the actual scan as its background. The mask alone isn't enough. **This blocks the linked-slices ticket.** It's the uploaded input, so it is available as soon as the job exists, in any status (`queued`, `running`, `done` or `failed`).
- [ ] **Sample job:** seed `jobs/sample/` in the image or volume so that `GET /jobs/sample/*` works immediately, with no upload and no inference. This is the offline demo fallback.

### 2.1 Status (`GET /jobs/{id}`)

```json
{
  "jobId": "abc123",
  "status": "queued | running | done | failed",
  "stage": "validating | inferring | meshing | null",
  "error": { "code": "BAD_SEQUENCE_COUNT", "message": "Expected 4 files: t1c, t1, t2, flair" },
  "createdAt": "2026-10-24T03:12:00Z"
}
```

- [ ] `stage` is set while `running`, so the Processing page shows real progress.
- [ ] `error` is non-null only when `failed`. Error codes:

| Code | When |
|------|------|
| `BAD_SEQUENCE_COUNT` | Missing or extra file |
| `INVALID_FORMAT` | Not NIfTI |
| `SEQUENCE_MISMATCH` | The 4 sequences don't share shape / affine (tolerance 1e-3) |
| `BAD_SPACING` | Not ≈ 1 mm isotropic (if not resampled) |
| `NOT_3D` | A sequence has fewer than 3 spatial dims, or any dim < 32 (e.g. a JPG converted to NIfTI) |
| `LOW_DYNAMIC_RANGE` | Integer data with ≤ 256 distinct values in the 0–255 range: likely a converted screenshot, not scanner intensities |
| `TOO_LARGE` | File > 200 MB |
| `INFERENCE_ERROR` | Exception during inference |
| `MESH_ERROR` | Exception during meshing |

- [ ] Input validation errors return **422 from `POST /jobs`** before a job is queued, with the same `{code, message}` body. `TOO_LARGE` is one of these: it returns 422 too, not 413.

### Input guard: no JPG/PNG, ever

- JPG/PNG/screenshots lack raw intensities, sequence identity, spacing and depth. No preprocessing can recover these, so they never reach the model.
- [ ] `POST /jobs` rejects any file not ending in `.nii`/`.nii.gz`, or not parseable by nibabel, with `INVALID_FORMAT`. Message: *"Images and screenshots don't contain 3D scan data. Upload 4 NIfTI sequences (T1c, T1, T2, FLAIR) or use a sample case."*
- [ ] `NOT_3D` and `LOW_DYNAMIC_RANGE` catch images that were converted to NIfTI.
- The frontend also blocks non-NIfTI files before upload (same message). The backend check is still required: it is the trust boundary.

### 2.2 Report (`GET /jobs/{id}/report`)

```json
{
  "jobId": "abc123",
  "coordinateFrame": "RAS_mm",
  "model": { "name": "brats_mri_segmentation", "arch": "SegResNet", "version": "x.y.z" },
  "segmentationSource": "model | expert",
  "tumorDetected": true,
  "side": "left | right | bilateral | null",
  "lesionCount": 1,
  "centroidMm": [x, y, z],
  "bboxMm": { "min": [x, y, z], "max": [x, y, z] },
  "volumesCm3": { "whole": 0.0, "core": 0.0, "enhancing": 0.0 },
  "brain": { "centroidMm": [x, y, z], "bboxMm": { "min": [x, y, z], "max": [x, y, z] } },
  "input": { "shape": [240, 240, 155], "spacingMm": [1, 1, 1], "sequences": ["t1c", "t1", "t2", "flair"] }
}
```

- [ ] `centroidMm` / `bboxMm` are the **whole tumor**, in the same RAS mm frame as the GLB. `null` when there's no tumor.
- [ ] `side` is computed against the **brain midline** (same x as the §1.1 split). `bilateral` = **at least 20% of WT voxels on each side** of the midline; otherwise the side holding the majority. `+x` = patient **Right**.
- [ ] `lesionCount` = connected components of WT with **≥ 100 voxels** (0.1 cm³ at 1 mm isotropic), so stray specks don't count.
- [ ] `segmentationSource` is `"model"` for SegResNet output and `"expert"` for the expert-mask fallback. The UI badge reads only this field.
- [ ] `brain` block is included. The frontend uses it for centering, camera framing and clamping the cut plane.

## 3. `seg.nii.gz` label values

NiiVue needs one integer label map, not three overlapping channels.

| Value | Region | Colour (shared by the 2D overlay, 3D mesh and legend) |
|-------|--------|---------|
| 0 | background | — |
| 1 | edema only (WT ∖ TC) | `#F2C94C` yellow |
| 2 | non-enhancing core (TC ∖ ET) | `#F2994A` orange |
| 3 | enhancing (ET) | `#EB5757` red |

- [ ] `seg.nii.gz` uses these values and the input affine.

## 4. Model correctness — please verify

- [ ] **Channel order.** Confirm the order the bundle actually expects (check its `inference.json` / `metadata.json`) and assert it in `predict.py`. Our demo data (Medical Segmentation Decathlon Task01) packs all 4 sequences in one 4D file, believed to be in the order FLAIR, T1, T1c, T2 (unverified — check the dataset's `dataset.json`). Feeding the wrong order still produces a confident-looking mask, so this fails silently.
- [ ] **Output channels.** Confirm the bundle's output channel order (TC / WT / ET) and the sigmoid threshold used.
- [ ] **Training overlap.** Decathlon Task01 cases likely come from BraTS 2016/17, which BraTS 2018 training includes. Pick a demo case confirmed **not** in training, or state in the pitch that the sample may be a training case.
- [ ] **Dice numbers.** Quote WT/TC/ET Dice from the bundle's own metadata, attributed to its authors ("reported on BraTS 2018 validation"). Never present them as our result.
- [ ] **Sample-case check.** Compute Dice of the model mask vs the dataset's expert mask on the demo case and add it to `jobs/sample/report.json` as `"expertDice": {"whole":…, "core":…, "enhancing":…}` (optional field). The UI shows it on the sample.
- [ ] **Inference time.** Measure on the demo laptop (CPU) and post the number in the backend ticket.
- [ ] **IXI healthy scans won't work as planned.** As far as we know IXI has no T1c and isn't skull-stripped. Drop it or rethink it after the hackathon.

## 5. Wording rules (the UI follows these, and the API text should too)

- "No tumor detected", never "healthy".
- "Shown where the model segmented it, in the scan's own coordinates." Avoid claiming it "matches real anatomy": the shared affine guarantees brain ↔ tumor alignment, not that the segmentation is correct.
- "Educational visualization; not clinically validated."

## 6. Docker

- [ ] Build for the demo laptop's **native architecture** (arm64 on Apple Silicon). An amd64 image under emulation makes CPU inference much slower.
- [ ] Bake the weights into the image. **Build and pull before the venue**; don't download over hackathon Wi-Fi.
- [ ] Mount `jobs/`; seed `jobs/sample/` (§2).
- [ ] On startup, delete jobs older than the current session, except `sample`.
- [ ] CORS allows `http://localhost:5173` plus the frontend's deployed origin, if any.
- [ ] Run one inference at a time (queue the rest), so CPU and RAM don't spike during the demo.
- [ ] Add the `Dockerfile` + `docker-compose.yml` to the repo, and put the one-line run command in the README.
