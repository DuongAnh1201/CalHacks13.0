# QA: presence + 3D cursors, browser verification

Branch `agents/presence-cursors` at `de3aa24`. Local Convex `127.0.0.1:3210`, frontend `http://localhost:5173`.
Method: Chrome, host tab plus a second same-origin tab as guest (session token is per tab in `sessionStorage`).

## Gates (T7 Step 1)

Root `npm run typecheck`, `npm test`; frontend `npm test`, `npm run build`, `npm run lint`: all green (0 lint errors).

## Manual checks (T7 Step 3)

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Host opens `/jobs/sample/mri`, shares, guest joins by invite link | PASS | |
| 2 | Both piles show 2 avatars, popover shows 2 green dots | PASS | |
| 3 | Host goes to 3D, guest follows; each pointer shows a coloured named dot (chip) on the other screen | PASS | |
| 4 | Different explode per screen: dot stays on the same anatomical spot | PASS | Guest at 50% explode: dot moved with the mesh and sat on the tumour. Judged by eye. |
| 5 | Pointer off the model: dot disappears within ~0.2 s | PASS | Checked at 600 ms (no chip). Sub-200 ms not measured. |
| 6 | Close guest tab: host pile drops to 1 | PASS | Host showed 1 on first poll. Exact beacon latency not measured; well under 25 s. |
| 7 | Hide guest tab: host shows it offline; online again when visible | PASS | Simulated (`visibilityState` override + `visibilitychange`); Chrome reported both tabs visible, so a real hide was not possible. |
| 8 | Host ends session: guest sees "The host ended the session", no dots remain | PASS | 0 chip elements on guest. DB cursor rows not inspected directly. |
| 9 | `/learn` and `/learn/anything` redirect to `/` | PASS | |
| 10 | Home shows no Learning Mode item, button or filter | PASS | No "learn" text on `/`. |

## Result

10 PASS / 0 FAIL. Caveats are in the notes (rows 4, 5, 6, 7).

## Re-run after merge with main

Merge `d778e49` (main's Phase 3 presence + chat + any-scan sharing + camera follow) and R4 `43ba08c` (cursors on any shared case). Same setup as above. Local Convex needed `NEUROVISION_API_URL=http://localhost:8000` (set by lead); without it main's `jobs.registerScan` blocks Share on every case, sample included.

Review: merge diff vs `origin/main` holds only T0–T5 and R4 paths; `convex/presence.ts`, `frontend/src/share/presence.ts`, `SharePopover.tsx` are byte-identical to main. R4 is the `live` gate line plus the `useShare` import.
Gates: typecheck exit 0; root tests 329/329 (17 files); frontend tests 113/113 (26 files); build OK; lint 0 errors, 3 warnings.

| # | Check | Result | Note |
|---|-------|--------|------|
| 1 | Host shares `/jobs/sample/mri`, guest joins by invite link | PASS | |
| 2 | Both piles show the pair; popover roster shows both with the "on" dot class | PASS | Dot class read from DOM, not colour-checked. |
| 3 | Host goes to 3D, guest follows; host pointer shows a named dot on the guest | PASS | |
| 4 | Guest pointer shows a named dot on the host | PASS | |
| 5 | Following guest sees host camera move and host cursor at the same time | PASS | Host orbit-dragged then hovered; guest view rotated and "Host" dot present. |
| 6 | Different explode per screen: dot stays on the same anatomical spot | PASS | Guest 45%, host 0%. Judged by eye. |
| 7 | Pointer off the model: dot clears within ~0.2 s | PASS | Checked at 500 ms. Sub-200 ms not measured. |
| 8 | Close guest tab: host pile drops to 1 | PASS | Already 1 on first read; latency not measured. |
| 9 | Host ends session: guest sees "The host ended the session", no dots | PASS | 0 chip elements. |
| 10 | `/learn` and `/learn/anything` redirect to `/` | PASS | |
| 11 | Home shows no Learning Mode item, button or filter | PASS | No "learn" text on `/`. |
| 12 | Session chat sends both ways | PASS | Host and guest both saw both messages. |
| 13 | Cursors on a finished non-sample job's `/3d` | SKIP | No non-sample job exists (Home: "No workspaces yet"); `GET /jobs` is not allowed on the backend. R4 gate covered by unit tests only. |
| – | Hide guest tab → offline | DROPPED | Per plan: main keeps hidden tabs online by design. |

Result: 12 PASS / 0 FAIL / 1 SKIP.
