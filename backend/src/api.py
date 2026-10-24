# src/api.py
"""
REST API for Brain3D.

POST /jobs                 upload 4 MRI files → {"jobId": ...}
GET  /jobs/{id}            status: queued | running | done | failed
GET  /jobs/{id}/report     report.json
GET  /jobs/{id}/model.glb  3D meshes
GET  /jobs/{id}/seg.nii.gz label map
GET  /health               server check
"""
import json
import os
import re
import tempfile
from datetime import datetime, timezone
import nibabel as nib
import numpy as np
import shutil
import traceback
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from starlette.datastructures import UploadFile as FormUploadFile

SEQUENCES = ("t1c", "t1", "t2", "flair")

def run(job_dir, on_stage=None):
    from src.pipeline import run as pipeline_run
    return pipeline_run(job_dir, on_stage=on_stage)

JOBS = Path("jobs")
JOBS.mkdir(exist_ok=True)
MAX_FILE_MB = 200
SEED = Path("seed")
INVALID_MESSAGE = "Images and screenshots don't contain 3D scan data. Upload 4 NIfTI sequences (T1c, T1, T2, FLAIR) or use a sample case."

executor = None  # Initialized for each application lifespan; one inference at a time.


# ---------- status stored atomically on disk ----------
def _status_path(job_id: str) -> Path:
    return JOBS / job_id / "status.json"

def set_status(job_id: str, **data):
    path = _status_path(job_id)
    current = json.loads(path.read_text()) if path.exists() else {
        "jobId": job_id, "status": "running", "stage": "validating", "error": None,
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
    current.update(data)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(current))
    temporary.replace(path)

def get_status_data(job_id: str) -> dict:
    p = _status_path(job_id)
    if not p.exists():
        raise HTTPException(404, "Unknown job")
    return json.loads(p.read_text())

def _check_id(job_id: str):
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,64}", job_id):
        raise HTTPException(400, "Invalid job id")


# ---------- background worker ----------
def _work(job_id: str):
    stage = "inferring"
    def on_stage(value):
        nonlocal stage
        stage = value
        set_status(job_id, status="running", stage=value)
    try:
        on_stage("inferring")
        run(JOBS / job_id, on_stage=on_stage)
        set_status(job_id, status="done", stage=None)
    except Exception as exc:
        traceback.print_exc()
        set_status(job_id, status="failed", stage=None, error={
            "code": "INFERENCE_ERROR" if stage == "inferring" else "MESH_ERROR", "message": str(exc)})


def initialize_jobs():
    JOBS.mkdir(parents=True, exist_ok=True)
    for folder in JOBS.iterdir():
        if folder.is_dir() and not folder.name.startswith("sample"):
            shutil.rmtree(folder)
    if SEED.exists():
        for folder in SEED.iterdir():
            if folder.is_dir() and not (JOBS / folder.name).exists():
                shutil.copytree(folder, JOBS / folder.name)


# ---------- app ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global executor
    initialize_jobs()
    executor = ThreadPoolExecutor(max_workers=1)
    yield
    executor.shutdown(wait=True)

app = FastAPI(title="Brain3D API", lifespan=lifespan)

origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    metadata = Path(__file__).resolve().parents[1] / "brats_mri_segmentation/configs/metadata.json"
    return {"ok": True, "model": "brats_mri_segmentation", "version": json.loads(metadata.read_text())["version"]}


class InvalidInput(Exception):
    def __init__(self, code, message):
        self.code, self.message = code, message


def reject(code, message):
    raise InvalidInput(code, message)


def validate(paths):
    images = []
    for path in paths:
        try:
            image = nib.load(path)
            np.asanyarray(image.dataobj)
            images.append(image)
        except Exception:
            reject("INVALID_FORMAT", INVALID_MESSAGE)
    if any(len(im.shape) < 3 or any(d < 32 for d in im.shape) for im in images):
        reject("NOT_3D", "Expected 3D scan data with every dimension at least 32 voxels")
    ref = images[0]
    if any(im.shape != ref.shape or not np.allclose(im.affine, ref.affine, atol=1e-3, rtol=0) for im in images[1:]):
        reject("SEQUENCE_MISMATCH", "All 4 sequences must share shape and affine (tolerance 1e-3)")
    if any(not np.allclose(im.header.get_zooms(), 1, atol=0.1, rtol=0) for im in images):
        reject("BAD_SPACING", "Expected approximately 1 mm isotropic spacing (1 ± 0.1 mm)")
    for im in images:
        data = np.asanyarray(im.dataobj)
        if np.issubdtype(im.get_data_dtype(), np.integer) and data.min() >= 0 and data.max() <= 255 and np.unique(data).size <= 256:
            reject("LOW_DYNAMIC_RANGE", "Scan intensities resemble a converted screenshot; upload raw MRI NIfTI sequences")


@app.post("/jobs", status_code=201)
async def create_job(request: Request):
    JOBS.mkdir(parents=True, exist_ok=True)
    job_dir = Path(tempfile.mkdtemp(prefix="job-", dir=JOBS))
    job_id = job_dir.name
    try:
        set_status(job_id)
        async with request.form() as form:
            entries = list(form.multi_items())
            if len(entries) != 4 or sorted(k for k, _ in entries) != sorted(SEQUENCES) or any(not isinstance(f, FormUploadFile) for _, f in entries):
                reject("BAD_SEQUENCE_COUNT", "Expected 4 files: t1c, t1, t2, flair")
            files = dict(entries)
            paths = []
            for name in SEQUENCES:
                size = 0
                with (job_dir / name).open("wb") as output:
                    while chunk := await files[name].read(1024 * 1024):
                        size += len(chunk)
                        if size > MAX_FILE_MB * 1024 * 1024:
                            reject("TOO_LARGE", "File exceeds 200 MB")
                        output.write(chunk)
            for name in SEQUENCES:
                filename = files[name].filename or ""
                if not filename.endswith((".nii", ".nii.gz")):
                    reject("INVALID_FORMAT", INVALID_MESSAGE)
                suffix = ".nii.gz" if filename.endswith(".nii.gz") else ".nii"
                path = job_dir / (name + suffix)
                (job_dir / name).rename(path)
                paths.append(path)
            validate(paths)
            for name, path in zip(SEQUENCES, paths):
                if path.suffix == ".nii":
                    nib.save(nib.load(path), job_dir / f"{name}.nii.gz")
                    path.unlink()
        set_status(job_id, status="queued", stage=None)
        executor.submit(_work, job_id)
    except InvalidInput as exc:
        shutil.rmtree(job_dir)
        return JSONResponse(status_code=422, content={"code": exc.code, "message": exc.message})
    except Exception:
        shutil.rmtree(job_dir)
        raise
    return {"jobId": job_id}


@app.get("/jobs/{job_id}")
def job_status(job_id: str):
    _check_id(job_id)
    return get_status_data(job_id)


def _result(job_id: str, name: str) -> Path:
    _check_id(job_id)
    if get_status_data(job_id)["status"] != "done":
        raise HTTPException(409, "Job not finished")
    p = JOBS / job_id / name
    if not p.exists():
        raise HTTPException(404, f"{name} not found")
    return p


@app.get("/jobs/{job_id}/report")
def job_report(job_id: str):
    return json.loads(_result(job_id, "report.json").read_text())


@app.get("/jobs/{job_id}/model.glb")
def job_model(job_id: str):
    return FileResponse(_result(job_id, "model.glb"), media_type="model/gltf-binary",
                        filename=f"{job_id}.glb")


@app.get("/jobs/{job_id}/seg.nii.gz")
def job_seg(job_id: str):
    return FileResponse(_result(job_id, "seg.nii.gz"), media_type="application/gzip",
                        filename=f"{job_id}_seg.nii.gz")


@app.get("/jobs/{job_id}/flair.nii.gz")
def job_flair(job_id: str):
    _check_id(job_id)
    get_status_data(job_id)
    path = JOBS / job_id / "flair.nii.gz"
    if not path.exists():
        raise HTTPException(404, "flair.nii.gz not found")
    return FileResponse(path, media_type="application/gzip")
