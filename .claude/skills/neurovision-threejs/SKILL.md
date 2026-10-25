---
name: neurovision-threejs
description: NeuroVision 3D viewer internals — React Three Fiber/drei/three.js scene, model.glb loading, RAS→scene transform, hemisphere/tumor layers, x-ray/explode/cutaway, CameraControls framing, the /learn atlas canvas, and NiiVue MPR slices. Use when touching frontend/src/viewer/*, CaseCanvas, AtlasCanvas, MprPanel, transforms, materials, camera, or GLB node names.
---

# NeuroVision three.js / R3F viewer

All files are in `frontend/src/viewer/`. There is **one R3F scene per page** (D5) and NiiVue for 2D slices.

## Coordinate frame (most bugs live here)

- The backend emits meshes in **RAS millimetres** with identity node transforms.
- `transform.ts`:
  - `rasToScene(p)`, `sceneToRas(p)`
  - `worldMatrix(c) = makeRotationX(−π/2) · translation(−c)`, i.e. `p_scene = R_yup · T_center · p_ras` with `(x,y,z) → (x, z, −y)`
  - `c` = `report.brain.centroidMm`
- Scene axes: +x = patient Right, +y = Superior, −z = Anterior (front = −z, left = −x, top = +y).
- The cursor is stored in RAS mm; slice indices are derived from it (`slices.ts` `sliceOf`). Never store scene-space positions in shared state.
- Convex `scans.affineRowMajor` is **row-major**; `THREE.Matrix4.set()` takes row-major, but `.elements` and `fromArray` are column-major. Don't mix them.

## Case scene (`/jobs/:id/3d`)

- `loadCase.ts` `buildCaseScene(gltfScene, report)`:
  - Clones the GLTF and finds meshes **by name**.
  - Throws `MissingNodeError` if `brain_left` or `brain_right` is missing. Tumor nodes may be absent when no tumor is found.
  - Groups:
    - `world` (matrix = `worldMatrix(brain centroid)`)
    - `hemiLeft`, `hemiRight`
    - `tumorCenter`
    - `cursorMarker` (empty, a shortcut placeholder)
  - Tumor layers are parented to the hemisphere of `report.side`, so they move with explode.
  - Replaces materials with `MeshStandardMaterial` using `layers.ts` colours.
- `layers.ts`: `LAYERS` (edema #F2C94C α0.35 seg1 renderOrder 3; core #F2994A α0.70 seg2 ro2; enhancing #EB5757 α1.0 seg3 ro1) and `BRAIN_LAYER` #D9D4CF ro4.
  - Transparent materials need `depthWrite=false`. Keep renderOrder inner → outer.
- `applyView.ts` `applyView(caseScene, viewerState)` is a pure mutation of the three objects from the store:
  - Tumor is visible iff `tumorRevealed && layers[l]`.
  - X-ray: brain transparent at `brainOpacity`, `depthWrite` off.
  - Hidden hemispheres are hidden.
  - Explode offsets hemispheres by `±explode · EXPLODE_MM` (40).
  - Add new visual state here, not in JSX.
- `CaseCanvas.tsx`:
  - `<Canvas>` with fov 40, near 1, far 3000; `HOME = [-260,80,-200, 0,0,0]` (eye, target).
  - drei `CameraControls`: minDistance 20, maxDistance 900, smoothTime 0.35.
  - Listens on `viewEvents` for `'reset'` → HOME and `'focus'` → frame the tumor from the tumor's own side.
  - Handles `webglcontextlost`.
- `useGLTF(modelUrl(id))` caches by URL. Retry must call `useGLTF.clear(url)` (see `routes/Brain3D.tsx` LoadBoundary).

## Atlas scene (`/learn`)

- `AtlasCanvas.tsx` loads `public/atlas/brain_atlas.glb` (~10 MB) and `public/atlas/structures.json` (CerebrA, 95 structures).
  - One material per structure. `GHOST_OPACITY` 0.15. A click with less than `DRAG_PX` (5) of movement selects; clicking empty space clears the selection.
- `anatomy.ts`: `Atlas`/`Structure` types, groups, `CORTICAL_GROUPS`, `loadAtlas()`. Ids look like `lh_hippocampus` / `rh_hippocampus`.
- The atlas is built by `backend/atlas/build_atlas.py`. It is a template brain, **not** the patient (D6: patient cases get hemispheres only, no per-structure distances).

## MPR (`MprPanel.tsx`, `slices.ts`)

- NiiVue shows 3 views (axial, sagittal, coronal). It loads `flairUrl(id)` as the base and `segUrl(id)` at opacity 0.6 with `labelColormap()` (labels 1–3 → layer colours).
- Window presets Brain/Bone/Subdural/Perfusion are fractions of the robust intensity range.
- NiiVue version is pinned `0.69.0`. Don't bump it casually; its API changes between minors.

## Camera tools coming in P1 (see neurovision-multi-agents)

- `zoom_view`: 100% = home distance (≈338 mm), step ±20%, clamp 50–400%, `controls.dollyTo`.
- `rotate_view`: presets via `setLookAt` at the current distance, or relative `controls.rotate`.
- `spin_view`: `useFrame` adds to `azimuthAngle`; any pointer drag stops it.
- Camera changes go through `viewEvents`, never through zustand or Convex.

## Rules

- Never rename GLB nodes. D11 fixes exactly 5 names, shared with `backend/src/pipeline.py`.
- Keep `applyView` and the transforms pure and unit-tested (`*.test.ts` in node env, plain THREE objects, no renderer).
- Performance budget: ≤150k triangles per hemisphere, ≤50k per tumor layer, GLB ≤15 MB. Don't add per-frame allocations in `useFrame`.
