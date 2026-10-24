# W1 MRI workspace browser verification (T7)

HEAD `8a5cd17` (features at `2640df9`), Chrome, viewport 1568x765, Vite dev server on :5173, backend docker `calhacks130-api-1` on :8000.
Automated at this HEAD: vitest 16 files / 79 tests pass · `tsc -b` OK · `npm run build` OK · `npm run lint` 3 warnings, 0 errors (react purity/set-state-in-effect: `Home.tsx:25`, `Learn.tsx:41`, `AtlasCanvas.tsx:107`).
Walkthrough (dashboard → New menu → upload → sample card → `/mri` → Place in 3D → `/3d`): `w1_walkthrough.gif`.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `/` dashboard empty state, New menu open/close, MRI Workspace → `/upload`, Learning Mode → `/learn/<id>` + card | PASS | 01-dashboard-empty.jpg, 01-new-menu-open.jpg, 01-learning-card.jpg |
| 2 | Real 4-file upload → processing → `/jobs/<id>/mri`; job card and sample card on `/` | PASS (see note A: card named from filename, subject shows job id) | 02-upload-lands-mri.jpg, 02-dashboard-job-card.jpg, 02-dashboard-sample-card.jpg |
| 3 | Nav only MRI Workspace + Learning Mode; no Explore/Help; FlowStepper step 3 label | PASS. Stepper step 3 already reads "MRI workspace". | w1_walkthrough.gif |
| 4 | `/results` → `/mri`, `/explore` → `/3d` redirects | PASS | w1_walkthrough.gif |
| 5 | `/mri` layout vs `docs/figma/03-workspace.png` | PASS | 05-mri-layout.jpg |
| 6 | Slice views with overlay, crosshair sync, `n / N`, slider | PASS | 06-crosshair-sync.jpg |
| 7 | Presets, gamma, mask %, caliper; "3-Axis Triangulation Locked" | PASS. Caliper only measures on right-button drag (note B). | 07-preset-bone.png, 07-preset-perfusion.png, 07-gamma-mask.jpg, 07-caliper-rightdrag.png |
| 8 | Agent panel: vision line, confirm → `/3d`, Not now removes; input/mic/Run disabled "Agent not connected yet"; no key names | PASS. Agent panel CSS on `/mri` and `/3d` matches (same component, same layout). | 08-agent-script-tab.jpg, 08-not-now-removed.jpg, 08-not-now-black-slices.jpg |
| 9 | Export NIfTI Mask downloads; Adjust Threshold disabled with title | PASS | 09-export-adjust-bottom.jpg |
| 10 | `/3d` layout vs `docs/figma/04-explore.png` | PASS with deviations (note D) | 10-3d-layout.jpg |
| 11 | Arrival: tumor placed, camera on tumor, toast; Undo resets | PASS. Undo removes tumor and toast, brain only remains. | 11-3d-arrival.jpg, 11-undo-removes-tumor.jpg |
| 12 | Opacity, Hide Brain, Focus Tumor, Explode, layer chips; Slices Intersect disabled | PASS (Focus Tumor off-centre at explode 100%, note E) | 12-opacity-xray30.jpg, 12-hide-brain.jpg, 12-explode-50.jpg, 12-layer-edema-off.jpg, 12-layer-core-off.jpg |
| 13 | No-tumor case | N/A. No no-tumor job exists. | none |
| 14 | Failure paths: backend stopped → offline + Retry on `/mri` and `/3d`; one slice URL blocked → own error + Retry, others work | PASS. After `docker start`, Retry on `/3d` recovered. Blocked seg: Retry recovers. Ghost "loading ..." text sits behind the error overlay (note F). | 14-backend-offline-mri.jpg, 14-backend-offline-3d.jpg, 14-seg-blocked-retry.jpg, 14-axial-retry-recovers.jpg |
| 15 | No banned copy (Glioblastoma, Grade IV, confidence, patient name, 3.0 Tesla, "healthy") | PASS. Text scan of `/`, `/upload`, `/learn`, `/jobs/sample/{mri,3d,processing}`: 0 hits. | none |
| 16 | Console clean apart from known warnings | PASS. `/mri`: only `niivue-warn 88% of voxels are zero`. `/3d`: no warnings/errors on fresh load. | none |

## Notes (non-blocking)

- A: Upload workspace card is named from the first filename ("flair"), subject shows the job id. Dashboard card thumbnails are blank.
- B: Caliper measures on right-drag only (NiiVue measurement mode). Nothing tells the user.
- C: Backend container restart wipes `jobs/` (uploaded `job-85gmpe9z` gone). Dashboard card still lists it; `/jobs/job-85gmpe9z/mri` shows "Unknown job." + "Use sample case". Dashboard keeps dead cards (localStorage `nv.workspaces`).
- D: `/3d` lacks the Figma structures chip bar; Brain Opacity defaults to 100.
- E: Focus Tumor is off-centre at explode 100%.
- F: Ghost "loading ..." text behind slice error overlays.
- Test side effect: temporarily renamed `jobs/job-85gmpe9z/seg.nii.gz` for row 14 and restored it; stopped and restarted the api container (health ok after).

Totals: 15 PASS / 0 FAIL / 1 N/A (row 13).
