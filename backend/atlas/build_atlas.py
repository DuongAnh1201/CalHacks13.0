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
