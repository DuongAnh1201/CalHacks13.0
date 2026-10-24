import json

import nibabel as nib
import numpy as np
import pytest
import trimesh

from src.pipeline import build_outputs, build_report, clean_brain


@pytest.fixture
def masks():
    brain = np.zeros((40, 40, 40), dtype=bool)
    brain[2:38, 2:38, 2:38] = True
    wt = np.zeros_like(brain)
    wt[5:15, 10:20, 10:20] = True
    tc = np.zeros_like(brain)
    tc[7:13, 12:18, 12:18] = True
    et = np.zeros_like(brain)
    et[9:11, 14:16, 14:16] = True
    return brain, wt, tc, et


def test_artifact_contract(tmp_path, masks):
    affine = np.diag([-2., 3., 4., 1.])
    report = build_outputs(tmp_path, *masks, affine, (2, 3, 4), source="expert")
    scene = trimesh.load(tmp_path / "model.glb", force="scene")
    assert set(scene.graph.nodes_geometry) == {"brain_left", "brain_right", "edema", "core", "enhancing"}
    for name in scene.graph.nodes_geometry:
        transform, geometry = scene.graph[name]
        np.testing.assert_array_equal(transform, np.eye(4))
        mesh = scene.geometry[geometry]
        assert mesh.is_watertight
        assert len(mesh.faces) <= (150_000 if name.startswith("brain") else 50_000)
    seg = nib.load(tmp_path / "seg.nii.gz")
    assert seg.get_data_dtype() == np.uint8
    assert set(np.unique(seg.get_fdata())) == {0, 1, 2, 3}
    np.testing.assert_array_equal(seg.affine, affine)
    assert report["volumesCm3"]["whole"] == pytest.approx(24)
    assert report["volumesCm3"]["core"] == 5.18
    assert report["centroidMm"] == [-19.0, 43.5, 58.0]
    assert report["bboxMm"] == {"min": [-28., 30., 40.], "max": [-10., 57., 76.]}
    assert report["side"] == "right"
    assert report["lesionCount"] == 1
    assert report["segmentationSource"] == "expert"
    assert set(report) == {"jobId", "coordinateFrame", "model", "segmentationSource", "tumorDetected", "side", "lesionCount", "centroidMm", "bboxMm", "volumesCm3", "brain", "input"}
    assert json.loads((tmp_path / "report.json").read_text()) == report


def test_empty_tumor(tmp_path, masks):
    brain = masks[0]
    empty = np.zeros_like(brain)
    report = build_outputs(tmp_path, brain, empty, empty, empty, np.eye(4), (1, 1, 1))
    scene = trimesh.load(tmp_path / "model.glb", force="scene")
    assert set(scene.graph.nodes_geometry) == {"brain_left", "brain_right"}
    assert report["tumorDetected"] is False
    assert report["side"] is report["centroidMm"] is report["bboxMm"] is None
    assert report["lesionCount"] == 0


@pytest.mark.parametrize("start,stop,side", [(3, 13, "left"), (26, 36, "right"), (15, 25, "bilateral"), (17, 27, "bilateral")])
def test_side(masks, start, stop, side):
    brain = masks[0]
    wt = np.zeros_like(brain)
    wt[start:stop, 10:20, 10:20] = True
    report = build_report(brain, wt, wt, wt, np.eye(4), (1, 1, 1), "test")
    assert report["side"] == side


def test_oblique_bounds_and_split(tmp_path, masks):
    affine = np.array([[-1., 2., .5, 100], [1., -1., 0., 10], [0., .5, 2., -20], [0., 0., 0., 1.]])
    report = build_outputs(tmp_path, *masks, affine, (1, 1, 1))
    points = nib.affines.apply_affine(affine, np.argwhere(masks[1]))
    np.testing.assert_allclose(report["bboxMm"]["min"], points.min(axis=0))
    np.testing.assert_allclose(report["bboxMm"]["max"], points.max(axis=0))
    scene = trimesh.load(tmp_path / "model.glb", force="scene")
    midline = nib.affines.apply_affine(affine, np.argwhere(masks[0]))[:, 0].mean()
    assert scene.geometry["brain_left"].centroid[0] < midline
    assert scene.geometry["brain_right"].centroid[0] > midline


def test_clean_brain_fills_holes_and_keeps_largest(masks):
    brain = masks[0].copy()
    brain[10:15, 10:15, 10:15] = False
    brain[0, 0, 0] = True
    result = clean_brain(brain)
    np.testing.assert_array_equal(result, masks[0])


def test_run_stage_callbacks(tmp_path, masks, monkeypatch):
    import sys
    import types
    from src import pipeline

    stages = []

    def fake_predict(paths):
        assert stages == ["inferring"]
        assert [path.name for path in paths] == ["t1c.nii.gz", "t1.nii.gz", "t2.nii.gz", "flair.nii.gz"]
        return dict(zip(("brain", "wt", "tc", "et"), masks), affine=np.eye(4), zooms=(1, 1, 1))

    monkeypatch.setitem(sys.modules, "src.predict", types.SimpleNamespace(predict=fake_predict))
    report = pipeline.run(tmp_path, on_stage=stages.append)
    assert stages == ["inferring", "meshing"]
    assert report["jobId"] == tmp_path.name


def test_decimation_budget(masks):
    from src.mask_to_mesh import to_mesh

    mesh = to_mesh(masks[0], np.eye(4), [217, 212, 207, 255], step_size=2, max_faces=100)
    assert len(mesh.faces) <= 100
    assert mesh.is_watertight
