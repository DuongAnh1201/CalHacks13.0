# Live call QA, 2026-10-24

Branch `viewer/live-call`, gates run on `b3e2b69`, re-run green on `453bc32` and `b0d1187` (CSS-only follow-ups `b83e211` and `b0d1187` reviewed PASS) (T1 `0dfef57`, T2 `55d9f3a`, T3 `dad4132`, T4 `ece00dc`, plus the merge of origin/main).

## PR candidate: code PASS, manual call check pending

Latest code candidate: `05ca38f`, including the note-taker integration from main (#148) and the microphone ownership fixes in `ed338dd`, `fd8e77b`, and `05ca38f`.

- Root typecheck and tests passed: 31 files / 449 tests, plus the stdio test. The subsequent fixes change frontend code only.
- Final frontend gates passed: 34 files / 163 tests, lint with four existing warnings, and production-config build with the existing chunk-size warning. Root and frontend production dependency audits reported zero vulnerabilities.
- QA independently reviewed the six integration paths against `0ed834e`: code PASS, no unresolved findings. A separate Vite SSR check using the actual transcriber with fake speech recognition and Convex covered 12 scenarios: one active recognizer and one append, both mute paths and resume, late callbacks, both mount orders, route handoff, standalone notes, session/participant isolation, ended sessions, host switching, same-session rejoin, and failed Join.
- The host panel mic controls transcription for everyone. The member panel mic controls a local opt-out that persists across `/3d` and `/mri`. Call Mute suppresses local transcription. Leave or a failed Join restores standalone notes on `/3d` if the host switch remains on. On `/mri`, the call link owns capture.
- These checks do not establish physical microphone arbitration, two-laptop audio, autoplay, speaker rings, or venue-network behavior. T6 remains pending.

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
- Leaving the case pages mid-call hides Mute/Leave while audio continues.
- Each task commit carries an extra `Co-authored-by: Cursor` trailer (T2, T3).

## Steps 2-3: deploy and two-laptop check

LiveKit variables are set, and the call backend was deployed at `453bc32`. The production frontend checked at 2026-10-25 03:38:56 UTC did not contain the call UI: index and `/assets/index-CdYX2Y7Z.js` returned HTTP 200, but the bundle contained neither `Join call` nor LiveKit. QA loaded the sample case in Chrome on macOS. The bundle retained the expected RunPod API and production Convex URLs.

The two-laptop call check is BLOCKED by the missing-call frontend, not an audio failure. No new deployment was performed during PR preparation. After merge, wait for the main-branch CI deployment, verify `Join call` is present, then run the rows below with headphones. Record each laptop's browser, OS, and network; those details are still pending.

| # | Check | Result | Browser + OS | Network |
|---|---|---|---|---|
| 1 | Host shares sample case; guest joins via invite | PENDING | | |
| 2 | Both Join call; each hears the other; face-pile avatar and 3D cursor chip ring on the speaker | PENDING | | |
| 3 | Mute: ring stops, other side hears nothing; Unmute | PENDING | | |
| 4 | `/3d` → `/mri` → `/3d`: audio continues | PENDING | | |
| 5 | Host enables transcript; each speaker's words land under their own name; STT and LiveKit share the mic | PENDING | | |
| 6 | Host ends session: both calls end, buttons disappear | PENDING | | |
| 7 | Env unset on a dev deployment: Join shows "Call unavailable" | PENDING | | |
