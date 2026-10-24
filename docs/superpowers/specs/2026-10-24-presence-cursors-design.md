# Presence + 3D cursors (case pages) — design

Date: 2026-10-24 · Status: approved by user; revised 2026-10-24 to drop Learn · Sub-project 1 of the NeuroVision collaborative-workspace brief

## Goal

People in a live session of the sample case see who is online right now (heartbeat-based, expires) and see each other's pointer as a live 3D point on the model on `/jobs/sample/3d`. This builds on the existing MRI/3D share flow (W2): Share popover, Join link, roster, Follow banner. Nothing about how a session is created or joined changes.

## Decisions

| Question | Decision |
|---|---|
| First sub-project of the brief | Presence + 3D cursors. The rest of the brief (infinite canvas, spatial objects, 4-role workspaces, medical tools, Miro toolset) gets its own spec → plan cycles later. |
| What a "cursor" is | Raycast hit on the model: `{node, localMm}`, the hit point in the hit mesh's local frame. Others see a coloured dot + name chip. Hidden when the pointer is off the model. No camera ghosts, no screen-space arrows. |
| Pages | Cursors on `/jobs/sample/3d` only. Presence (face pile, online dots) shows on every case page while a session is active (`/mri` and `/3d`). |
| Learn (`/learn`) | **Out of scope** (user decision, 2026-10-24: redundant next to the MRI flow). Learn stays as it is today: not shareable, no presence, no cursors. `sessions` is not widened. |
| Presence transport | `@convex-dev/presence` on the server, plus our own thin client loop on the existing `ConvexClient`. The stock `usePresence` hook is **not** used: its `heartbeat` args are fixed (`roomId, userId, sessionId, interval`), so there is no slot for our participant token. It also needs a `ConvexProvider`, which would be a second websocket. |
| Cursor transport | Separate `cursors` table, one row per participant, ≤ 10 Hz, written only on change. It never touches `sessions` / `sessionParticipants`, so `sessions.get` does not re-run at cursor rate. |
| Convex review | Sage reviews the PR before merge (schema change + bends guardrail 7, see Limits). |

## Non-goals

- Learn rooms, sharing `/learn`, atlas cursors.
- Cursors on `/mri` (2D slice hover).
- Camera-pose sync or camera ghosts. An off-screen indicator for a cursor outside the view.
- Owner / Editor / Commenter / Viewer roles. Roles stay `host | viewer`.
- Presence `data` / metadata from the component.
- Uploaded jobs (still sample case only, unchanged from W2).
- Hashed tokens, single-use invites (accepted demo limits, `docs/CONVEX_BACKEND.md`).

## 1. Convex

### 1.1 Presence

- Root `package.json` adds `@convex-dev/presence`. `convex/convex.config.ts` adds `app.use(presence)` next to static hosting.
- New `convex/presence.ts`, with `presence = new Presence(components.presence)`:
  - `heartbeat({ sessionId, participantToken, clientId, interval })`:
    - Calls `requireSessionMember`, which refuses bad tokens (`NOT_AUTHENTICATED`) and ended sessions (`SESSION_ENDED`).
    - `clientId` is 1–64 chars. `interval` is finite and clamped to 2–60 s.
    - Then calls `presence.heartbeat(ctx, session._id, participant._id, `${participant._id}:${clientId}`, interval)` and returns `{ roomToken, sessionToken }`.
    - `roomId` and `userId` are always server-derived.
  - `list({ roomToken })`. No per-user reads, so all subscribers share one cached query (component README).
  - `disconnect({ sessionToken })` is unauthenticated, because the component requires that (it is called from `sendBeacon`).

### 1.2 `cursors` table

```ts
cursors: defineTable({
  sessionId: v.id("sessions"),
  participantId: v.id("sessionParticipants"),
  // null = the pointer is off the model
  cursor: v.union(v.null(), v.object({ node: v.string() /* 1–128 chars */, localMm: vVec3 })),
  updatedAt: v.number(),
})
  .index("by_session", ["sessionId"])
  .index("by_participant", ["participantId"]),
```

- `cursors.move({ sessionId, participantToken, cursor })`:
  - Calls `requireSessionMember`, then upserts the caller's own row only.
  - `cursor.localMm` must be exactly 3 finite numbers.
  - Refused when the session has ended.
- `cursors.list({ sessionId, participantToken })` returns the session's rows minus the caller's, as `{ participantId, displayName, cursor }`.
- Everyone in the room (host + viewers) may send cursors. The existing `NOT_PRESENTER` gate on the shared view is unchanged.
- `sessions.end` also deletes the room's `cursors` rows.

## 2. Frontend

### 2.1 New units in `frontend/src/share/`

| File | Job |
|---|---|
| `presence.ts` | `startPresence(client, auth, convexUrl, onOnline): stop`. Heartbeat every 10 s via `client.mutation(api.presence.heartbeat)`, with `clientId = crypto.randomUUID()` per tab. Then `onUpdate(api.presence.list, { roomToken })` reports online participant ids, which `store.ts` keeps as `useShare.online: Set<participantId>`. On `pagehide` it `sendBeacon`s `{ path: "presence:disconnect", args: { sessionToken } }` to `${VITE_CONVEX_URL}/api/mutation`, matching the stock hook. When the page goes hidden it disconnects, and when it becomes visible again it re-heartbeats. `store.ts` starts it when a session is watched and stops it on end or leave. |
| `cursorSync.ts` | Pure. `cursorSender(send, ms = 100)` is a trailing throttle: it sends only when `{node, localMm}` changed, and sends a single `null` after the pointer leaves. `colorOf(participantId)` picks a stable colour from a fixed 8-colour palette. `cursorOf(object, point)` returns the hit in the mesh's frame, or null for a hidden or unnamed object. |
| `RemoteCursors.tsx` | R3F child, mounted in `CaseCanvas`. Subscribes to `cursors.list`. Per row it calls `scene.getObjectByName(node)` → `localToWorld(localMm)` and lerps toward the target in `useFrame` (~120 ms ease). It draws a small sphere plus a drei `<Html>` name chip in `colorOf`. A row is hidden when its node is unresolved, its owner is not in `online`, or `cursor` is `null`. Also exports `useCursorPush(enabled)`. |
| `FacePile.tsx` | In `TopNavBar`: up to 4 initials avatars plus "+N", online participants only. |

`SharePopover`'s roster gains online/offline dots, so membership is no longer presented as presence.

### 2.2 Pointer capture

- `CaseCanvas` adds `onPointerMove` / `onPointerOut` on its world primitive (it has none today), only while a session is active on the sample case. Without a session there are no handlers, so R3F does not raycast the case at all.
- Move pushes `cursorOf(e.object, e.point)` into `cursorSender`. Pointer-out pushes `null`.

The local frame is explode-safe because each receiver re-projects through its own transforms. This assumes GLB mesh node names are unique, and a test checks it against the sample case GLB.

## 3. Errors and limits

### Errors

- No `VITE_CONVEX_URL`: presence and cursors are off, and Share stays disabled (current behaviour).
- Heartbeat fails (offline): retry on the next tick. Others see us go offline after the component's timeout.
- `SESSION_ENDED` or a stale token: the existing `sessions.get` error path in `store.ts` drops the session, which stops the presence loop and unmounts the cursor subscription.
- Tab crash (no beacon): the component timeout expires the session. Our cursor row lingers but is hidden because its owner is offline.
- Bad cursor payload: `INVALID_ARGUMENT`. The sender drops errors silently, because cursors are best-effort.

### Limits (accepted)

- `disconnect` is unauthenticated. A leaked per-tab `sessionToken` can only mark that tab offline for a few seconds.
- Up to 10 writes/s per participant while the pointer moves over the model, and 0 when idle. At 4 people that is ≈ 40 writes/s peak. This bends guardrail 7 (no high-frequency writes), but it is isolated from `sessions.get`. Sage reviews it, and above ~10 users it needs revisiting.
- A following guest shares the host's scene but not the camera, so the host's cursor may be off-screen for them. There is no indicator.

## 4. Testing

**Convex (`convex/tests`, convex-test)**
- `presence.heartbeat` with a bad token, an ended session, or a bad `clientId` → refused. `list` shows the caller online. `disconnect` takes the tab offline.
- `cursors.move` writes only the caller's row, rejects NaN / length ≠ 3 / an empty or oversized node, and is refused after `end`.
- `cursors.list` excludes the caller.
- `sessions.end` deletes the room's cursors.

**Frontend (vitest)**
- `startPresence`: heartbeat + list subscribe, hidden → disconnect, visible → heartbeat, pagehide → beacon, stop cleans up.
- `cursorSender`: throttle, sends only on change, a single trailing `null`.
- `colorOf`: same id → same colour. `cursorOf`: local frame survives a parent move; hidden/unnamed → null.
- GLB mesh node names are unique (sample case).

**Manual (two browsers)**
- `/jobs/sample/mri` and `/3d`: avatars appear on join, and disappear after a tab close within the timeout (or at once via the beacon).
- `/jobs/sample/3d`: cursors track correctly across different explode values per browser.

**Gates:** `npm run typecheck`, `npm test` (root), `npm --prefix frontend run build`, `npm --prefix frontend test`.
