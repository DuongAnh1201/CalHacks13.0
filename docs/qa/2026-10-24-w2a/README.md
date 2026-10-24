# W2 Phase A two-window pass (2026-10-24)

Branch `w2/share`. Convex local :3210 (fresh database, sample seeded), Vite :5173, API :8000.
Host and guest were two separate Chrome tabs with sessionStorage cleared first (no Duplicate tab).
Slice labels are listed axial, sagittal, coronal.

**Result: 6/6 checks pass (check 1 re-run against ba61e54 passes). Negative checks pass.**

## Checks

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Share shows link, code and "Host (host)" | **Pass** after ba61e54 (initial run on 3ed4771 failed visually: popover behind the analysis panel). Re-run below. | `1-share-popover-fixed.jpg` (fixed), `1-share-popover-occluded.png` (before) |
| 2 | Guest joins, "Following Host", host roster shows guest | Pass. Roster reads "Host (host)", "Guest · following". | `2-guest-following.jpg` |
| 3 | Host click moves guest crosshair in all 3 views, labels match | Pass. Host and guest both 78/155, 55/240, 186/240. | `3-host-after-click.jpg`, `3-guest-after-host-click.jpg` |
| 4 | Guest click shows "Not following Host", host move does not move guest, Follow snaps back | Pass, no auto flip. Guest 78/155, 161/240, 143/240 stayed put while host moved to 78/155, 205/240, 143/240. Follow snapped guest to 205/240, 143/240. | `4-guest-not-following.jpg`, `4-guest-unmoved-after-host-move.jpg`, `4-guest-after-follow.jpg` |
| 5 | End session: guest "The host ended the session", host popover closes, no notice | Pass | `5-guest-host-ended.jpg`, `5-host-after-end.jpg` |
| 6 | New session, guest reload keeps "Following Host", no second roster entry | Pass. Roster: "Host (host)", "Guest · following". | `6-guest-after-reload.jpg` |

### Check 1 detail
Before (3ed4771): popover at z-index 20 inside a static header, so the analysis panel painted over it; `elementFromPoint` on the invite field returned the panel's kicker.

Re-run against ba61e54 (header `position: relative`, `z-index: 30`, confirmed via computed style), `/jobs/sample/mri`, fresh sessionStorage, real mouse clicks only:
- Popover sits above the AI Volumetric Analysis panel, which shows through the popover's translucent background only as faint text.
- `elementFromPoint` at the centre of the invite field returns the popover's INPUT, at Copy link and End session returns the popover's BUTTONs (`inPop` true for all three).
- Real click on Copy link: button label changes to "Copied". Clipboard contents not read (the read hung on a permission prompt).
- Real click on Share closes the popover, a second click reopens it.
- Real click on End session closes the popover and clears the session from sessionStorage.
- Real click on the NeuroVision nav link navigates to `/`.

## Negative checks

| Check | Result | Evidence |
|---|---|---|
| Share disabled on an upload job with title "Sharing works on the sample case for now" | Pass on the title and disabled state. Tested on `/jobs/upload-test/mri`, which renders "Unknown job.", not a real upload job. | `neg-upload-job-share-disabled.jpg` |
| `/join/BADCODE` shows "That invite link doesn't work. Ask the host for a new one." | Pass. The message appears after submitting a name; the bare page shows only the form. | `neg-badcode.jpg` |
| No UI text names a key | Pass. Scanned body text, title, aria-label and placeholder with the popover open. No hits. | none |

## Observations (not fixed)
- A reloaded guest in a new session shows default slices (121/240, 121/240) until the host moves. The host's view is not published until the host acts.
- An earlier run on a previous database showed both tabs' slice labels shifting after End session (host 181/240, 152/240 to 155/240, 131/240; guest 181/240, 152/240 to 154/240, 134/240). It did not reproduce on this run, and the cause is unknown.
- The guest's "Following Host" banner still shows on the `/join/BADCODE` page while that tab holds a live session. This is expected but worth knowing when testing.
