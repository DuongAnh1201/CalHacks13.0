# Live group call (case pages) — design

Date: 2026-10-24 · Status: approved by user in brainstorm · Sub-project 3 of the NeuroVision collaborative-workspace brief (sub-project 2, the Miro-style whiteboard UI, is owned by Sage and out of scope here)

## Goal

Members of a live session talk to each other by voice while they review the shared case, and everyone sees who is speaking: a coloured ring on that person's face-pile avatar and 3D cursor. While a member is in the call and unmuted, their speech feeds the existing live transcript (#135), so the transcript shows who said what.

## Decisions

| Question | Decision |
|---|---|
| Media | Audio only. No video, no screen share. |
| Transport | **LiveKit Cloud**, token-only. Convex mints a room token after the member check; LiveKit carries the audio (SFU + built-in TURN). Chosen over a P2P WebRTC mesh because TURN removes the venue-Wi-Fi/NAT failure mode and active-speaker detection comes for free. |
| `convex-livekit` component | **Not used.** It is v0.0.9 from a single maintainer, and its webhook-synced tables, egress and ingress are surface we do not need. The official `livekit-server-sdk` mints the token. |
| Where the call lives | The whole session. The connection lives in a module-scope store, not a component, so it survives `/mri` ↔ `/3d` navigation for the same session. |
| Join model | Explicit **Join call** button in `share/ShareControls.tsx` (hosted by `TopNavBar`), next to `FacePile`. The mic is live on join, with Mute and Leave next to it. The click is the user gesture for mic permission and audio autoplay. |
| Host controls | None. Everyone controls only their own mic. Tokens carry no admin grant. |
| Speaking indicator | From LiveKit's `ActiveSpeakersChanged` event on the client. Nothing about speaking goes through Convex. |
| Transcript | Reuse #135 (`frontend/src/agent/transcribe.ts`, `convex/transcript.ts`) unchanged. `call/transcribeLink.ts` starts the transcriber while `live && !muted` and the host's transcript switch is on, and stops it otherwise. |
| Convex review | Sage reviews the PR before merge (new action, new secrets, new dependencies). |

## Non-goals

- Video, screen share, chat in the call, raise-hand, reactions.
- Recording or egress (a later Scribe-report idea; it would need its own privacy review).
- LiveKit webhooks, or any server-side record of who is in the call.
- Host mute/remove, waiting rooms, call capacity limits beyond LiveKit's own.
- A transcript tab, a transcription banner or per-user transcription opt-out (#139, claude2 lane).
- Hiding the Join button when LiveKit is not configured (it shows an error on click instead).
- Calls outside a session, or on pages other than `/jobs/<id>/mri` and `/jobs/<id>/3d`.

## 1. Architecture

```
Join click ──► call.token (Convex action)
                 ├─ runQuery(internal.call.member) ─► requireSessionMember + session active
                 └─ livekit-server-sdk AccessToken ─► {url, token}
           ──► livekit-client Room.connect(url, token) ─► LiveKit Cloud (room = sessionId)
                 ├─ remote audio tracks ─► hidden <audio> elements
                 └─ ActiveSpeakersChanged ─► useCall.speaking ─► FacePile / RemoteCursors rings
useCall (live && !muted) ─► createTranscriber().start() ─► transcript.append (#135)
```

### Units

1. **`convex/call.ts`, `member` internalQuery** (new). Args `{sessionId, participantToken}`. Runs `requireSessionMember`, refuses an ended session with `SESSION_ENDED`, and returns `{participantId, displayName}`. Actions have no `db`, so the check lives in a query.
2. **`convex/call.ts`, `token` public action** (new, default runtime: `livekit-server-sdk` has no Node built-ins, it signs with `jose` on Web Crypto). Args `{sessionId, participantToken}`.
   - Reads `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `LIVEKIT_URL`. If any is missing, it throws `appError("UNAVAILABLE", "Call unavailable")`.
   - Calls `ctx.runQuery(internal.call.member, args)`.
   - Mints an `AccessToken`: identity = `participantId`, name = `displayName`, ttl 15 min. Grant: `{roomJoin: true, room: sessionId, canPublish: true, canPublishSources: [microphone], canSubscribe: true, canPublishData: false}`. No `roomAdmin`, `roomCreate` or `roomList`.
   - Returns `{url, token}`.
3. **`frontend/src/call/store.ts`, zustand `useCall`** (new).
   - State: `status: 'idle' | 'connecting' | 'live' | 'error'`, `muted: boolean`, `speaking: Set<string>` (participantIds), `error: string | null`.
   - Actions: `join()`, `leave()`, `toggleMute()`.
   - The LiveKit `Room` and the transcriber are module-scope singletons. The `Room` constructor and the transcriber factory are injectable for tests, following the `ctor` pattern of `createTranscriber`.
4. **`frontend/src/call/CallControls.tsx`** (new). Renders Join, or Mute/Unmute + Leave, plus an inline error. It is rendered in `share/ShareControls.tsx` (which `TopNavBar` hosts since #140) under the same condition as `FacePile`: active session on `/jobs/<id>/(mri|3d)`.
5. **Speaking rings** (modified `FacePile.tsx`, `RemoteCursors.tsx` + CSS). A face or cursor whose `participantId` is in `useCall.speaking` gets a `colorOf(participantId)` ring. The self face rings when the local user speaks.
6. **Transcriber coupling** (`frontend/src/call/transcribeLink.ts`). The transcriber runs only while `status === 'live' && !muted && transcriptEnabled`, where `transcriptEnabled` comes from a `transcript.state` subscription (the host switch, #135; `append` refuses while it is off). `onSegment` posts through a new `sendTranscript` sender in `share/store.ts`. #135/#136 are merged into `main`; the host toggle UI stays with #139.

## 2. Data flow

**Join**
1. Set `status = 'connecting'` and call `call.token` with `useShare`'s `{sessionId, participantToken}`.
2. `room.connect(url, token)`, then `room.startAudio()` while still inside the click handler's promise chain.
3. `room.localParticipant.setMicrophoneEnabled(true)` makes the browser show its mic prompt. Then `status = 'live'`, `muted = false`.
4. `TrackSubscribed` (audio): `track.attach()` and append the element to a hidden container. `TrackUnsubscribed`: `track.detach()` and remove it.
5. `ActiveSpeakersChanged(speakers)`: `speaking = new Set(speakers.map(p => p.identity))`.

**Mute**: `setMicrophoneEnabled(!muted)` and flip `muted`. When muted, the local id leaves `speaking`. The transcriber stops (unit 6).

**Leave**: `room.disconnect()`, detach all audio, `status = 'idle'`, `speaking` cleared, transcriber stopped.

**Automatic leave**: `useCall` subscribes to `useShare`. When `session` becomes null or not `active` (left, ended, kicked), it calls `leave()`. Tab close is handled by `livekit-client` itself (`disconnectOnPageLeave`, default on).

Route changes between `/mri` and `/3d` do nothing to the call. Navigating to a page without `TopNavBar` controls keeps the call running while the session is active. The user can come back to leave.

## 3. Errors

| Case | Behaviour |
|---|---|
| `NOT_AUTHENTICATED` / `NOT_A_MEMBER` / `SESSION_ENDED` from `token` | `status = 'error'`, inline message: "You're no longer in this session" (auth/member) or "This session has ended". Join stays clickable. |
| `UNAVAILABLE` (LiveKit not configured) | Same, message "Call unavailable". |
| `room.connect` throws (network, bad token) | Disconnect, `status = 'error'`, "Couldn't connect to the call". |
| Mic permission denied | Disconnect, `status = 'error'`, "Microphone blocked". The user is not left in the room listening silently. |
| `Disconnected` event after `live` (LiveKit gave up reconnecting) | `status = 'idle'`, `error = "Call dropped. Join again"`. |
| Token expiry | LiveKit refreshes tokens for connected participants. Each Join mints a fresh token. |

## 4. Security, privacy, limits

- Every token mint is authorized by `requireSessionMember` (guardrail 5). The room name is the `sessionId`, so a token for session A cannot join session B's room.
- Tokens grant publish-mic and subscribe only. No data channel and no admin, so a client cannot kick, mute or list others.
- Secrets live in Convex env only, set by the user with `npx convex env set`. They are never logged, returned or committed. `LIVEKIT_URL` is returned to the client: it is a public `wss://` endpoint, not a secret.
- Audio passes through LiveKit Cloud (a third party). It is acceptable only for the de-identified sample case of this research prototype (guardrail 11). Nothing is recorded.
- No new Convex writes at audio or speaking rate (guardrail 7). The one Convex call per Join is the token action.
- Two tabs of the same participant share one identity. LiveKit disconnects the older tab, which then shows "Call dropped". Accepted.
- Exact `livekit-client` / `livekit-server-sdk` signatures are checked against their docs at plan time (guardrail 13). Versions are pinned exactly.

## 5. Testing

**Convex (`convex/tests`, convex-test)**
- `call.member`: bad token → `NOT_AUTHENTICATED`; member of another session → `NOT_A_MEMBER`; ended session → `SESSION_ENDED`; member → `{participantId, displayName}`.
- `call.token`: env missing → `UNAVAILABLE`. With env stubbed, decode the JWT payload (base64 of the middle segment) and check:
  - `sub === participantId`
  - `video.room === sessionId`
  - `video.roomJoin === true`
  - `video.canPublishData === false`
  - no `roomAdmin`
  - `exp - nbf` ≈ 900 s.

**Frontend (vitest, fake `Room` + fake transcriber)**
- join → `connecting` → `live`; `token` error → `error` with the mapped message; mic denied → disconnect + `error`.
- `toggleMute` flips `muted` and calls `setMicrophoneEnabled`.
- An emitted `ActiveSpeakersChanged` updates `speaking`.
- Clearing `useShare.session` calls `leave()` and disconnects.
- Transcriber `start` runs only while `live && !muted` and the switch is on; `stop` runs on mute, leave and error.
- `FacePile` renders a ring class for a speaking participant.

**Manual (early, on the venue Wi-Fi)**
- Two laptops join the same session and hear each other.
- Rings follow the speaker.
- `/3d` → `/mri` keeps audio.
- Leaving the session ends the call.
- With #135 merged, transcript segments appear under the right speaker.

## 6. Dependencies and setup

- Root (Convex): `livekit-server-sdk@2.19.1` (exact pin; versions at least two weeks old).
- Frontend: `livekit-client@2.22.4` (exact pin), loaded with a dynamic `import()` on first Join. `@livekit/components-react` is not used.
- User sets `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `LIVEKIT_URL` from a LiveKit Cloud project on the Convex deployment.
- `docs/CONVEX_BACKEND.md` gets a short "Live call" section: the three env vars, and the third-party audio note.
