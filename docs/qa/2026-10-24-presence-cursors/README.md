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
