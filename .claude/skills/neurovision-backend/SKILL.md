---
name: neurovision-backend
description: NeuroVision FastAPI imaging service (backend/) — job endpoints, upload validation and error codes, job status on disk, CORS, seeds, Docker/compose, RunPod deploy, and backend tests. Use when editing backend/src/api.py, the HTTP contract, Dockerfile, docker-compose.yml, CI backend jobs, or anything the frontend fetches from VITE_API_URL. For the ML/mesh pipeline load neurovision-model.
---

# NeuroVision backend (FastAPI)

The contract is `docs/BACKEND_CONTRACT.md` (v1.2). The frontend mirror is `frontend/src/api/types.ts`. Change all three together.

## Run

```sh
docker compose up --build          # repo root; port 8000; compose watch syncs backend/src
cd backend && uv sync && uv run uvicorn src.api:app --reload   # without Docker
cd backend && uv run pytest -q      # tests: test_api, test_pipeline, test_certainty
```

- Python ≥3.12, managed with uv. Torch comes from the **CPU** index (`pytorch-cpu`). Weights are at `backend/weights/model.pt`.
- Compose pins `linux/arm64` (Apple Silicon). CI builds `linux/amd64` for RunPod.
- Env:
  - `ALLOWED_ORIGINS` (comma list, default `http://localhost:5173`)
  - `KEEP_JOBS=1` (otherwise non-sample jobs are wiped on start)
  - `PORT` (default 8000)

## Endpoints (`src/api.py`, no `/api` prefix)

| Method | Path | Returns |
|---|---|---|
| POST | `/jobs` | multipart with exactly `t1c`, `t1`, `t2`, `flair` → 201 `{jobId}` |
| GET | `/jobs/{id}` | `{jobId,status,stage,error,createdAt}`, status `queued|running|done|failed`, stage `validating|inferring|meshing|null` |
| GET | `/jobs/{id}/report` | report.json (409 if not done, 404 unknown) |
| GET | `/jobs/{id}/model.glb` | `model/gltf-binary` |
| GET | `/jobs/{id}/seg.nii.gz` | uint8 label map |
| GET | `/jobs/{id}/flair.nii.gz` | FLAIR for NiiVue (no done-check) |
| GET | `/health` | `{ok, model, version}` from `brats_mri_segmentation/configs/metadata.json` |
| GET | `/ping` | RunPod LB health |

- Job ids must match `[A-Za-z0-9_-]{1,64}` (`_check_id`). Keep this on every path param, since it is the path-traversal guard.
- CORS allows only `GET, POST`.

## Validation → 422 `{code, message}`

The checks run in this order:

| Code | Check |
|---|---|
| `BAD_SEQUENCE_COUNT` | the multipart has exactly 4 file fields named t1c/t1/t2/flair |
| `TOO_LARGE` | a file is over 200 MB (streamed in 1 MB chunks) |
| `INVALID_FORMAT` | a filename isn't `.nii`/`.nii.gz`, or nibabel can't load it (D1: JPG/PNG/screenshots) |
| `NOT_3D` | a file has fewer than 3 dims, or any dim < 32 |
| `SEQUENCE_MISMATCH` | shape and affine aren't equal across all 4 (atol 1e-3) |
| `BAD_SPACING` | spacing isn't 1 ± 0.1 mm isotropic |
| `LOW_DYNAMIC_RANGE` | integer data in 0–255 with ≤256 unique values (a converted screenshot) |

- Runtime failures set status `failed` with `error.code`:
  - `INFERENCE_ERROR` if the stage was `inferring`
  - `MESH_ERROR` otherwise
- `.nii` inputs are re-saved as `.nii.gz`. The pipeline expects `jobs/<id>/<seq>.nii.gz`.

## Job model

- Status is written atomically: `jobs/<id>/status.json` via a `.tmp` file and `replace`. Use `set_status(job_id, **fields)`.
- One `ThreadPoolExecutor(max_workers=1)` means one inference at a time, created in `lifespan`. uvicorn runs `--workers 1`, so don't add workers (they would contend for the CPU and the model singleton).
- Seeds: `backend/seed/sample`, `backend/seed/sample-2` are copied to `jobs/` on startup and never wiped. Convex `seed.seedSampleScan` and the MCP fallback depend on these ids.

## Privacy (D9)

Imagery never leaves the backend. Convex stores asset **paths** like `/jobs/sample/model.glb`, and the browser prefixes `VITE_API_URL`. Don't push pixels or NIfTI to Convex or to Claude.

## Deploy (`.github/workflows/ci.yml`)

- Every push/PR runs `uv sync --frozen && uv run pytest -q`. Update `uv.lock` when deps change.
- On main, when `backend/**` changed, CI:
  1. builds the GHCR image `ghcr.io/<repo>-api:<sha>`
  2. runs `deploy-runpod`, which PATCHes the pod image. This wipes the pod's jobs.
  3. smoke tests `/ping` and `backend/scripts/runpod_check.sh`
- The pod needs `ALLOWED_ORIGINS=<SITE_URL>`, or the browser hits CORS errors.

## Rules

- Contract changes (fields, codes, endpoints) need a BACKEND_CONTRACT bump plus a SPEC §14 line, and the same PR must update `frontend/src/api/types.ts` and Convex report schemas (`reportSchema` in `convex/mcp/data.ts`, `convex/lib/exportReport.ts`).
- Keep 422 bodies `{code,message}`. The frontend `ApiError` relies on it.
- Add a `tests/test_api.py` case for every new code path. Tests use FastAPI `TestClient` (httpx).
