# W1.5 polish browser re-check (T6)

HEAD `850ddbb` (branch `w1.5/polish`, fixes #90-#94), Chrome, viewport 1517x784, Vite dev server on :5173, backend docker `calhacks130-api-1` on :8000 with `KEEP_JOBS=1`.
Automated at this HEAD: vitest 16 files / 84 tests pass · `tsc -b` OK · `npm run build` OK · `npm run lint` 3 warnings, 0 errors (same 3 as W1).

| # | Check | Result | Evidence |
|---|---|---|---|
| W1-1 | `/` empty state; New menu opens and closes on outside click; Learning Mode → `/learn/<id>` + card on `/` | PASS (New → MRI Workspace → `/upload` covered by W1; not re-clicked) | 01-dashboard-empty.jpg, 01-new-menu-open.jpg, 01-learning-card-eye-thumb.jpg |
| W1-2 | Real 4-file upload → processing → `/jobs/<id>/mri`; card on `/`; sample link adds a card | PASS (`job-8hfvaeh0`) | 02-upload-lands-mri-certainty.jpg, 02-dashboard-named-cards-thumbs.jpg |
| W1-7 | Presets, gamma, mask % change the views | PASS (Bone, Perfusion, mask 60 → lower) | 07-preset-bone.jpg, 07-preset-perfusion-mask.jpg |
| W1-10 | `/3d` layout vs `docs/figma/04-explore.png` | PASS. Structures bar now present. | T4-3d-arrival-xray40-structures-bar.jpg |
| W1-11 | `/3d` arrival: tumor placed, camera on tumor, toast | PASS. Undo not re-run (passed in W1, no change in scope). | T4-3d-arrival-xray40-structures-bar.jpg |
| W1-12 | Opacity, Hide Brain, Focus Tumor, Explode, layer chips; Slices Intersect disabled | PASS. Slices Intersect disabled, title "Needs Cutaway (#16)". Hide Brain and edema-off change the scene. | 12-hide-brain-edema-off.jpg |
| W1-14 | Backend offline → "Backend offline" + Retry on `/mri` and `/3d`; Retry recovers | PASS. `/3d` Retry after `docker start` loads the scene. | 14-backend-offline-mri.jpg, 14-backend-offline-3d.jpg |
| T1 | Card names and thumbnails | PASS. Upload `BraTS_0042_*` → card "BraTS_0042" (no sequence suffix). MRI cards show the head icon; Learn card shows the eye icon. Subject line on the uploaded job's `/mri` still reads the job id. | 02-dashboard-named-cards-thumbs.jpg, 01-learning-card-eye-thumb.jpg |
| T2a | Dead card dropped when job dir removed; offline backend keeps cards | PASS. Moved `jobs/job-8hfvaeh0` out → reload `/` → card gone (API 404) → dir moved back, API 200. Backend stopped → `/` still lists both remaining cards. | T2a-dead-card-dropped.jpg, T2a-offline-keeps-cards.jpg |
| T2b | `docker compose restart api` keeps an upload | PASS. `jobs/job-8hfvaeh0` present after restart, report 200, `KEEP_JOBS=1` in container. | none (shell) |
| T3a | Caliper OFF: no hint; button title "Right-drag on a slice to measure." | PASS (title read from DOM; hint text absent) | none (DOM check) |
| T3b | Caliper ON: exact line below tool strip; right-drag measures; OFF hides the line | PASS. Right-drag drew the ruler (dispatched right-button events). After toggling off the line is gone. | T3-caliper-on-hint.jpg, T3-caliper-right-drag-ruler.jpg |
| T3c | Seg blocked: each failed view shows only the React error + Retry, no NiiVue loading text; unblock + Retry recovers | PASS. Blocked by renaming `seg.nii.gz` in the job dir (not DevTools request blocking), restored after. All three views show "could not load the scan" + Retry, no ghost text; Retry on all three restores the scan. | T3-seg-blocked-error-only.jpg, T3-retry-recovers.jpg |
| T4a | Structures bar: Tumor chip + layers + hemispheres | PASS. "STRUCTURES:" bar, "Tumor (136.3 cm³)", edema/core/enhancing, left/right hemisphere. Layer, Tumor and Left hemisphere chips toggle (aria-pressed flips, scene changes). | T4-3d-arrival-xray40-structures-bar.jpg |
| T4b | Landing at opacity 40, X-Ray | PASS. Toggle reads 40, mode X-Ray, tumor visible through the brain. | T4-3d-arrival-xray40-structures-bar.jpg |
| T4c | Focus Tumor centred at explode 100% | PASS, judged by eye. Tumor sits slightly right of canvas centre (about 12% of canvas width), fully in frame. | T4-explode100-focus-tumor.jpg |
| T5 | Certainty tile on `sample` and `sample-2` | PASS. `sample`: whole 0.94 · core 0.97 · enhancing 0.92. `sample-2`: whole 0.94 · core 0.91 · enhancing 0.91. Tile labelled "Model certainty (not calibrated)" with the not-a-diagnosis line. Uploaded job also shows it. Null path not testable (no seed with null), unit test covers it. | T5-sample-2-certainty.jpg, 02-upload-lands-mri-certainty.jpg |
| Copy | Banned copy scan (Glioblastoma, Grade IV, confidence, 3.0 Tesla, "healthy") | PASS. 0 hits on `/`, `/upload`, `/learn`, `/jobs/sample/{mri,3d,processing}`, `/jobs/sample-2/mri`. | none |
| Console | Console clean apart from known warnings | PASS. Only `THREE.Clock deprecated` and `niivue-warn N% of voxels are zero`; no errors. | none |

## Notes (non-blocking)

- Real upload subject line shows the job id, not the card name.
- Focus Tumor leaves a small offset at explode 100% (see T4c); judged by eye, not measured.
- T2a: job dir moved aside and back, never deleted. `seg.nii.gz` rename for T3c restored. Backend container stopped and started once; health ok after.
- Viewport 1517x784 (W1 used 1568x765); not a concern for the checks above.

Totals: 19 PASS / 0 FAIL / 0 N/A.
