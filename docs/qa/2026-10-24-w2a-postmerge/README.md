# W2 Phase A post-merge pass (2026-10-24)

Branch `w2/share` HEAD `4ee2260` (origin/main merged in). Vite :5173, Convex :3210 (redeployed with staticHosting), API :8000. No installs, no restarts.
Host and guest were two separate Chrome tabs with sessionStorage cleared first (no Duplicate tab). All clicks were real mouse clicks, including Copy link and End session. Slice labels are listed axial, sagittal, coronal.

**Result: 6/6 checks pass. 3/3 negative checks pass. Regression pages (4/4) load with no console errors.**

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Share shows link, code and "Host (host)"; popover above the analysis panel | **PASS**. Invite link, code and "Host (host)" shown. `elementFromPoint` on the invite field, Copy link and End session returns popover elements; header z-index 30. Real click on Copy link changes the label to "Copied". | `1-share-popover.jpg`, `1-copy-link-copied.png` |
| 2 | Guest joins, "Following Host", host roster shows guest | **PASS**. Guest banner "Following Host / Stop following". Host roster "Host (host)", "Guest · following". | `2-guest-following.jpg`, `2-host-roster.jpg` |
| 3 | Host click moves guest crosshair in all 3 views, labels match | **PASS**. Host and guest both 78/155, 72/240, 152/240. | `3-host-after-click.jpg`, `3-guest-after-host-click.jpg` |
| 4 | Guest click shows "Not following Host", host move does not move guest, Follow snaps back | **PASS**, no auto flip. Guest clicked to 78/155, 55/240, 101/240 and "Not following Host / Follow". Host then moved to 78/155, 165/240, 177/240 and the guest stayed at 55/101. Follow snapped the guest to 165/177. | `4-guest-not-following.jpg`, `4-host-moved.jpg`, `4-guest-unmoved-after-host-move.jpg`, `4-guest-after-follow.jpg` |
| 5 | End session: guest "The host ended the session", host popover closes, no notice | **PASS**. Host popover closed, host sessionStorage empty, no error or notice text. Host slices stayed 165/177. | `5-host-after-end.jpg`, `5-guest-host-ended.jpg` |
| 6 | New session, guest reload keeps "Following Host", no second roster entry | **PASS**. After reload the guest still shows "Following Host". Roster: "Host (host)", "Guest · following". | `6-guest-after-reload.jpg`, `6-host-roster.jpg` |

## Negative checks

| Check | Result | Evidence |
|---|---|---|
| Share disabled on an upload job with title "Sharing works on the sample case for now" | **PASS**. Tested on `/jobs/job-dx0nm31l/mri`, a real upload job from the Home list. Share is `disabled` with that title. | `neg-upload-job-share-disabled.jpg` |
| `/join/BADCODE` shows "That invite link doesn't work. Ask the host for a new one." | **PASS**. The message appears after submitting a name. | `neg-badcode.jpg` |
| No UI text names a key | **PASS**. Scanned body text, title, aria-label, placeholder and title attributes with the popover open for api key, secret, token and similar. No hits. | none |

## Regression (pages that render TopNavBar)

| Page | Result | Evidence |
|---|---|---|
| Home `/` | **PASS**. Renders the workspace list. Console shows only Vite connect messages. | `reg-home.jpg` |
| Upload `/upload` | **PASS**. Renders "Load an MRI study" with sample cases. Console shows only Vite connect messages. | `reg-upload.jpg` |
| Learn `/learn` | **PASS**. Renders the 3D brain and structure list. The only console message is a warning: `THREE.Clock: This module has been deprecated`. | `reg-learn.jpg` |
| Sample MRI workspace `/jobs/sample/mri` | **PASS**. Loads three views at 78/155, 121/240, 121/240. The only console messages are niivue info messages and "88% of voxels are zero" warnings. | `reg-sample-mri.jpg` |

No console errors on any of the four pages.

## Diff vs first run
- Check 1: first run failed visually (popover behind the analysis panel). Now passes after ba61e54. Copy link and End session are reachable with real clicks, so End session is no longer driven through the DOM.
- Checks 2 to 6: same results as the first run. Slice labels differ only because the click positions differ.
- Negative check, upload job: the first run used `/jobs/upload-test/mri`, which renders "Unknown job.". This run used a real upload job, `job-dx0nm31l`. Share is disabled with the same title.
- The label shift after End session seen on an earlier database did not reproduce. Host slices stayed at 165/177 through End session.
- Still true: a reloaded guest in a new session shows default slices (121/240, 121/240) until the host moves.

## Observations (not fixed)
- Intermittent: the first real click on Share after a reload plus sessionStorage clear did not open the popover, and the page was scrolled about 30px (header partly off-screen). After `scrollTo(0,0)` the retry opened it. Not reproduced on the later Share clicks (about 6 more). Cause unknown, possibly a click landing mid-load.
- Guest tab console on `/join/BADCODE` logs `[CONVEX M(sessions:join)] Server Error ... Uncaught ConvexError INVALID_INVITE`. Expected for the bad-code path and the UI handles it. It is logged as an error, not caught.
- Clipboard contents were not read (the read hangs on a permission prompt). "Copied" on the button is the only evidence that copy worked.
