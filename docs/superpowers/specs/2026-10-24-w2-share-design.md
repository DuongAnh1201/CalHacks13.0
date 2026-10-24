# W2 · Share — design

Date: 2026-10-24 · Status: approved by user, awaiting spec review · Milestone: **W2 · Share**

## Goal

The disabled **Share** button in `TopNavBar` starts a live session on Sage's Convex Phase 1 backend (`convex/sessions.ts`). A second person opens an invite link, joins, and follows the host: first the MRI slice crosshair (Phase A), then the 3D page (Phase B).

The user hosts the Convex deployment. Setup, once, at the repo root:

1. `npm install`, then `npx convex login`, then `npx convex dev`. This writes the root `.env.local` with `CONVEX_URL`.
2. `frontend/.env.local`: `VITE_CONVEX_URL=<CONVEX_URL>`.
3. `npx convex run seed:seedSampleScan`.

## Decisions

| Question | Decision |
|---|---|
| What mirrors | Phase A: the `/mri` crosshair (all 3 planes). No Convex change. Phase B adds tumor overlay visibility, because the fixture has no `tumor`, so `setTumorVisible true` throws `INVALID_ARGUMENT` until B1 seeds it from the real report. Phase B: `/3d` page state plus page follow, with Convex widened. |
| Which scans | The sample case (`jobs/sample`) only. Uploads aren't registered in Convex, and their affine needs M4 (Tom). |
| Join | Link `/join/<inviteCode>` plus the code shown in the popover. The guest types a display name. |
| Guest controls | Follow / Stop following, plus a roster of who joined (membership, not online status). The host can end the session. No presenter handoff, no presence. |
| Phase A sync | Translate to the existing commands (`setPlane` + `setSlice` for every changed axis, always both, so an in-flight plane change can never misroute a slice). Phase B replaces this with an atomic `setCursor`. |
| Phase B Convex code | Our be worker writes it in `convex/`. Sage reviews the PR before merge. |

## Non-goals

- Uploaded jobs, and `scans.register` from the backend (needs M4).
- Presenter handoff, presence/online dots, heartbeats.
- Camera orbit sync, gesture streaming (Sage's guardrail 7).
- The structure tree (`selectedStructure`, `hiddenStructures`, `isolate`), the cut plane, and the Focus second-press re-frame. All stay local.
- Server-side workspace list; Home stays on `localStorage`.
- Offline/reconnect UI. The Convex client reconnects on its own.
- Hashed tokens, single-use invite codes (accepted demo limitations, `docs/CONVEX_BACKEND.md`).

## 1. Sync by voxel index, not mm

The seeded fixture has a placeholder affine (`centredAxisAlignedAffine`, `convex/seed.ts:138`), so Convex's `cursorRasMm` does not match the mm that NiiVue reads from the real NIfTI header. The grid does match: 240 × 240 × 155 at 1 mm in both `convex/seed.ts:86` and `jobs/sample/report.json`. The frontend therefore syncs only through `view.sliceIndices` (`{axial, coronal, sagittal}`) and never reads or writes `cursorRasMm`.

Mapping: `MprPanel` reads `nv.scene.crosshairPos[AXIS_INDEX[axis]]` (RAS-ordered fraction) and `dimsRAS`. Index = `sliceOf(frac, N) - 1` (existing `viewer/slices.ts`); frac = `(index + 0.5) / N` (voxel centre). `AXIS_INDEX` = sagittal 0, coronal 1, axial 2. That matches `planeToRasAxis` in `convex/lib/transform.ts`.

## 2. Phase A — frontend only

**Dependency:** `frontend/package.json` adds `convex` `^1.48.0` (same as root). The frontend uses `ConvexClient` (`convex/browser`) with untyped `anyApi` refs and hand-written types in `share/types.ts`. Importing `convex/_generated/api` would make the frontend `tsc` type-check `convex/` under the frontend tsconfig, and that needs the root `node_modules`. Mirrors SPEC §6 "No codegen", like `api/types.ts`.

**New `frontend/src/share/`:**

| File | Job |
|---|---|
| `client.ts` | Exports `convex: ConvexClient \| null` (`null` when `VITE_CONVEX_URL` is unset) and `api = anyApi`. |
| `types.ts` | Hand-written mirror of `SessionStateDto`, `PublicParticipant`, and `ViewerCommand`. |
| `copy.ts` | `codeOf(e)` reads `ConvexError.data.code`, and `messageFor(e)` maps it to the copy in section 4. |
| `store.ts` | Zustand `useShare` holding `{ stored, session, notice, syncNote }`, plus `startShare`, `joinShare`, `endShare`, `setFollowing`, `sendView`, `resume`. One `client.onUpdate(sessions.get)` subscription. Its error callback handles `SESSION_ENDED` and stale tokens. |
| `stored.ts` | sessionStorage key `nv.share` = `{ sessionId, participantToken, role }`. Every read and write is in try/catch, and blocked storage means none is stored. A reload re-uses the token instead of calling `join` again, because a second `join` adds a duplicate participant. |
| `mprSync.ts` | Pure functions: `commandsFor(prev: SliceIndices, next: SliceIndices): ViewerCommand[]`. For each axis whose index changed, it emits `setPlane`, then `setSlice`. Also `toIdx(frac, n)` and `toFrac(idx, n)`. |
| `SharePopover.tsx` | Host: link `${location.origin}/join/<code>` with **Copy link**, the code, the roster (`session.participants` from `sessions.get`), and **End session**. |
| `FollowBanner.tsx` | Guest: "Following <host name>" with **Stop following** / **Follow**. |

**New route** `/join/:code` → `routes/Join.tsx`: a display-name field and **Join**. It calls `join`, stores the token, and navigates to `/jobs/sample/mri`.

**Wiring:**
- `TopNavBar` Share:
  - Enabled on `/jobs/sample/*` and opens `SharePopover`; the host's display name is "Host".
  - Elsewhere it's disabled with the title "Sharing works on the sample case for now".
  - With no client it's disabled with the title "Sharing is not configured".
- `MprPanel` gets two optional props:
  - `onCrosshair?: (idx: SliceIndices) => void`. Fires from `onLocationChange` on the host.
  - `remote?: SliceIndices | null`. When it's set, each view sets `nv.scene.crosshairPos` from `toFrac`. Phase B widens this to `{ indices, tumorVisible }`.

**Data flow:**
- **Host.**
  - A crosshair change gives new indices. `commandsFor` turns them into commands, and the host sends them in order to `sessions.updateView`; Convex pushes `sessions.get` to all subscribers.
- **Guest.**
  - While `me.following`, `MprPanel` gets `remote` from `state.view`.
  - A guest click on a slice while following calls `setFollowMode(false)`, and the guest browses locally.
  - **Follow** calls `setFollowMode(true)` and snaps to the shared view.

Known cost: a click that moves 2 axes sends up to 4 mutations, so the guest can briefly see one axis moved before the other. Phase B removes this.

## 3. Phase B — Convex widened, 3D mirrored

**Convex (`convex/schema.ts`, `convex/lib/viewCommands.ts`, `convex/sessions.ts`, `convex/seed.ts`):**
- `seed.ts`: the sample gets `segmentationSource: "model"` and `tumor: { detected: true, volumesCm3 }`, copied from `backend/seed/sample/report.json` (a real model run, so Sage's honesty rule holds). `isFixture` and the placeholder affine stay.
- `sessions` gets an optional `scene`. A missing `scene` reads as the default below, so existing rows keep working.
  ```ts
  scene: {
    page: 'mri' | '3d';
    mode: 'whole' | 'xray' | 'exploded' | 'cutaway';
    brainOpacity: number;       // 0..1
    explodeAmount: number;      // 0..1
    hidden: { left: boolean; right: boolean };
    layers: { edema: boolean; core: boolean; enhancing: boolean };
    cameraTarget: 'brain' | 'tumor';
  }
  // default: { page: 'mri', mode: 'whole', brainOpacity: 0.3, explodeAmount: 0,
  //   hidden: { left: false, right: false }, layers: { edema: true, core: true, enhancing: true },
  //   cameraTarget: 'brain' }  — same as frontend initialState()
  ```
- New `ViewerCommand` arms, each validated in `vViewerCommand` and bounds-checked in `applyCommand`:
  - `setCursor { sliceIndices: {axial, coronal, sagittal} }`: each index is clamped to its slice count.
  - `setPage { page }`
  - `setMode { mode }`
  - `setOpacity { value }` and `setExplosion { value }`: clamped to 0..1, non-finite values rejected with `INVALID_ARGUMENT`.
  - `setHemisphereVisible { side, visible }`
  - `setLayerVisible { layer, visible }`: rejected when the scan has no tumor.
  - `setCameraTarget { target }`: `'tumor'` rejected when the scan has no tumor.
- `resetView` also resets `scene` to the default.
- `SessionStateDto.view` gains `scene`.

**Frontend:**
- `share/sceneSync.ts`.
  - Host side: subscribes to `useViewer` and diffs the shared fields into commands. `brainOpacity` and `explodeAmount` are throttled to one write per 150 ms with a trailing write.
  - Guest side: applies `scene` through `dispatch(...)`, so the store keeps one mutation path (SPEC §7.3). Mapping: `cameraTarget 'tumor'` → `focusTumor`; `cameraTarget 'brain'` → no dispatch (the guest's own camera stays put).
- Page follow: the host sends `setPage` on mount of `/mri` and `/3d`. A following guest whose route differs navigates to `/jobs/sample/<page>`.
- The `/mri` crosshair switches from `commandsFor` to a single `setCursor`. `mprSync.commandsFor` is deleted.
- Mask sync: host mask slider moved to 0 → `setTumorVisible false`; moved above 0 from 0 → `true`. The guest's overlay opacity is their own mask % if `tumorVisible`, else 0.

## 4. Errors and copy

| Case | What the user sees |
|---|---|
| `INVALID_INVITE` on `/join` | "That invite link doesn't work. Ask the host for a new one." |
| `SESSION_ENDED` | Banner "The host ended the session". The stored token is cleared and the view stays put. |
| `NOT_A_MEMBER` / `NOT_AUTHENTICATED` (stale token) | The token is cleared and `/join/:code` shows the name form again. Elsewhere the banner disappears. |
| `NOT_PRESENTER` | Not reachable from the UI (guests send no `updateView`). `console.error` only. |
| `scans.getByJobId('sample')` returns null | Share shows "Sample scan is not in Convex. Run seed:seedSampleScan". |
| `NOT_FOUND` from `sessions.get` | Treated as a stale token: token cleared. |
| `updateView` rejects | The host keeps the local view. Inline note in the popover: "Couldn't sync. Will try again on the next change." No retry loop. |
| `VITE_CONVEX_URL` unset | Share disabled, "Sharing is not configured". Everything else works. |

Copy rules from W1 apply: no keyboard shortcuts or key names, no "heal"+"thy", no Figma placeholder data.

## 5. Testing

**Frontend vitest:**
- `mprSync`:
  - one axis changed;
  - two axes changed;
  - no change → `[]`;
  - `toFrac`/`toIdx` round-trip at 0 and N − 1.
- `stored`: read, write and clear; blocked storage returns null.
- `Join`: `INVALID_INVITE` shows the copy above.
- `TopNavBar`: Share is disabled off-sample and with no client.
- Phase B `sceneSync`: field diff to commands, and the throttle emitting a trailing write.

**Convex vitest + `convex-test` (Phase B; both already in root `package.json`):**
- `applyCommand` for every new arm, with its bounds and its tumor/no-tumor rejections.
- `create` → `join` → `updateView(setExplosion)` → guest `get` shows the new `scene`.
- `updateView` by a guest → `NOT_PRESENTER`.

**Gates:** frontend `tsc -b`, `npm run build` and vitest; root `npm test` and `npm run typecheck`.

**qa, in two browser windows** (needs the user's deployment). This also covers Sage's Phase 1 two-tab acceptance, which has never been run.

*Phase A:*
1. On `/jobs/sample/mri`, Share shows the link, code and roster.
2. The guest opens the link, enters a name, and lands following.
3. A host click in the axial view moves the guest crosshair in all 3 views.
4. A guest click stops following. **Follow** snaps back.
5. **End session** shows "The host ended the session".
6. A guest reload keeps the session with no second roster entry.

*Phase B:*
1. Host to `/3d` → the guest follows.
2. Explode, opacity, mode, layers, hemispheres and Focus Tumor mirror. Host mask at 0 on `/mri` hides the guest overlay.
3. The guest orbits their own camera freely.

## 6. Issues

New milestone **W2 · Share**:

| Issue | Scope | Owner | Depends on |
|---|---|---|---|
| W2-A1 | `share/client`, `types`, `copy`, `stored`, `store`, `SharePopover`, `FollowBanner`, `/join/:code`, `TopNavBar` Share | fe | user's Convex deployment (for qa only) |
| W2-A2 | `mprSync`, `MprPanel` `onCrosshair` / `remote` | ai | A1 store interface |
| W2-A3 | qa Phase A two-window pass | qa | A1, A2 |
| W2-B1 | Convex `scene` + new commands + seeded tumor + tests; Sage reviews | be | A3 green |
| W2-B2 | `sceneSync`, page follow, `setCursor` replaces `commandsFor`, mask → `setTumorVisible` | ai | B1 |
| W2-B3 | qa Phase B pass | qa | B2 |

Conflict risk: #56 [AG-T] also edits `convex/schema.ts` (new tables). B1 adds one optional field to `sessions`, so a merge conflict there is trivial.
