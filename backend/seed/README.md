# Seeded demo jobs

Finished jobs baked into the image. On startup the API copies each `seed/<name>/` to `jobs/<name>/`, so `GET /jobs/sample/*` works with no upload, no inference and no Wi-Fi (contract §2, SPEC D4).

| Job | Case (Decathlon Task01) | Source | Size |
|-----|-------------------------|--------|------|
| `sample` | `BRATS_001` | model (`expertDice` in report) | ~7 MB |
| `sample-2` | `BRATS_002` | model (`expertDice` in report) | ~7 MB |

Each folder holds `model.glb`, `report.json`, `seg.nii.gz`, `flair.nii.gz` and `status.json` (`done`).

## Regenerate (from `backend/`)

```bash
uv run python scripts/split_decathlon.py <Task01>/imagesTr/BRATS_002.nii.gz <case_dir>
cp <Task01>/labelsTr/BRATS_002.nii.gz <case_dir>/expert_label.nii.gz
uv run python scripts/make_sample.py <case_dir> sample-2            # model (~7 min on CPU)
uv run python scripts/make_sample.py <case_dir> sample-2 --expert   # expert-mask fallback
```

## Study library (`lib-NN`, GET /library)

```bash
uv run python scripts/build_library.py <Task01_BrainTumour> --count 25
```

Picks a varied set of cases (hemisphere × tumor size), meshes their expert masks (seconds per case, no model run) and writes `seed/lib-NN/` with a `meta.json` title and blurb. Every seed folder with a `report.json` is listed by `GET /library`; `meta.json` is optional (the job id is the fallback title).

Use `--expert` if inference is broken: the job has the same five-node `model.glb`, and the badge reads "Expert segmentation" from `segmentationSource`.

Dataset: Medical Segmentation Decathlon, CC-BY-SA 4.0 (see `data/sample/LICENSE`, issue #1). These cases may be in the model's training set (BraTS 2018), so the Dice here is a sanity check, not a result.
