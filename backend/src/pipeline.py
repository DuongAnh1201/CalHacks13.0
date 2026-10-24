"""Inference and reusable contract outputs in the input's RAS millimetres."""
import json
from pathlib import Path

import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage

from src.mask_to_mesh import to_mesh

MIN_VOXELS = 100
SEQUENCES = ("t1c", "t1", "t2", "flair")
COLORS = {
    "brain_left": [217, 212, 207, 255],
    "brain_right": [217, 212, 207, 255],
    "edema": [242, 201, 76, 255],
    "core": [242, 153, 74, 255],
    "enhancing": [235, 87, 87, 255],
}


def remove_small_blobs(mask, min_voxels=MIN_VOXELS):
    labeled, _ = ndimage.label(mask)
    sizes = np.bincount(labeled.ravel())
    keep = sizes >= min_voxels
    keep[0] = False
    return keep[labeled]


def clean_brain(brain):
    brain = ndimage.binary_fill_holes(brain)
    labeled, count = ndimage.label(brain)
    if not count:
        raise ValueError("Brain mask is empty")
    sizes = np.bincount(labeled.ravel())
    sizes[0] = 0
    return labeled == sizes.argmax()


def coordinates(mask, affine):
    return nib.affines.apply_affine(affine, np.argwhere(mask))


def spatial_summary(points):
    if not len(points):
        return {"centroidMm": None, "bboxMm": None}
    return {
        "centroidMm": points.mean(axis=0).round(1).tolist(),
        "bboxMm": {"min": points.min(axis=0).round(1).tolist(), "max": points.max(axis=0).round(1).tolist()},
    }


def save_label_map(wt, tc, et, affine, path):
    seg = np.zeros(wt.shape, dtype=np.uint8)
    seg[wt] = 1
    seg[tc] = 2
    seg[et] = 3
    nib.save(nib.Nifti1Image(seg, affine), path)


def build_glb(brain, wt, tc, et, affine, path):
    midline = coordinates(brain, affine)[:, 0].mean()
    # Broadcast all affine terms: oblique and mirrored inputs need the full x row.
    i, j, k = np.ogrid[tuple(slice(0, size) for size in brain.shape)]
    x = affine[0, 0] * i + affine[0, 1] * j + affine[0, 2] * k + affine[0, 3]
    layers = {"brain_left": brain & (x < midline),
              "brain_right": brain & (x >= midline),
              "edema": wt, "core": tc, "enhancing": et}
    scene = trimesh.Scene()
    for name, mask in layers.items():
        is_brain = name.startswith("brain_")
        mesh = to_mesh(mask, affine, COLORS[name], step_size=2 if is_brain else 1,
                       max_faces=150_000 if is_brain else 50_000)
        if mesh is not None:
            scene.add_geometry(mesh, node_name=name, geom_name=name, transform=np.eye(4))
    scene.export(str(path))
    if Path(path).stat().st_size > 15_000_000:
        raise ValueError("model.glb exceeds the 15 MB budget")


def build_report(brain, wt, tc, et, affine, zooms, job_id, source="model"):
    metadata_path = Path(__file__).resolve().parents[1] / "brats_mri_segmentation/configs/metadata.json"
    metadata = json.loads(metadata_path.read_text())
    brain_points = coordinates(brain, affine)
    points = coordinates(wt, affine)
    side = None
    if len(points):
        left_fraction = np.mean(points[:, 0] < brain_points[:, 0].mean())
        side = "bilateral" if 0.2 <= left_fraction <= 0.8 else ("left" if left_fraction > 0.5 else "right")
    labeled, _ = ndimage.label(wt)
    sizes = np.bincount(labeled.ravel())[1:]
    voxel_cm3 = float(abs(np.linalg.det(affine[:3, :3]))) / 1000
    return {
        "jobId": job_id, "coordinateFrame": "RAS_mm",
        "model": {"name": metadata["name"], "arch": metadata.get("arch", "SegResNet"),
                  "version": metadata["version"]},
        "segmentationSource": source, "tumorDetected": bool(wt.any()), "side": side,
        "lesionCount": int(np.count_nonzero(sizes >= MIN_VOXELS)),
        **spatial_summary(points),
        "volumesCm3": {name: round(float(mask.sum()) * voxel_cm3, 2) for name, mask in
                       (("whole", wt), ("core", tc), ("enhancing", et))},
        "brain": spatial_summary(brain_points),
        "input": {"shape": list(brain.shape), "spacingMm": [float(z) for z in zooms],
                  "sequences": list(SEQUENCES)},
    }


def build_outputs(job_dir, brain, wt, tc, et, affine, zooms, source="model"):
    """Build the same artifacts for model predictions or expert segmentations."""
    job_dir = Path(job_dir)
    brain = clean_brain(brain)
    wt = remove_small_blobs(np.asarray(wt, dtype=bool))
    tc = np.asarray(tc, dtype=bool) & wt
    et = np.asarray(et, dtype=bool) & tc
    save_label_map(wt, tc, et, affine, job_dir / "seg.nii.gz")
    build_glb(brain, wt, tc, et, affine, job_dir / "model.glb")
    report = build_report(brain, wt, tc, et, affine, zooms, job_dir.name, source)
    (job_dir / "report.json").write_text(json.dumps(report, indent=2))
    return report


def run(job_dir, on_stage=None):
    from src.predict import predict

    job_dir = Path(job_dir)
    if on_stage:
        on_stage("inferring")
    result = predict([job_dir / f"{s}.nii.gz" for s in SEQUENCES])
    if on_stage:
        on_stage("meshing")
    return build_outputs(job_dir, **result)


if __name__ == "__main__":
    import sys
    print(json.dumps(run(Path(sys.argv[1])), indent=2))
