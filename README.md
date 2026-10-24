# NeuroVision

Upload a brain MRI (4 standard sequences); a pretrained AI model (MONAI SegResNet) segments the tumor. Check it in linked 2D slices, then explore it inside a 3D brain. You can make the brain see-through, split the hemispheres apart, or cut it open. Everything is driven by mouse, keyboard, hand gestures, or voice ("Jarvis").

> **Educational visualization only — not clinically validated.** NeuroVision does not diagnose, plan surgery, or give medical advice. The tumor is shown where the model segmented it, in the scan's own coordinates. JPG/PNG images are not accepted: they don't contain 3D scan data.

Built at **CalHacks 13.0** (36 hours).

## Docs

| Doc | What it's for |
|-----|---------------|
| [`docs/SPEC.md`](docs/SPEC.md) | **Source of truth:** scope, locked decisions, contracts, timeline |
| [`docs/BACKEND_CONTRACT.md`](docs/BACKEND_CONTRACT.md) | Backend API, `model.glb` node names, report JSON, Docker |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Lanes, labels, branch/PR flow, how new ideas become issues |
| [Issues](https://github.com/DuongAnh1201/CalHacks13.0/issues) · [Milestones](https://github.com/DuongAnh1201/CalHacks13.0/milestones) | All work, grouped by checkpoint A–H |

## How it works

```
4 NIfTI sequences (T1c, T1, T2, FLAIR)
        │
        ▼
Docker · FastAPI: validate → SegResNet → masks → meshes (RAS mm)
        │
        ├─ model.glb   brain_left · brain_right · edema · core · enhancing
        ├─ report.json volumes, centroid, side, lesion count
        └─ seg.nii.gz + flair.nii.gz
        ▼
React app: Upload → Processing → Results (3 NiiVue slices) → Explore (R3F 3D)
                                                               ▲
                          pointer · keyboard · MediaPipe gestures · Jarvis voice
                                    └──── one typed Action dispatcher ────┘
```

Brain and tumor meshes come from the **same scan and affine**, so they share one coordinate frame and no template registration is needed. See SPEC §5.

**Four modes:**
1. **Whole Brain:** tumor hidden until revealed.
2. **X-Ray:** adjustable opacity.
3. **Exploded:** hemispheres pull apart.
4. **Cutaway:** clip plane linked to the 2D slice.

## Quickstart

> These commands go live once issues **A3** (frontend) and **B1** (backend Docker) are merged.

```bash
# backend (Docker, CPU PyTorch; build before the venue)
docker compose up --build            # http://localhost:8000/health

# frontend (second terminal)
cd frontend && npm install
VITE_API_URL=http://localhost:8000 npm run dev   # http://localhost:5173
```

Click a **sample case** on the upload page. Sample jobs are pre-seeded, so they work without inference or venue Wi-Fi.

## Repo layout

```
frontend/src/{routes,viewer,actions,api}/   React + R3F + NiiVue + MediaPipe
backend/                                    FastAPI + MONAI SegResNet + mesh export (Docker)
jobs/sample*/                               pre-seeded demo jobs
data/sample/LICENSE                         demo dataset license + attribution
docs/SPEC.md · docs/BACKEND_CONTRACT.md     the spec + backend contract
```

## Data & credits

- Model: [MONAI Model Zoo `brats_mri_segmentation`](https://github.com/Project-MONAI/model-zoo) (SegResNet, Apache-2.0, trained on BraTS 2018).
- Demo case: [Medical Segmentation Decathlon](http://medicaldecathlon.com/), Task01_BrainTumour. License confirmed in issue A1 and recorded in `data/sample/LICENSE`.
- Libraries: MONAI, PyTorch, Three.js / React Three Fiber, NiiVue, MediaPipe, FastAPI, nibabel, scikit-image, trimesh.

## License

Code: [Apache-2.0](LICENSE). Dataset files keep their original license.
