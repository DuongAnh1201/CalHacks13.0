from datetime import datetime
from unittest.mock import Mock

import nibabel as nib
import numpy as np
import pytest
from fastapi.testclient import TestClient
from src import api


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(api, "JOBS", tmp_path / "jobs")
    monkeypatch.setattr(api, "SEED", tmp_path / "seed")
    monkeypatch.setattr(api, "run", Mock())
    with TestClient(api.app) as c:
        monkeypatch.setattr(api.executor, "submit", Mock())
        yield c


def uploads(tmp_path, shape=(32, 32, 32), dtype=np.float32, affine=None):
    data = np.arange(np.prod(shape), dtype=np.float32).reshape(shape).astype(dtype)
    path = tmp_path / "scan.nii.gz"
    nib.save(nib.Nifti1Image(data, np.eye(4) if affine is None else affine), path)
    return [(name, ("scan.nii.gz", path.read_bytes(), "application/octet-stream")) for name in api.SEQUENCES]


def rejected(client, files, code):
    response = client.post("/jobs", files=files)
    assert response.status_code == 422
    assert response.json()["code"] == code
    assert set(response.json()) == {"code", "message"}
    assert list(api.JOBS.iterdir()) == []
    api.executor.submit.assert_not_called()
    return response


def test_bad_sequence_count(client, tmp_path):
    rejected(client, uploads(tmp_path)[:3], "BAD_SEQUENCE_COUNT")


def test_extra_duplicate(client, tmp_path):
    files = uploads(tmp_path)
    rejected(client, files + files[:1], "BAD_SEQUENCE_COUNT")


def test_too_large(client, tmp_path, monkeypatch):
    monkeypatch.setattr(api, "MAX_FILE_MB", 0)
    rejected(client, uploads(tmp_path), "TOO_LARGE")


def test_invalid_format(client, tmp_path):
    files = uploads(tmp_path)
    files[0] = ("t1c", ("photo.nii.gz", b"\xff\xd8\xffJPEG", "application/octet-stream"))
    assert rejected(client, files, "INVALID_FORMAT").json()["message"] == api.INVALID_MESSAGE


def test_invalid_extension(client, tmp_path):
    files = uploads(tmp_path)
    files[0] = ("t1c", ("photo.jpg", files[0][1][1], "image/jpeg"))
    rejected(client, files, "INVALID_FORMAT")


def test_not_3d(client, tmp_path):
    rejected(client, uploads(tmp_path, shape=(32, 32)), "NOT_3D")


def test_small_dimension(client, tmp_path):
    rejected(client, uploads(tmp_path, shape=(32, 32, 31)), "NOT_3D")


def test_sequence_mismatch(client, tmp_path):
    files = uploads(tmp_path)
    affine = np.eye(4); affine[0, 3] = 1
    files[0] = uploads(tmp_path, affine=affine)[0]
    rejected(client, files, "SEQUENCE_MISMATCH")


def test_bad_spacing(client, tmp_path):
    rejected(client, uploads(tmp_path, affine=np.diag([2, 2, 2, 1])), "BAD_SPACING")


def test_low_dynamic_range(client, tmp_path):
    rejected(client, uploads(tmp_path, dtype=np.uint8), "LOW_DYNAMIC_RANGE")


def test_created_status_and_flair(client, tmp_path):
    files = uploads(tmp_path)
    response = client.post("/jobs", files=files)
    assert response.status_code == 201
    job_id = response.json()["jobId"]
    status = client.get(f"/jobs/{job_id}").json()
    assert status == {"jobId": job_id, "status": "queued", "stage": None, "error": None, "createdAt": status["createdAt"]}
    datetime.fromisoformat(status["createdAt"].replace("Z", "+00:00"))
    assert client.get(f"/jobs/{job_id}/flair.nii.gz").content == files[3][1][1]
    api.executor.submit.assert_called_once_with(api._work, job_id)


@pytest.mark.parametrize("stage,code", [("inferring", "INFERENCE_ERROR"), ("meshing", "MESH_ERROR")])
def test_worker_error(client, monkeypatch, stage, code):
    folder = api.JOBS / "sample-2"; folder.mkdir()
    api.set_status(folder.name)
    def fail(job_dir, on_stage):
        on_stage(stage)
        assert api.get_status_data(folder.name)["stage"] == stage
        raise RuntimeError("test failure")
    monkeypatch.setattr(api, "run", fail)
    api._work(folder.name)
    status = client.get("/jobs/sample-2").json()
    assert status["status"] == "failed"
    assert status["stage"] is None
    assert status["error"] == {"code": code, "message": "test failure"}


def test_worker_success(client):
    folder = api.JOBS / "sample-2"; folder.mkdir()
    api.set_status(folder.name)
    api._work(folder.name)
    assert api.get_status_data(folder.name)["status"] == "done"
    assert api.get_status_data(folder.name)["stage"] is None


def test_cleanup_and_seed(client):
    (api.JOBS / "old-job").mkdir()
    (api.JOBS / "sample-keep").mkdir()
    (api.JOBS / "sample-keep" / "value").write_text("keep")
    api.SEED.mkdir()
    for name in ["sample-keep", "sample-2"]:
        folder = api.SEED / name; folder.mkdir()
        (folder / "value").write_text("seed")
    api.initialize_jobs()
    assert not (api.JOBS / "old-job").exists()
    assert (api.JOBS / "sample-keep" / "value").read_text() == "keep"
    assert (api.JOBS / "sample-2" / "value").read_text() == "seed"


def test_health(client):
    assert client.get("/health").json() == {"ok": True, "model": "brats_mri_segmentation", "version": "0.5.4"}


def test_invalid_id(client):
    assert client.get("/jobs/invalid.id").status_code == 400


def test_uncompressed_input(client, tmp_path):
    path = tmp_path / "scan.nii"
    nib.save(nib.Nifti1Image(np.ones((32, 32, 32), dtype=np.float32), np.eye(4)), path)
    response = client.post("/jobs", files=[(name, ("scan.nii", path.read_bytes())) for name in api.SEQUENCES])
    assert response.status_code == 201
    job_dir = api.JOBS / response.json()["jobId"]
    assert all(nib.load(job_dir / f"{name}.nii.gz").shape == (32, 32, 32) for name in api.SEQUENCES)


def test_cors(client):
    response = client.options("/jobs", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
