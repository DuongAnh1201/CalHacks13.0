# W2 Phase B two-window pass (2026-10-24)

Branch `w2/share-b` HEAD `db3aa01` (Convex 5df2ee2 on local :3210, sample re-seeded with tumor volumes). Vite :5173, API :8000. No installs, no restarts.
Host and guest were two separate Chrome tabs with sessionStorage cleared first (no Duplicate tab). All clicks and drags were real mouse input. Slice labels are listed axial, sagittal, coronal.

**Result: 5/5 Phase B checks pass, 6/6 Phase A checks pass. One open finding (guest mask overlay intermittently missing while following), see Findings.**

## Phase A re-run

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Share shows link, code and "Host (host)" | **PASS** | `A1-share-popover.jpg` |
| 2 | Guest joins, "Following Host", host roster shows guest | **PASS**. Roster "Host (host)", "Guest · following". | `A2-guest-following.jpg`, `A2-host-roster.jpg` |
| 3 | One host click moves the guest crosshair in all 3 views, labels match | **PASS**. Host and guest both 78/155, 72/240, 152/240. Both axes moved together. | `A3-host-after-click.jpg`, `A3-guest-after-host-click.jpg` |
| 4 | Guest click shows "Not following Host", host move does not move guest, Follow snaps back | **PASS**. Guest 78/155, 57/240, 95/240 stayed put while host went to 78/155, 165/240, 177/240. Follow snapped the guest to 165/177. | `A4-guest-not-following.jpg`, `A4-host-moved.jpg`, `A4-guest-unmoved-after-host-move.jpg`, `A4-guest-after-follow-overlay-missing.jpg` |
| 5 | End session: guest "The host ended the session", host popover closes, no notice | **PASS**. Host popover closed, host sessionStorage empty, no ended/error text on host. | `A5-host-after-end.jpg`, `A5-guest-host-ended.jpg` |
| 6 | New session, guest reload keeps "Following Host", no second roster entry | **PASS**. Roster after reload: "Host (host)", "Guest · following". | `A6-guest-after-reload-overlay-missing.jpg`, `A6-host-roster.jpg` |

## Phase B

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Host to /3d, guest lands on /jobs/sample/3d | **PASS**. Host clicked "Place in 3D". Both tabs on `/jobs/sample/3d` within the 4 s wait. | `B1-host-on-3d.jpg`, `B1-guest-landed-on-3d.jpg` |
| 2 | Explode, opacity, mode, layers, hemispheres, Focus Tumor mirror | **PASS with limits**. Explode 0 to 73: both sliders read 73. Opacity 40 to 29: both 29. Layers (Tumor core off, others as toggled) and hemispheres (Right off) identical in both tabs by button state. Focus Tumor and Hide Brain mirrored. Mode: see limits. | `B2-*.jpg` pairs |
| 3 | Host mask 0 hides guest overlay, above 0 shows at guest's own % | **PASS**, with the finding below. Host 0: guest overlay hidden, guest slider stays 60. Host 22: overlay returns at guest 60 (guest slider unchanged at 60). | `B3-host-mask-0.jpg`, `B3-guest-host-mask-0.jpg`, `B3-host-mask-22.jpg`, `B3-guest-overlay-shown-own-60.jpg` |
| 4 | Guest orbit free, host camera unmoved | **PASS**. Guest drag changed the guest camera. Host screenshot is identical to the one before the drag. Guest stayed "Following Host" (no auto flip). | `B4-guest-orbited.jpg`, `B4-host-camera-unmoved.jpg` |
| 5 | Stop following on /3d, host changes, Follow snaps to host page+scene | **PASS**. Guest "Not following Host", host explode 73 to 98 and Left hemisphere toggled: guest stayed at 73. Follow: guest 98 and same hemispheres. Then Stop, host to `/mri`: guest stayed on `/3d`. Follow: guest moved to `/jobs/sample/mri`. | `B5-*.jpg` |

### Limits of check 2
- Timing: each change was checked after a 1 s wait, not measured. "Within ~0.3 s" is not proven, only "within 1 s".
- Mode: the "X-Ray" pill is a read-only label in the UI. No clickable mode control exists, so mode could not be driven separately. It read X-Ray in both tabs throughout.
- Tumor, Edema and Enhancing buttons: clicks did not change their reported state in either tab (parity held, but I did not confirm they toggle). Tumor core and the hemispheres did toggle and mirrored.
- Left hemisphere read `false` on host when I expected a flip. Parity held, I did not chase it.

## Findings
1. **Guest mask overlay intermittently missing while following (open).** The guest's axial (and sagittal) views show the white tumor with no colour overlay, while the host at the same slices shows it. Seen:
   - after Follow snap in A4 (`A4-guest-after-follow-overlay-missing.jpg`),
   - with host mask at 60, 97 and 58, guest slider at 60 (`B3-guest-overlay-hidden-host-97.jpg`),
   - after a guest reload in A6 (`A6-guest-after-reload-overlay-missing.jpg`, coronal shows it, axial does not).
   It rendered correctly when the guest was not following, after the host dragged mask to 0 and back to 22, and after Follow back to `/mri` from `/3d` (`B5-guest-follow-snapped-page.jpg`). Cause unknown. Possible trigger: overlay not applied until a host mask change or a page remount. I did not confirm that trigger.
2. Host slices reset to 78/155, 121/240, 121/240 after a /mri to /3d to /mri round trip (were 165/177). Host-local, not a share bug as far as I can tell.

## Observations
- Opacity: guest's Brain Opacity readout matched the host (40 on landing), no mismatch.
- Intermittent (also in Phase A): the first Share click after `location.href` navigation did nothing because the page was scrolled about 420 px and the header was off-screen. Retry at scrollY 0 worked.
- Console: `read_console_messages` with `onlyErrors` returned no errors on either tab, but tracking only starts at the first call, which I made at the end of the run. Errors earlier in the run were not captured.

## Re-check 2fa1bec (2026-10-24)

Branch `w2/share-b` HEAD `2fa1bec`. Two fresh tabs, sessionStorage cleared, no Duplicate tab, real clicks and drags only. Console tracking started on both tabs before the first action. Screenshots are `RC-*.jpg`.

**Result: 5/5 pass. One unexplained guest reload seen once (see Notes).**

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Host on `/jobs/sample/mri` at default mask 60, then Share, guest joins and follows: overlay shows without the host touching the mask | **PASS**. Guest "Following Host", mask 60, overlay on axial and coronal at once. Sagittal at 121/240 shows none, and the host's sagittal at the same slice shows none (no tumor there). After one host click on the tumor (guest 78/155, 168/240, 119/240) all 3 guest views show the overlay. | `RC-1-guest-following-overlay.jpg`, `RC-1-host-popover-before-join.jpg`, `RC-1-host-after-tumor-click.jpg`, `RC-1-guest-all3-overlay.jpg` |
| 2 | Guest reload while following: overlay still shows | **PASS**. Still "Following Host", slider 60, overlay in all 3 views. | `RC-2-guest-after-reload.jpg` |
| 3 | Guest Stop following, host moves, Follow: overlay shows after snap | **PASS**. Not following: overlay shown. After Follow the guest snapped to the host slices (122/240, 192/240) with the overlay on axial and coronal. | `RC-3-guest-not-following.jpg`, `RC-3-guest-after-follow-snap.jpg`, `RC-3-host-after-follow.jpg` |
| 4 | Host mask 0 hides guest overlay, back above 0 shows it | **PASS**. Host 0: guest overlay hidden, guest slider stays 60. Host 23: overlay back, guest slider 60 (no page reload on this repeat, `timeOrigin` unchanged). | `RC-4-guest-following-host-mask-0-hidden.jpg`, `RC-4-host-mask-0-again.jpg`, `RC-4-guest-host-mask-23-overlay.jpg`, `RC-4-host-mask-23.jpg` |
| 5 | Tumor/Edema/Enhancing buttons on `/jobs/sample/3d` toggle and mirror | **PASS**. Tumor click turns Tumor, Edema, Tumor core and Enhancing all off (it is a group toggle), and a second click turns them all on. Edema click: Edema off only. Enhancing click: Enhancing off only. Button states identical on host and guest after each click, and the 3D views match. | `RC-5-*.jpg` pairs |

The earlier "no state change" for Tumor/Edema/Enhancing in the first pass was a misread on my side: I clicked Tumor first, which flipped all four, so the later clicks netted out. Not a bug.

### Notes
- **Unexplained guest reload (1 of 2 attempts at check 4).** After my first successful host drag to mask 0, the guest tab reloaded on its own: `performance.getEntriesByType('navigation')[0].type` was `reload`, the canvases went black for a moment, and the guest came back as "Not following Host" at its own slices (168/240, 134/240), roster "Guest" without "following". My own guest reload in check 2 kept "Following Host", so the reload itself should not drop the follow. Git tree was clean (no edits, so not a Vite full reload) and the host tab did not reload. The second run of the same host mask 0 and back action caused no reload. Cause unknown, not reproduced. `RC-X-guest-black-canvases-transient.jpg` and `RC-X-guest-reloaded-not-following.jpg` show it.
- **Console.** No errors on either tab at the end. The guest's log resets on reload, so errors before that reload were not retained for that tab. On the host tab, the first read returned 7 errors timestamped 12:58:45, from before this run: a Vite hot update of `useMprShare.ts` (the fix) while the older page was open ("change in the order of Hooks", then `getSnapshot` of null in `MriWorkspace`). The host was reloaded right after and showed no errors since. Dev-only HMR effect as far as I can tell, not confirmed.
- **Follow-up on the "reload" (lead, after the run): not a reload.** Vite forwards each tab's console to its log, and every `/jobs/sample/mri` load prints `niivue-warn 88% of voxels are zero` 3 times, one per view. Those lines appear at 1:00:26 (host), 1:01:01 (guest join) and 1:01:19 (guest reload in check 2), then not again before the `/3d` load at 1:02:51. Check 4 falls inside that gap. `navigation.type` stays `reload` until the next navigation, so the value read in check 4 came from the check 2 reload. The guest's new slices (168/240, 134/240) differ from the host's, and only pointer input on the guest moves them. A guest's own click stops following by design (spec §2, Phase A check 4). Most likely cause: the missed first drag, made after the window resize, landed on a guest slice view. The resize also explains the brief black canvases (`isResizeCanvas`). No code change.
- First attempt at the host mask drag missed the slider (wrong coordinate frame after the window size changed). No effect on results.
