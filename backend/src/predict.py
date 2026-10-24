from pathlib import Path
import numpy as np, nibabel as nib, torch
from monai.networks.nets import SegResNet
from monai.inferers import sliding_window_inference

# Input channel order from brats_mri_segmentation/configs/metadata.json channel_def: 0 T1c, 1 T1, 2 T2, 3 FLAIR
SEQUENCE_ORDER = ("t1c", "t1", "t2", "flair")
# Output channel order from the same file (label_classes): 0 TC, 1 WT, 2 ET

_net = None

def get_net(weights="weights/model.pt"):
    global _net
    if _net is None:
        _net = SegResNet(blocks_down=[1, 2, 2, 4], blocks_up=[1, 1, 1], init_filters=16,
                         in_channels=4, out_channels=3, dropout_prob=0.2)
        _net.load_state_dict(torch.load(weights, map_location="cpu"))
        _net.eval()
    return _net

def predict(paths):
    """paths: [t1c, t1, t2, flair] → (tc, wt, et) bool arrays, affine, voxel size"""
    names = tuple(Path(p).name.split(".")[0].lower() for p in paths)
    assert names == SEQUENCE_ORDER, f"paths must be in order {SEQUENCE_ORDER}, got {names}"
    imgs = [nib.load(p) for p in paths]
    ref = imgs[0]
    for im in imgs[1:]:
        if im.shape != ref.shape or not np.allclose(im.affine, ref.affine, atol=1e-3):
            raise ValueError("All 4 sequences must have the same shape and affine")

    x = np.stack([im.get_fdata(dtype=np.float32) for im in imgs])   # (4, H, W, D)
    for c in range(4):                                              # NormalizeIntensityd(nonzero, channel_wise)
        nz = x[c] != 0
        if nz.any():
            x[c][nz] = (x[c][nz] - x[c][nz].mean()) / (x[c][nz].std() + 1e-8)

    with torch.no_grad():
        logits = sliding_window_inference(torch.from_numpy(x)[None], roi_size=(240, 240, 160),
                                          sw_batch_size=1, predictor=get_net(), overlap=0.5)
    assert logits.shape[1] == 3, "expected 3 output channels (TC, WT, ET)"
    m = (torch.sigmoid(logits)[0] > 0.5).numpy()
    brain = x[3] != 0                                               # FLAIR non-zero = brain (skull-stripped input)
    return {"tc": m[0], "wt": m[1], "et": m[2], "brain": brain,
            "affine": ref.affine, "zooms": ref.header.get_zooms()[:3]}