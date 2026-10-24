# Anatomy Explorer (Learning Mode) + Frontend Foundation — Design

**Date:** 2026-10-23 · **Status:** approved in brainstorm, pending written-spec review · **Branch:** `viewer/anatomy-explorer-30`
**Tickets:** A3, A4, B4, L1 (foundation) · S4 #30 (atlas structures, as a standalone Learning Mode)

## 1. Goal

A detailed, clickable 3D brain at `/learn`. Hover shows the name. Click flies the camera to the structure and opens an info panel. Explode pulls structures apart. Solid and X-Ray views. No tumor in this slice.

The same work lays the frontend foundation every later ticket builds on: the scaffold, `transform.ts`, the store + dispatcher, and the layer table.

## 2. Scope

**In**
- `backend/atlas/build_atlas.py`: CerebrA atlas → one mesh per structure → `brain_atlas.glb` + `structures.json`, committed to `frontend/public/atlas/`
- Frontend scaffold (A3): Vite + React + TS, routes `/`, `/jobs/:id/processing`, `/jobs/:id/results`, `/jobs/:id/explore` as stubs, plus `/learn`. One stub shows `GET /health`, or "Backend offline"
- `viewer/transform.ts` (A4), `actions/` store + dispatch (B4), `viewer/layers.ts` + `Legend` (L1)
- `/learn` page: structure tree, 3D canvas, info panel, bottom toolbar
- Authored content for every structure: description, key functions, a "when damaged" note

**Out (spec #2 or later)**
- The FastAPI jobs API, SegResNet, sample jobs (A1, A5, A6, B1–B3)
- Upload / Processing / Results pages (B5), case loader (B6), NiiVue slices (C1), modes on patient cases (C2, D1, D2), alignment check (C3), badge (C4)
- The keyboard map (D3). `/learn` has no keyboard shortcuts; every action is an on-screen control
- 2D atlas slices, fibre tracts, tumor overlay on the atlas

## 3. Decisions

| # | Decision | Why |
|---|----------|-----|
| AE1 | Geometry = **CerebrA** atlas (Manera et al. 2020, Mindboggle-101 labels hand-corrected on MNI-ICBM2009c sym), **CC0**. DOI 10.12751/g-node.be5e62 | Real MRI-space coordinates, ~100 labelled regions including deep structures, public domain |
| AE2 | The atlas is in **template space, not patient space**. It is never mixed into `/jobs/:id/explore` | Without registration the atlas cannot hold a patient tumor in the right place (SPEC D3/D6) |
| AE3 | The build script is offline; output is committed as static files. No server is needed for `/learn` | Works offline at the venue; FastAPI stays in spec #2 |
| AE4 | One store and one `dispatch`, extended with anatomy actions (§6) | Gestures and Jarvis later wire into one door |
| AE5 | Explode = grouped radial (§5.3) | Every part stays readable; matches Figma screen 04 |
| AE6 | Info panel = computed facts + authored text tagged "Educational · unreviewed" | Computed fields are exact; authored text needs a human check |
| AE7 | Visual style from Figma `NeuroVision` (file `rHjTVYYISZzHWvWNeSKaVE`, node 43:2). Behaviour follows SPEC, not Figma, where they conflict | Figma shows diagnosis, JPG input, and "Hide Healthy", which the SPEC forbids |

## 4. Data pipeline

```
uv run backend/atlas/build_atlas.py           (PEP 723 inline deps: nibabel, numpy, scipy,
                                               scikit-image, trimesh, fast-simplification)
  download CerebrA zip → backend/atlas/.cache/ (gitignored)
  read label NIfTI + label table (whatever CerebrA ships; no hard-coded list)
  per label:
    binary mask → Gaussian smooth (σ≈1 vox) → marching cubes (level 0.5)
    → voxel → RAS mm via the NIfTI affine
    → Taubin smoothing → decimate to a budget proportional to surface area
  write frontend/public/atlas/brain_atlas.glb   one node per structure, identity transforms
  write frontend/public/atlas/structures.json
```

**Node / id naming:** `lh_<slug>` / `rh_<slug>` for paired structures, `<slug>` for midline ones (e.g. `brainstem`, `third_ventricle`). The side comes from the CerebrA label name.

**`structures.json`**

```json
{
  "source": { "atlas": "CerebrA", "license": "CC0-1.0", "doi": "10.12751/g-node.be5e62" },
  "brain": { "centroidMm": [x, y, z], "bboxMm": { "min": [..], "max": [..] } },
  "structures": [
    {
      "id": "lh_superior_frontal",
      "name": "Superior frontal gyrus",
      "side": "left | right | midline",
      "group": "frontal | parietal | temporal | occipital | insula_cingulate | deep | limbic | ventricles | cerebellum | brainstem | other",
      "volumeCm3": 0.0,
      "centroidMm": [x, y, z],
      "bboxMm": { "min": [..], "max": [..] },
      "neighbours": ["lh_caudal_middle_frontal", "..."]
    }
  ]
}
```

- `volumeCm3` = voxel count × voxel volume / 1000.
- `neighbours` = labels touching after one 6-connected dilation.
- `group` comes from a small mapping table in the script. A label missing from it gets `other` and a printed warning.

**Self-checks (script exits non-zero on failure):** every label gives a non-empty mesh; GLB node names == JSON ids; all volumes > 0; identity node transforms; GLB ≤ 15 MB; total triangles ≤ 600k.

## 5. UX

### 5.1 Layout (`/learn`)

- **Top nav:** NeuroVision · Explore · MRI Workspace · **Learning Mode** (active) · Help. **Footer:** "Educational visualization — not for diagnosis or surgical planning."
- **Left card: structure tree.** Search box, then the groups. Each row has a colour dot, the name, and an eye toggle. Clicking a row = clicking the mesh.
- **Center: 3D canvas.** A floating status pill on top shows mode + explode %. A bottom toolbar holds `Solid | X-Ray` with an opacity slider, the Explode slider, L / R hemisphere toggles, Isolate, and Reset.
- **Right card: info panel.** Name, side, group chip, volume (cm³), description, key functions, "when damaged" note, neighbour chips (click to jump), and an "Educational · unreviewed" tag. Empty state: "Click any structure to learn about it."

### 5.2 Pointer

| Input | Result |
|-------|--------|
| Hover mesh | Emissive highlight + name tooltip; pointer cursor |
| Click mesh / tree row / neighbour chip | `selectStructure`. Camera flies (~0.8 s ease) to frame the structure's bounding sphere and orbits around it. Others ghost to 15% opacity. Info panel fills |
| Click empty space | `selectStructure(null)`. Un-ghost; the camera stays put |
| Double-click mesh / Isolate button | `setIsolate` toggle; others hidden |
| Drag / wheel / right-drag | Orbit / zoom / pan (OrbitControls, damped) |

### 5.3 Modes

- **Solid:** every structure is opaque.
- **X-Ray:** cortical groups at `brainOpacity` (default 0.3, `depthWrite: false`). Deep, limbic, ventricle, cerebellum and brainstem groups stay opaque, so the inside shows through.
- **Explode** (one slider, `explodeAmount` 0..1), as an offset in RAS mm:
  - **Stage 1 (0 → 0.4):** hemispheres split along x up to ±40 mm. Midline structures stay.
  - **Stage 2 (0.4 → 1):** each structure moves along `normalize(centroid − brainCentroid)` × group factor × up to 40 mm. Factors: cortical lobes 1.0, limbic 0.7, deep 0.5, ventricles 0.5, cerebellum 1.0 with a −z bias, brainstem 0.
  - `explodeAmount = 0` gives exactly zero offset for every structure.
- **Hemisphere toggles:** hide every `lh_*` / `rh_*` structure.

### 5.4 Colours

One table in `viewer/anatomy.ts`: a hue per group and a lightness step per structure within the group, so neighbours stay distinct. The tree dots, the meshes and the chips all read from it. Tumor layer colours stay in `layers.ts` (L1); the two tables are separate.

## 6. State and actions

SPEC §7.2 / §7.3 are extended. This needs a SPEC PR with a Decision Log line and a heads-up to the B4 owner.

```ts
// ViewerState additions
selectedStructure: string | null;
isolate: boolean;
hiddenStructures: Record<string, boolean>;

// Action additions
| { type: 'selectStructure'; id: string | null }          // unknown id → ok:false
| { type: 'setStructureVisible'; id: string; visible: boolean }
| { type: 'setIsolate'; on: boolean }                     // on without a selection → ok:false
```

- Reused unchanged: `setMode` (`whole` = Solid, `xray`, `exploded`), `setOpacity`, `setExplosion`, `setHemisphereVisible`, `resetView`.
- `dispatch` clamps every value, validates ids against the loaded atlas, and refuses tumor actions when the case has no tumor (the atlas case has none).
- Camera fly-to is a view effect driven by `selectedStructure`. The camera is not stored, matching the SPEC.
- Nothing outside `dispatch` mutates the store.

## 7. Errors

| Situation | Behaviour |
|-----------|-----------|
| GLB or JSON fetch fails | Card "Atlas failed to load" + Retry |
| JSON id with no GLB node | Skipped, listed in one console warning, tree row disabled |
| WebGL context lost | Message + Reload button (SPEC §9) |
| Backend offline (stub route) | "Backend offline — start `docker compose up`" banner; `/learn` is unaffected |

## 8. Tests

- **Python:** the build-script self-checks in §4.
- **Vitest:**
  - `transform`: centroid (0,0,0), RAS (10,20,30) → scene (10,30,−20); ras→scene→ras round trip within 1e-6
  - `dispatch`: `setOpacity(1.7)` → 1; `setExplosion(−1)` → 0; `resetView` restores the snapshot; unknown structure id → `ok:false`; `focusTumor` on the no-tumor atlas → `ok:false`; `setIsolate(true)` without a selection → `ok:false`
  - `explodeOffset(s, 0)` is `[0,0,0]` for every structure
  - authored content has an entry for every id in `structures.json`
- **Manual / browser:** run `/learn` in Chrome and check hover, click fly-to, ghosting, isolate, X-Ray, explode 0 → 1 → 0, hemisphere toggles, Reset, and the search filter. Take screenshots.

## 9. Ticket status after this slice

| Ticket | After this slice |
|--------|------------------|
| A3 scaffold + route stubs + `/health` | Done ("Backend offline" until B1) |
| A4 `transform.ts` | Done |
| B4 store + dispatch | Done, plus anatomy actions |
| L1 `layers.ts` + Legend | Table + Legend done; the NiiVue colormap waits for C1 |
| S4 atlas structures | Done as standalone Learning Mode (template space) |
| A2 renderer proof | Partly shown (opacity, offsets, orbit reset); the clip plane is not exercised |
| A1, A5, A6, B1–B3, B5, B6, C1–C4, D1–D3 | Spec #2 |

## 10. Risks

| Risk | Response |
|------|----------|
| CerebrA has no white-matter / brain-outline label, so the cortex looks hollow in X-Ray | Accept for the MVP. Optional: add the template brain mask as a ghost "outline" node |
| ~100 meshes are too heavy for 60 fps | Decimate to the 600k-tri budget; one draw call per structure is fine on an M1 |
| Authored text is wrong | Tagged "Educational · unreviewed"; a teammate reviews before the demo |
| The G-Node download is slow or down at the venue | Output is committed; the download is only needed to rebuild |
