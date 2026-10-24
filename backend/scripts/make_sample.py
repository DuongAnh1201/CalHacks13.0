"""Seed a finished demo job from a split case, so it works with no upload and no inference.

Usage (from backend/):
  uv run python scripts/make_sample.py <case_dir> <job_id> [--expert] [--out seed]

<case_dir> holds t1c/t1/t2/flair.nii.gz in bundle order (see scripts/split_decathlon.py) and
expert_label.nii.gz (Decathlon Task01 labels: 1 edema, 2 non-enhancing, 3 enhancing).

Model mode runs SegResNet, then adds "expertDice" (model vs expert mask) to report.json.
--expert skips the model and meshes the expert mask instead (segmentationSource "expert").
Writes <out>/<job_id>/: model.glb, report.json, seg.nii.gz, flair.nii.gz, status.json.
"""
import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import nibabel as nib
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))   # import src.* when run from anywhere

from src.pipeline import SEQUENCES, build_outputs


def expert_regions(label):
    """Decathlon labels → nested WT ⊇ TC ⊇ ET."""
    return {"wt": label > 0, "tc": np.isin(label, (2, 3)), "et": label == 3}


def dice(a, b):
    total = a.sum() + b.sum()
    return 1.0 if total == 0 else round(float(2 * (a & b).sum() / total), 3)


def make_sample(case_dir, job_id, expert=False, out=Path("seed")):
    case_dir, job_dir = Path(case_dir), Path(out) / job_id
    paths = [case_dir / f"{s}.nii.gz" for s in SEQUENCES]
    ref = nib.load(paths[0])
    label_img = nib.load(case_dir / "expert_label.nii.gz")
    if label_img.shape != ref.shape or not np.allclose(label_img.affine, ref.affine, atol=1e-3):
        raise ValueError("expert_label.nii.gz must share the sequences' shape and affine")
    truth = expert_regions(np.asarray(label_img.dataobj).astype(np.uint8))

    if job_dir.exists():
        shutil.rmtree(job_dir)
    job_dir.mkdir(parents=True)

    if expert:
        brain = np.asarray(nib.load(case_dir / "flair.nii.gz").dataobj) != 0   # same rule as predict()
        report = build_outputs(job_dir, brain, truth["wt"], truth["tc"], truth["et"],
                               ref.affine, ref.header.get_zooms()[:3], source="expert")
    else:
        from src.predict import predict
        result = predict(paths)
        report = build_outputs(job_dir, **result, source="model")
        report["expertDice"] = {name: dice(result[key], truth[key]) for name, key in
                                (("whole", "wt"), ("core", "tc"), ("enhancing", "et"))}
        (job_dir / "report.json").write_text(json.dumps(report, indent=2))

    shutil.copy(case_dir / "flair.nii.gz", job_dir / "flair.nii.gz")
    created = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    (job_dir / "status.json").write_text(json.dumps(
        {"jobId": job_id, "status": "done", "stage": None, "error": None, "createdAt": created}))
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("case_dir")
    parser.add_argument("job_id")
    parser.add_argument("--expert", action="store_true", help="mesh the expert mask instead of running the model")
    parser.add_argument("--out", default="seed", type=Path, help="seed root (default: seed)")
    args = parser.parse_args()
    print(json.dumps(make_sample(args.case_dir, args.job_id, args.expert, args.out), indent=2))
