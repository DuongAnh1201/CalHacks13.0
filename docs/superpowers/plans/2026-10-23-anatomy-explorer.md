# Anatomy Explorer (Learning Mode) + Frontend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Herdr execution:** this plan runs across the Herdr panes listed in §0. Each task names its owner pane. Do only your own tasks, and touch only the paths your task lists.

**Goal:** A detailed, clickable 3D brain at `/learn`, built from the CerebrA atlas (95 structures) and styled from the Figma `NeuroVision` file. It has hover names, click to fly the camera, an info panel, grouped explode, Solid/X-Ray, hemisphere toggles, isolate and reset. The same work lays the frontend foundation: the scaffold, `transform.ts`, store + `dispatch`, and `layers.ts`.

**Architecture:**
- An offline `uv` Python script turns the CerebrA label volume into one GLB node per structure plus `structures.json`. Both are committed under `frontend/public/atlas/`.
- A Vite + React + TS app loads them in an R3F scene. The scene sits inside a single `world` group carrying `R_yup · T_center`. Mesh children stay in RAS mm, so explode offsets are plain RAS vectors.
- All UI changes go through one `dispatch(action, source)` into a Zustand `ViewerState`. The camera is a view effect, not state.

**Tech Stack:**
- Python 3.11+ via `uv` (PEP 723 inline deps): nibabel, numpy, scipy, scikit-image, trimesh, fast-simplification.
- Vite + React 19 + TypeScript, `@react-three/fiber` 9, `@react-three/drei` 10, `three`, `zustand`, `react-router-dom`, `@fontsource/manrope`, `@fontsource/cousine`, `vitest`.

**Spec:** `docs/superpowers/specs/2026-10-23-anatomy-explorer-design.md` (the "design spec"). Project spec: `docs/SPEC.md`.

## Global Constraints

- Atlas = CerebrA, CC0-1.0, DOI `10.12751/g-node.be5e62`. Raw files: `https://gin.g-node.org/doi/CerebrA/raw/master/CerebrA.nii` (34 MB, 193×229×193, 1 mm, RAS, labels 0–102) and `.../CerebrA_LabelDetails.csv` (51 rows: label ids 1–51 are the right hemisphere, 52–102 the left; verified 2026-10-23).
- The atlas is in template space, never patient space. It never appears in `/jobs/:id/explore`.
- Structure ids: `lh_<slug>` / `rh_<slug>` for paired structures, `<slug>` for midline ones. Ids match `[a-z0-9_]+`.
- GLB: one node per structure, identity node transforms, vertices in RAS mm, ≤ 15 MB, ≤ 600k triangles total.
- Transform: `p_scene = R_yup · T_center · p_ras`, with `R_yup: (x, y, z)_RAS → (x, z, −y)_three`. It is defined once, in `frontend/src/viewer/transform.ts`.
- Nothing outside `dispatch` mutates the store, except `initCase` (the case loader) in the same file. The camera is not stored.
- `/learn` has **no keyboard shortcuts**. Every action is an on-screen control.
- Figma is the visual source: file `rHjTVYYISZzHWvWNeSKaVE`, frame 04 = node `43:1149`. The SPEC wins on behaviour:
  - no diagnosis or confidence cards
  - no "Hide Healthy" label
  - no JPG/DICOM cards
  - no LLM chat
- Styling: plain CSS custom properties in `src/styles/tokens.css` plus one CSS module per component. **No Tailwind.**
- Fonts: self-hosted `@fontsource` only; no Google Fonts at runtime.
- Icons: Figma-exported files only (from `docs/figma/assets/` → `frontend/src/assets/figma/`). No hand-drawn SVG paths.
- Copy rules: never "healthy" or "diagnosis". The info panel shows the tag "Educational · unreviewed". The footer reads "Educational visualization — not for diagnosis or surgical planning."
- Colours: anatomy colours live in `viewer/anatomy.ts`; tumor layer colours live in `viewer/layers.ts`. They are separate tables.
- Root `.gitignore` already ignores `lib/`, `build/`, `dist/` and `.cache`. **Never create a `lib/` folder** (it would be silently ignored). Task 2 adds `node_modules/`.
- The Vite TS template sets `verbatimModuleSyntax`, `noUnusedLocals` and `noUnusedParameters`. Use `import type` for types, and prefix intentionally unused params with `_`.

---

## 0. Herdr team and protocol

Workspace `w33`, checked 2026-10-23 with `hc who` / `hp status`:

| Pane | Label | Agent | Role | Owns tasks |
|------|-------|-------|------|-----------|
| `w33:p1` | `lead` | Claude Code (Opus 5.5) | controller | T0, T11, dispatch, merge |
| `w33:p6` | `be` | Codex (GPT-6.1-Sol, medium) | backend / data | T1, T6 |
| `w33:p5` | `fe` | Cursor Agent (Gemini 4 Argon High) | frontend UI | T2, T7, T9 |
| `w33:p7` | `ai` | Claude Code (Sonnet 5.5, high) | 3D model specialist | T3, T4, T5, T8 |
| `w33:p8` | `qa` | Claude Code (Sonnet 5.5, medium) | QA engineer | review gate on every task, T10 |

`hp status` reports `fe` as `no-agent`, but the pane shows Cursor Agent at its prompt. The lead confirms with one `hc send fe` before dispatching T2.

**Path ownership** (all panes share one checkout on branch `viewer/anatomy-explorer-30`):

| Owner | Paths |
|-------|-------|
| lead | `docs/figma/**`, `docs/SPEC.md`, `docs/superpowers/**` |
| be | `backend/atlas/**`, `frontend/public/atlas/**`, `frontend/src/content/**`, `frontend/src/viewer/atlasData.test.ts` |
| fe | `.gitignore`, `frontend/*` (root config files, `package.json`, `package-lock.json`, `index.html`), `frontend/src/{main.tsx,App.tsx,vite-env.d.ts}`, `frontend/src/{styles,assets,api,routes,learn}/**`, `frontend/src/components/{TopNavBar,Footer,BackendBanner,StubPage}.*` |
| ai | `frontend/src/{viewer,actions}/**` (except `atlasData.test.ts`), `frontend/src/components/Legend.*` |
| qa | none (read-only); writes only `docs/qa/2026-10-23-learn/**` in T10 |

**Rules for every worker:**
1. Name yourself first: `hc name <your-label>`.
2. Commit only your own paths: `git add <explicit paths> && git commit -m "..."`. Never `git add -A` or `git add .`. If `.git/index.lock` exists, wait 2 s and retry; never delete it.
3. Never `git push`, `git reset --hard`, `git checkout -- <file>` or rebase. The lead pushes.
4. Only `fe` runs `npm install`. If you need a dependency, `hc send fe "<package> needed for T<n>"`.
5. When a task is done:
   - `hc send qa "review T<n> at <sha>: <one line>"`
   - `hc send lead "T<n> done at <sha>"`
6. `qa` replies to the lead with `T<n> PASS` or `T<n> FAIL: <file:line> <problem>`. The owner fixes FAILs in a new commit.
7. **GitNexus.** The repo is indexed as `CalHacks13.0`, and the MCP server `gitnexus` is configured for Claude Code, Codex and Cursor. `AGENTS.md` and `CLAUDE.md` in the repo root hold the rules; they are local-only, ignored by the global gitignore.
   - Before editing an existing symbol (a function, component or store field another task produced), run `impact({target, direction: "upstream", repo: "CalHacks13.0"})`.
   - Before each commit, run `detect_changes({repo: "CalHacks13.0"})`.
   - New files have no callers yet, so an empty impact result is normal there.
   - **Only the lead re-indexes** (`gitnexus analyze`, after each qa PASS). The checkout and index are shared, so concurrent `analyze` runs from several panes would race. A worker that finds the index stale sends `hc send lead "reindex"`.
   - qa uses `detect_changes({scope: "compare", base_ref: "main", repo: "CalHacks13.0"})` in every review.

**Dispatch template (lead → worker):**
```
hc send <label> "Execute Task <n> of /Users/kaydee/Developer/CalHacks13.0/docs/superpowers/plans/2026-10-23-anatomy-explorer.md exactly, step by step. Read §0 and Global Constraints first. Touch only the paths in your Files block. When done: hc send qa \"review T<n> at <sha>\" and hc send lead \"T<n> done at <sha>\". Peers: lead, be, fe, ai, qa. Name yourself first: hc name <label>."
```

**Waves and dependencies:**

```
W0  lead T0 (Figma export)
W1  be T1 (atlas build)            ‖ fe T2 (scaffold; commits base scaffold early, then pings ai)
W2  ai T3 → T4 → T5                ‖ fe T2 rest → T7 (needs T4+T5 for runtime; codes against the interfaces below)
    be T6 (needs T1 JSON)
W3  ai T8 (needs T1, T3, T4, T5)
W4  fe T9 (needs T7, T8)
W5  qa T10 (browser verification)  → lead T11 (SPEC PR)
```

## File structure

```
backend/atlas/build_atlas.py                 be  T1  CerebrA → GLB + structures.json (+ --selftest)
frontend/public/atlas/brain_atlas.glb        be  T1  generated, committed
frontend/public/atlas/structures.json        be  T1  generated, committed
docs/figma/                                  lead T0 reference code, screenshots, assets, ASSETS.md
frontend/                                    fe  T2  Vite app, vitest config
frontend/src/styles/{tokens,global}.css      fe  T2  design tokens + base styles
frontend/src/assets/figma/*                  fe  T2  icons copied from docs/figma/assets
frontend/src/api/{types,client}.ts           fe  T2  Health type + getHealth()
frontend/src/components/TopNavBar.*          fe  T2  Figma 43:1406
frontend/src/components/Footer.*             fe  T2  Figma 43:1387
frontend/src/components/BackendBanner.*      fe  T2  GET /health → "Backend offline" banner
frontend/src/components/StubPage.*           fe  T2  shared stub skeleton
frontend/src/routes/{Upload,Processing,Results,Explore,Learn}.tsx  fe T2 (Learn filled in T9)
frontend/src/viewer/transform.ts (+test)     ai  T3  A4
frontend/src/viewer/layers.ts                ai  T3  L1 table
frontend/src/components/Legend.*             ai  T3  L1 legend
frontend/src/actions/{types,store,dispatch}.ts (+dispatch.test.ts)  ai T4  B4 + anatomy actions
frontend/src/viewer/anatomy.ts (+test)       ai  T5  atlas types, loader, groups, colours, explodeOffset
frontend/src/content/{anatomy.json,index.ts} be  T6  authored text, keyed by base slug
frontend/src/viewer/atlasData.test.ts        be  T6  real-data tests (content coverage, explode=0)
frontend/src/learn/{filter.ts(+test),StructureTree,InfoPanel,LearnToolbar,ExplodeSlider,StatusPill}.*  fe T7
frontend/src/viewer/AtlasCanvas.tsx (+.module.css)  ai T8  R3F scene
frontend/src/routes/Learn.tsx (+.module.css) fe  T9  page assembly, errors
docs/qa/2026-10-23-learn/                    qa  T10 screenshots + checklist result
docs/SPEC.md                                 lead T11 §7.2/§7.3 additions + Decision Log
```

---

### Task 0: Export Figma reference into the repo (lead)

The Figma MCP asset URLs expire about 7 days after export, and only the lead pane has the Figma MCP for sure. This task freezes everything the UI tasks need inside the repo.

**Files:**
- Create: `docs/figma/04-explore.ref.tsx` (frame `43:1149` design context, asset URLs rewritten to `./assets/<file>`)
- Create: `docs/figma/{01-upload,02-processing,03-workspace,04-explore}.png`
- Create: `docs/figma/assets/*` (46 files: 45 SVG + 1 PNG)
- Create: `docs/figma/ASSETS.md`

- [ ] **Step 1: Download the assets.** The source is the scratchpad `figma/s04.tsx` saved earlier. Pull every `${assetPathPrefix}/<file>` into `docs/figma/assets/` with `curl -fsSL`. If any download fails (the URL expired), re-run `get_design_context` on `43:1149` with fileKey `rHjTVYYISZzHWvWNeSKaVE`, re-save the output, and retry.
- [ ] **Step 2: Rewrite the reference.** Copy `s04.tsx` to `docs/figma/04-explore.ref.tsx` and replace the `assetPathPrefix` value with `"./assets"`. Copy the four screenshots.
- [ ] **Step 3: Write `ASSETS.md`.** It is a table `asset file | const name | nearest data-name | node id`, generated by scanning the ref for each `img` const and its first use. Mark the icons the UI tasks need: the eye / hide icon in `43:1246` (Hide Healthy Tissue button), the reset icon in the Suggestion chip `46:127`, the brand mark in the header, the status dot.
- [ ] **Step 4: Verify and commit.** Check `ls docs/figma/assets | wc -l` → `46`. Then:
```bash
git add docs/figma && git commit -m "docs(figma): freeze frame 04 reference, screenshots and assets"
```

---

### Task 1: CerebrA atlas build script (be)

**Files:**
- Create: `backend/atlas/build_atlas.py`
- Generated + committed: `frontend/public/atlas/brain_atlas.glb`, `frontend/public/atlas/structures.json`
- Cache (gitignored by the existing `.cache` rule): `backend/atlas/.cache/`

**Interfaces:**
- Produces `structures.json`:
  - `{source:{atlas,license,doi}, brain:{centroidMm:[x,y,z], bboxMm:{min,max}}, structures:[{id,name,side,group,volumeCm3,centroidMm,bboxMm,neighbours}]}`
  - 95 structures: 44 paired × 2 + 7 midline.
  - `side ∈ left|right|midline`.
  - `group ∈ frontal|parietal|temporal|occipital|insula_cingulate|deep|limbic|ventricles|cerebellum|brainstem|other`.
- Produces `brain_atlas.glb`: node name == structure id, one mesh primitive per node, identity transforms, RAS mm vertices with vertex normals.

**Midline rule:** CerebrA splits every label into RH and LH ids, including midline structures. These 7 are merged into one midline structure each, using both ids: Brainstem, Third Ventricle, Fourth Ventricle, Optic Chiasm, Vermal lobules I-V, Vermal lobules VI-VII, Vermal lobules VIII-X. Every other name gives `lh_` + `rh_`.

- [ ] **Step 1: Write the script with its self-test**

```python
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "nibabel>=5",
#   "numpy>=1.26",
#   "scipy>=1.11",
#   "scikit-image>=0.22",
#   "trimesh>=4",
#   "fast-simplification>=0.1.7",
# ]
# ///
"""Build the CerebrA anatomy atlas for /learn: one GLB node per structure + structures.json.

Run:   uv run backend/atlas/build_atlas.py            # download (cached), build, self-check
       uv run backend/atlas/build_atlas.py --selftest # synthetic checks only, no download
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import urllib.request
from pathlib import Path

import fast_simplification
import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage
from skimage import measure

HERE = Path(__file__).resolve().parent
CACHE = HERE / ".cache"
OUT = HERE.parents[1] / "frontend" / "public" / "atlas"
BASE_URL = "https://gin.g-node.org/doi/CerebrA/raw/master/"
NII, CSV = "CerebrA.nii", "CerebrA_LabelDetails.csv"
SOURCE = {"atlas": "CerebrA", "license": "CC0-1.0", "doi": "10.12751/g-node.be5e62"}
TRI_BUDGET = 450_000  # spec cap is 600k; 450k keeps the GLB well under 15 MB
MIN_TRIS = 400
MAX_TRIS, MAX_BYTES = 600_000, 15 * 1024 * 1024

MIDLINE = {
    "Brainstem", "Third Ventricle", "Fourth Ventricle", "Optic Chiasm",
    "Vermal lobules I-V", "Vermal lobules VI-VII", "Vermal lobules VIII-X",
}
NAME_FIX = {"Inferior temporal": "Inferior Temporal"}
GROUPS = {
    "frontal": ["Caudal Middle Frontal", "Lateral Orbitofrontal", "Medial Orbitofrontal", "Paracentral",
                "Pars Opercularis", "Pars Orbitalis", "Pars Triangularis", "Precentral",
                "Rostral Middle Frontal", "Superior Frontal"],
    "parietal": ["Inferior Parietal", "Postcentral", "Precuneus", "Superior Parietal", "Supramarginal"],
    "temporal": ["Entorhinal", "Fusiform", "Inferior temporal", "Middle Temporal", "Parahippocampal",
                 "Superior Temporal", "Transverse Temporal"],
    "occipital": ["Cuneus", "Lateral Occipital", "Lingual", "Pericalcarine"],
    "insula_cingulate": ["Insula", "Caudal Anterior Cingulate", "Isthmus Cingulate", "Posterior Cingulate",
                         "Rostral Anterior Cingulate"],
    "deep": ["Thalamus", "Caudate", "Putamen", "Pallidum", "Accumbens Area", "Ventral Diencephalon",
             "Basal Forebrain"],
    "limbic": ["Hippocampus", "Amygdala"],
    "ventricles": ["Lateral Ventricle", "Inferior Lateral Ventricle", "Third Ventricle", "Fourth Ventricle"],
    "cerebellum": ["Cerebellum Gray Matter", "Cerebellum White Matter", "Vermal lobules I-V",
                   "Vermal lobules VI-VII", "Vermal lobules VIII-X"],
    "brainstem": ["Brainstem"],
    "other": ["Optic Chiasm"],
}
GROUP_OF = {name: g for g, names in GROUPS.items() for name in names}


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def r3(v) -> list[float]:
    return [round(float(x), 2) for x in v]


def fetch() -> tuple[Path, Path]:
    CACHE.mkdir(parents=True, exist_ok=True)
    for f in (NII, CSV):
        p = CACHE / f
        if not p.exists():
            print(f"downloading {f} …")
            part = p.with_name(p.name + ".part")
            urllib.request.urlretrieve(BASE_URL + f, part)
            part.rename(p)
    return CACHE / NII, CACHE / CSV


def read_labels(csv_path: Path) -> list[dict]:
    """CerebrA label table → [{id, name, side, group, labels}]. RH ids are column 3, LH ids column 4."""
    rows = list(csv.reader(csv_path.open(newline="", encoding="utf-8-sig")))[2:]  # 2 header rows
    out = []
    for r in rows:
        if len(r) < 4 or not r[2].strip():
            continue
        raw, rh, lh = r[1].strip(), int(r[2]), int(r[3])
        name = NAME_FIX.get(raw, raw)
        group = GROUP_OF.get(raw)
        if group is None:
            print(f"warning: no group for {raw!r} → other")
            group = "other"
        s = slug(raw)
        if raw in MIDLINE:
            out.append({"id": s, "name": name, "side": "midline", "group": group, "labels": [rh, lh]})
        else:
            out.append({"id": f"lh_{s}", "name": name, "side": "left", "group": group, "labels": [lh]})
            out.append({"id": f"rh_{s}", "name": name, "side": "right", "group": group, "labels": [rh]})
    return out


def mask_to_mesh(mask: np.ndarray, affine: np.ndarray) -> trimesh.Trimesh:
    """Binary mask → closed, smoothed surface in RAS mm."""
    idx = np.argwhere(mask)
    lo = np.maximum(idx.min(0) - 3, 0)
    hi = idx.max(0) + 4
    sub = np.pad(mask[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]].astype(np.float32), 2)  # pad closes edge surfaces
    field = ndimage.gaussian_filter(sub, sigma=1.0)
    level = min(0.5, 0.5 * float(field.max()))  # thin labels (optic chiasm) peak below 0.5 after blur
    verts, faces, _, _ = measure.marching_cubes(field, level=level)
    verts = verts + lo - 2
    mesh = trimesh.Trimesh(nib.affines.apply_affine(affine, verts), faces, process=True)
    trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=-0.53, iterations=10)
    trimesh.repair.fix_normals(mesh)
    return mesh


def decimate(mesh: trimesh.Trimesh, target: int) -> trimesh.Trimesh:
    if len(mesh.faces) <= target:
        return mesh
    v, f = fast_simplification.simplify(
        mesh.vertices.astype(np.float32), mesh.faces.astype(np.int32),
        target_reduction=1.0 - target / len(mesh.faces))
    out = trimesh.Trimesh(v, f, process=True)
    trimesh.repair.fix_normals(out)
    return out


def touching_labels(vol: np.ndarray, mask: np.ndarray) -> set[int]:
    """Labels within one 6-connected dilation step of the mask."""
    ring = ndimage.binary_dilation(mask, structure=ndimage.generate_binary_structure(3, 1)) & ~mask
    return set(np.unique(vol[ring]).tolist()) - {0}


def check(glb: Path, records: list[dict]) -> None:
    sc = trimesh.load(glb, force="scene")
    names, ids = set(sc.graph.nodes_geometry), {r["id"] for r in records}
    assert names == ids, f"GLB/JSON id mismatch: {sorted(names ^ ids)}"
    for n in names:
        T, _ = sc.graph[n]
        assert np.allclose(T, np.eye(4)), f"{n}: non-identity node transform"
    assert all(r["volumeCm3"] > 0 for r in records), "zero-volume structure"
    assert all(len(g.faces) > 0 for g in sc.geometry.values()), "empty mesh"
    tris, size = sum(len(g.faces) for g in sc.geometry.values()), glb.stat().st_size
    assert tris <= MAX_TRIS, f"{tris} triangles > {MAX_TRIS}"
    assert size <= MAX_BYTES, f"{size} bytes > {MAX_BYTES}"
    print(f"ok: {len(ids)} structures, {tris:,} triangles, {size / 1e6:.1f} MB")


def build() -> None:
    nii_path, csv_path = fetch()
    img = nib.load(nii_path)
    vol = np.rint(np.asarray(img.dataobj)).astype(np.int16)
    aff = img.affine
    voxel_cm3 = float(np.prod(img.header.get_zooms()[:3])) / 1000.0
    structs = read_labels(csv_path)
    label_to_id = {lab: s["id"] for s in structs for lab in s["labels"]}

    meshes, records = {}, []
    for s in structs:
        mask = np.isin(vol, s["labels"])
        n = int(mask.sum())
        assert n > 0, f"{s['id']}: label {s['labels']} is empty"
        meshes[s["id"]] = mask_to_mesh(mask, aff)
        nb = sorted({label_to_id[x] for x in touching_labels(vol, mask) if x in label_to_id} - {s["id"]})
        records.append({
            "id": s["id"], "name": s["name"], "side": s["side"], "group": s["group"],
            "volumeCm3": round(n * voxel_cm3, 3),
            "centroidMm": r3(nib.affines.apply_affine(aff, np.argwhere(mask).mean(0))),
            "bboxMm": None, "neighbours": nb,
        })
        print(f"  {s['id']:<36} {n:>7} vox  {len(meshes[s['id']].faces):>7} tris")

    total_area = sum(m.area for m in meshes.values())
    for r in records:
        m = meshes[r["id"]]
        m = meshes[r["id"]] = decimate(m, max(MIN_TRIS, int(TRI_BUDGET * m.area / total_area)))
        r["bboxMm"] = {"min": r3(m.bounds[0]), "max": r3(m.bounds[1])}

    bounds = np.array([m.bounds for m in meshes.values()])
    brain = {
        "centroidMm": r3(nib.affines.apply_affine(aff, np.argwhere(vol > 0).mean(0))),
        "bboxMm": {"min": r3(bounds[:, 0].min(0)), "max": r3(bounds[:, 1].max(0))},
    }
    scene = trimesh.Scene()
    for r in records:
        scene.add_geometry(meshes[r["id"]], node_name=r["id"], geom_name=r["id"])
    OUT.mkdir(parents=True, exist_ok=True)
    glb = OUT / "brain_atlas.glb"
    glb.write_bytes(scene.export(file_type="glb", include_normals=True))
    (OUT / "structures.json").write_text(
        json.dumps({"source": SOURCE, "brain": brain, "structures": records}, indent=1) + "\n")
    check(glb, records)


def selftest() -> None:
    assert slug("Vermal lobules I-V") == "vermal_lobules_i_v"
    assert slug("Accumbens Area") == "accumbens_area"
    names = [n for ns in GROUPS.values() for n in ns]
    assert len(names) == 51 and len(set(names)) == 51, "GROUPS must list each CerebrA name once"
    assert MIDLINE <= set(names)
    zz, yy, xx = np.mgrid[:40, :40, :40]
    ball = (xx - 20) ** 2 + (yy - 20) ** 2 + (zz - 20) ** 2 <= 10 ** 2
    mesh = mask_to_mesh(ball, np.diag([2.0, 2.0, 2.0, 1.0]))  # 2 mm voxels
    expect = ball.sum() * 8.0
    assert mesh.is_watertight, "ball mesh not closed"
    assert mesh.volume > 0, "normals point inward"
    assert abs(mesh.volume - expect) / expect < 0.10, (mesh.volume, expect)
    assert abs(mesh.centroid - 40.0).max() < 0.5, mesh.centroid  # voxel 20 × 2 mm
    small = decimate(mesh, 500)
    assert len(small.faces) <= 520 and small.volume > 0
    print("selftest ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--selftest", action="store_true")
    selftest() if ap.parse_args().selftest else build()
```

- [ ] **Step 2: Run the self-test**

Run: `uv run backend/atlas/build_atlas.py --selftest`
Expected: `selftest ok`. If the volume assert fails, print `(mesh.volume, expect)`. Loosen nothing; Taubin with `lamb=0.5, nu=-0.53` should stay within 10%.

- [ ] **Step 3: Run the full build**

Run: `time uv run backend/atlas/build_atlas.py`
Expected:
- 95 per-structure lines
- no `warning: no group` lines
- final `ok: 95 structures, <≤600,000> triangles, <≤15.0> MB`
- about 1–3 min on an M-series Mac

- [ ] **Step 4: Spot-check the output**

```bash
python3 -c "import json;d=json.load(open('frontend/public/atlas/structures.json'));s={x['id']:x for x in d['structures']};print(len(s),d['brain']);print(s['rh_superior_frontal']['centroidMm'],s['lh_superior_frontal']['centroidMm'],s['brainstem']['side'],s['lh_hippocampus']['neighbours'][:5])"
```
Expected:
- `95`
- `rh_superior_frontal` centroid x ≈ +13, `lh_` ≈ −13
- `brainstem` side `midline`
- the hippocampus neighbours include `lh_amygdala` or `lh_inferior_lateral_ventricle`

- [ ] **Step 5: Commit**

```bash
git add backend/atlas/build_atlas.py frontend/public/atlas/brain_atlas.glb frontend/public/atlas/structures.json
git commit -m "feat(atlas): CerebrA → per-structure GLB + structures.json (Closes part of #30)"
```

---

### Task 2: Frontend scaffold, tokens, shell and route stubs (fe)

**Files:**
- Create: `frontend/` via `create-vite` (react-ts), then `frontend/vite.config.ts`, `frontend/src/vite-env.d.ts`
- Create: `frontend/src/main.tsx`, `frontend/src/App.tsx`
- Create: `frontend/src/styles/tokens.css`, `frontend/src/styles/global.css`
- Create: `frontend/src/assets/figma/*` (copied from `docs/figma/assets/`, only the files you use)
- Create: `frontend/src/api/types.ts`, `frontend/src/api/client.ts`
- Create: `frontend/src/components/{TopNavBar,Footer,BackendBanner,StubPage}.tsx` + `.module.css`
- Create: `frontend/src/routes/{Upload,Processing,Results,Explore,Learn}.tsx`
- Modify: `.gitignore` (append `node_modules/`)
- Delete: the template's `src/App.css`, `src/index.css`, `src/assets/react.svg`, `public/vite.svg`

**Interfaces:**
- Produces:
  - `TopNavBar({ active }: { active: 'explore' | 'workspace' | 'learn' | null })`
  - `Footer()`
  - `BackendBanner()`
  - `StubPage({ title, figmaFrame, children })`
  - `getHealth(signal?: AbortSignal): Promise<Health>`
  - `API_URL: string`
  - the CSS tokens below
  - a router with the routes `/`, `/jobs/:id/processing`, `/jobs/:id/results`, `/jobs/:id/explore`, `/learn`
- `Learn.tsx` here is a placeholder page (header + footer + "Loading atlas…"). T9 replaces its body.

- [ ] **Step 1: Create the app and install dependencies**

```bash
cd /Users/kaydee/Developer/CalHacks13.0
npm create vite@latest frontend -- --template react-ts   # if asked "Install and start now?", answer No
cd frontend
npm install
npm install three @react-three/fiber @react-three/drei zustand react-router-dom @fontsource/manrope @fontsource/cousine
npm install -D vitest @types/three
```
Expected: React 19.x in `package.json` (R3F 9 requires it). Then:
```bash
printf '\n# Node\nnode_modules/\n' >> ../.gitignore
```

- [ ] **Step 2: Configure vitest and scripts**

`frontend/vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```
In `package.json` `"scripts"`, add `"test": "vitest run"`. In `tsconfig.app.json` `compilerOptions`, make sure `"resolveJsonModule": true` is present.

`frontend/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
interface ImportMetaEnv { readonly VITE_API_URL?: string }
interface ImportMeta { readonly env: ImportMetaEnv }
```

- [ ] **Step 3: Commit the bare scaffold and unblock ai**

```bash
npm run build && npx vitest run --passWithNoTests
cd .. && git add .gitignore frontend && git commit -m "chore(frontend): Vite + React + TS scaffold with vitest (A3)"
hc send ai "Scaffold committed at $(git rev-parse --short HEAD). frontend/ has three, R3F, drei, zustand, vitest. Start T3."
```

- [ ] **Step 4: Tokens and global styles**

`frontend/src/styles/tokens.css` (values from Figma frame 04; the file has no Figma variables):
```css
:root {
  --nv-primary: #1f5673;
  --nv-primary-soft: #e8eff7;
  --nv-primary-soft-2: #e3eef4;
  --nv-text: #151c22;
  --nv-text-2: #41484d;
  --nv-text-3: #71787e;
  --nv-border: rgba(193, 199, 206, 0.3);
  --nv-surface: rgba(255, 255, 255, 0.85);
  --nv-surface-warm: rgba(251, 249, 245, 0.86);
  --nv-blur: 8px;
  --nv-canvas-bg: radial-gradient(ellipse at center, #fbf9f5 0%, #f4efeb 75%, #ebe3db 100%);
  --nv-success: #38684f;
  --nv-success-2: #2e6b47;
  --nv-success-bg: #e2f1e6;
  --nv-accent-warm: #982713;
  --nv-muted-bg: #f3f5f7;
  --nv-radius-control: 8px;
  --nv-radius-header: 12px;
  --nv-radius-card: 16px;
  --nv-radius-pill: 9999px;
  --nv-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  --nv-shadow-card: 0 12px 32px -4px rgba(30, 37, 43, 0.06);
  --nv-font: 'Manrope', system-ui, sans-serif;
  --nv-mono: 'Cousine', ui-monospace, monospace;
  --nv-header-h: 64px;
  --nv-footer-h: 44px;
}
```
`frontend/src/styles/global.css`:
```css
@import '@fontsource/manrope/500.css';
@import '@fontsource/manrope/600.css';
@import '@fontsource/manrope/700.css';
@import '@fontsource/cousine/400.css';
@import './tokens.css';

*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; margin: 0; }
body { font: 500 14px/1.45 var(--nv-font); color: var(--nv-text-2); background: #fbf9f5; }
button { font: inherit; color: inherit; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: 0.5; }
:focus-visible { outline: 2px solid var(--nv-primary); outline-offset: 2px; }
```
Measure `--nv-header-h` and `--nv-footer-h` against `docs/figma/04-explore.ref.tsx` nodes `43:1406` / `43:1387` and correct them if they differ.

- [ ] **Step 5: API client**

`frontend/src/api/types.ts`:
```ts
// Mirrors docs/BACKEND_CONTRACT.md §2 by hand (SPEC §6: no codegen).
export interface Health { ok: boolean; model: string; version: string }
```
`frontend/src/api/client.ts`:
```ts
import type { Health } from './types';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const r = await fetch(`${API_URL}/health`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json() as Promise<Health>;
}
```

- [ ] **Step 6: Shell components from Figma**

Port each component from `docs/figma/04-explore.ref.tsx`, using the node ids below. Convert the Tailwind classes to the CSS module with the tokens above. Use icons from `src/assets/figma/` as `<img>` in a fixed-size box with both width and height set. Compare against `docs/figma/04-explore.png`.

`TopNavBar.tsx` (node `43:1406`):
```tsx
import { NavLink } from 'react-router-dom';
import css from './TopNavBar.module.css';

type Active = 'explore' | 'workspace' | 'learn' | null;

export function TopNavBar({ active }: { active: Active }) {
  const cls = (k: Active) => (k === active ? `${css.link} ${css.active}` : css.link);
  return (
    <header className={css.bar}>
      <NavLink to="/" className={css.brand}>{/* brand mark <img> from ASSETS.md */}NeuroVision</NavLink>
      <nav className={css.nav} aria-label="Main">
        <NavLink to="/jobs/sample/explore" className={cls('explore')}>Explore</NavLink>
        <NavLink to="/jobs/sample/results" className={cls('workspace')}>MRI Workspace</NavLink>
        <NavLink to="/learn" className={cls('learn')}>Learning Mode</NavLink>
        <span className={css.link} aria-disabled="true">Help</span>
      </nav>
      <div className={css.chips}>
        <button className={css.chip} disabled title="Gestures arrive with ticket E1">Gestures off</button>
      </div>
    </header>
  );
}
```
Replace the brand comment with the `<img>` of the brand-mark asset listed in `docs/figma/ASSETS.md`.

`Footer.tsx` (node `43:1387`): one row on `--nv-surface`. Left: `Educational visualization — not for diagnosis or surgical planning.` Right: the link row from node `43:1394`, rendered as plain text spans. No dead `href`s.

`BackendBanner.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { getHealth } from '../api/client';
import css from './BackendBanner.module.css';

export function BackendBanner() {
  const [state, setState] = useState<'checking' | 'online' | 'offline'>('checking');
  useEffect(() => {
    const ac = new AbortController();
    getHealth(ac.signal).then((h) => setState(h.ok ? 'online' : 'offline')).catch(() => {
      if (!ac.signal.aborted) setState('offline');
    });
    return () => ac.abort();
  }, []);
  if (state === 'checking') return null;
  return state === 'online'
    ? <p className={`${css.banner} ${css.ok}`} role="status">Backend online</p>
    : <p className={`${css.banner} ${css.off}`} role="alert">Backend offline — start <code>docker compose up</code></p>;
}
```
The banner CSS uses the "Status — Listening" pill style from node `46:46`: `--nv-success` on `--nv-success-bg` when online, and `--nv-accent-warm` on `--nv-muted-bg` when offline.

`StubPage.tsx`:
```tsx
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Footer } from './Footer';
import { TopNavBar } from './TopNavBar';
import css from './StubPage.module.css';

interface Props { title: string; figmaFrame: string; active?: 'explore' | 'workspace' | null; children?: ReactNode }

export function StubPage({ title, figmaFrame, active = null, children }: Props) {
  return (
    <div className={css.page}>
      <TopNavBar active={active} />
      <main className={css.main}>
        <section className={css.card}>
          <h1 className={css.title}>{title}</h1>
          <p className={css.meta}>Layout: Figma frame {figmaFrame}. Full screen arrives in spec #2.</p>
          {children}
          <Link to="/learn" className={css.cta}>Open Learning Mode</Link>
        </section>
      </main>
      <Footer />
    </div>
  );
}
```
`.card` uses the glass card style: `--nv-surface`, `backdrop-filter: blur(var(--nv-blur))`, `--nv-border`, `--nv-radius-card`, `--nv-shadow-card`. `.cta` uses the primary button style (`--nv-primary`, white text, `--nv-radius-control`).

- [ ] **Step 7: Routes**

`frontend/src/routes/Upload.tsx`:
```tsx
import { BackendBanner } from '../components/BackendBanner';
import { StubPage } from '../components/StubPage';

export default function Upload() {
  return <StubPage title="Upload MRI" figmaFrame="01 · 43:3"><BackendBanner /></StubPage>;
}
```
- `Processing.tsx` → `<StubPage title="Processing" figmaFrame="02 · 44:99" />`
- `Results.tsx` → `<StubPage title="MRI Workspace" figmaFrame="03 · 43:767" active="workspace" />`
- `Explore.tsx` → `<StubPage title="Explore case" figmaFrame="04 · 43:1149" active="explore" />`. T3 adds `<Legend available={{}} />` as its child.
- `Learn.tsx` is a placeholder:
```tsx
import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';

export default function Learn() {
  return (<><TopNavBar active="learn" /><main style={{ height: 'calc(100vh - var(--nv-header-h) - var(--nv-footer-h))' }}>Loading atlas…</main><Footer /></>);
}
```
`frontend/src/App.tsx`:
```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Explore from './routes/Explore';
import Learn from './routes/Learn';
import Processing from './routes/Processing';
import Results from './routes/Results';
import Upload from './routes/Upload';

const router = createBrowserRouter([
  { path: '/', element: <Upload /> },
  { path: '/jobs/:id/processing', element: <Processing /> },
  { path: '/jobs/:id/results', element: <Results /> },
  { path: '/jobs/:id/explore', element: <Explore /> },
  { path: '/learn', element: <Learn /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
```
`frontend/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
```
Set `<title>NeuroVision</title>` in `frontend/index.html`.

- [ ] **Step 8: Verify**

```bash
cd frontend && npm run build && npm run dev
```
Expected:
- the build passes
- `http://localhost:5173/` shows the header, the "Upload MRI" card, "Backend offline — start docker compose up" (no backend running), and the footer
- all five routes render
- `/learn` shows "Loading atlas…"

Compare the header and footer to `docs/figma/04-explore.png`.

- [ ] **Step 9: Commit**

```bash
cd .. && git add .gitignore frontend/index.html frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/tsconfig*.json frontend/src/main.tsx frontend/src/App.tsx frontend/src/vite-env.d.ts frontend/src/styles frontend/src/assets frontend/src/api frontend/src/components/TopNavBar.* frontend/src/components/Footer.* frontend/src/components/BackendBanner.* frontend/src/components/StubPage.* frontend/src/routes
git add -u frontend   # stages the deleted template files
git commit -m "feat(frontend): Figma tokens, header/footer, health banner, route stubs (A3)"
```

---

### Task 3: `transform.ts`, `layers.ts`, Legend (ai)

**Files:**
- Create: `frontend/src/viewer/transform.ts`, `frontend/src/viewer/transform.test.ts`
- Create: `frontend/src/viewer/layers.ts`
- Create: `frontend/src/components/Legend.tsx`, `frontend/src/components/Legend.module.css`
- Modify: `frontend/src/routes/Explore.tsx` (add the Legend child; it is fe's file, so make this one-line edit only)

**Interfaces:**
- Produces:
  - `type Vec3 = [number, number, number]`
  - `rasToScene(p: Vec3, centroidMm: Vec3): Vec3`
  - `sceneToRas(q: Vec3, centroidMm: Vec3): Vec3`
  - `worldMatrix(centroidMm: Vec3): THREE.Matrix4`
  - `type Layer`
  - `LAYERS: readonly LayerDef[]`
  - `BRAIN_LAYER`
  - `Legend({ available }: { available: Partial<Record<Layer, boolean>> })`

- [ ] **Step 1: Write the failing test**

`frontend/src/viewer/transform.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { rasToScene, sceneToRas, worldMatrix, type Vec3 } from './transform';

describe('transform (SPEC §5.2)', () => {
  it('maps RAS (10,20,30) to scene (10,30,-20) with centroid 0', () => {
    expect(rasToScene([10, 20, 30], [0, 0, 0])).toEqual([10, 30, -20]);
  });
  it('subtracts the centroid before rotating', () => {
    expect(rasToScene([11, 22, 33], [1, 2, 3])).toEqual([10, 30, -20]);
  });
  it('round-trips ras → scene → ras within 1e-6', () => {
    const c: Vec3 = [0.4, -24.1, 5.5];
    for (const p of [[10, 20, 30], [-71.3, 52.2, -40.9], [0, 0, 0]] as Vec3[]) {
      const back = sceneToRas(rasToScene(p, c), c);
      back.forEach((v, i) => expect(Math.abs(v - p[i])).toBeLessThan(1e-6));
    }
  });
  it('worldMatrix equals rasToScene', () => {
    const c: Vec3 = [3, -7, 11];
    const p: Vec3 = [10, 20, 30];
    const v = new Vector3(...p).applyMatrix4(worldMatrix(c));
    const e = rasToScene(p, c);
    expect(v.x).toBeCloseTo(e[0], 6); expect(v.y).toBeCloseTo(e[1], 6); expect(v.z).toBeCloseTo(e[2], 6);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd frontend && npx vitest run src/viewer/transform.test.ts`
Expected: FAIL, "Failed to resolve import ./transform".

- [ ] **Step 3: Implement**

`frontend/src/viewer/transform.ts`:
```ts
import { Matrix4 } from 'three';

export type Vec3 = [number, number, number];

// SPEC §5.2: p_scene = R_yup · T_center · p_ras ; R_yup = −90° about X: (x, y, z) → (x, z, −y)
export function rasToScene(p: Vec3, c: Vec3): Vec3 {
  const x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
  return [x, z, -y];
}

export function sceneToRas(q: Vec3, c: Vec3): Vec3 {
  return [q[0] + c[0], -q[2] + c[1], q[1] + c[2]];
}

export function worldMatrix(c: Vec3): Matrix4 {
  return new Matrix4().makeRotationX(-Math.PI / 2).multiply(new Matrix4().makeTranslation(-c[0], -c[1], -c[2]));
}
```
`[x, z, -y]` yields `-0` when y = 0, and vitest `toEqual` uses `Object.is` for numbers, so `-0` ≠ `0`. The tests above avoid zero inputs on that axis; keep it that way, or compare with `toBeCloseTo`.

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run src/viewer/transform.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Layer table + Legend (L1)**

`frontend/src/viewer/layers.ts`:
```ts
// SPEC §7.4 — one table drives NiiVue overlay colours, 3D materials and the legend.
export type Layer = 'edema' | 'core' | 'enhancing';

export interface LayerDef { layer: Layer; label: string; node: Layer; seg: 1 | 2 | 3; color: string; opacity: number; renderOrder: number }

export const LAYERS: readonly LayerDef[] = [
  { layer: 'edema', label: 'Edema (whole tumor)', node: 'edema', seg: 1, color: '#F2C94C', opacity: 0.35, renderOrder: 3 },
  { layer: 'core', label: 'Tumor core', node: 'core', seg: 2, color: '#F2994A', opacity: 0.7, renderOrder: 2 },
  { layer: 'enhancing', label: 'Enhancing', node: 'enhancing', seg: 3, color: '#EB5757', opacity: 1, renderOrder: 1 },
];

export const BRAIN_LAYER = { label: 'Brain', nodes: ['brain_left', 'brain_right'] as const, color: '#D9D4CF', renderOrder: 4 };
```
`frontend/src/components/Legend.tsx`:
```tsx
import { LAYERS, type Layer } from '../viewer/layers';
import css from './Legend.module.css';

export function Legend({ available }: { available: Partial<Record<Layer, boolean>> }) {
  return (
    <ul className={css.legend} aria-label="Segmentation legend">
      {LAYERS.map((l) => (
        <li key={l.layer} className={available[l.layer] ? css.row : `${css.row} ${css.off}`}>
          <span className={css.swatch} style={{ background: l.color }} />
          {l.label}
          {!available[l.layer] && <span className={css.note}>not in this case</span>}
        </li>
      ))}
    </ul>
  );
}
```
`Legend.module.css`:
```css
.legend { list-style: none; margin: 12px 0 0; padding: 0; display: grid; gap: 6px; }
.row { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--nv-text-2); }
.off { opacity: 0.5; }
.swatch { width: 12px; height: 12px; border-radius: 3px; flex: none; }
.note { margin-left: auto; font-size: 11px; color: var(--nv-text-3); }
```
In `frontend/src/routes/Explore.tsx`, pass `<Legend available={{}} />` as the StubPage child and import it.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run && npm run build
cd .. && git add frontend/src/viewer/transform.ts frontend/src/viewer/transform.test.ts frontend/src/viewer/layers.ts frontend/src/components/Legend.tsx frontend/src/components/Legend.module.css frontend/src/routes/Explore.tsx
git commit -m "feat(viewer): transform.ts (A4) and layer table + Legend (L1)"
```

---

### Task 4: ViewerState store + `dispatch` with anatomy actions (ai)

**Files:**
- Create: `frontend/src/actions/types.ts`, `frontend/src/actions/store.ts`, `frontend/src/actions/dispatch.ts`
- Test: `frontend/src/actions/dispatch.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `viewer/transform.ts`, `Layer` from `viewer/layers.ts`
- Produces:
  - `ViewerState`, `Action`, `Source`, `DispatchResult`, `Mode`, `Axis`, `CaseContext`
  - `useViewer` (Zustand hook)
  - `initialState(jobId: string): ViewerState`
  - `initCase(ctx: CaseContext): void`
  - `dispatch(a: Action, _source: Source): DispatchResult`
  - `viewEvents: EventTarget` (fires `'reset'`)

- [ ] **Step 1: Types**

`frontend/src/actions/types.ts`:
```ts
import type { Layer } from '../viewer/layers';
import type { Vec3 } from '../viewer/transform';

// SPEC §7.2 + design spec §6 (anatomy additions)
export type Axis = 'sagittal' | 'coronal' | 'axial';
export type Mode = 'whole' | 'xray' | 'exploded' | 'cutaway';
export type Hemi = 'left' | 'right';

export interface ViewerState {
  jobId: string;
  mode: Mode;
  cursorRas: Vec3;
  tumorRevealed: boolean;
  selected: 'tumor' | 'left' | 'right' | null;
  brainOpacity: number;
  explodeAmount: number;
  cut: { axis: Axis; offsetMm: number; enabled: boolean };
  hidden: Record<Hemi, boolean>;
  layers: Record<Layer, boolean>;
  cameraTarget: 'brain' | 'tumor';
  selectedStructure: string | null;
  isolate: boolean;
  hiddenStructures: Record<string, boolean>;
}

export type Action =
  | { type: 'focusTumor' }
  | { type: 'setMode'; mode: Mode }
  | { type: 'setOpacity'; value: number }
  | { type: 'setExplosion'; value: number }
  | { type: 'setCutPlane'; axis?: Axis; offsetMm?: number; deltaMm?: number; enabled?: boolean }
  | { type: 'setHemisphereVisible'; side: Hemi; visible: boolean }
  | { type: 'setLayerVisible'; layer: Layer; visible: boolean }
  | { type: 'setSlice'; axis: Axis; offsetMm: number }
  | { type: 'select'; target: 'tumor' | 'left' | 'right' | null }
  | { type: 'resetView' }
  | { type: 'explainFinding' }
  | { type: 'selectStructure'; id: string | null }
  | { type: 'setStructureVisible'; id: string; visible: boolean }
  | { type: 'setIsolate'; on: boolean };

export type Source = 'pointer' | 'keyboard' | 'gesture' | 'voice';
export interface DispatchResult { ok: boolean; message: string }

export interface CaseContext {
  jobId: string;
  hasTumor: boolean;
  structureIds: ReadonlySet<string>;
  bboxMm: { min: Vec3; max: Vec3 };
}
```

- [ ] **Step 2: Write the failing tests**

`frontend/src/actions/dispatch.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import type { Action, CaseContext } from './types';
import { dispatch, initCase, viewEvents } from './dispatch';
import { initialState, useViewer } from './store';

const ctx: CaseContext = {
  jobId: 'atlas',
  hasTumor: false,
  structureIds: new Set(['lh_superior_frontal', 'brainstem']),
  bboxMm: { min: [-70, -100, -50], max: [70, 70, 80] },
};
const st = () => useViewer.getState();

beforeEach(() => initCase(ctx));

describe('dispatch', () => {
  it('clamps opacity to 1', () => {
    expect(dispatch({ type: 'setOpacity', value: 1.7 }, 'pointer').ok).toBe(true);
    expect(st().brainOpacity).toBe(1);
  });
  it('clamps explosion to 0', () => {
    dispatch({ type: 'setExplosion', value: -1 }, 'pointer');
    expect(st().explodeAmount).toBe(0);
  });
  it('rejects NaN values', () => {
    expect(dispatch({ type: 'setOpacity', value: Number.NaN }, 'pointer').ok).toBe(false);
    expect(st().brainOpacity).toBe(0.3);
  });
  it('resetView restores the snapshot and emits reset', () => {
    let resets = 0;
    const on = () => { resets++; };
    viewEvents.addEventListener('reset', on);
    dispatch({ type: 'setOpacity', value: 0.9 }, 'pointer');
    dispatch({ type: 'setExplosion', value: 0.5 }, 'pointer');
    dispatch({ type: 'setMode', mode: 'xray' }, 'pointer');
    dispatch({ type: 'selectStructure', id: 'brainstem' }, 'pointer');
    dispatch({ type: 'setStructureVisible', id: 'lh_superior_frontal', visible: false }, 'pointer');
    expect(dispatch({ type: 'resetView' }, 'pointer').ok).toBe(true);
    expect(st()).toEqual(initialState('atlas'));
    expect(resets).toBe(1);
    viewEvents.removeEventListener('reset', on);
  });
  it('rejects an unknown structure id and leaves state alone', () => {
    const r = dispatch({ type: 'selectStructure', id: 'lh_nope' }, 'pointer');
    expect(r.ok).toBe(false);
    expect(st().selectedStructure).toBeNull();
    expect(dispatch({ type: 'setStructureVisible', id: 'nope', visible: false }, 'pointer').ok).toBe(false);
  });
  it('refuses focusTumor on the no-tumor atlas', () => {
    const r = dispatch({ type: 'focusTumor' }, 'pointer');
    expect(r).toEqual({ ok: false, message: 'No tumor detected in this scan' });
    expect(st().tumorRevealed).toBe(false);
    expect(dispatch({ type: 'setLayerVisible', layer: 'core', visible: true }, 'pointer').ok).toBe(false);
    expect(dispatch({ type: 'select', target: 'tumor' }, 'pointer').ok).toBe(false);
  });
  it('refuses isolate without a selection', () => {
    expect(dispatch({ type: 'setIsolate', on: true }, 'pointer').ok).toBe(false);
    expect(st().isolate).toBe(false);
  });
  it('isolates the selection, and deselect clears isolate', () => {
    dispatch({ type: 'selectStructure', id: 'brainstem' }, 'pointer');
    expect(dispatch({ type: 'setIsolate', on: true }, 'pointer').ok).toBe(true);
    expect(st().isolate).toBe(true);
    dispatch({ type: 'selectStructure', id: null }, 'pointer');
    expect(st()).toMatchObject({ selectedStructure: null, isolate: false });
  });
  it('hides and shows a structure', () => {
    dispatch({ type: 'setStructureVisible', id: 'brainstem', visible: false }, 'pointer');
    expect(st().hiddenStructures.brainstem).toBe(true);
    dispatch({ type: 'setStructureVisible', id: 'brainstem', visible: true }, 'pointer');
    expect(st().hiddenStructures.brainstem).toBe(false);
  });
  it('toggles hemispheres', () => {
    dispatch({ type: 'setHemisphereVisible', side: 'left', visible: false }, 'pointer');
    expect(st().hidden).toEqual({ left: true, right: false });
  });
  it('clamps the cut offset to the brain bbox', () => {
    dispatch({ type: 'setCutPlane', axis: 'axial', offsetMm: 500, enabled: true }, 'pointer');
    expect(st().cut).toEqual({ axis: 'axial', offsetMm: 80, enabled: true });
    dispatch({ type: 'setCutPlane', deltaMm: -1000 }, 'pointer');
    expect(st().cut.offsetMm).toBe(-50);
  });
  it('rejects unknown actions', () => {
    expect(dispatch({ type: 'warp' } as unknown as Action, 'pointer').ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run them to make sure they fail**

Run: `npx vitest run src/actions/dispatch.test.ts`
Expected: FAIL, "Failed to resolve import ./dispatch".

- [ ] **Step 4: Implement the store and dispatch**

`frontend/src/actions/store.ts`:
```ts
import { create } from 'zustand';
import type { ViewerState } from './types';

export function initialState(jobId: string): ViewerState {
  return {
    jobId,
    mode: 'whole',
    cursorRas: [0, 0, 0],
    tumorRevealed: false,
    selected: null,
    brainOpacity: 0.3,
    explodeAmount: 0,
    cut: { axis: 'axial', offsetMm: 0, enabled: false },
    hidden: { left: false, right: false },
    layers: { edema: false, core: false, enhancing: false },
    cameraTarget: 'brain',
    selectedStructure: null,
    isolate: false,
    hiddenStructures: {},
  };
}

// Mutated only by actions/dispatch.ts (SPEC §7.3).
export const useViewer = create<ViewerState>()(() => initialState(''));
```
`frontend/src/actions/dispatch.ts`:
```ts
import type { Vec3 } from '../viewer/transform';
import { initialState, useViewer } from './store';
import type { Action, Axis, CaseContext, DispatchResult, Mode, Source, ViewerState } from './types';

const MODES: readonly Mode[] = ['whole', 'xray', 'exploded', 'cutaway'];
const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { sagittal: 0, coronal: 1, axial: 2 };
const NO_TUMOR: DispatchResult = { ok: false, message: 'No tumor detected in this scan' };

let ctx: CaseContext = { jobId: '', hasTumor: false, structureIds: new Set(), bboxMm: { min: [0, 0, 0], max: [0, 0, 0] } };

/** View effects that are not state (camera). AtlasCanvas listens for 'reset'. */
export const viewEvents = new EventTarget();

const ok = (message: string): DispatchResult => ({ ok: true, message });
const fail = (message: string): DispatchResult => ({ ok: false, message });
const set = (p: Partial<ViewerState>) => useViewer.setState(p);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Case loader: sets the validation context and resets the view to the snapshot. */
export function initCase(c: CaseContext): void {
  ctx = c;
  useViewer.setState(initialState(c.jobId), true);
}

function clampAxis(axis: Axis, mm: number): number {
  const i = AXIS_INDEX[axis];
  return clamp(mm, ctx.bboxMm.min[i], ctx.bboxMm.max[i]);
}

export function dispatch(a: Action, _source: Source): DispatchResult {
  const s = useViewer.getState();
  switch (a.type) {
    case 'focusTumor':
      if (!ctx.hasTumor) return NO_TUMOR;
      set({ tumorRevealed: true, cameraTarget: 'tumor', selected: 'tumor' });
      return ok('Focused on the tumor');
    case 'setMode':
      if (!MODES.includes(a.mode)) return fail(`Unknown mode ${String(a.mode)}`);
      set({ mode: a.mode });
      return ok(`Mode: ${a.mode}`);
    case 'setOpacity':
      if (!Number.isFinite(a.value)) return fail('Invalid opacity');
      set({ brainOpacity: clamp(a.value, 0, 1) });
      return ok(`Opacity ${pct(clamp(a.value, 0, 1))}`);
    case 'setExplosion':
      if (!Number.isFinite(a.value)) return fail('Invalid explosion');
      set({ explodeAmount: clamp(a.value, 0, 1) });
      return ok(`Explode ${pct(clamp(a.value, 0, 1))}`);
    case 'setCutPlane': {
      const axis = a.axis ?? s.cut.axis;
      const raw = a.offsetMm ?? s.cut.offsetMm + (a.deltaMm ?? 0);
      if (!Number.isFinite(raw)) return fail('Invalid cut offset');
      const offsetMm = clampAxis(axis, raw);
      const cut = { axis, offsetMm, enabled: a.enabled ?? s.cut.enabled };
      const patch: Partial<ViewerState> = { cut };
      if (s.mode === 'cutaway') {
        const c = [...s.cursorRas] as Vec3;
        c[AXIS_INDEX[axis]] = offsetMm;
        patch.cursorRas = c;
      }
      set(patch);
      return ok(`Cut ${axis} at ${offsetMm.toFixed(0)} mm`);
    }
    case 'setHemisphereVisible':
      set({ hidden: { ...s.hidden, [a.side]: !a.visible } });
      return ok(`${a.side === 'left' ? 'Left' : 'Right'} hemisphere ${a.visible ? 'shown' : 'hidden'}`);
    case 'setLayerVisible':
      if (!ctx.hasTumor) return NO_TUMOR;
      set({ layers: { ...s.layers, [a.layer]: a.visible } });
      return ok(`${a.layer} ${a.visible ? 'shown' : 'hidden'}`);
    case 'setSlice': {
      if (!Number.isFinite(a.offsetMm)) return fail('Invalid slice offset');
      const c = [...s.cursorRas] as Vec3;
      c[AXIS_INDEX[a.axis]] = clampAxis(a.axis, a.offsetMm);
      set({ cursorRas: c });
      return ok(`Slice ${a.axis} at ${c[AXIS_INDEX[a.axis]].toFixed(0)} mm`);
    }
    case 'select':
      if (a.target === 'tumor' && !ctx.hasTumor) return NO_TUMOR;
      set({ selected: a.target });
      return ok(a.target ? `Selected ${a.target}` : 'Selection cleared');
    case 'resetView':
      set(initialState(ctx.jobId));
      viewEvents.dispatchEvent(new Event('reset'));
      return ok('View reset');
    case 'explainFinding':
      // shortcut: the report-backed template is ticket E2; until then only the no-tumor answer exists
      return ctx.hasTumor ? fail('Explanations arrive with the report (ticket E2)') : NO_TUMOR;
    case 'selectStructure':
      if (a.id === null) {
        set({ selectedStructure: null, isolate: false });
        return ok('Selection cleared');
      }
      if (!ctx.structureIds.has(a.id)) return fail(`Unknown structure ${a.id}`);
      set({ selectedStructure: a.id });
      return ok(`Selected ${a.id}`);
    case 'setStructureVisible':
      if (!ctx.structureIds.has(a.id)) return fail(`Unknown structure ${a.id}`);
      set({ hiddenStructures: { ...s.hiddenStructures, [a.id]: !a.visible } });
      return ok(`${a.id} ${a.visible ? 'shown' : 'hidden'}`);
    case 'setIsolate':
      if (a.on && !s.selectedStructure) return fail('Select a structure first');
      set({ isolate: a.on });
      return ok(a.on ? 'Isolated' : 'Isolate off');
    default:
      return fail(`Unknown action ${(a as { type?: unknown }).type as string}`);
  }
}
```

- [ ] **Step 5: Run the tests to make sure they pass**

Run: `npx vitest run src/actions/dispatch.test.ts`
Expected: 12 passed.

- [ ] **Step 6: Commit**

```bash
npm run build
cd .. && git add frontend/src/actions && git commit -m "feat(actions): ViewerState store + dispatch with anatomy actions (B4)"
```

---

### Task 5: `anatomy.ts`: atlas types, loader, groups, colours, explode (ai)

**Files:**
- Create: `frontend/src/viewer/anatomy.ts`
- Test: `frontend/src/viewer/anatomy.test.ts`

**Interfaces:**
- Consumes: `Vec3` from `transform.ts`
- Produces:
  - Types: `Group`, `Side`, `BBox`, `Structure`, `Atlas`
  - Constants: `GROUP_ORDER: readonly Group[]`, `GROUP_LABEL: Record<Group, string>`, `SIDE_LABEL: Record<Side, string>`, `CORTICAL_GROUPS: ReadonlySet<Group>`, `ATLAS_JSON_URL`, `ATLAS_GLB_URL`
  - Functions:
    - `loadAtlas(): Promise<Atlas>`
    - `displayName(s: Structure): string`
    - `structureColors(list: readonly Structure[]): Record<string, string>`
    - `explodeOffset(s: Structure, amount: number, brainCentroid: Vec3): Vec3` (RAS mm)

- [ ] **Step 1: Write the failing tests**

`frontend/src/viewer/anatomy.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { displayName, explodeOffset, structureColors, type Structure } from './anatomy';
import type { Vec3 } from './transform';

const mk = (id: string, side: Structure['side'], group: Structure['group'], centroidMm: Vec3): Structure => ({
  id, name: id, side, group, volumeCm3: 1, centroidMm, bboxMm: { min: centroidMm, max: centroidMm }, neighbours: [],
});
const C: Vec3 = [0, -20, 5];
const lhFront = mk('lh_superior_frontal', 'left', 'frontal', [-13, 34, 37]);
const rhFront = mk('rh_superior_frontal', 'right', 'frontal', [13, 34, 37]);
const stem = mk('brainstem', 'midline', 'brainstem', [0, -31, -36]);
const cbl = mk('lh_cerebellum_gray_matter', 'left', 'cerebellum', [-25, -60, -30]);
const len = (v: Vec3) => Math.hypot(...v);

describe('explodeOffset (design spec §5.3)', () => {
  it('is exactly zero at amount 0', () => {
    for (const s of [lhFront, rhFront, stem, cbl]) expect(explodeOffset(s, 0, C)).toEqual([0, 0, 0]);
  });
  it('stage 1 splits hemispheres to ±40 mm on x and keeps midline still', () => {
    expect(explodeOffset(lhFront, 0.4, C)).toEqual([-40, 0, 0]);
    expect(explodeOffset(rhFront, 0.4, C)).toEqual([40, 0, 0]);
    expect(explodeOffset(stem, 0.4, C)).toEqual([0, 0, 0]);
  });
  it('stage 2 adds a radial push of 40 mm × group factor', () => {
    const o = explodeOffset(rhFront, 1, C);
    const radial: Vec3 = [o[0] - 40, o[1], o[2]];
    expect(len(radial)).toBeCloseTo(40, 6);
    expect(explodeOffset(stem, 1, C)).toEqual([0, 0, 0]); // brainstem factor 0
  });
  it('biases the cerebellum downward', () => {
    const o = explodeOffset(cbl, 1, C);
    const d: Vec3 = [cbl.centroidMm[0] - C[0], cbl.centroidMm[1] - C[1], cbl.centroidMm[2] - C[2]];
    expect(o[2] / 40).toBeLessThan(d[2] / len(d)); // pushed lower than pure radial
  });
  it('clamps amount', () => {
    expect(explodeOffset(rhFront, 5, C)).toEqual(explodeOffset(rhFront, 1, C));
    expect(explodeOffset(rhFront, -1, C)).toEqual([0, 0, 0]);
  });
});

describe('colours and names', () => {
  it('gives left and right of a pair the same colour and neighbours distinct ones', () => {
    const lhMid = mk('lh_caudal_middle_frontal', 'left', 'frontal', [-35, 10, 45]);
    const c = structureColors([lhFront, rhFront, lhMid, stem]);
    expect(c.lh_superior_frontal).toBe(c.rh_superior_frontal);
    expect(c.lh_superior_frontal).not.toBe(c.lh_caudal_middle_frontal);
    expect(c.brainstem).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('adds the side to display names', () => {
    expect(displayName(lhFront)).toBe('lh_superior_frontal (L)');
    expect(displayName(stem)).toBe('brainstem');
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run src/viewer/anatomy.test.ts`
Expected: FAIL, "Failed to resolve import ./anatomy".

- [ ] **Step 3: Implement**

`frontend/src/viewer/anatomy.ts`:
```ts
import { Color } from 'three';
import type { Vec3 } from './transform';

export type Group =
  | 'frontal' | 'parietal' | 'temporal' | 'occipital' | 'insula_cingulate'
  | 'deep' | 'limbic' | 'ventricles' | 'cerebellum' | 'brainstem' | 'other';
export type Side = 'left' | 'right' | 'midline';
export interface BBox { min: Vec3; max: Vec3 }
export interface Structure {
  id: string; name: string; side: Side; group: Group; volumeCm3: number;
  centroidMm: Vec3; bboxMm: BBox; neighbours: string[];
}
export interface Atlas {
  source: { atlas: string; license: string; doi: string };
  brain: { centroidMm: Vec3; bboxMm: BBox };
  structures: Structure[];
}

export const ATLAS_JSON_URL = `${import.meta.env.BASE_URL}atlas/structures.json`;
export const ATLAS_GLB_URL = `${import.meta.env.BASE_URL}atlas/brain_atlas.glb`;

export const GROUP_ORDER: readonly Group[] = [
  'frontal', 'parietal', 'temporal', 'occipital', 'insula_cingulate',
  'limbic', 'deep', 'ventricles', 'cerebellum', 'brainstem', 'other',
];
export const GROUP_LABEL: Record<Group, string> = {
  frontal: 'Frontal lobe', parietal: 'Parietal lobe', temporal: 'Temporal lobe', occipital: 'Occipital lobe',
  insula_cingulate: 'Insula & cingulate', limbic: 'Limbic', deep: 'Deep nuclei', ventricles: 'Ventricles',
  cerebellum: 'Cerebellum', brainstem: 'Brainstem', other: 'Other',
};
export const SIDE_LABEL: Record<Side, string> = { left: 'Left', right: 'Right', midline: 'Midline' };
/** Groups that go see-through in X-Ray (design spec §5.3). */
export const CORTICAL_GROUPS: ReadonlySet<Group> = new Set(['frontal', 'parietal', 'temporal', 'occipital', 'insula_cingulate']);

export async function loadAtlas(): Promise<Atlas> {
  const r = await fetch(ATLAS_JSON_URL);
  if (!r.ok) throw new Error(`Atlas failed to load (HTTP ${r.status})`);
  return (await r.json()) as Atlas;
}

export function displayName(s: Structure): string {
  return s.side === 'midline' ? s.name : `${s.name} (${s.side === 'left' ? 'L' : 'R'})`;
}

// Hue per group, lightness step per structure within the group (design spec §5.4).
const HUE: Record<Group, number> = {
  frontal: 205, parietal: 145, temporal: 275, occipital: 330, insula_cingulate: 180,
  limbic: 55, deep: 25, ventricles: 195, cerebellum: 100, brainstem: 15, other: 0,
};
const baseId = (id: string) => id.replace(/^(lh|rh)_/, '');

export function structureColors(list: readonly Structure[]): Record<string, string> {
  const idx = new Map<string, number>();
  const perGroup = new Map<Group, number>();
  const out: Record<string, string> = {};
  for (const s of list) {
    const b = baseId(s.id);
    if (!idx.has(b)) {
      const n = perGroup.get(s.group) ?? 0;
      idx.set(b, n);
      perGroup.set(s.group, n + 1);
    }
    const i = idx.get(b)!;
    const sat = s.group === 'other' ? 0 : s.group === 'ventricles' ? 0.35 : 0.45;
    out[s.id] = `#${new Color().setHSL(HUE[s.group] / 360, sat, 0.42 + (i % 6) * 0.06).getHexString()}`;
  }
  return out;
}

const HEMI_MM = 40;
const RADIAL_MM = 40;
const FACTOR: Record<Group, number> = {
  frontal: 1, parietal: 1, temporal: 1, occipital: 1, insula_cingulate: 1,
  limbic: 0.7, deep: 0.5, ventricles: 0.5, cerebellum: 1, brainstem: 0, other: 0.5,
};

/** Grouped radial explode offset in RAS mm (design spec §5.3). amount 0 → exactly [0,0,0]. */
export function explodeOffset(s: Structure, amount: number, brainCentroid: Vec3): Vec3 {
  const a = Math.min(1, Math.max(0, amount));
  if (a === 0) return [0, 0, 0];
  const s1 = Math.min(a, 0.4) / 0.4;
  const s2 = Math.max(0, a - 0.4) / 0.6;
  const hx = s.side === 'left' ? -HEMI_MM * s1 : s.side === 'right' ? HEMI_MM * s1 : 0;
  let d: Vec3 = [s.centroidMm[0] - brainCentroid[0], s.centroidMm[1] - brainCentroid[1], s.centroidMm[2] - brainCentroid[2]];
  if (s.group === 'cerebellum') d = [d[0], d[1], d[2] - 0.5 * Math.hypot(...d)];
  const n = Math.hypot(...d);
  const k = n > 1e-9 ? (FACTOR[s.group] * RADIAL_MM * s2) / n : 0;
  if (k === 0) return [hx, 0, 0]; // avoids -0 from d * 0, which breaks toEqual([0, 0, 0])
  return [hx + d[0] * k, d[1] * k, d[2] * k];
}
```

- [ ] **Step 4: Run the tests to make sure they pass**

Run: `npx vitest run src/viewer/anatomy.test.ts`
Expected: 7 passed. Then run `npx vitest run && npm run build` (everything green).

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/viewer/anatomy.ts frontend/src/viewer/anatomy.test.ts
git commit -m "feat(viewer): atlas types, group colours, grouped radial explode"
```

---

### Task 6: Authored content + real-data tests (be)

**Files:**
- Create: `frontend/src/content/anatomy.json`, `frontend/src/content/index.ts`
- Test: `frontend/src/viewer/atlasData.test.ts`

**Interfaces:**
- Consumes: `frontend/public/atlas/structures.json` (T1), plus `explodeOffset` and `Atlas` from `viewer/anatomy.ts` (T5)
- Produces:
  - `interface StructureContent { description: string; functions: string[]; whenDamaged: string }`
  - `contentFor(id: string): StructureContent | undefined`
  - `baseId(id: string): string`

Content is keyed by **base slug** (`superior_frontal`, not `lh_superior_frontal`), so left and right share one entry. That is 51 entries:

```
caudal_anterior_cingulate caudal_middle_frontal cuneus entorhinal fusiform inferior_parietal
inferior_temporal isthmus_cingulate lateral_occipital lateral_orbitofrontal lingual medial_orbitofrontal
middle_temporal parahippocampal paracentral pars_opercularis pars_orbitalis pars_triangularis
pericalcarine postcentral posterior_cingulate precentral precuneus rostral_anterior_cingulate
rostral_middle_frontal superior_frontal superior_parietal superior_temporal supramarginal
transverse_temporal insula brainstem third_ventricle fourth_ventricle optic_chiasm lateral_ventricle
inferior_lateral_ventricle cerebellum_gray_matter cerebellum_white_matter thalamus caudate putamen
pallidum hippocampus amygdala accumbens_area ventral_diencephalon basal_forebrain vermal_lobules_i_v
vermal_lobules_vi_vii vermal_lobules_viii_x
```

**Writing rules:**
- `description`: 1–2 sentences on where it is and what it is.
- `functions`: 2–4 short noun phrases.
- `whenDamaged`: 1 sentence of textbook-level "damage here is associated with …".
- No prognosis, no treatment advice, and never the words "diagnosis" or "healthy".
- Plain English, general neuroanatomy-textbook level. The UI tags the text "Educational · unreviewed".

- [ ] **Step 1: Write the failing test**

`frontend/src/viewer/atlasData.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import atlasJson from '../../public/atlas/structures.json';
import content from '../content/anatomy.json';
import { baseId, contentFor } from '../content';
import { explodeOffset, type Atlas } from './anatomy';

const atlas = atlasJson as unknown as Atlas;

describe('atlas data (real structures.json)', () => {
  it('has 95 structures with unique ids', () => {
    const ids = atlas.structures.map((s) => s.id);
    expect(ids.length).toBe(95);
    expect(new Set(ids).size).toBe(95);
  });
  it('explodeOffset(s, 0) is [0,0,0] for every structure', () => {
    for (const s of atlas.structures) expect(explodeOffset(s, 0, atlas.brain.centroidMm)).toEqual([0, 0, 0]);
  });
  it('has authored content for every structure', () => {
    for (const s of atlas.structures) {
      const c = contentFor(s.id);
      expect(c, s.id).toBeDefined();
      expect(c!.description.length, s.id).toBeGreaterThan(20);
      expect(c!.functions.length, s.id).toBeGreaterThanOrEqual(2);
      expect(c!.whenDamaged.length, s.id).toBeGreaterThan(20);
    }
  });
  it('has no orphan content keys', () => {
    const bases = new Set(atlas.structures.map((s) => baseId(s.id)));
    expect(Object.keys(content).filter((k) => !bases.has(k))).toEqual([]);
  });
  it('avoids banned clinical words', () => {
    expect(JSON.stringify(content)).not.toMatch(/diagnos|healthy|prognos/i);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd frontend && npx vitest run src/viewer/atlasData.test.ts`
Expected: FAIL, "Failed to resolve import ../content/anatomy.json".

- [ ] **Step 3: Implement**

`frontend/src/content/index.ts`:
```ts
import content from './anatomy.json';

export interface StructureContent { description: string; functions: string[]; whenDamaged: string }

export const baseId = (id: string) => id.replace(/^(lh|rh)_/, '');

export function contentFor(id: string): StructureContent | undefined {
  return (content as Record<string, StructureContent>)[baseId(id)];
}
```
Write `frontend/src/content/anatomy.json` with all 51 entries. Example entry:
```json
{
  "superior_frontal": {
    "description": "The uppermost gyrus of the frontal lobe, running front to back along the top of each hemisphere beside the midline.",
    "functions": ["Working memory", "Self-awareness and planning", "Supplementary motor control"],
    "whenDamaged": "Damage here is associated with reduced initiative, working-memory problems and, near the back, difficulty starting movements."
  }
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run`
Expected: everything passes, including 5 in `atlasData.test.ts`.

- [ ] **Step 5: Commit**

```bash
cd .. && git add frontend/src/content frontend/src/viewer/atlasData.test.ts
git commit -m "feat(content): authored notes for all 51 CerebrA structures + data tests"
```

---

### Task 7: Learning Mode UI panels from Figma (fe)

**Files:**
- Create: `frontend/src/learn/filter.ts`, `frontend/src/learn/filter.test.ts`
- Create: `frontend/src/learn/StructureTree.tsx` + `.module.css` (Figma: left Aside `43:1203`, toggle buttons `43:1233`, notes card `43:1256`)
- Create: `frontend/src/learn/InfoPanel.tsx` + `.module.css` (Figma: Neuro Agent panel shell `46:38`, Heading 2 `43:1210`, context chips `46:65`/`46:67`, suggestion chips `46:122`)
- Create: `frontend/src/learn/LearnToolbar.tsx` + `.module.css` (Figma: bottom bar `43:1356`/`43:1357` with its buttons `43:1366`–`43:1384`, Mode Tabs `46:49`)
- Create: `frontend/src/learn/ExplodeSlider.tsx` + `.module.css` (Figma: Tactile Explode Slider `43:1301`, track `43:1310`, thumb `43:1311`, ticks `43:1313`)
- Create: `frontend/src/learn/StatusPill.tsx` + `.module.css` (Figma: Active Gesture Status Banner `43:1339`)

**Interfaces:**
- Consumes (from T4): `useViewer`, `dispatch`
- Consumes (from T5): `Atlas`, `Structure`, `Group`, `GROUP_ORDER`, `GROUP_LABEL`, `SIDE_LABEL`, `displayName`
- Consumes (from T6): `contentFor`
- Produces:
  - `filterStructures(list, q)`, `groupStructures(list)`
  - `StructureTree({ atlas, colors, missing })`
  - `InfoPanel({ atlas, colors })`
  - `LearnToolbar()`
  - `ExplodeSlider()`
  - `StatusPill()`
- Every control calls `dispatch(action, 'pointer')`. Components never call `useViewer.setState`.

- [ ] **Step 1: Write the failing filter test**

`frontend/src/learn/filter.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import type { Structure } from '../viewer/anatomy';
import { filterStructures, groupStructures } from './filter';

const mk = (id: string, name: string, group: Structure['group']): Structure => ({
  id, name, side: 'left', group, volumeCm3: 1, centroidMm: [0, 0, 0], bboxMm: { min: [0, 0, 0], max: [0, 0, 0] }, neighbours: [],
});
const list = [mk('lh_hippocampus', 'Hippocampus', 'limbic'), mk('lh_superior_frontal', 'Superior Frontal', 'frontal'), mk('lh_cuneus', 'Cuneus', 'occipital')];

describe('filterStructures', () => {
  it('returns everything for a blank query', () => expect(filterStructures(list, '  ')).toHaveLength(3));
  it('matches names case-insensitively', () => expect(filterStructures(list, 'HIPPO').map((s) => s.id)).toEqual(['lh_hippocampus']));
  it('matches group labels', () => expect(filterStructures(list, 'frontal lobe').map((s) => s.id)).toEqual(['lh_superior_frontal']));
});

describe('groupStructures', () => {
  it('orders groups by GROUP_ORDER and drops empty ones', () => {
    expect(groupStructures(list).map(([g]) => g)).toEqual(['frontal', 'occipital', 'limbic']);
  });
});
```
Run `npx vitest run src/learn/filter.test.ts`. Expected: FAIL, unresolved `./filter`.

- [ ] **Step 2: Implement the filter**

`frontend/src/learn/filter.ts`:
```ts
import { GROUP_LABEL, GROUP_ORDER, type Group, type Structure } from '../viewer/anatomy';

export function filterStructures(list: readonly Structure[], q: string): Structure[] {
  const t = q.trim().toLowerCase();
  if (!t) return [...list];
  return list.filter((s) => s.name.toLowerCase().includes(t) || GROUP_LABEL[s.group].toLowerCase().includes(t));
}

export function groupStructures(list: readonly Structure[]): [Group, Structure[]][] {
  return GROUP_ORDER.map((g) => [g, list.filter((s) => s.group === g)] as [Group, Structure[]]).filter(([, l]) => l.length > 0);
}
```
Run `npx vitest run src/learn/filter.test.ts`. Expected: 4 passed.

- [ ] **Step 3: StructureTree**

```tsx
import { useMemo, useState } from 'react';
import { dispatch } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import { GROUP_LABEL, type Atlas } from '../viewer/anatomy';
import { filterStructures, groupStructures } from './filter';
import css from './StructureTree.module.css';

interface Props { atlas: Atlas; colors: Record<string, string>; missing: ReadonlySet<string> }

export function StructureTree({ atlas, colors, missing }: Props) {
  const [q, setQ] = useState('');
  const selected = useViewer((s) => s.selectedStructure);
  const hiddenMap = useViewer((s) => s.hiddenStructures);
  const groups = useMemo(() => groupStructures(filterStructures(atlas.structures, q)), [atlas, q]);
  return (
    <aside className={css.card} aria-label="Brain structures">
      <h2 className={css.heading}>Structures</h2>
      <input className={css.search} type="search" placeholder="Search structures" value={q}
        onChange={(e) => setQ(e.target.value)} aria-label="Search structures" />
      <div className={css.scroll}>
        {groups.map(([g, list]) => (
          <section key={g}>
            <h3 className={css.group}>{GROUP_LABEL[g]}</h3>
            <ul className={css.list}>
              {list.map((s) => {
                const hidden = !!hiddenMap[s.id];
                return (
                  <li key={s.id} className={s.id === selected ? `${css.row} ${css.selected}` : css.row}>
                    <button className={css.name} disabled={missing.has(s.id)} aria-current={s.id === selected}
                      onClick={() => dispatch({ type: 'selectStructure', id: s.id }, 'pointer')}>
                      <span className={css.dot} style={{ background: colors[s.id] }} />
                      {s.name}
                      {s.side !== 'midline' && <span className={css.side}>{s.side === 'left' ? 'L' : 'R'}</span>}
                    </button>
                    <button className={hidden ? `${css.eye} ${css.eyeOff}` : css.eye} aria-pressed={!hidden}
                      aria-label={`${hidden ? 'Show' : 'Hide'} ${s.name} ${s.side}`} disabled={missing.has(s.id)}
                      onClick={() => dispatch({ type: 'setStructureVisible', id: s.id, visible: hidden }, 'pointer')}>
                      {/* <img> of the hide/eye icon listed in docs/figma/ASSETS.md (node 43:1246), 16×16 */}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      <p className={css.credit}>
        Geometry: {atlas.source.atlas} atlas, {atlas.source.license}, doi:{atlas.source.doi}. Template brain (MNI-ICBM2009c), not a patient scan.
      </p>
    </aside>
  );
}
```
Replace the icon comment with the real `<img>`. The CSS is ported from nodes `43:1203` (card), `43:1233` (row/toggle style) and `43:1256` (credit card): `.scroll { overflow: auto; flex: 1 }`, `.selected` on `--nv-primary-soft`, `.eyeOff img { opacity: .35 }`.

- [ ] **Step 4: InfoPanel**

```tsx
import { dispatch } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import { contentFor } from '../content';
import { displayName, GROUP_LABEL, SIDE_LABEL, type Atlas } from '../viewer/anatomy';
import css from './InfoPanel.module.css';

export function InfoPanel({ atlas, colors }: { atlas: Atlas; colors: Record<string, string> }) {
  const id = useViewer((s) => s.selectedStructure);
  const byId = new Map(atlas.structures.map((s) => [s.id, s]));
  const s = id ? byId.get(id) : undefined;
  if (!s) return <aside className={css.panel}><p className={css.empty}>Click any structure to learn about it.</p></aside>;
  const c = contentFor(s.id);
  return (
    <aside className={css.panel} aria-live="polite" aria-label="Structure details">
      <h2 className={css.title}>{s.name}</h2>
      <div className={css.chips}>
        <span className={css.chip}>{SIDE_LABEL[s.side]}</span>
        <span className={css.chip}><span className={css.dot} style={{ background: colors[s.id] }} />{GROUP_LABEL[s.group]}</span>
      </div>
      <dl className={css.facts}><dt>Volume</dt><dd className={css.mono}>{s.volumeCm3.toFixed(2)} cm³</dd></dl>
      {c && (
        <>
          <p>{c.description}</p>
          <h3 className={css.h3}>Key functions</h3>
          <ul className={css.list}>{c.functions.map((f) => <li key={f}>{f}</li>)}</ul>
          <h3 className={css.h3}>When damaged</h3>
          <p>{c.whenDamaged}</p>
        </>
      )}
      {s.neighbours.length > 0 && (
        <>
          <h3 className={css.h3}>Neighbours</h3>
          <div className={css.suggestions}>
            {s.neighbours.flatMap((n) => byId.get(n) ?? []).map((n) => (
              <button key={n.id} className={css.suggestion} onClick={() => dispatch({ type: 'selectStructure', id: n.id }, 'pointer')}>
                <span className={css.dot} style={{ background: colors[n.id] }} />{displayName(n)}
              </button>
            ))}
          </div>
        </>
      )}
      <p className={css.tag}>Educational · unreviewed</p>
    </aside>
  );
}
```
CSS from `46:38` (panel shell), `43:1210` (title), `46:67` (chip), `46:122`/`46:123` (suggestion chips), and `--nv-mono` for the volume. The panel scrolls (`overflow: auto`).

- [ ] **Step 5: LearnToolbar, ExplodeSlider, StatusPill**

```tsx
// LearnToolbar.tsx
import { dispatch } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import css from './LearnToolbar.module.css';

export function LearnToolbar() {
  const mode = useViewer((s) => s.mode);
  const opacity = useViewer((s) => s.brainOpacity);
  const hidden = useViewer((s) => s.hidden);
  const isolate = useViewer((s) => s.isolate);
  const selected = useViewer((s) => s.selectedStructure);
  const xray = mode === 'xray';
  return (
    <div className={css.bar} role="toolbar" aria-label="View controls">
      <div className={css.tabs} role="tablist" aria-label="Render mode">
        <button role="tab" aria-selected={!xray} className={css.tab} onClick={() => dispatch({ type: 'setMode', mode: 'whole' }, 'pointer')}>Solid</button>
        <button role="tab" aria-selected={xray} className={css.tab} onClick={() => dispatch({ type: 'setMode', mode: 'xray' }, 'pointer')}>X-Ray</button>
      </div>
      <label className={css.opacity}>
        Cortex
        <input type="range" min={0} max={100} value={Math.round(opacity * 100)} disabled={!xray} aria-label="Cortex opacity"
          onChange={(e) => dispatch({ type: 'setOpacity', value: Number(e.target.value) / 100 }, 'pointer')} />
        <span className={css.mono}>{Math.round(opacity * 100)}%</span>
      </label>
      <span className={css.divider} />
      {(['left', 'right'] as const).map((side) => (
        <button key={side} className={css.chip} aria-pressed={!hidden[side]} aria-label={`${side} hemisphere`}
          onClick={() => dispatch({ type: 'setHemisphereVisible', side, visible: hidden[side] }, 'pointer')}>
          {side === 'left' ? 'L' : 'R'}
        </button>
      ))}
      <button className={css.chip} aria-pressed={isolate} disabled={!selected}
        onClick={() => dispatch({ type: 'setIsolate', on: !isolate }, 'pointer')}>Isolate</button>
      <button className={css.chip} onClick={() => dispatch({ type: 'resetView' }, 'pointer')}>Reset</button>
    </div>
  );
}
```
```tsx
// ExplodeSlider.tsx
import { dispatch } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import css from './ExplodeSlider.module.css';

const TICKS = [0, 25, 50, 75, 100];

export function ExplodeSlider() {
  const v = Math.round(useViewer((s) => s.explodeAmount) * 100);
  const set = (p: number) => dispatch({ type: 'setExplosion', value: p / 100 }, 'pointer');
  return (
    <div className={css.card}>
      <div className={css.head}><span>Explode</span><span className={css.mono}>{v}%</span></div>
      <input className={css.range} type="range" min={0} max={100} value={v} aria-label="Explode amount"
        style={{ ['--fill' as string]: `${v}%` }} onChange={(e) => set(Number(e.target.value))} />
      <div className={css.ticks}>
        {TICKS.map((t) => <button key={t} className={v === t ? `${css.tick} ${css.on}` : css.tick} onClick={() => set(t)}>{t}%</button>)}
      </div>
    </div>
  );
}
```
```tsx
// StatusPill.tsx
import { useViewer } from '../actions/store';
import css from './StatusPill.module.css';

export function StatusPill() {
  const mode = useViewer((s) => s.mode);
  const explode = useViewer((s) => s.explodeAmount);
  return (
    <div className={css.pill} role="status">
      <span className={css.dot} />{mode === 'xray' ? 'X-Ray' : 'Solid'} · Explode {Math.round(explode * 100)}%
    </div>
  );
}
```
The range track styles come from `43:1308`/`43:1310`/`43:1311`: a `--nv-primary` filled track via `linear-gradient(var(--nv-primary) var(--fill), var(--nv-muted-bg) var(--fill))`, and a white thumb with the Thumb Pin shadow. The pill is `--nv-surface-warm` with `--nv-radius-pill` and a `--nv-success` dot.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run && npm run build
cd .. && git add frontend/src/learn && git commit -m "feat(learn): structure tree, info panel, toolbar, explode slider from Figma"
```

---

### Task 8: R3F atlas scene: materials, hover, click fly-to, ghost, isolate, X-Ray, explode (ai)

**Files:**
- Create: `frontend/src/viewer/AtlasCanvas.tsx`, `frontend/src/viewer/AtlasCanvas.module.css`

**Interfaces:**
- Consumes:
  - T1: GLB at `ATLAS_GLB_URL`
  - T3: `worldMatrix`
  - T4: `useViewer`, `dispatch`, `viewEvents`
  - T5: `Atlas`, `Structure`, `CORTICAL_GROUPS`, `displayName`, `explodeOffset`, `ATLAS_GLB_URL`
- Produces: `AtlasCanvas({ atlas, colors, onMissing }: { atlas: Atlas; colors: Record<string, string>; onMissing: (ids: string[]) => void })`. It suspends while the GLB loads and throws to the nearest error boundary if the load fails. `onMissing` must be referentially stable (pass a `useState` setter).

**Camera choice:** drei `CameraControls` instead of `OrbitControls`. It does damped orbit, zoom and pan the same way, and `fitToSphere(sphere, true)` is exactly the "fly to frame the bounding sphere, then orbit around it" behaviour in design spec §5.2, with no hand-written tween.

- [ ] **Step 1: Implement**

```tsx
import { CameraControls, Html, useGLTF } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { dispatch, viewEvents } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import { ATLAS_GLB_URL, CORTICAL_GROUPS, displayName, explodeOffset, type Atlas, type Structure } from './anatomy';
import { worldMatrix } from './transform';
import css from './AtlasCanvas.module.css';

interface Props { atlas: Atlas; colors: Record<string, string>; onMissing: (ids: string[]) => void }

const GHOST_OPACITY = 0.15;
const MIN_FRAME_RADIUS_MM = 12; // tiny nuclei: don't fly inside them
// Front-left three-quarter view. Brain front (RAS +y) is scene −z, left (RAS −x) is scene −x.
const HOME: [number, number, number, number, number, number] = [-260, 80, -200, 0, 0, 0];

export function AtlasCanvas(props: Props) {
  const [lost, setLost] = useState(false);
  if (lost) {
    return (
      <div className={css.lost} role="alert">
        The 3D view lost its graphics context.
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
  return (
    <Canvas className={css.canvas} dpr={[1, 2]} camera={{ fov: 40, near: 1, far: 3000, position: [HOME[0], HOME[1], HOME[2]] }}
      onCreated={({ gl }) => gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setLost(true); })}
      onPointerMissed={(e) => { if (e.type === 'click') dispatch({ type: 'selectStructure', id: null }, 'pointer'); }}>
      <ambientLight intensity={0.6} />
      <directionalLight position={[150, 250, 200]} intensity={1.6} />
      <directionalLight position={[-200, -50, -150]} intensity={0.5} />
      <AtlasScene {...props} />
    </Canvas>
  );
}

function AtlasScene({ atlas, colors, onMissing }: Props) {
  const { scene } = useGLTF(ATLAS_GLB_URL);
  const controls = useRef<CameraControls>(null);
  const [hover, setHover] = useState<{ id: string; point: THREE.Vector3 } | null>(null);
  const st = useViewer();
  const world = useMemo(() => worldMatrix(atlas.brain.centroidMm), [atlas]);

  // One material per structure; the GLB's own materials are ignored (SPEC §7.4).
  const nodes = useMemo(() => {
    const byId = new Map<string, { mesh: THREE.Mesh; s: Structure }>();
    const missing: string[] = [];
    for (const s of atlas.structures) {
      const o = scene.getObjectByName(s.id);
      if (!(o instanceof THREE.Mesh)) { missing.push(s.id); continue; }
      o.material = new THREE.MeshStandardMaterial({ color: colors[s.id], roughness: 0.65, metalness: 0 });
      o.userData.structureId = s.id;
      byId.set(s.id, { mesh: o, s });
    }
    if (missing.length) console.warn(`[atlas] ${missing.length} structures have no GLB node:`, missing);
    return { byId, missing };
  }, [scene, atlas, colors]);

  useEffect(() => onMissing(nodes.missing), [nodes, onMissing]);

  // Visibility, ghosting, X-Ray, hover and explode, applied imperatively (no React re-render per mesh).
  useEffect(() => {
    for (const { mesh, s } of nodes.byId.values()) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      const sideHidden = (s.side === 'left' && st.hidden.left) || (s.side === 'right' && st.hidden.right);
      mesh.visible = !st.hiddenStructures[s.id] && !sideHidden && !(st.isolate && st.selectedStructure !== s.id);
      const ghost = st.selectedStructure !== null && st.selectedStructure !== s.id;
      const xray = st.mode === 'xray' && CORTICAL_GROUPS.has(s.group);
      const opacity = Math.min(ghost ? GHOST_OPACITY : 1, xray ? st.brainOpacity : 1);
      if (m.transparent !== opacity < 1) m.needsUpdate = true;
      m.transparent = opacity < 1;
      m.opacity = opacity;
      m.depthWrite = opacity >= 1;
      m.emissive.set(hover?.id === s.id ? colors[s.id] : '#000000');
      m.emissiveIntensity = 0.45;
      const [x, y, z] = explodeOffset(s, st.explodeAmount, atlas.brain.centroidMm);
      mesh.position.set(x, y, z); // RAS mm: the parent group carries R_yup · T_center
    }
  }, [nodes, st, hover, colors, atlas]);

  // Fly to the selected structure's bounding sphere (camera is a view effect, not state).
  useEffect(() => {
    const e = st.selectedStructure ? nodes.byId.get(st.selectedStructure) : undefined;
    if (!e || !controls.current) return;
    e.mesh.updateWorldMatrix(true, false);
    e.mesh.geometry.computeBoundingSphere();
    const sphere = e.mesh.geometry.boundingSphere!.clone().applyMatrix4(e.mesh.matrixWorld);
    sphere.radius = Math.max(sphere.radius, MIN_FRAME_RADIUS_MM);
    void controls.current.fitToSphere(sphere, true);
  }, [st.selectedStructure, nodes]);

  // Home pose + Reset.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    void c.setLookAt(...HOME, false);
    c.saveState();
    const onReset = () => { void c.reset(true); };
    viewEvents.addEventListener('reset', onReset);
    return () => viewEvents.removeEventListener('reset', onReset);
  }, []);

  const pickable = (id: string | undefined): id is string => {
    const e = id ? nodes.byId.get(id) : undefined;
    if (!e || !e.mesh.visible) return false;
    // In X-Ray the see-through cortex must not swallow clicks meant for deep structures.
    return !(st.mode === 'xray' && CORTICAL_GROUPS.has(e.s.group) && st.brainOpacity < 0.5);
  };
  const idOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.object.userData.structureId as string | undefined;

  return (
    <>
      <CameraControls ref={controls} makeDefault smoothTime={0.35} minDistance={20} maxDistance={900} />
      <group matrix={world} matrixAutoUpdate={false}>
        <primitive
          object={scene}
          onPointerMove={(e: ThreeEvent<PointerEvent>) => {
            const id = idOf(e);
            if (!pickable(id)) return; // not stopped → R3F tries the next hit
            e.stopPropagation();
            if (hover?.id !== id) setHover({ id, point: e.point.clone() });
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e: ThreeEvent<PointerEvent>) => {
            if (idOf(e) === hover?.id) { setHover(null); document.body.style.cursor = ''; }
          }}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            const id = idOf(e);
            if (!pickable(id)) return;
            e.stopPropagation();
            dispatch({ type: 'selectStructure', id }, 'pointer');
          }}
          onDoubleClick={(e: ThreeEvent<MouseEvent>) => {
            const id = idOf(e);
            if (!pickable(id)) return;
            e.stopPropagation();
            dispatch({ type: 'selectStructure', id }, 'pointer');
            dispatch({ type: 'setIsolate', on: !useViewer.getState().isolate }, 'pointer');
          }}
        />
      </group>
      {hover && nodes.byId.has(hover.id) && (
        <Html position={hover.point} center style={{ pointerEvents: 'none' }}>
          <div className={css.tooltip}>{displayName(nodes.byId.get(hover.id)!.s)}</div>
        </Html>
      )}
    </>
  );
}

useGLTF.preload(ATLAS_GLB_URL);
```
`AtlasCanvas.module.css`:
```css
.canvas { position: absolute; inset: 0; }
.tooltip {
  transform: translateY(-18px); white-space: nowrap; padding: 4px 10px; font: 600 12px var(--nv-font);
  color: var(--nv-text); background: var(--nv-surface-warm); border: 1px solid var(--nv-border);
  border-radius: var(--nv-radius-pill); box-shadow: var(--nv-shadow);
}
.lost { position: absolute; inset: 0; display: grid; place-content: center; gap: 12px; text-align: center; color: var(--nv-text-2); }
.lost button { padding: 8px 16px; border: 0; border-radius: var(--nv-radius-control); background: var(--nv-primary); color: #fff; }
```

- [ ] **Step 2: Verify in isolation**

Temporarily mount it in `Learn.tsx` locally with `loadAtlas()`; do not commit that change. Run `npm run dev` and check:
1. The brain is centred and upright (superior = scene +y). The home view is front-left three-quarter: the frontal lobe faces the camera, and the left hemisphere is nearest. If you see the back of the head or the brain lies on its side, `worldMatrix` is wrong. Stop and tell qa.
2. Hover shows the name.
3. Click flies to the structure.
4. The explode slider has no effect yet (no UI); test it from the console: `window.__d = (await import('/src/actions/dispatch.ts')).dispatch; __d({type:'setExplosion',value:1},'pointer')`.

Then run `npx vitest run && npm run build`.

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/src/viewer/AtlasCanvas.tsx frontend/src/viewer/AtlasCanvas.module.css
git commit -m "feat(viewer): atlas scene with hover, fly-to, ghost, isolate, X-Ray, explode"
```

---

### Task 9: Assemble `/learn` with error states (fe)

**Files:**
- Modify: `frontend/src/routes/Learn.tsx` (replace the T2 placeholder)
- Create: `frontend/src/routes/Learn.module.css`

**Interfaces:**
- Consumes:
  - T4: `initCase`
  - T5: `loadAtlas`, `structureColors`, `ATLAS_GLB_URL`, `Atlas`
  - T7: `StructureTree`, `InfoPanel`, `LearnToolbar`, `ExplodeSlider`, `StatusPill`
  - T8: `AtlasCanvas`
  - T2: `TopNavBar`, `Footer`

- [ ] **Step 1: Implement**

```tsx
import { useGLTF } from '@react-three/drei';
import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { initCase } from '../actions/dispatch';
import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';
import { ExplodeSlider } from '../learn/ExplodeSlider';
import { InfoPanel } from '../learn/InfoPanel';
import { LearnToolbar } from '../learn/LearnToolbar';
import { StatusPill } from '../learn/StatusPill';
import { StructureTree } from '../learn/StructureTree';
import { ATLAS_GLB_URL, loadAtlas, structureColors, type Atlas } from '../viewer/anatomy';
import { AtlasCanvas } from '../viewer/AtlasCanvas';
import css from './Learn.module.css';

class LoadBoundary extends Component<{ onRetry: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <LoadError onRetry={() => { useGLTF.clear(ATLAS_GLB_URL); this.setState({ failed: false }); this.props.onRetry(); }} />;
  }
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={css.error} role="alert">
      <p>Atlas failed to load.</p>
      <button className={css.retry} onClick={onRetry}>Retry</button>
    </div>
  );
}

export default function Learn() {
  const [atlas, setAtlas] = useState<Atlas | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [missing, setMissing] = useState<string[]>([]);

  useEffect(() => {
    let live = true;
    setFailed(false);
    loadAtlas().then((a) => {
      if (!live) return;
      initCase({ jobId: 'atlas', hasTumor: false, structureIds: new Set(a.structures.map((s) => s.id)), bboxMm: a.brain.bboxMm });
      setAtlas(a);
    }).catch((e: unknown) => { console.error(e); if (live) setFailed(true); });
    return () => { live = false; };
  }, [attempt]);

  const colors = useMemo(() => (atlas ? structureColors(atlas.structures) : {}), [atlas]);
  const missingSet = useMemo(() => new Set(missing), [missing]);
  const retry = () => setAttempt((n) => n + 1);

  return (
    <div className={css.page}>
      <TopNavBar active="learn" />
      <main className={css.grid}>
        {atlas ? <StructureTree atlas={atlas} colors={colors} missing={missingSet} /> : <aside className={css.side} />}
        <section className={css.stage} aria-label="3D brain">
          {failed && <LoadError onRetry={retry} />}
          {!failed && !atlas && <p className={css.loading}>Loading atlas…</p>}
          {atlas && (
            <LoadBoundary onRetry={retry}>
              <Suspense fallback={<p className={css.loading}>Loading 3D brain…</p>}>
                <AtlasCanvas atlas={atlas} colors={colors} onMissing={setMissing} />
              </Suspense>
            </LoadBoundary>
          )}
          <div className={css.top}><StatusPill /></div>
          <div className={css.bottom}><ExplodeSlider /><LearnToolbar /></div>
        </section>
        {atlas ? <InfoPanel atlas={atlas} colors={colors} /> : <aside className={css.side} />}
      </main>
      <Footer />
    </div>
  );
}
```
`Learn.module.css` (frame 04 grid; measure the column widths against `04-explore.png` and adjust):
```css
.page { display: flex; flex-direction: column; height: 100vh; }
.grid { flex: 1; min-height: 0; display: grid; grid-template-columns: 300px 1fr 340px; gap: 16px; padding: 16px; }
.side { border-radius: var(--nv-radius-card); background: var(--nv-surface); }
.stage { position: relative; min-height: 0; border-radius: var(--nv-radius-card); background: var(--nv-canvas-bg); overflow: hidden; }
.top { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); pointer-events: none; }
.bottom { position: absolute; left: 16px; right: 16px; bottom: 16px; display: flex; flex-direction: column; align-items: center; gap: 10px; pointer-events: none; }
.bottom > * { pointer-events: auto; }
.loading, .error { position: absolute; inset: 0; display: grid; place-content: center; text-align: center; color: var(--nv-text-3); }
.retry { margin-top: 8px; padding: 8px 16px; border: 0; border-radius: var(--nv-radius-control); background: var(--nv-primary); color: #fff; }
@media (max-width: 1100px) { .grid { grid-template-columns: 1fr; grid-auto-rows: minmax(320px, auto); } }
```

- [ ] **Step 2: Verify the failure paths**

1. Rename `public/atlas/structures.json` locally → reload `/learn` → "Atlas failed to load" + Retry. Restore the file → Retry → it loads.
2. Repeat with `brain_atlas.glb`.
3. Run `npx vitest run && npm run build` (green).

- [ ] **Step 3: Commit**

```bash
cd .. && git add frontend/src/routes/Learn.tsx frontend/src/routes/Learn.module.css
git commit -m "feat(learn): assemble /learn with load/retry and missing-node handling"
```

---

### Task 10: Browser verification (qa)

**Files:**
- Create: `docs/qa/2026-10-23-learn/README.md` (checklist with PASS/FAIL per line)
- Create: `docs/qa/2026-10-23-learn/*.png` (screenshots)

- [ ] **Step 1: Run every automated check**

```bash
cd /Users/kaydee/Developer/CalHacks13.0
uv run backend/atlas/build_atlas.py --selftest
cd frontend && npx vitest run && npm run build && npx tsc -b
```
Expected: `selftest ok`; all vitest suites pass (transform 4, dispatch 12, anatomy 7, atlasData 5, filter 4); build OK.

- [ ] **Step 2: Manual run in Chrome** (`npm run dev`, open `http://localhost:5173/learn`). Use the claude-in-chrome tools. Record a GIF named `learn_walkthrough.gif`. Check every line:
1. The brain loads within 3 s; the console has no errors and no `[atlas] … no GLB node` warning.
2. Hovering a gyrus shows its name with an emissive highlight; the cursor becomes a pointer.
3. Clicking `Superior Frontal (L)` makes the camera fly (~0.8 s), others ghost to ~15%, and the info panel shows name, chips, volume, text, neighbours and "Educational · unreviewed".
4. Dragging orbits around the selected structure.
5. Clicking a neighbour chip flies to the neighbour.
6. Clicking empty space deselects and un-ghosts; the camera stays put.
7. Double-click a structure → isolate. The Isolate button toggles; it is disabled with no selection.
8. X-Ray shows the cortex at 30% with deep nuclei, hippocampus and ventricles visible and clickable. The opacity slider changes the cortex only.
9. Explode 0 → 40% splits the hemispheres (midline stays); → 100% pushes structures radially; the cerebellum moves down. Back to 0 → everything returns to its original place.
10. The L / R chips hide each hemisphere; midline structures stay.
11. The tree search "hippo" filters to the hippocampus rows; the eye toggle hides one mesh.
12. Reset restores Solid, explode 0, opacity 30%, no selection, all visible, and the camera returns home.
13. `/`, `/jobs/x/processing`, `/jobs/x/results`, `/jobs/x/explore` render; `/` shows "Backend offline — start docker compose up".
14. The layout matches `docs/figma/04-explore.png`: header, three columns, canvas gradient, pill, slider, toolbar, footer. Note any visual diffs as FAIL lines with a screenshot.
15. Frame rate: orbiting at explode 100% in X-Ray stays smooth (Chrome performance overlay ≥ 50 fps on the M-series laptop).

- [ ] **Step 3: Report**

Write `docs/qa/2026-10-23-learn/README.md` with each line, PASS/FAIL, a screenshot name, and file:line for each FAIL. Commit only that folder:
```bash
git add docs/qa/2026-10-23-learn && git commit -m "test(qa): /learn browser verification"
hc send lead "T10 done at <sha>: <n> PASS / <m> FAIL (see docs/qa/2026-10-23-learn/README.md)"
```

---

### Task 11: SPEC update + PR (lead)

**Files:**
- Modify: `docs/SPEC.md` §7.2 (add `selectedStructure`, `isolate`, `hiddenStructures`), §7.3 (add `selectStructure`, `setStructureVisible`, `setIsolate`), §3 (add the `/learn` route), §14 (Decision Log line)

- [ ] **Step 1: Edit the SPEC.** Copy the types verbatim from `frontend/src/actions/types.ts`. Decision Log line:
```
- 2026-10-23 · h? · Learning Mode `/learn`: CerebrA atlas (CC0, template space, never mixed into patient space so D6 holds); ViewerState + selectedStructure/isolate/hiddenStructures; actions selectStructure/setStructureVisible/setIsolate · S4 delivered as a standalone page; same dispatch door for gestures/Jarvis later · #<PR>
```
- [ ] **Step 2: Gate.** Every task has a qa PASS, T10 has no FAIL lines left open, and `npx vitest run && npm run build` passes on a clean `npm ci`.
- [ ] **Step 3: Ask the user** before pushing or opening the PR (it is outward-facing). Show the user a draft heads-up to Ben (the B4 owner) about the store extension. Then:
```bash
git push -u origin viewer/anatomy-explorer-30
gh pr create --base main --title "Learning Mode /learn + frontend foundation (A3, A4, B4, L1, S4)" --body "<summary; Closes #30 and the A3/A4/B4 issue numbers from gh issue list>"
```
