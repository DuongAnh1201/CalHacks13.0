# /learn browser verification (T10)

HEAD `6b7caac`, Chrome, viewport 1568x765, Vite dev server on :5173, index 445 nodes.
Automated: selftest ok · vitest 5 files / 32 tests pass · `npm run build` OK · `tsc -b` OK.
Walkthrough: `learn_walkthrough.gif`.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Brain loads <3 s, no console errors, no `[atlas] … no GLB node` warning | PASS. Only warning is `THREE.Clock deprecated` (three internals, logged via the Chrome extension hook). | 01-load.jpg |
| 2 | Hover: name tooltip + highlight, pointer cursor | PASS. Canvas `cursor: pointer` confirmed by computed style while hovering. | 02-hover.jpg |
| 3 | Click structure: fly-to, ghost others, panel (name, chips, volume, text, neighbours, "Educational · unreviewed") | PASS (clicked Rostral Middle Frontal (L); Superior Frontal (L) reached via neighbour chip in 5) | 03-select-rostral-middle-frontal.jpg |
| 4 | Drag orbits around selection | PASS | 04-orbit.jpg |
| 5 | Neighbour chip flies to neighbour | PASS | 05-neighbour-superior-frontal.jpg |
| 6 | Click empty space deselects, un-ghosts, camera stays | PASS | 06-deselect.jpg |
| 7 | Double-click isolates; Isolate button toggles; disabled with no selection | PASS | 07-isolate-dblclick.jpg, 08-isolate-toggled-off.jpg |
| 8 | X-Ray: cortex 30%, deep nuclei clickable, slider affects cortex only | PASS (putamen selected; slider 12% and 95% change cortex only) | 09, 10, 11, 12 |
| 9 | Explode 0→50→100 splits hemispheres, radial, cerebellum down, back to 0 | PASS | 13-explode-50.jpg, 14-explode-100.jpg |
| 10 | L/R chips hide hemispheres, midline stays | PASS | 15-hide-left.jpg, 16-hide-right.jpg |
| 11 | Tree search "hippo" filters; eye toggle hides mesh | PASS (also matches Parahippocampal: substring match) | 17, 18, 19 |
| 12 | Reset: Solid, explode 0, opacity 30%, nothing hidden, camera home | PASS | 20-reset.jpg |
| 13 | Routes `/`, `/jobs/x/processing`, `/results`, `/explore` render; `/` shows "Backend offline — start docker compose up" | PASS | 21–24 |
| 14 | Layout vs `docs/figma/04-explore.png` | PASS after fix `2e8d188` (was FAIL: flat header/footer) | 27 (before), 28-reverify-floating-header.jpg |
| 15 | Orbit at explode 100% in X-Ray ≥ 50 fps | PASS. 75 fps rAF over 2.4 s (180 synthetic pointer moves). | 25-xray-explode100-fps75.jpg |
| 16 | Failure path: rename `public/atlas/structures.json` → "Atlas failed to load" + Retry; restore + Retry recovers | PASS. File restored; `git status` clean apart from this dir. | 26-atlas-failed-retry.jpg |

## Re-verify (HEAD e3d3435, vitest 34 pass, tsc ok)

- 14: header 12px card, footer 8px card, 24px inset (`2e8d188`). PASS.
- Explode 100% now refits camera, whole brain visible (`e3d3435`). PASS, 29-reverify-explode100-fits.jpg.
- Reset clears tree search (typed "hippo", Reset, box empty). PASS, 30-reverify-reset-clears-search.jpg.
- Double-click isolate leaves no stale tooltip. PASS, 31-reverify-isolate-no-tooltip.jpg.
- Failed load hides toolbar and explode slider; Retry after restoring the file brings them back (`562a33c`, vitest 34, tsc, build ok). PASS, 32-reverify-failed-load-no-controls.jpg, 33-reverify-retry-controls-return.jpg.

Totals: 16 PASS / 0 FAIL.
