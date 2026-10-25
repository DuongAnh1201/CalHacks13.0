"""Build the study library: many finished cases students can open without uploading.

Usage (from backend/):
  uv run python scripts/build_library.py <Task01_BrainTumour> [--count 25] [--out seed]

Picks a varied set of Decathlon Task01 cases (left / right / both hemispheres; small to large
tumors), then seeds each one with make_sample --expert: the expert mask is meshed, no model
run, so a case takes seconds instead of minutes. Writes <out>/lib-NN/ plus meta.json
{"title", "blurb"} for GET /library. BRATS_001 and BRATS_002 are skipped: they are the
existing sample jobs.

Dataset: Medical Segmentation Decathlon Task01, CC-BY-SA 4.0 (see seed/README.md).
"""
import argparse
import json
import shutil
import sys
import tempfile
from itertools import zip_longest
from pathlib import Path

import nibabel as nib
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # import scripts.* / src.* from anywhere

from scripts.make_sample import make_sample
from scripts.split_decathlon import split

SKIP = {"BRATS_001", "BRATS_002"}   # already seeded as sample / sample-2


def describe(label_path):
    """Approximate hemisphere and whole-tumor volume (cm³) straight from the expert label."""
    img = nib.load(label_path)
    wt = np.asarray(img.dataobj) > 0
    voxel_cm3 = float(np.prod(img.header.get_zooms()[:3])) / 1000
    xs = np.nonzero(wt)[0]
    # Rough version of pipeline.py's rule (voxel midline, not RAS): only used to vary the pick.
    # The card text uses the report's own side.
    left = float((xs < wt.shape[0] / 2).mean()) if xs.size else 0.5
    side = "bilateral" if 0.2 <= left <= 0.8 else ("left" if left > 0.5 else "right")
    return side, round(wt.sum() * voxel_cm3, 1)


def pick(task_dir):
    """Every case, ordered round-robin over (side, size tercile) buckets so any prefix is varied."""
    cases = []
    for label in sorted((task_dir / "labelsTr").glob("BRATS_*.nii.gz")):
        name = label.name.removesuffix(".nii.gz")
        if name not in SKIP and not name.startswith("._"):
            cases.append((name, *describe(label)))
    vols = np.array([c[2] for c in cases])
    cuts = np.quantile(vols, [1 / 3, 2 / 3])
    buckets = {}
    for c in cases:
        buckets.setdefault((c[1], int(np.searchsorted(cuts, c[2]))), []).append(c)
    order = [c for row in zip_longest(*buckets.values()) for c in row if c]
    return order


def size_word(cm3):
    return "small" if cm3 < 30 else "large" if cm3 > 90 else "medium"


SIDE = {"left": "Left hemisphere", "right": "Right hemisphere", "bilateral": "Both hemispheres"}


def build(task_dir, count, out):
    task_dir, out = Path(task_dir), Path(out)
    n = 0
    for name, _, _ in pick(task_dir):
        if n == count:
            break
        job_id = f"lib-{n + 1:02d}"
        with tempfile.TemporaryDirectory() as tmp:
            split(task_dir / "imagesTr" / f"{name}.nii.gz", tmp)
            shutil.copy(task_dir / "labelsTr" / f"{name}.nii.gz", Path(tmp) / "expert_label.nii.gz")
            try:
                report = make_sample(tmp, job_id, expert=True, out=out)
            except ValueError as exc:   # a pipeline guard, e.g. the mesh triangle or 15 MB budget: take the next case
                shutil.rmtree(out / job_id, ignore_errors=True)
                print(f"skip {name}: {exc}", flush=True)
                continue
        n += 1
        whole = report["volumesCm3"]["whole"]
        lesions = report["lesionCount"]
        meta = {
            "title": f"Glioma {n:02d}",
            "blurb": f"{SIDE.get(report['side'], 'No tumor')} · {size_word(whole)} ({whole:.0f} cm³) · "
                     f"{lesions} lesion{'' if lesions == 1 else 's'} · {name}",
        }
        (out / job_id / "meta.json").write_text(json.dumps(meta, indent=2))
        print(job_id, meta["blurb"], flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("task_dir", help="extracted Task01_BrainTumour folder (holds dataset.json, imagesTr, labelsTr)")
    parser.add_argument("--count", type=int, default=25)
    parser.add_argument("--out", default="seed", type=Path)
    args = parser.parse_args()
    build(args.task_dir, args.count, args.out)
