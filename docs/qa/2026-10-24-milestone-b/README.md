# Milestone B browser verification (T10)

HEAD `4b9791a`, Chrome, viewport 1568x765, Vite dev server on :5173, docker backend on :8000 (jobs `sample` right, `sample-2` left).
Automated: vitest 10 files / 53 tests pass · `tsc -b` OK · `npm run build` OK · `npm run lint` 0 errors (2 old warnings).
Checks 1-13 ran at `6e98090`; header/footer commit `4b9791a` landed during the run and was re-measured (row 15).

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | `/` layout vs `01-upload.png`; samples above dropzone; NIfTI-only copy; educational footer | PASS | 01-upload.jpg, figma-upload.jpg |
| 1b | Keyboard: Tab reaches all 5 file inputs (Browse + 4 sequences), focus ring on label | PASS. Order: 2 sample buttons, Browse files, 4 × Choose. Label outline solid 2px. Enter-opens-picker not testable (native dialog); inputs are real `<input type=file>` focus targets. | 03-focus-browse-files.png |
| 2 | `.jpg` picked: contract message shown, no `POST /jobs` | PASS (no `/jobs` fetch in resource timing) | 02-jpg-rejected.jpg |
| 3 | Use sample → Results; Processing never shows a % | PASS. Sample job is already `done`, so it lands on Results directly; no `%` text on any screen. | 04-results-sample.jpg |
| 4 | Results `sample`: Tumor detected, 136.3 / 61.6 / 34.3 cm³, Right hemisphere, 1 lesion, Dice, limitations incl. training-case line | PASS. Also 5.5 × 8.9 × 7.3 cm tile and Dice 0.89/0.96/0.88. No invented values. | 04-results-sample.jpg |
| 4b | Results layout vs `03-workspace.png` | FAIL: panels padded 16px, header inset 24px, panels overhang header 8px each side (`Results.module.css:14`). Owner fe. | 04-results-sample.jpg, figma-results.jpg |
| 4c | Processing layout vs `02-processing.png` | FAIL: card sits at top, Figma centers it vertically (`FlowPage.module.css:12`). Owner fe. | figma-processing.jpg, 14-offline-processing.jpg |
| 5 | `sample-2`: Left hemisphere | PASS (67.7 / 9.7 / 7.5 cm³, Dice 0.92/0.85/0.87) | 05-results-sample-2-left.jpg |
| 6 | Place in 3D → `/jobs/sample/explore`: brain loads, tumor hidden, no console errors | PASS. Only warning: `THREE.Clock deprecated` (three internals). | 06-explore-loaded-tumor-hidden.jpg |
| 7 | Show tumor: tumor on patient-right, camera frames it; two `[case] tumor world position` logs identical | PASS. Both logs `37.20, -8.70, -9.30`. | 07-show-tumor.jpg |
| 8 | Orbit, Reset view: camera returns to first frame, tumor hides | PASS. Reset frame equals the settled direct-load frame. First screenshot after a click-through was taken mid-camera-animation (4 s), so compare settled frames. | 08-orbit.jpg, 09-reset-view.jpg, 10-direct-load-settled.jpg |
| 9 | Broken GLB (`brain_left` → `brain_LEFT`): error names `brain_left` | PASS: "3D model is missing node: brain_left" + Retry. `jobs/sample-broken` deleted afterwards. | 11-broken-glb-error.jpg |
| 9b | Same screen, rest of UI | FAIL (minor): legend shows "not in this case" for edema/core/enhancing and Show tumor / Reset view stay enabled although no model loaded. Misleading, tumor is in the case. Owner ai. | 11-broken-glb-error.jpg |
| 10 | Backend stopped: `/` shows "Backend offline — start docker compose up"; Processing/Results show message + Retry | PASS. Backend restarted afterwards (`/health` ok, model.glb 200). | 12, 13, 14 |
| 11 | Real upload, live stages | NOT RUN: optional, browser tool cannot read local NIfTI files | none |
| 12 | Banned word in non-test `frontend/src` | PASS (grep empty; `copy.test.ts` passes) | none |
| 13 | `/learn` regression smoke: loads, no console errors, click structure → fly-to + panel (name, chips, volume, text, neighbours, "Educational · unreviewed") | PASS. Full 16-check suite from `2026-10-23-learn` not rerun. | 15-learn-select.jpg |
| 14 | Explore layout vs `04-explore.png` | PASS: warm bg, floating header/footer, right panel real data only; Figma left HUD, telemetry and agent panels not shipped by design. | figma-explore.jpg, 07-show-tumor.jpg |
| 15 | Header/footer after `4b9791a` on `/`, `/jobs/sample/results`, `/jobs/sample-2/results`, `/jobs/sample/explore`, `/learn`: header 12px card, footer 8px card, 24px left inset | PASS. Measured by `getBoundingClientRect`: left 24, header radius 12, height 58; footer radius 8, height 38; explore/learn footer pinned 8px above viewport bottom, upload/results footers sit at end of scrolling content. Right inset 24 (37 where the page scrollbar shows). | 16-learn-header-footer.jpg |

Totals: 14 PASS / 3 FAIL / 1 not run.
