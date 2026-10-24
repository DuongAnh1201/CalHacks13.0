# src/mask_to_mesh.py
import nibabel as nib
import numpy as np
import trimesh
from skimage.measure import marching_cubes


def to_mesh(binary, affine, rgba, smooth_iters=0, step_size=1, max_faces=None):
    """
    binary : 3D bool array (H, W, D), True = inside the region
    affine : 4x4 matrix from the MRI file (voxel index → mm, RAS)
    rgba   : color [R, G, B, A], 0–255
    returns: trimesh.Trimesh in mm, or None if the mask is empty
    """
    # 0. Nothing to draw
    if not binary.any():
        return None

    # 1. Pad by a full sampling step to close surfaces at volume edges
    padded = np.pad(binary, step_size).astype(np.uint8)

    # 2. Marching cubes: boundary between 0 and 1 → vertices + triangles (voxel units)
    verts, faces, _, _ = marching_cubes(padded, level=0.5, step_size=step_size)

    # 3. Undo the padding shift, then voxel index → mm with the MRI's affine
    verts = nib.affines.apply_affine(affine, verts - step_size)

    # 4. If the affine mirrors an axis, triangles are inside-out → reverse them
    if np.linalg.det(affine[:3, :3]) < 0:
        faces = faces[:, ::-1]

    # 5. Build the mesh
    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)

    # 6. Smooth the blocky voxel steps; Taubin keeps the volume (no shrinking)
    if smooth_iters > 0:
        trimesh.smoothing.filter_taubin(mesh, iterations=smooth_iters)

    if max_faces is not None and len(mesh.faces) > max_faces:
        mesh = mesh.simplify_quadric_decimation(face_count=max_faces)
        if len(mesh.faces) > max_faces:
            raise ValueError("Mesh exceeds triangle budget after decimation")

    # 7. Color
    mesh.visual.face_colors = rgba
    return mesh


if __name__ == "__main__":
    # Check on a saved label map:  uv run python -m src.mask_to_mesh jobs/test/seg.nii.gz
    import sys
    img = nib.load(sys.argv[1])
    wt = img.get_fdata() > 0
    m = to_mesh(wt, img.affine, [220, 0, 0, 255])
    if m is None:
        print("empty mask")
    else:
        voxel_cm3 = wt.sum() * np.prod(img.header.get_zooms()[:3]) / 1000
        print("vertices:", len(m.vertices), "| triangles:", len(m.faces))
        print("watertight:", m.is_watertight)
        print("bounds (mm):", m.bounds.round(1).tolist())
        print("mesh volume (cm³):", round(abs(m.volume) / 1000, 2),
              "| voxel volume (cm³):", round(voxel_cm3, 2))
        m.export("check_tumor.stl")