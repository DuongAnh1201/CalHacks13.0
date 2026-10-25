# Presence + 3D cursors (case pages) — design

Date: 2026-10-24 · Status: approved by user; revised 2026-10-24 to remove Learning Mode; revised again 2026-10-24 to reconcile with main (§R) · Sub-project 1 of the NeuroVision collaborative-workspace brief

## Goal

People in a live session of a shared case see who is online right now (heartbeat-based, expires) and see each other's pointer as a live 3D point on the model on `/jobs/<id>/3d`. This builds on the existing MRI/3D share flow (W2): Share popover, Join link, roster, Follow banner. Nothing about how a session is created or joined changes.

## Decisions

| Question | Decision |
|---|---|
| First sub-project of the brief | Presence + 3D cursors. The rest of the brief (infinite canvas, spatial objects, 4-role workspaces, medical tools, Miro toolset) gets its own spec → plan cycles later. |
| What a "cursor" is | Raycast hit on the model: `{node, localMm}`, the hit point in the hit mesh's local frame. Others see a coloured dot + name chip. Hidden when the pointer is off the model. No camera ghosts, no screen-space arrows. |
| Pages | Cursors on `/jobs/<id>/3d` of the session's case (any shared scan, as on main since `154ff7b`). Presence (face pile, online dots) shows on every case page while a session is active (`/mri` and `/3d`). |
| Learning Mode (`/learn`) | **Removed from the app** (user decision, 2026-10-24: redundant next to the MRI flow). See §0. `sessions` is not widened. |
| Presence transport | **Superseded by §R:** main's Phase 3 presence (`8b779f2`, `6fc8bad`) is used as is. Original text: `@convex-dev/presence` on the server, plus our own thin client loop on the existing `ConvexClient`. The stock `usePresence` hook is **not** used: its `heartbeat` args are fixed (`roomId, userId, sessionId, interval`), so there is no slot for our participant token. It also needs a `ConvexProvider`, which would be a second websocket. |
| Cursor transport | Separate `cursors` table, one row per participant, ≤ 10 Hz, written only on change. It never touches `sessions` / `sessionParticipants`, so `sessions.get` does not re-run at cursor rate. |
| Convex review | Sage reviews the PR before merge (schema change + bends guardrail 7, see Limits). |

## Non-goals

- Learn rooms, sharing `/learn`, atlas cursors (Learning Mode no longer exists).
- Backend `/learn` cleanup: agent eval `/learn` cases and thresholds, the MCP page enum, export guards, `backend/atlas/build_atlas.py`. They stay as dead input; a later change removes them.
- Cursors on `/mri` (2D slice hover).
- Camera-pose sync or camera ghosts. An off-screen indicator for a cursor outside the view.
- Owner / Editor / Commenter / Viewer roles. Roles stay `host | viewer`.
- Presence `data` / metadata from the component.
- Hashed tokens, single-use invites (accepted demo limits, `docs/CONVEX_BACKEND.md`).

## R. Reconcile with main (2026-10-24, user chose merge-and-reconcile)

Main gained its own presence while this branch was open: Phase 3 (`8b779f2` server, `357a551` roster dots + QR, `6fc8bad` hidden tab stays online), plus chat (`983982d`), any-finished-scan sharing (`154ff7b`) and camera follow (`16074cd`). Merge `origin/main` into this branch and keep main wherever both did the same job.

- **Main wins, ours dropped:**
  - `convex/presence.ts` + its test. Main's heartbeat args are the stock hook's `{ roomId, userId, sessionId, interval }`, with `userId` = participant token, checked server-side.
  - `convex/convex.config.ts`, `vitest.config.ts`.
  - `frontend/src/share/presence.ts` + its test.
  - Presence wiring in `store.ts`.
  - `SharePopover` online dots.
  - Identity stays server-derived either way, so the security property of §1.1 holds.
- **Ours kept, unchanged in behaviour:**
  - §0 Learning Mode removal.
  - The `cursors` table and `cursors.move` / `list`, plus the `sessions.end` cleanup.
  - `cursorSync.ts`, `RemoteCursors.tsx`, the `sendCursor` / `watchCursors` store functions and the `Cursor` types.
  - `FacePile` (reads main's `useShare.online`, the same name and type as ours) and its case-route guard.
- **Changed:**
  - Cursors run on whichever case the session reviews (`stored.jobId === jobId`), not only `sample`.
  - `CaseCanvas` carries both main's `camera` prop (follow) and our pointer handlers.
- **Hidden tabs:** main keeps a hidden tab online by design (`6fc8bad`), so the §2.1 "hidden → disconnect" behaviour and its manual check are void.
- Where §1.1, the `presence.ts` row of §2.1 and the presence tests of §4 disagree with this section, this section wins.

## 0. Remove Learning Mode (frontend)

- Delete the `/learn` route and its units: `routes/Learn.tsx`, `learn/*`, `viewer/AtlasCanvas.tsx`, `viewer/anatomy.ts`, `content/index.ts`, `public/atlas/brain_atlas.glb`, and their tests.
- `ExplodeSlider` and `StatusPill` move to `components/`, because `/3d` uses them.
- `/learn` and `/learn/*` redirect to `/`, the same way the legacy `/results` and `/explore` links redirect today.
- Home becomes MRI only:
  - no Learning Mode menu item or empty-state button;
  - no kind filter;
  - `WorkspaceKind = 'mri'`.
  - Saved Learn workspaces in localStorage are dropped on read.
- **Kept:**
  - `public/atlas/structures.json` and `content/anatomy.json`, which `convex/mcp/data.ts` imports for the MCP `explain_structure` tool.
  - The `selectStructure` / `setIsolate` / `hiddenStructures` actions, which are part of the agent/MCP action vocabulary.

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
- `/learn` and `/learn/<id>` redirect to `/`. A stored `learn` workspace is dropped. `hrefOf` → `/jobs/<id>/mri`.
- `startPresence`: heartbeat + list subscribe, hidden → disconnect, visible → heartbeat, pagehide → beacon, stop cleans up.
- `cursorSender`: throttle, sends only on change, a single trailing `null`.
- `colorOf`: same id → same colour. `cursorOf`: local frame survives a parent move; hidden/unnamed → null.
- GLB mesh node names are unique (sample case).

**Manual (two browsers)**
- `/jobs/sample/mri` and `/3d`: avatars appear on join, and disappear after a tab close within the timeout (or at once via the beacon).
- `/jobs/sample/3d`: cursors track correctly across different explode values per browser.
- After §R: a following guest sees the host's camera move and the host's cursor together. If a finished non-sample job exists, cursors work on its `/3d` too.
- `/learn` redirects to `/`. Home has no Learning Mode entry.

**Gates:** `npm run typecheck` (also proves the MCP still finds both atlas JSON files), `npm test` (root), `npm --prefix frontend run build`, `npm --prefix frontend test`.
