---
name: neurovision-model
description: NeuroVision ML model and pipeline — MONAI brats_mri_segmentation SegResNet inference, channel orders, normalization, thresholds, mask cleaning, marching-cubes meshing into model.glb, seg.nii.gz label map, and every number in report.json (side, lesionCount, volumes, certainty). Use when touching backend/src/predict.py, pipeline.py, mask_to_mesh.py, weights, seeds, backend/scripts, or report math.
---

# NeuroVision model + pipeline

Flow: `api._work` → `pipeline.run(job_dir)` → `predict.predict(paths)` → `build_outputs(...)` → `seg.nii.gz`, `model.glb`, `report.json`.

The stages reported to `/jobs/{id}` are `inferring` and then `meshing`.

## Model (`src/predict.py`)

- MONAI bundle `brats_mri_segmentation`:
  - `SegResNet(blocks_down=[1,2,2,4], blocks_up=[1,1,1], init_filters=16, in_channels=4, out_channels=3, dropout_prob=0.2)`
  - Weights `weights/model.pt`, CPU, loaded once into a module singleton (`get_net`).
- **Input channel order** (`configs/metadata.json` `channel_def`): `0 T1c, 1 T1, 2 T2, 3 FLAIR` = `SEQUENCE_ORDER`.
  - `predict` asserts that the filenames come in this order. Never reorder.
- **Output channel order**: `0 TC, 1 WT, 2 ET`. This is not WT-first. The pipeline maps tc=m[0], wt=m[1], et=m[2].
- Preprocessing: per-channel z-score over **nonzero** voxels (NormalizeIntensityd nonzero, channel_wise).
- Inference: `sliding_window_inference(roi=(240,240,160), sw_batch_size=1, overlap=0.5)` → sigmoid → `> 0.5`.
- Brain mask = `FLAIR != 0`. This assumes **skull-stripped**, BraTS-style input (1 mm iso, co-registered).

## Pipeline (`src/pipeline.py`)

- `build_outputs` is shared by model and expert-mask (D4) runs. `source` is `"model"` or the expert source.
  - `clean_brain`: fill holes, then keep the largest component. An empty brain raises.
  - `wt = remove_small_blobs(wt)` with `MIN_VOXELS = 100`.
  - Enforce nesting: `tc &= wt`, `et &= tc`.
- `save_label_map`: uint8 with 1 = WT (edema), 2 = TC (core), 3 = ET (enhancing), and the same affine.
- `build_glb`:
  - Splits the brain at the brain-centroid x (RAS), using the full affine x row, so oblique and mirrored inputs work.
  - Node names: `brain_left`, `brain_right`, `edema`, `core`, `enhancing` (D11). Identity transforms.
  - Budgets: hemispheres `step_size=2`, ≤150k faces; tumor layers ≤50k faces. GLB over 15 MB raises.
- `build_report` (contract fields):
  - `side`: fraction of WT voxels with x < brain midline. A value in 0.2–0.8 → `bilateral`, otherwise `left`/`right`. Null if there is no tumor.
  - `lesionCount`: WT connected components with ≥100 voxels.
  - `volumesCm3`: `{whole, core, enhancing}` = voxels × |det(affine[:3,:3])| / 1000, rounded to 2 dp.
  - `centroidMm`/`bboxMm` for WT, and `brain.{centroidMm,bboxMm}`, in RAS mm, rounded to 1 dp.
  - `model` comes from metadata.json `{name, arch, version}`. `input` = `{shape, spacingMm, sequences}`.
- `certainty` (#52, contract v1.2) is only for `source=="model"`. It is the mean sigmoid prob **inside the final cleaned mask**: whole←probs[1], core←probs[0], enhancing←probs[2]. Null when a region is empty or for expert masks.
  - It is "certainty of the outline", **uncalibrated**. Never present it as diagnostic confidence, and never derive it from `expertDice`.

## Meshing (`src/mask_to_mesh.py` `to_mesh`)

1. Pad by `step_size`, then marching cubes at 0.5.
2. Apply the affine to the vertices, and flip the face winding if det < 0.
3. If the mesh isn't watertight, retry on a Gaussian-blurred field (σ 0.5). This only affects display; masks stay exact.
4. Taubin smoothing, 10 iterations (keeps volume).
5. Quadric decimation to `max_faces`, trying aggression 7 and then 3, and keeping a watertight result.
6. It raises if the mesh is still over budget or not closed.

The output is in mm, RAS, with face colours from `COLORS`.

Debug a mesh: `uv run python -m src.mask_to_mesh jobs/<id>/seg.nii.gz` (prints triangle count, watertightness, mesh vs voxel volume).

## Scripts and data

- `scripts/make_sample.py`: builds `seed/<id>` from a dataset case.
- `scripts/split_decathlon.py`: Decathlon 4D → 4 files.
- `scripts/runpod_check.sh`: deploy smoke test.
- `atlas/build_atlas.py` builds the `/learn` CerebrA atlas GLB. It is separate from the patient pipeline.

## Rules

- Never fake inference or invent measurements. If data is missing, the report field is null and the UI says so.
- `tumorDetected=false` → the UI and agents say "No tumor detected in this scan", **never** "healthy".
- Any change to the report math, thresholds or channel mapping needs:
  - a test in `tests/test_pipeline.py` / `test_certainty.py`
  - a contract version bump
  - regenerated `seed/*/report.json` (MCP and Convex read the bundled seed reports)
- Keep CPU-only. RunPod and local Docker both run without a GPU.
