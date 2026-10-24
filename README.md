# NeuroVision

Upload a brain MRI, check the segmented tumor in linked 2D slices, then explore it inside a 3D brain. You can make the brain see-through, split the hemispheres apart, or cut it open. Everything is driven by mouse, keyboard, hand gestures, or voice ("Jarvis").

> **Educational visualization only.** NeuroVision does not diagnose, plan surgery, or give medical advice. Tumor location is labelled **Measured** only when it comes from a volumetric segmentation mask. Single 2D images get an **Illustrative** placement with no measurements.

Built at **CalHacks 13.0** (36 hours).

## Docs

| Doc | What it's for |
|-----|---------------|
| [`docs/SPEC.md`](docs/SPEC.md) | **Source of truth:** scope, locked decisions, contracts, timeline |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Lanes, labels, branch/PR flow, how new ideas become issues |
| [Issues](https://github.com/DuongAnh1201/CalHacks13.0/issues) · [Milestones](https://github.com/DuongAnh1201/CalHacks13.0/milestones) | All work, grouped by checkpoint A–H |

## How it works

```
NIfTI scan + mask ──► FastAPI: validate → marching cubes → measurements (RAS mm)
                                   │
                    brain_left/right.glb · tumor.glb · case.json
                                   ▼
React app: Upload → Processing → Results (3 NiiVue slices) → Explore (R3F 3D)
                                                               ▲
                          pointer · keyboard · MediaPipe gestures · Jarvis voice
                                    └──── one typed Action dispatcher ────┘
```

The brain surface is built from the **same scan** as the tumor, so both share one coordinate frame and no template registration is needed. See SPEC §5.

**Four modes:**
1. **Whole Brain:** tumor hidden until revealed.
2. **X-Ray:** adjustable opacity.
3. **Exploded:** hemispheres pull apart.
4. **Cutaway:** clip plane linked to the 2D slice.

## Quickstart

> These commands go live once scaffold issue **A3** is merged.

```bash
# backend
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# frontend (second terminal)
cd frontend && npm install && npm run dev      # http://localhost:5173
```

Click **Use sample case** on the upload page. The sample is precomputed, so it works without the pipeline or venue Wi-Fi.

## Repo layout

```
frontend/src/{routes,viewer,actions,api}/   React + R3F + NiiVue + MediaPipe
backend/app/                                FastAPI + nibabel + scikit-image + trimesh
backend/scripts/precompute_sample.py        builds data/sample/ artifacts
data/sample/                                bundled demo case (see its LICENSE)
docs/SPEC.md                                the spec
```

## Data & credits

- Demo case: [Medical Segmentation Decathlon](http://medicaldecathlon.com/), Task01_BrainTumour. License confirmed in issue A1 and recorded in `data/sample/LICENSE`.
- Libraries: Three.js / React Three Fiber, NiiVue, MediaPipe, FastAPI, nibabel, scikit-image, trimesh.

## License

Code: [Apache-2.0](LICENSE). Dataset files keep their original license.
