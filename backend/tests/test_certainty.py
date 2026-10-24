"""Certainty describes probabilities within cleaned outlines, never disease risk."""
import json
from pathlib import Path

import nibabel as nib
import numpy as np
import pytest

from src import pipeline


@pytest.fixture
def regions(monkeypatch):
    # Certainty and label-map tests do not need to regenerate meshes.
    monkeypatch.setattr(pipeline, "build_glb", lambda *args: None)
    brain = np.ones((40, 40, 40), dtype=bool)
    wt = np.zeros_like(brain)
    wt[5:15, 10:20, 10:20] = True
    wt[25:29, 25:29, 25:29] = True  # 64-voxel speck removed by cleanup
    tc = np.zeros_like(brain)
    tc[7:13, 12:18, 12:18] = True
    tc[25:29, 25:29, 25:29] = True  # excluded when WT speck is removed
    et = np.zeros_like(brain)
    et[9:11, 14:16, 14:16] = True
    et[5:7, 10:14, 10:14] = True  # inside WT, outside TC: nesting excludes it
    probs = np.stack([np.where(mask, value, 0.1) for mask, value in
                      ((tc, 0.75), (wt, 0.8), (et, 0.95))])
    probs[0:2, 25:29, 25:29, 25:29] = 0.51
    probs[2, 5:7, 10:14, 10:14] = 0.51
    return brain, wt, tc, et, probs


def test_certainty_uses_cleaned_regions_and_preserves_outputs(tmp_path, regions):
    brain, wt, tc, et, probs = regions
    baseline_dir, model_dir = tmp_path / "baseline", tmp_path / "model"
    baseline_dir.mkdir()
    model_dir.mkdir()
    baseline = pipeline.build_outputs(baseline_dir, brain, wt, tc, et, np.eye(4), (1, 1, 1))
    report = pipeline.build_outputs(model_dir, brain, wt, tc, et, np.eye(4), (1, 1, 1), probs=probs)
    assert report["certainty"] == {"whole": 0.8, "core": 0.75, "enhancing": 0.95}
    assert all(0.5 <= value <= 1 for value in report["certainty"].values())
    assert report["certainty"]["whole"] != round(float(probs[1][wt].mean()), 2)
    assert report["certainty"]["core"] != round(float(probs[0][tc].mean()), 2)
    assert report["certainty"]["enhancing"] != round(float(probs[2][et].mean()), 2)
    assert baseline["certainty"] is None
    assert report["volumesCm3"] == baseline["volumesCm3"]
    np.testing.assert_array_equal(nib.load(baseline_dir / "seg.nii.gz").dataobj,
                                  nib.load(model_dir / "seg.nii.gz").dataobj)
    assert json.loads((model_dir / "report.json").read_text()) == report


@pytest.mark.parametrize("empty_regions", [("et",), ("tc", "et"), ("wt", "tc", "et")])
def test_empty_regions_are_null(tmp_path, regions, empty_regions):
    brain, wt, tc, et, probs = regions
    masks = {"wt": wt, "tc": tc, "et": et}
    for key in empty_regions:
        masks[key] = np.zeros_like(brain)
    report = pipeline.build_outputs(tmp_path, brain, **masks, affine=np.eye(4), zooms=(1, 1, 1), probs=probs)
    for name, key in (("whole", "wt"), ("core", "tc"), ("enhancing", "et")):
        if key in empty_regions:
            assert report["certainty"][name] is None
        else:
            assert 0.5 <= report["certainty"][name] <= 1


@pytest.mark.parametrize("with_probs", [False, True])
def test_expert_certainty_is_null(tmp_path, regions, with_probs):
    brain, wt, tc, et, probs = regions
    report = pipeline.build_outputs(tmp_path, brain, wt, tc, et, np.eye(4), (1, 1, 1),
                                    source="expert", probs=probs if with_probs else None)
    assert report["certainty"] is None


def test_certainty_rounds_to_two_decimals(tmp_path, regions):
    brain, wt, tc, et, probs = regions
    probs[:] = 0.8765
    report = pipeline.build_outputs(tmp_path, brain, wt, tc, et, np.eye(4), (1, 1, 1), probs=probs)
    assert report["certainty"] == dict.fromkeys(("whole", "core", "enhancing"), 0.88)


def test_predict_returns_sigmoid_probs_and_unchanged_threshold(tmp_path, monkeypatch):
    import torch
    from src import predict

    paths = []
    for name in predict.SEQUENCE_ORDER:
        path = tmp_path / f"{name}.nii.gz"
        nib.save(nib.Nifti1Image(np.ones((4, 4, 4), dtype=np.float32), np.eye(4)), path)
        paths.append(path)
    logits = torch.linspace(-3, 3, 3 * 4**3).reshape(1, 3, 4, 4, 4)
    logits[0, 0, 0, 0, 0] = 0  # Exactly 0.5 is excluded, preserving strict >.
    monkeypatch.setattr(predict, "get_net", lambda: object())
    monkeypatch.setattr(predict, "sliding_window_inference", lambda *args, **kwargs: logits)
    result = predict.predict(paths)
    expected_probs = torch.sigmoid(logits)[0].numpy()
    np.testing.assert_array_equal(result["probs"], expected_probs)
    assert np.all((result["probs"] >= 0) & (result["probs"] <= 1))
    legacy_masks = (torch.sigmoid(logits)[0] > 0.5).numpy()
    for channel, key in enumerate(("tc", "wt", "et")):
        np.testing.assert_array_equal(result[key], legacy_masks[channel])
        assert result[key].dtype == np.bool_
    assert not result["tc"][0, 0, 0]


@pytest.mark.parametrize("name", ["sample", "sample-2"])
def test_model_seeds_include_certainty_and_expert_dice(name):
    path = Path(__file__).resolve().parents[1] / "seed" / name / "report.json"
    report = json.loads(path.read_text())
    assert report["segmentationSource"] == "model"
    assert set(report["certainty"]) == {"whole", "core", "enhancing"}
    assert all(0.5 <= value <= 1 for value in report["certainty"].values())
    assert set(report["expertDice"]) == {"whole", "core", "enhancing"}
