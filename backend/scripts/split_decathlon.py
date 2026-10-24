"""Split a Decathlon Task01 4D case into the 4 files the bundle expects.

Usage: uv run python scripts/split_decathlon.py <case.nii.gz> <out_dir>

Writes t1c/t1/t2/flair.nii.gz (bundle order, see brats_mri_segmentation/configs/metadata.json
channel_def) using the same affine. Modality indices are read from the dataset's dataset.json.
"""
import json
import sys
from pathlib import Path

import nibabel as nib

BUNDLE_ORDER = ("t1c", "t1", "t2", "flair")
# dataset.json modality name (lowercased) → output name
NAMES = {"t1gd": "t1c", "t1w": "t1", "t2w": "t2", "flair": "flair"}


def find_dataset_json(case: Path) -> Path:
    for d in case.resolve().parents:
        if (d / "dataset.json").exists():
            return d / "dataset.json"
    raise FileNotFoundError("dataset.json not found in any parent of " + str(case))


def split(case, out_dir):
    case, out_dir = Path(case), Path(out_dir)
    modality = json.loads(find_dataset_json(case).read_text())["modality"]
    img = nib.load(case)
    data = img.dataobj
    if len(img.shape) != 4 or img.shape[3] != len(modality):
        raise ValueError(f"expected 4D with {len(modality)} channels, got {img.shape}")
    out_dir.mkdir(parents=True, exist_ok=True)
    out = {}
    for idx, name in modality.items():
        key = NAMES[name.lower()]
        vol = nib.Nifti1Image(data[..., int(idx)], img.affine, img.header)
        nib.save(vol, out_dir / f"{key}.nii.gz")
        out[key] = out_dir / f"{key}.nii.gz"
    return {k: out[k] for k in BUNDLE_ORDER}


if __name__ == "__main__":
    print(*split(sys.argv[1], sys.argv[2]).values(), sep="\n")
