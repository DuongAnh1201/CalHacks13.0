# Presence + 3D cursors (case /3d and Learn) — design

Date: 2026-10-24 · Status: approved by user, awaiting spec review · Sub-project 1 of the NeuroVision collaborative-workspace brief

## Goal

People in a live session see who is online right now (heartbeat-based, expires) and see each other's pointer as a live 3D point on the model. This works on the case `/jobs/sample/3d` page and on `/learn`. Learn becomes shareable, and it behaves the same as the case pages: Share popover, Join link, roster, Follow banner, follow mirroring, presence and cursors.

## Decisions

| Question | Decision |
|---|---|
| First sub-project of the brief | Presence + 3D cursors. The rest of the brief (infinite canvas, spatial objects, 4-role workspaces, medical tools, Miro toolset) gets its own spec → plan cycles later. |
| What a "cursor" is | Raycast hit on the model: `{node, localMm}`, the hit point in the hit mesh's local frame. Others see a coloured dot + name chip. Hidden when the pointer is off the model. No camera ghosts, no screen-space arrows. |
| Pages | `/jobs/sample/3d` and `/learn`. No cursors on `/mri`. Presence (face pile, online dots) shows wherever a session is active. |
| Presence transport | `@convex-dev/presence` on the server, plus our own thin client loop on the existing `ConvexClient`. The stock `usePresence` hook is **not** used: its `heartbeat` args are fixed (`roomId, userId, sessionId, interval`), so there is no slot for our participant token. It also needs a `ConvexProvider`, which would be a second websocket. |
| Cursor transport | Separate `cursors` table, one row per participant, ≤ 10 Hz, written only on change. It never touches `sessions` / `sessionParticipants`, so `sessions.get` does not re-run at cursor rate. |
| Learn room | `sessions` is widened with `subject: "case" \| "atlas"`. Atlas rooms have no `scanId`. |
| Learn follow mirrors | page, explode, selected structure, hidden structures, isolate. The camera stays local, as on the case pages. |
| Convex review | Sage reviews the PR before merge (schema change + bends guardrail 7, see Limits). |

## Non-goals

- Cursors on `/mri` (2D slice hover).
- Camera-pose sync or camera ghosts. An off-screen indicator for a cursor outside the view.
- Owner / Editor / Commenter / Viewer roles. Roles stay `host | viewer`.
- Presence `data` / metadata from the component.
- Uploaded jobs (still sample case only, unchanged from W2).
- Hashed tokens, single-use invites (accepted demo limits, `docs/CONVEX_BACKEND.md`).

## 1. Convex

### 1.1 `sessions` widened

All new fields are optional, so existing rows stay valid.

- `subject: v.optional(v.union(v.literal("case"), v.literal("atlas")))`. Missing reads as `"case"`.
- `scanId: v.optional(v.id("scans"))`.
- `sessions.create` args become `{ subject?, scanId?, hostDisplayName }`:
  - `scanId` is required when the subject is `"case"`.
  - `scanId` is forbidden when the subject is `"atlas"`.
  - Anything else throws `INVALID_ARGUMENT`.
- Atlas rooms skip `loadScan` and slice derivation in `create`, `get` and `updateView`. `SessionStateDto` adds `subject`, and `view.sliceIndices` is `null` for atlas.
- `vScene` (`convex/lib/viewCommands.ts`) is widened:
  - `page` adds `"learn"`.
  - New optional fields: `structure: string | null`, `hiddenStructures: string[]`, `isolate: boolean`.
- New `ViewerCommand`s:
  - `setStructure { id: string | null }`
  - `setStructureVisible { id, visible }`
  - `setIsolate { on }`

  Validation, at the trust boundary:
  - Each id is 1–64 chars.
  - `hiddenStructures` holds ≤ 256 entries.
  - `setStructureVisible` adds or removes one id, with no duplicates.
- Commands by subject:
  - Atlas rooms accept only `setPage("learn")`, `setExplosion`, `setStructure`, `setStructureVisible`, `setIsolate`.
  - Case rooms reject the three structure commands and `setPage("learn")`.
  - Both reject with `INVALID_ARGUMENT`.
- `sessions.end` also deletes the room's `cursors` rows.

### 1.2 Presence

- Root `package.json` adds `@convex-dev/presence`. `convex/convex.config.ts` adds `app.use(presence)` next to static hosting.
- New `convex/presence.ts`, with `presence = new Presence(components.presence)`:
  - `heartbeat({ token, clientId, interval })`:
    - Calls `requireParticipant(token)` and refuses ended sessions.
    - Then calls `presence.heartbeat(ctx, sessionId, participantId, clientId, interval)` and returns `{ roomToken, sessionToken }`.
    - `roomId` and `userId` are always server-derived.
  - `list({ roomToken })`. No per-user reads, so all subscribers share one cached query (component README).
  - `disconnect({ sessionToken })` is unauthenticated, because the component requires that (it is called from `sendBeacon`).

### 1.3 `cursors` table

```ts
cursors: defineTable({
  sessionId: v.id("sessions"),
  participantId: v.id("sessionParticipants"),
  node: v.string(),            // 1–128 chars
  localMm: v.union(vVec3, v.null()),
  updatedAt: v.number(),
})
  .index("by_session", ["sessionId"])
  .index("by_participant", ["participantId"]),
```

- `cursors.move({ token, node, localMm })`:
  - Calls `requireParticipant`, then upserts the caller's own row only.
  - `localMm` must be exactly 3 finite numbers, or `null`.
  - Refused when the session has ended.
- `cursors.list({ token })` returns the session's rows minus the caller's, as `{ participantId, displayName, node, localMm }`.
- Everyone in the room (host + viewers) may send cursors. The existing `NOT_PRESENTER` gate on the shared view is unchanged.

## 2. Frontend

### 2.1 New units in `frontend/src/share/`

| File | Job |
|---|---|
| `presence.ts` | `startPresence(token): stop`. Heartbeat every 10 s via `convex.mutation(api.presence.heartbeat)`, with `clientId = crypto.randomUUID()` per tab. Then `onUpdate(api.presence.list, { roomToken })` writes `useShare.online: Set<participantId>`. On `pagehide` it `sendBeacon`s `{ path: "presence:disconnect", args: { sessionToken } }` to `${VITE_CONVEX_URL}/api/mutation`, matching the stock hook. When the page goes hidden it disconnects, and when it becomes visible again it re-heartbeats. `store.ts` starts it when a session is active and stops it on end or leave. |
| `cursorSync.ts` | Pure. `cursorSender(send, ms = 100)` is a trailing throttle: it sends only when `{node, localMm}` changed, and sends a single `null` after the pointer leaves. `colorOf(participantId)` picks a stable colour from a fixed 8-colour palette. |
| `RemoteCursors.tsx` | R3F child, mounted in `CaseCanvas` and `AtlasCanvas` when a session is active. Subscribes to `cursors.list`. Per row it calls `scene.getObjectByName(node)` → `localToWorld(localMm)` and lerps toward the target in `useFrame` (~120 ms ease). It draws a small sphere plus a drei `<Html>` name chip in `colorOf`. A row is hidden when its node is unresolved, its owner is not in `online`, or `localMm` is `null`. |
| `FacePile.tsx` | In `TopNavBar`: up to 4 initials avatars plus "+N", online participants only. |

`SharePopover`'s roster gains online/offline dots, so membership is no longer presented as presence.

### 2.2 Pointer capture

- `AtlasCanvas` extends its existing `onPointerMove` / `onPointerOut` on the atlas primitive.
- `CaseCanvas` adds the same handlers on its world group (it has none today).
- Both push `{ node: e.object.name, localMm: e.object.worldToLocal(e.point.clone()).toArray() }` into `cursorSender`. Pointer-out pushes `null`.

The local frame is explode-safe because each receiver re-projects through its own transforms. This assumes GLB node names are unique per model, and a test checks it against both GLBs.

### 2.3 Learn wiring

- `TopNavBar` Share:
  - Enabled on `/learn*` → `startShare({ subject: "atlas" })`.
  - Case pages are unchanged (`SAMPLE_ONLY` elsewhere).
- `Join` routes by the session's `subject`: case → `/jobs/sample/mri`, atlas → `/learn`.
- `useShareSync` accepts `page: "learn"`. `Learn.tsx` calls it.
- `sceneOf` / `sceneCommands` / `sceneActions` gain the three structure fields.
- A following guest's own structure click (select, hide, isolate) calls `setFollowMode(false)`, the same rule as the MRI slice click. **Follow** snaps back to the shared scene.
- `share/types.ts` mirrors the widened DTO, `Scene` and `ViewerCommand`.

## 3. Errors and limits

### Errors

- No `VITE_CONVEX_URL`: presence and cursors are off, and Share stays disabled (current behaviour).
- Heartbeat fails (offline): retry on the next tick. The client reconnects on its own. Others see us go offline after the component's timeout.
- `SESSION_ENDED` or a stale token on any presence or cursor call: stop the loops and clear cursors, via the existing `store.ts` error path.
- Tab crash (no beacon): the component timeout expires the session. Our cursor row lingers but is hidden because its owner is offline.
- Bad cursor payload: `INVALID_ARGUMENT`. The sender drops errors silently, because cursors are best-effort.

### Limits (accepted)

- `disconnect` is unauthenticated. A leaked per-tab `sessionToken` can only mark that tab offline for a few seconds.
- Up to 10 writes/s per participant while the pointer moves over the model, and 0 when idle. At 4 people that is ≈ 40 writes/s peak. This bends guardrail 7 (no high-frequency writes), but it is isolated from `sessions.get`. Sage reviews it, and above ~10 users it needs revisiting.
- A following guest shares the host's scene but not the camera, so the host's cursor may be off-screen for them. There is no indicator.

## 4. Testing

**Convex (`convex/tests`, convex-test)**
- Session `create` by subject:
  - Atlas with no `scanId` succeeds.
  - Case with no `scanId` → `INVALID_ARGUMENT`.
  - Atlas with a `scanId` → `INVALID_ARGUMENT`.
- Atlas `get` returns `subject: "atlas"` and `sliceIndices: null`.
- Command filtering by subject:
  - Atlas rooms reject `setSlice` / `setPlane` / `setTumorVisible`.
  - Case rooms reject the structure commands.
  - The structure-id caps are enforced.
- Presence and cursor mutations:
  - `presence.heartbeat` with a bad token, or on an ended session → refused.
  - `cursors.move` writes only the caller's row, rejects NaN / length ≠ 3 / an oversized node, and is refused after `end`.
  - `cursors.list` excludes the caller.
  - `sessions.end` deletes the room's cursors.

**Frontend (vitest)**
- `cursorSender`: throttle, sends only on change, a single trailing `null`.
- `colorOf`: same id → same colour.
- `sceneCommands` / `sceneActions` round-trip the Learn fields.
- `Join` routes by `subject`.
- GLB node names are unique (case sample + atlas).

**Manual (two browsers)**
- `/jobs/sample/3d` and `/learn` both:
  - Avatars appear on join, and disappear after a tab close within the timeout.
  - Cursors track correctly across different explode values per browser.
- On `/learn`, follow mirrors structure select, hide and isolate.

**Gates:** `npm run typecheck`, `npm test` (root), `npm --prefix frontend run build`, `npm --prefix frontend test`.
