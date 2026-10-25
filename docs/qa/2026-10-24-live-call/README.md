# Live call QA, 2026-10-24

Branch `viewer/live-call`, gates run on `b3e2b69`, re-run green on `453bc32` and `b0d1187` (CSS-only follow-ups `b83e211` and `b0d1187` reviewed PASS) (T1 `0dfef57`, T2 `55d9f3a`, T3 `dad4132`, T4 `ece00dc`, plus the merge of origin/main).

## Step 1: gates (qa, on b3e2b69)

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS (`tsc --noEmit -p convex`, no output) |
| `npm test` | PASS: 30 files, 445 tests; stdio test `ok 1`, `fail 0` |
| `npm --prefix frontend run lint` | PASS: 0 errors, existing warnings only (`useShareSync.ts`, `Home.tsx`, `RemoteCursors.tsx`) |
| `npm --prefix frontend test` | PASS: 32 files, 139 tests |
| `npm --prefix frontend run build` | PASS; separate chunk `livekit-client.esm-*.js` 521.16 kB (135.60 kB gzip) |

## Task reviews (T5)

T1, T2, T3, T4 all PASS. Non-blocking notes:
- `toggleMute` sets state after its `await` with no `room === r` guard (`call/store.ts`); harmless, `join` resets `muted`.
- Leaving the case pages mid-call hides Mute/Leave and stops the transcriber while audio continues.
- Each task commit carries an extra `Co-authored-by: Cursor` trailer (T2, T3).

## Steps 2-3: deploy and two-laptop check

Pending: lead deploys after the user sets `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`.
Browser + OS and network are filled in per row at the check.

| # | Check | Result | Browser + OS | Network |
|---|---|---|---|---|
| 1 | Host shares sample case; guest joins via invite | PENDING | | |
| 2 | Both Join call; each hears the other; face-pile avatar and 3D cursor chip ring on the speaker | PENDING | | |
| 3 | Mute: ring stops, other side hears nothing; Unmute | PENDING | | |
| 4 | `/3d` → `/mri` → `/3d`: audio continues | PENDING | | |
| 5 | Host enables transcript; each speaker's words land under their own name; STT and LiveKit share the mic | PENDING | | |
| 6 | Host ends session: both calls end, buttons disappear | PENDING | | |
| 7 | Env unset on a dev deployment: Join shows "Call unavailable" | PENDING | | |
