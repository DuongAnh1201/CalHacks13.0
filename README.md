# NeuroVision

Upload a brain MRI (4 standard sequences); a pretrained AI model (MONAI SegResNet) segments the tumor. Explore it inside a 3D brain using on-screen controls. The vision includes linked 2D slices, a see-through brain, separated hemispheres, a cutaway view, and mouse, keyboard, hand gesture or voice ("Jarvis") controls. The Status table below separates shipped features from planned work.

> **Educational visualization only — not clinically validated.** NeuroVision does not diagnose, plan surgery, or give medical advice. The tumor is shown where the model segmented it, in the scan's own coordinates. JPG/PNG images are not accepted: they don't contain 3D scan data.

Built at **CalHacks 13.0** (36 hours).

## Docs

| Doc | What it's for |
|-----|---------------|
| [`docs/SPEC.md`](docs/SPEC.md) | **Source of truth:** scope, locked decisions, contracts, timeline |
| [`docs/BACKEND_CONTRACT.md`](docs/BACKEND_CONTRACT.md) | Backend API, `model.glb` node names, report JSON, Docker |
| [`docs/qa/`](docs/qa/) | Browser verification reports |
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
React app: Upload → Processing → Results → Explore (R3F 3D)
           /learn (atlas)                       ▲
                          pointer → one typed Action dispatcher
```

Brain and tumor meshes come from the **same scan and affine**, so they share one coordinate frame and no template registration is needed. See SPEC §5.

**Planned case exploration modes** (only Whole Brain ships today):

1. **Whole Brain:** tumor hidden until revealed.
2. **X-Ray:** adjustable opacity.
3. **Exploded:** hemispheres pull apart.
4. **Cutaway:** clip plane linked to the 2D slice.

## Status

| Feature | State |
|---------|-------|
| Upload | Shipped: 4 NIfTI slots, sample cases, non-NIfTI files refused. |
| Processing | Shipped: 1 s polling and backend stages. |
| Results | Shipped: volumes, side, lesion count, expert Dice on samples, and limitations. |
| Explore `/jobs/:id/explore` | Shipped: Whole Brain, Show tumor, Reset view. |
| Learning Mode `/learn` | Shipped: CerebrA atlas, X-Ray, explode, isolate, structure tree. |
| 2D NiiVue slices | Not yet: [#11](https://github.com/DuongAnh1201/CalHacks13.0/issues/11). |
| X-Ray / Exploded / Cutaway on a case | Not yet: [#12](https://github.com/DuongAnh1201/CalHacks13.0/issues/12), [#15](https://github.com/DuongAnh1201/CalHacks13.0/issues/15), [#16](https://github.com/DuongAnh1201/CalHacks13.0/issues/16). |
| Keyboard map | Not yet: [#17](https://github.com/DuongAnh1201/CalHacks13.0/issues/17). |
| Gestures | Not yet: [#18](https://github.com/DuongAnh1201/CalHacks13.0/issues/18). |
| Jarvis voice | Not yet: [#19](https://github.com/DuongAnh1201/CalHacks13.0/issues/19). |

## Quickstart

Run the backend from the repository root: `docker compose up --build`.

```bash
# backend (Docker, CPU PyTorch; build before the venue)
docker compose up --build            # http://localhost:8000/health

# frontend (second terminal)
cd frontend && npm install
npm run dev                         # http://localhost:5173
```

`VITE_API_URL` is optional; it defaults to `http://localhost:8000`. Open `http://localhost:5173`; backend CORS allows that origin, so use `localhost` rather than `127.0.0.1`.

Click a **sample case** on the upload page. Sample jobs are pre-seeded and need no inference. A real 4-sequence upload took about 90 s on CPU in [browser verification](docs/qa/2026-10-24-milestone-b/README.md); timing depends on the scan and hardware.

## Repo layout

```
frontend/src/{routes,viewer,actions,api,components,learn,content}/   React + R3F
backend/                                    FastAPI + MONAI SegResNet + mesh export (Docker)
jobs/sample*/                               pre-seeded demo jobs
data/sample/LICENSE                         demo dataset license + attribution
docs/SPEC.md · docs/BACKEND_CONTRACT.md     the spec + backend contract
```

## Data & credits

- Model: [MONAI Model Zoo `brats_mri_segmentation`](https://github.com/Project-MONAI/model-zoo) (SegResNet, Apache-2.0, trained on BraTS 2018).
- Demo case: [Medical Segmentation Decathlon](http://medicaldecathlon.com/), Task01_BrainTumour. License confirmed in issue A1 and recorded in `data/sample/LICENSE`.
- Libraries: MONAI, PyTorch, Three.js / React Three Fiber, FastAPI, nibabel, scikit-image, trimesh.

## License

Code: [Apache-2.0](LICENSE). Dataset files keep their original license.
