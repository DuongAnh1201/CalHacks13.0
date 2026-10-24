# Presence + 3D Cursors (case /3d and Learn) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In a live session, people see who is online (heartbeat, expires) and see each other's pointer as a live 3D dot on the model, on `/jobs/sample/3d` and on `/learn`. Learn becomes a shareable room that behaves like the case pages.

**Architecture:** `sessions` gains `subject: "case" | "atlas"`. Atlas rooms have no scan and run their own pure command reducer (`applyAtlasCommand`). Presence uses `@convex-dev/presence` behind our own token-checked wrappers, and the client drives a thin heartbeat loop on the existing `ConvexClient`. Cursors live in their own `cursors` table, one row per participant. Each row holds `{node, localMm}`, the hit point in the hit mesh's local frame, and every receiver re-projects it through its own scene. That keeps cursors correct when explode settings differ.

**Tech Stack:**
- Convex 1.48 with `@convex-dev/presence@0.4.0`, tested with convex-test + vitest (edge-runtime)
- React 19, react-three-fiber 9, drei 10, three 0.186, zustand 5, vitest (node env)

Spec: `docs/superpowers/specs/2026-10-24-presence-cursors-design.md`

## Global Constraints

- Convex args validators:
  - Every new public Convex function validates its args.
  - Auth is the existing `{ sessionId, participantToken }` pair, checked with `requireSessionMember` (`convex/lib/auth.ts`), which also refuses ended sessions with `SESSION_ENDED`.
- Room and user identity are server-derived:
  - The presence `roomId` is `session._id`.
  - The presence `userId` is `participant._id`.
  - Neither is ever taken from client args.
- Errors are thrown with `appError(code, message)` (`convex/lib/errors.ts`). Bad input → `INVALID_ARGUMENT`.
- Structure ids are 1–64 chars. `hiddenStructures` holds ≤ 256 entries. Cursor node names are 1–128 chars. `localMm` is exactly 3 finite numbers.
- Atlas rooms accept only these commands: `setPage("learn")`, `setMode`, `setOpacity`, `setExplosion`, `setHemisphereVisible`, `setStructure`, `setStructureVisible`, `setIsolate`.
  - Case rooms reject `setPage("learn")` and the three structure commands.
- Cursor sends are ≤ 10 Hz (trailing 100 ms throttle), only on change, and best-effort (errors swallowed).
- Presence heartbeat interval is 10 000 ms. The component times a tab out after 2.5 × interval.
- Frontend has no Convex codegen: `anyApi` plus hand-written mirror types in `frontend/src/share/types.ts`.
- GitNexus (project CLAUDE.md):
  - Run `impact({target, direction: "upstream"})` before editing any existing function, class or method, and report the risk.
  - Stop and warn on HIGH or CRITICAL risk.
  - Run `detect_changes()` before every commit.
- Commits:
  - Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Work happens on branch `agents/presence-cursors`.
- Gates: `npm run typecheck`, `npm test` (root), `npm --prefix frontend run build`, `npm --prefix frontend test`.

## Deviations from the spec (decided while planning, already applied to the spec)

1. Atlas rooms also accept `setMode`, `setOpacity` and `setHemisphereVisible`. The Learn toolbar has X-Ray, cortex opacity and L/R hemisphere controls. Without these commands, a Learn host's toolbar click would fail to sync (`SYNC_FAILED`) and break "same UX as the case pages".
2. Presence and cursor functions take `{ sessionId, participantToken }` like every other session function, not a bare `token`.
3. A cursor row stores `cursor: null | { node, localMm }` instead of a separate `node` plus nullable `localMm`.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `convex/lib/viewCommands.ts` | modify | Scene widened, structure commands, `ATLAS_SCENE`, `atlasSharedView`, `applyAtlasCommand`, `viewsEqual` |
| `convex/schema.ts` | modify | `sessions.subject`, optional `sessions.scanId`, `cursors` table |
| `convex/sessions.ts` | modify | subject-aware create/join/get/updateView; end clears cursors |
| `convex/exportDoc.ts` | modify | guard for atlas sessions (no scan) |
| `convex/convex.config.ts` | modify | `app.use(presence)` |
| `convex/presence.ts` | create | heartbeat / list / disconnect wrappers |
| `convex/cursors.ts` | create | move / list |
| `vitest.config.ts` | modify | inline presence + batch-worker for `import.meta.glob` |
| `convex/tests/viewCommands.test.ts` | modify | atlas reducer tests |
| `convex/tests/sessions.test.ts` | modify | atlas session tests |
| `convex/tests/presence.test.ts` | create | presence wrapper tests |
| `convex/tests/cursors.test.ts` | create | cursor tests |
| `docs/CONVEX_BACKEND.md` | modify | API table rows |
| `frontend/src/share/stored.ts` | modify | `Subject`, `subject` field, `roomPath` |
| `frontend/src/share/types.ts` | modify | DTO/command mirrors, `Cursor`, `RemoteCursor` |
| `frontend/src/share/copy.ts` | modify | `OTHER_ROOM` |
| `frontend/src/share/store.ts` | modify | `startShare(subject)`, subject on join, `activeFor`, `online`, presence start/stop, `sendCursor`, `watchCursors` |
| `frontend/src/share/client.ts` | modify | export `convexUrl` |
| `frontend/src/share/useMprShare.ts` | modify | gate on case rooms only |
| `frontend/src/share/sceneSync.ts` | modify | Learn fields in `Scene`, `sceneOf`, `sceneCommands`, `sceneActions`; `sameStructures` |
| `frontend/src/share/useShareSync.ts` | modify | subject gating, Learn navigation, unfollow on own structure change |
| `frontend/src/share/presence.ts` | create | client heartbeat loop |
| `frontend/src/share/cursorSync.ts` | create | `cursorSender`, `colorOf`, `cursorOf` (pure) |
| `frontend/src/share/RemoteCursors.tsx` | create | `RemoteCursors` R3F component, `useCursorPush` hook |
| `frontend/src/share/RemoteCursors.module.css` | create | name chip |
| `frontend/src/share/FacePile.tsx` | create | online avatars |
| `frontend/src/share/SharePopover.tsx` + `.module.css` | modify | online dots, face pile styles |
| `frontend/src/components/TopNavBar.tsx` | modify | Share on `/learn*`, face pile |
| `frontend/src/routes/Join.tsx` | modify | route by subject |
| `frontend/src/routes/Learn.tsx` | modify | `useShareSync('atlas', 'learn', …)` |
| `frontend/src/viewer/AtlasCanvas.tsx`, `CaseCanvas.tsx` | modify | pointer capture + `<RemoteCursors/>` |
| `frontend/src/viewer/glbNames.test.ts` | create | GLB mesh node names are unique |
| frontend tests | modify/create | `stored`, `store`, `sceneSync`, `presence`, `cursorSync` |

---

### Task 1: Learn-room view commands (pure reducer)

**Files:**
- Modify: `convex/lib/viewCommands.ts`
- Test: `convex/tests/viewCommands.test.ts`

**Interfaces:**
- Produces:
  - `Scene.page: "mri" | "3d" | "learn"`, plus optional `Scene.structure?: string | null`, `Scene.hiddenStructures?: string[]`, `Scene.isolate?: boolean`.
  - New `ViewerCommand` members: `{ type: "setStructure"; id: string | null }`, `{ type: "setStructureVisible"; id: string; visible: boolean }`, `{ type: "setIsolate"; on: boolean }`.
  - `ATLAS_SCENE: Scene`.
  - `atlasSharedView(): SharedView`.
  - `applyAtlasCommand(view: SharedView, command: ViewerCommand): SharedView`.
  - `viewsEqual` compares the new fields (hidden ids as a set).

- [ ] **Step 1: Impact check**

Run GitNexus `impact({target: "applyCommand", direction: "upstream"})` and `impact({target: "viewsEqual", direction: "upstream"})`. Expected: LOW, with the `convex/sessions.ts` handlers as callers. Report the result.

- [ ] **Step 2: Write the failing tests**

In `convex/tests/viewCommands.test.ts`, extend the import from `"../lib/viewCommands"` to also import `applyAtlasCommand` and `atlasSharedView`. Then append:

```ts
describe("Learn (atlas) rooms", () => {
  const atlas = atlasSharedView();

  it("opens on Learn with nothing selected", () => {
    expect(atlas.scene).toMatchObject({ page: "learn", structure: null, hiddenStructures: [], isolate: false });
  });

  it("selects, hides and isolates; clearing the selection clears isolate", () => {
    let v = applyAtlasCommand(atlas, { type: "setStructure", id: "thalamus_l" });
    v = applyAtlasCommand(v, { type: "setIsolate", on: true });
    v = applyAtlasCommand(v, { type: "setStructureVisible", id: "putamen_r", visible: false });
    v = applyAtlasCommand(v, { type: "setStructureVisible", id: "putamen_r", visible: false });
    expect(v.scene).toMatchObject({ structure: "thalamus_l", isolate: true, hiddenStructures: ["putamen_r"] });
    expect(applyAtlasCommand(v, { type: "setStructureVisible", id: "putamen_r", visible: true }).scene.hiddenStructures).toEqual([]);
    expect(applyAtlasCommand(v, { type: "setStructure", id: null }).scene).toMatchObject({ structure: null, isolate: false });
  });

  it("mirrors the Learn toolbar: mode, opacity, explode, hemispheres", () => {
    let v = applyAtlasCommand(atlas, { type: "setMode", mode: "xray" });
    v = applyAtlasCommand(v, { type: "setOpacity", value: 2 });
    v = applyAtlasCommand(v, { type: "setExplosion", value: 0.4 });
    v = applyAtlasCommand(v, { type: "setHemisphereVisible", side: "left", visible: false });
    expect(v.scene).toMatchObject({ mode: "xray", brainOpacity: 1, explodeAmount: 0.4, hidden: { left: true, right: false } });
  });

  it("isolate needs a selection", () => {
    expectAppError(() => applyAtlasCommand(atlas, { type: "setIsolate", on: true }), "INVALID_ARGUMENT");
  });

  it("caps structure ids and the hidden list", () => {
    expectAppError(() => applyAtlasCommand(atlas, { type: "setStructure", id: "" }), "INVALID_ARGUMENT");
    expectAppError(() => applyAtlasCommand(atlas, { type: "setStructure", id: "x".repeat(65) }), "INVALID_ARGUMENT");
    let v = atlas;
    for (let i = 0; i < 256; i++) v = applyAtlasCommand(v, { type: "setStructureVisible", id: `s${i}`, visible: false });
    expectAppError(() => applyAtlasCommand(v, { type: "setStructureVisible", id: "s256", visible: false }), "INVALID_ARGUMENT");
  });

  it("rejects case-only commands and other pages", () => {
    for (const command of [
      { type: "setSlice", index: 3 },
      { type: "setPlane", plane: "coronal" },
      { type: "setTumorVisible", visible: true },
      { type: "setLayerVisible", layer: "core", visible: false },
      { type: "setCameraTarget", target: "tumor" },
      { type: "resetView" },
      { type: "setPage", page: "3d" },
    ] as const) {
      expectAppError(() => applyAtlasCommand(atlas, command), "INVALID_ARGUMENT");
    }
  });

  it("case rooms reject Learn commands", () => {
    const view = defaultSharedView(WITH_TUMOR);
    expectAppError(() => applyCommand(WITH_TUMOR, view, { type: "setStructure", id: "thalamus_l" }), "INVALID_ARGUMENT");
    expectAppError(() => applyCommand(WITH_TUMOR, view, { type: "setIsolate", on: false }), "INVALID_ARGUMENT");
    expectAppError(() => applyCommand(WITH_TUMOR, view, { type: "setPage", page: "learn" }), "INVALID_ARGUMENT");
  });

  it("viewsEqual sees structure changes and ignores hidden-id order", () => {
    const a = { ...atlas, scene: { ...atlas.scene, hiddenStructures: ["a", "b"] } };
    const b = { ...atlas, scene: { ...atlas.scene, hiddenStructures: ["b", "a"] } };
    expect(viewsEqual(a, b)).toBe(true);
    expect(viewsEqual(atlas, applyAtlasCommand(atlas, { type: "setStructure", id: "thalamus_l" }))).toBe(false);
    expect(viewsEqual(defaultSharedView(WITH_TUMOR), defaultSharedView(WITH_TUMOR))).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run convex/tests/viewCommands.test.ts`
Expected: FAIL, because `applyAtlasCommand` / `atlasSharedView` are not exported.

- [ ] **Step 4: Implement in `convex/lib/viewCommands.ts`**

Replace the `Scene` type:

```ts
export type Scene = {
  page: "mri" | "3d" | "learn";
  mode: "whole" | "xray" | "exploded" | "cutaway";
  brainOpacity: number;
  explodeAmount: number;
  hidden: { left: boolean; right: boolean };
  layers: { edema: boolean; core: boolean; enhancing: boolean };
  cameraTarget: "brain" | "tumor";
  /** Learn rooms only. Optional so case rows written before Learn read as "nothing selected". */
  structure?: string | null;
  hiddenStructures?: string[];
  isolate?: boolean;
};
```

Right after `DEFAULT_SCENE`, add:

```ts
export const ATLAS_SCENE: Scene = { ...DEFAULT_SCENE, page: "learn", structure: null, hiddenStructures: [], isolate: false };
```

Change `vPage`, and extend `vScene` with the three optional fields:

```ts
const vPage = v.union(v.literal("mri"), v.literal("3d"), v.literal("learn"));
```

```ts
export const vScene = v.object({
  page: vPage, mode: vMode, brainOpacity: v.number(), explodeAmount: v.number(),
  hidden: v.object({ left: v.boolean(), right: v.boolean() }),
  layers: v.object({ edema: v.boolean(), core: v.boolean(), enhancing: v.boolean() }),
  cameraTarget: vTarget,
  structure: v.optional(v.union(v.string(), v.null())),
  hiddenStructures: v.optional(v.array(v.string())),
  isolate: v.optional(v.boolean()),
});
```

In the `ViewerCommand` union, change the `setPage` member and add three members before `resetView`:

```ts
  | { type: "setPage"; page: "mri" | "3d" | "learn" }
```

```ts
  /** Learn rooms only (SPEC §7.3 `selectStructure`). null clears the selection and isolate. */
  | { type: "setStructure"; id: string | null }
  | { type: "setStructureVisible"; id: string; visible: boolean }
  | { type: "setIsolate"; on: boolean }
```

In `vViewerCommand`, add before the `resetView` entry:

```ts
  v.object({ type: v.literal("setStructure"), id: v.union(v.string(), v.null()) }),
  v.object({ type: v.literal("setStructureVisible"), id: v.string(), visible: v.boolean() }),
  v.object({ type: v.literal("setIsolate"), on: v.boolean() }),
```

After `defaultSharedView`, add:

```ts
/** A Learn room has no scan: the slice fields are inert placeholders that no atlas command touches. */
export function atlasSharedView(): SharedView {
  return {
    plane: "axial", cursorRasMm: [0, 0, 0], tumorVisible: false,
    scene: { ...ATLAS_SCENE, hidden: { ...ATLAS_SCENE.hidden }, layers: { ...ATLAS_SCENE.layers }, hiddenStructures: [] },
  };
}
```

In `applyCommand`, replace the `setPage` case and add the three Learn cases (before `resetView`):

```ts
    case "setPage":
      if (command.page === "learn") throw appError("INVALID_ARGUMENT", "Learn is not a page of a case session.");
      return { ...view, cursorRasMm: cursor, scene: { ...view.scene, page: command.page } };
```

```ts
    case "setStructure":
    case "setStructureVisible":
    case "setIsolate":
      throw appError("INVALID_ARGUMENT", "Atlas structures belong to Learn sessions.");
```

After `applyCommand`, add:

```ts
const MAX_STRUCTURE_ID = 64;
const MAX_HIDDEN = 256;

function structureId(id: string): string {
  if (id.length === 0 || id.length > MAX_STRUCTURE_ID) {
    throw appError("INVALID_ARGUMENT", `Structure ids are 1–${MAX_STRUCTURE_ID} characters.`);
  }
  return id;
}

/** Learn rooms: the atlas has no scan, so only scene fields move. Mirrors frontend dispatch rules (null selection clears isolate). */
export function applyAtlasCommand(view: SharedView, command: ViewerCommand): SharedView {
  const s = view.scene;
  switch (command.type) {
    case "setPage":
      if (command.page !== "learn") throw appError("INVALID_ARGUMENT", "A Learn session stays on Learn.");
      return view;
    case "setMode":
      return { ...view, scene: { ...s, mode: command.mode } };
    case "setOpacity":
      return { ...view, scene: { ...s, brainOpacity: unit(command.value, "Opacity") } };
    case "setExplosion":
      return { ...view, scene: { ...s, explodeAmount: unit(command.value, "Explosion") } };
    case "setHemisphereVisible":
      return { ...view, scene: { ...s, hidden: { ...s.hidden, [command.side]: !command.visible } } };
    case "setStructure":
      return command.id === null
        ? { ...view, scene: { ...s, structure: null, isolate: false } }
        : { ...view, scene: { ...s, structure: structureId(command.id) } };
    case "setStructureVisible": {
      const id = structureId(command.id);
      const rest = (s.hiddenStructures ?? []).filter((h) => h !== id);
      const hidden = command.visible ? rest : [...rest, id];
      if (hidden.length > MAX_HIDDEN) throw appError("INVALID_ARGUMENT", `At most ${MAX_HIDDEN} structures can be hidden.`);
      return { ...view, scene: { ...s, hiddenStructures: hidden } };
    }
    case "setIsolate":
      if (command.on && (s.structure ?? null) === null) throw appError("INVALID_ARGUMENT", "Select a structure before isolating it.");
      return { ...view, scene: { ...s, isolate: command.on } };
    default:
      throw appError("INVALID_ARGUMENT", `${command.type} does not apply to a Learn session.`);
  }
}
```

In `viewsEqual`, insert before the cursor loop:

```ts
  if ((sa.structure ?? null) !== (sb.structure ?? null) || (sa.isolate ?? false) !== (sb.isolate ?? false)) return false;
  const ha = sa.hiddenStructures ?? [], hb = sb.hiddenStructures ?? [];
  if (ha.length !== hb.length || ha.some((id) => !hb.includes(id))) return false;
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run convex/tests/viewCommands.test.ts && npm run typecheck`
Expected: PASS, and tsc exits 0.

- [ ] **Step 6: Commit**

Run GitNexus `detect_changes()` and confirm that only `convex/lib/viewCommands.ts` symbols changed. Then:

```bash
git add convex/lib/viewCommands.ts convex/tests/viewCommands.test.ts
git commit -m "feat(convex): Learn-room scene fields and atlas command reducer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Sessions widened with `subject`

**Files:**
- Modify: `convex/schema.ts` (the `sessions` table)
- Modify: `convex/sessions.ts`
- Modify: `convex/exportDoc.ts:49`
- Test: `convex/tests/sessions.test.ts`

**Interfaces:**
- Consumes (from Task 1): `atlasSharedView`, `applyAtlasCommand`, `Scene` optional fields.
- Produces:
  - `api.sessions.create({ subject?: "case" | "atlas", scanId?, hostDisplayName })`.
  - `api.sessions.join` returns `{ sessionId, participantToken, participantId, role: "viewer", subject }`.
  - `SessionStateDto` gains `subject` and `scan: PublicScan | null`.
  - `view.sliceIndex`, `view.sliceCount` and `view.sliceIndices` are `null` for atlas.
  - `view.scene` always carries `structure`, `hiddenStructures` and `isolate`.

- [ ] **Step 1: Impact check**

Run GitNexus `impact` upstream on `create`, `get`, `updateView`, `end`, `toSharedViewDto` (all in `convex/sessions.ts`) and on the exportDoc handler. Report the risk. If any result is HIGH or CRITICAL, stop and tell the user.

- [ ] **Step 2: Write the failing tests**

Append to `convex/tests/sessions.test.ts`:

```ts
describe("Learn (atlas) sessions", () => {
  async function atlasRoom() {
    const t = convexTest({ schema });
    const host = await t.mutation(api.sessions.create, { subject: "atlas", hostDisplayName: "Teacher" });
    const viewer = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Student" });
    return { t, host, viewer };
  }
  const as = (r: { sessionId: Id<"sessions">; participantToken: string }) => ({ sessionId: r.sessionId, participantToken: r.participantToken });

  it("creates without a scan; get reports the atlas subject and no slices", async () => {
    const { t, viewer } = await atlasRoom();
    expect(viewer.subject).toBe("atlas");
    const state = await t.query(api.sessions.get, as(viewer));
    expect(state.subject).toBe("atlas");
    expect(state.scan).toBeNull();
    expect(state.view.sliceIndices).toBeNull();
    expect(state.view.scene).toMatchObject({ page: "learn", structure: null, hiddenStructures: [], isolate: false });
  });

  it("a case needs a scan and an atlas forbids one", async () => {
    const t = convexTest({ schema });
    const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
    await expectAppError(t.mutation(api.sessions.create, { hostDisplayName: "H" }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.sessions.create, { subject: "atlas", scanId, hostDisplayName: "H" }), "INVALID_ARGUMENT");
  });

  it("the host's structure selection reaches the viewer", async () => {
    const { t, host, viewer } = await atlasRoom();
    const r = await t.mutation(api.sessions.updateView, { ...as(host), command: { type: "setStructure", id: "thalamus_l" } });
    expect(r.applied).toBe(true);
    const state = await t.query(api.sessions.get, as(viewer));
    expect(state.view.scene.structure).toBe("thalamus_l");
  });

  it("atlas rooms reject slice commands; case rooms reject structure commands", async () => {
    const { t, host } = await atlasRoom();
    await expectAppError(t.mutation(api.sessions.updateView, { ...as(host), command: { type: "setSlice", index: 3 } }), "INVALID_ARGUMENT");
    const room = await setUpRoom();
    await expectAppError(
      room.t.mutation(api.sessions.updateView, { ...as(room.host), command: { type: "setStructure", id: "thalamus_l" } }),
      "INVALID_ARGUMENT",
    );
  });

  it("case sessions report subject case and default structure fields", async () => {
    const { t, viewer } = await setUpRoom();
    const state = await t.query(api.sessions.get, as(viewer));
    expect(state.subject).toBe("case");
    expect(state.view.scene).toMatchObject({ structure: null, hiddenStructures: [], isolate: false });
    expect(state.view.sliceIndices).not.toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run convex/tests/sessions.test.ts`
Expected: FAIL. `create` requires `scanId`, and `subject` is undefined.

- [ ] **Step 4: Widen the schema**

In `convex/schema.ts`, inside the `sessions` `defineTable({...})`:
- Change `scanId: v.id("scans"),` to `scanId: v.optional(v.id("scans")),`.
- Add a new field directly above it:

```ts
    /** "case" (MRI + 3D of one scan) or "atlas" (Learn, no scan). Missing reads as "case": rows predate Learn rooms. */
    subject: v.optional(v.union(v.literal("case"), v.literal("atlas"))),
    /** Required for case rooms, absent for atlas rooms (sessions.create enforces it). */
```

- [ ] **Step 5: Make `convex/sessions.ts` subject-aware**

Extend the `./lib/viewCommands` import with `applyAtlasCommand` and `atlasSharedView`.

Change `SharedViewDto`'s three slice fields to nullable:

```ts
  /** Slice index in the CURRENT plane — the number a "slice 77 of 155" label shows. null in Learn rooms (no scan). */
  sliceIndex: number | null;
  /** Total slices in the current plane. null in Learn rooms. */
  sliceCount: number | null;
  /** Derived index for each plane, for the three linked 2D views (SPEC §3). null in Learn rooms. */
  sliceIndices: { axial: number; coronal: number; sagittal: number } | null;
```

In `SessionStateDto`, replace `scan: PublicScan;` with:

```ts
  subject: "case" | "atlas";
  /** null in Learn rooms. */
  scan: PublicScan | null;
```

Replace `toSharedViewDto` with a version that accepts a null scan, and add the two helpers above it:

```ts
/** Every DTO scene carries the Learn fields, so the client mirror never sees them missing. */
function sceneDto(session: Doc<"sessions">): Scene {
  return { structure: null, hiddenStructures: [], isolate: false, ...(session.scene ?? DEFAULT_SCENE) };
}

/** The room's scan, or null for a Learn room. */
async function scanOf(ctx: QueryCtx, session: Doc<"sessions">): Promise<Doc<"scans"> | null> {
  if (session.subject === "atlas") return null;
  if (session.scanId === undefined) throw appError("NOT_FOUND", "This review session has no scan.");
  return await loadScan(ctx, session.scanId);
}

function toSharedViewDto(scan: Doc<"scans"> | null, session: Doc<"sessions">): SharedViewDto {
  const base = { plane: session.plane, cursorRasMm: session.cursorRasMm, tumorVisible: session.tumorVisible, scene: sceneDto(session), viewVersion: session.viewVersion };
  if (scan === null) return { ...base, sliceIndex: null, sliceCount: null, sliceIndices: null };
  const cursor: [number, number, number] = [
    session.cursorRasMm[0],
    session.cursorRasMm[1],
    session.cursorRasMm[2],
  ];
  const indices = {
    axial: sliceIndexFromCursor(scan, "axial", cursor),
    coronal: sliceIndexFromCursor(scan, "coronal", cursor),
    sagittal: sliceIndexFromCursor(scan, "sagittal", cursor),
  };
  const counts = toPublicScan(scan).sliceCounts;
  return { ...base, sliceIndex: indices[session.plane], sliceCount: counts[session.plane], sliceIndices: indices };
}
```

In `create`, replace the args:

```ts
  args: {
    /** Missing means "case", the only kind before Learn rooms. */
    subject: v.optional(v.union(v.literal("case"), v.literal("atlas"))),
    /** Required for a case, forbidden for an atlas room. */
    scanId: v.optional(v.id("scans")),
    /** Untrusted label for the roster. Never used as identity (schema.ts). */
    hostDisplayName: v.string(),
  },
```

Replace the two lines `const scan = await loadScan(ctx, args.scanId);` and `const view = defaultSharedView(scan);` with:

```ts
    const subject = args.subject ?? "case";
    let view: SharedView;
    if (subject === "case") {
      if (args.scanId === undefined) throw appError("INVALID_ARGUMENT", "A case session needs a scan.");
      view = defaultSharedView(await loadScan(ctx, args.scanId));
    } else {
      if (args.scanId !== undefined) throw appError("INVALID_ARGUMENT", "A Learn session has no scan.");
      view = atlasSharedView();
    }
```

In the `sessions` insert, replace `scanId: scan._id,` with:

```ts
      subject,
      scanId: args.scanId,
```

In `join`:
- Add `subject: "case" | "atlas";` to the return type.
- Change the return to `return { sessionId: session._id, participantToken, participantId, role: "viewer", subject: session.subject ?? "case" };`

In `get`, replace `const scan = await loadScan(ctx, session.scanId);` with `const scan = await scanOf(ctx, session);`. Then, in the returned object, replace `scan: toPublicScan(scan),` with:

```ts
      subject: session.subject ?? "case",
      scan: scan ? toPublicScan(scan) : null,
```

In `updateView`, replace the two lines `const scan = await loadScan(ctx, session.scanId);` and `const next = applyCommand(scan, current, args.command as ViewerCommand);` (keep `const current = sharedViewOf(session);` between them):

```ts
    const scan = await scanOf(ctx, session);
    const current = sharedViewOf(session);
    const command = args.command as ViewerCommand;
    const next = scan ? applyCommand(scan, current, command) : applyAtlasCommand(current, command);
```

Leave `end` unchanged for now. Its cursor cleanup needs the `cursors` table, so it lands in Task 4 Step 5.

- [ ] **Step 6: Guard exportDoc**

In `convex/exportDoc.ts`, replace line 49:

```ts
      const scan = session.scanId ? await ctx.db.get(session.scanId) : null; // Learn rooms have no scan, so they review no case
```

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run convex/tests && npm run typecheck`
Expected: all PASS. The existing case tests still pass because `subject` defaults to `"case"`.

- [ ] **Step 8: Commit**

Run GitNexus `detect_changes()` and confirm that only sessions, schema and exportDoc changed. Then:

```bash
git add convex/schema.ts convex/sessions.ts convex/exportDoc.ts convex/tests/sessions.test.ts
git commit -m "feat(convex): Learn (atlas) sessions without a scan

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Presence component + wrappers

**Files:**
- Modify: `package.json` (root; dependency added by npm)
- Modify: `convex/convex.config.ts`
- Modify: `vitest.config.ts`
- Create: `convex/presence.ts`
- Test: `convex/tests/presence.test.ts`

**Interfaces:**
- Produces:
  - `api.presence.heartbeat({ sessionId, participantToken, clientId, interval })` → `{ roomToken, sessionToken }`.
  - `api.presence.list({ roomToken })` → `{ userId, online, lastDisconnected }[]`, where `userId` is a `sessionParticipants` id.
  - `api.presence.disconnect({ sessionToken })` → `null`. Its function path is `presence:disconnect`, which the beacon in Task 7 targets.

- [ ] **Step 1: Install**

Run: `npm install @convex-dev/presence@0.4.0`

Expected: `package.json` dependencies gain `"@convex-dev/presence": "^0.4.0"`. npm may also install the `react` / `react-dom` peers into root `node_modules`. That is harmless, so leave it.

- [ ] **Step 2: Register the component**

`convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

const app = defineApp({ httpPrefix: "/api" });
app.use(staticHosting, { httpPrefix: "/" });
app.use(presence);

export default app;
```

Run: `npm run codegen`
Expected: `convex/_generated/api.d.ts` now contains `presence` under `components`. If codegen exits with a missing-deployment error, ask the user to run `! npx convex dev --once` and then re-run codegen.

In `vitest.config.ts`, change the inline list. The presence test helper and its batch-worker child use `import.meta.glob`, which only works on code Vite transforms:

```ts
    server: { deps: { inline: ["convex-test", "@convex-dev/presence", "@convex-dev/batch-worker"] } },
```

- [ ] **Step 3: Write the failing tests**

Create `convex/tests/presence.test.ts`:

```ts
import presenceTest from "@convex-dev/presence/test";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { AppErrorData } from "../lib/errors";
import schema from "../schema";

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ConvexError);
  await promise.catch((e: ConvexError<AppErrorData>) => expect(e.data.code).toBe(code));
}

async function room() {
  const t = convexTest({ schema });
  presenceTest.register(t);
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Judge" });
  return { t, host, viewer };
}

afterEach(() => vi.useRealTimers());

describe("presence", () => {
  it("room and user come from the token; list shows the caller online", async () => {
    const { t, viewer } = await room();
    const r = await t.mutation(api.presence.heartbeat, { sessionId: viewer.sessionId, participantToken: viewer.participantToken, clientId: "tab-1", interval: 10_000 });
    const rows = await t.query(api.presence.list, { roomToken: r.roomToken });
    expect(rows).toEqual([expect.objectContaining({ userId: viewer.participantId, online: true })]);
  });

  it("refuses a bad token and an ended session", async () => {
    const { t, host } = await room();
    await expectCode(t.mutation(api.presence.heartbeat, { sessionId: host.sessionId, participantToken: "nope", clientId: "tab", interval: 10_000 }), "NOT_AUTHENTICATED");
    await t.mutation(api.sessions.end, { sessionId: host.sessionId, participantToken: host.participantToken });
    await expectCode(t.mutation(api.presence.heartbeat, { sessionId: host.sessionId, participantToken: host.participantToken, clientId: "tab", interval: 10_000 }), "SESSION_ENDED");
  });

  it("rejects an empty or oversized clientId", async () => {
    const { t, host } = await room();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken, interval: 10_000 };
    await expectCode(t.mutation(api.presence.heartbeat, { ...auth, clientId: "" }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.presence.heartbeat, { ...auth, clientId: "x".repeat(65) }), "INVALID_ARGUMENT");
  });

  it("disconnect takes the tab offline", async () => {
    vi.useFakeTimers();
    const { t, host } = await room();
    const r = await t.mutation(api.presence.heartbeat, { sessionId: host.sessionId, participantToken: host.participantToken, clientId: "tab-1", interval: 10_000 });
    await t.mutation(api.presence.disconnect, { sessionToken: r.sessionToken });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await t.query(api.presence.list, { roomToken: r.roomToken });
    expect(rows).toEqual([expect.objectContaining({ userId: host.participantId, online: false })]);
  });
});
```

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `npx vitest run convex/tests/presence.test.ts`
Expected: FAIL, because `api.presence` is undefined.

- [ ] **Step 5: Implement `convex/presence.ts`**

```ts
/**
 * presence — who is online in a review session right now (spec §1.2).
 *
 * Wraps @convex-dev/presence. Room and user are ALWAYS derived from the
 * participant token: roomId = session id, userId = participant id. The client
 * only names its own tab (clientId), which we prefix with the participant id
 * so one participant can never address another's tab.
 */
import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";

const presence = new Presence(components.presence);

const MIN_INTERVAL_MS = 2_000;
const MAX_INTERVAL_MS = 60_000;

export const heartbeat = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    clientId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, args): Promise<{ roomToken: string; sessionToken: string }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    if (args.clientId.length === 0 || args.clientId.length > 64) {
      throw appError("INVALID_ARGUMENT", "clientId must be 1–64 characters.");
    }
    if (!Number.isFinite(args.interval)) throw appError("INVALID_ARGUMENT", "interval must be a number.");
    const interval = Math.min(Math.max(args.interval, MIN_INTERVAL_MS), MAX_INTERVAL_MS);
    return await presence.heartbeat(ctx, session._id, participant._id, `${participant._id}:${args.clientId}`, interval);
  },
});

/** No per-user reads, so every subscriber in a room shares one cached result (component README). */
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => await presence.list(ctx, roomToken),
});

/** Unauthenticated by necessity: it is called from navigator.sendBeacon on page hide. A leaked tab token can only mark that tab offline. */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => await presence.disconnect(ctx, sessionToken),
});
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `npx vitest run convex/tests/presence.test.ts && npm run typecheck`

Expected: PASS. If tsc rejects `presenceTest.register(t)` because of a schema generic mismatch, change that line to `presenceTest.register(t as never);`. The helper only calls `t.registerComponent`.

- [ ] **Step 7: Commit**

Run GitNexus `detect_changes()`. Then:

```bash
git add package.json package-lock.json convex/convex.config.ts convex/_generated vitest.config.ts convex/presence.ts convex/tests/presence.test.ts
git commit -m "feat(convex): presence component behind token-derived wrappers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `cursors` table + move/list + end cleanup

**Files:**
- Modify: `convex/schema.ts`
- Create: `convex/cursors.ts`
- Modify: `convex/sessions.ts` (the `end` mutation)
- Modify: `docs/CONVEX_BACKEND.md` (API table near line 401)
- Test: `convex/tests/cursors.test.ts`

**Interfaces:**
- Produces:
  - `api.cursors.move({ sessionId, participantToken, cursor: null | { node: string, localMm: number[] } })` → `null`.
  - `api.cursors.list({ sessionId, participantToken })` → `{ participantId, displayName, cursor }[]`, excluding the caller.

- [ ] **Step 1: Write the failing tests**

Create `convex/tests/cursors.test.ts`:

```ts
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { AppErrorData } from "../lib/errors";
import schema from "../schema";

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ConvexError);
  await promise.catch((e: ConvexError<AppErrorData>) => expect(e.data.code).toBe(code));
}

async function room() {
  const t = convexTest({ schema });
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Judge" });
  const as = (r: { sessionId: Id<"sessions">; participantToken: string }) => ({ sessionId: r.sessionId, participantToken: r.participantToken });
  return { t, host: as(host), viewer: as(viewer), viewerId: viewer.participantId };
}

const AT = { node: "lh_cortex", localMm: [1, 2, 3] };

describe("cursors", () => {
  it("each participant writes only its own row; list excludes the caller", async () => {
    const { t, host, viewer, viewerId } = await room();
    await t.mutation(api.cursors.move, { ...viewer, cursor: AT });
    await t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, localMm: [4, 5, 6] } });
    expect(await t.query(api.cursors.list, host)).toEqual([{ participantId: viewerId, displayName: "Judge", cursor: { ...AT, localMm: [4, 5, 6] } }]);
    expect(await t.query(api.cursors.list, viewer)).toEqual([]);
    await t.mutation(api.cursors.move, { ...viewer, cursor: null });
    expect((await t.query(api.cursors.list, host))[0].cursor).toBeNull();
  });

  it("rejects bad points and node names", async () => {
    const { t, viewer } = await room();
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, localMm: [1, 2] } }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, localMm: [1, Number.NaN, 3] } }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, node: "" } }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, node: "n".repeat(129) } }), "INVALID_ARGUMENT");
  });

  it("end deletes the room's cursors and refuses later moves", async () => {
    const { t, host, viewer } = await room();
    await t.mutation(api.cursors.move, { ...viewer, cursor: AT });
    await t.mutation(api.sessions.end, host);
    expect(await t.run((ctx) => ctx.db.query("cursors").collect())).toEqual([]);
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: AT }), "SESSION_ENDED");
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run convex/tests/cursors.test.ts`
Expected: FAIL, because `api.cursors` is undefined.

- [ ] **Step 3: Add the table**

In `convex/schema.ts`, add a new table inside `defineSchema({...})` after `sessionParticipants`:

```ts
  /**
   * Live 3D pointers, one row per participant (spec §1.3). Kept OUT of
   * `sessions` / `sessionParticipants` so `sessions.get` never re-runs at
   * pointer rate. This is the one high-frequency table (≤ 10 Hz per person
   * while the pointer moves, 0 when idle) — bends guardrail 7, Sage-reviewed.
   */
  cursors: defineTable({
    sessionId: v.id("sessions"),
    participantId: v.id("sessionParticipants"),
    /** Hit point in the hit mesh's local frame; null = the pointer is off the model. */
    cursor: v.union(v.null(), v.object({ node: v.string(), localMm: vVec3 })),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_participant", ["participantId"]),
```

- [ ] **Step 4: Implement `convex/cursors.ts`**

```ts
/**
 * cursors — live 3D pointers (spec §1.3). Any member may send its own;
 * the NOT_PRESENTER gate on the shared view is unrelated.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";
import { vVec3 } from "./schema";

const MAX_NODE = 128;
const vCursor = v.union(v.null(), v.object({ node: v.string(), localMm: vVec3 }));
type CursorValue = null | { node: string; localMm: number[] };

export const move = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), cursor: vCursor },
  handler: async (ctx, args): Promise<null> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const c = args.cursor;
    if (c && (c.node.length === 0 || c.node.length > MAX_NODE)) {
      throw appError("INVALID_ARGUMENT", `Node names are 1–${MAX_NODE} characters.`);
    }
    if (c && (c.localMm.length !== 3 || !c.localMm.every(Number.isFinite))) {
      throw appError("INVALID_ARGUMENT", "A cursor point is three finite numbers.");
    }
    const row = await ctx.db
      .query("cursors")
      .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
      .unique();
    const doc = { cursor: c, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, doc);
    else await ctx.db.insert("cursors", { sessionId: session._id, participantId: participant._id, ...doc });
    return null;
  },
});

export const list = query({
  args: { sessionId: v.id("sessions"), participantToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ participantId: Id<"sessionParticipants">; displayName: string; cursor: CursorValue }[]> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const rows = await ctx.db
      .query("cursors")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const out: { participantId: Id<"sessionParticipants">; displayName: string; cursor: CursorValue }[] = [];
    for (const r of rows) {
      if (r.participantId === participant._id) continue;
      const p = await ctx.db.get(r.participantId);
      if (p) out.push({ participantId: r.participantId, displayName: p.displayName, cursor: r.cursor });
    }
    return out;
  },
});
```

- [ ] **Step 5: End clears cursors**

Run GitNexus `impact({target: "end", direction: "upstream"})` first. Then, in the `end` handler of `convex/sessions.ts`, insert directly after `const { session } = await requirePresenter(ctx, args);`:

```ts
    const cursors = await ctx.db.query("cursors").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();
    for (const c of cursors) await ctx.db.delete(c._id);
```

- [ ] **Step 6: Docs**

In `docs/CONVEX_BACKEND.md`, replace the `sessions.create` API row with the first row below, and add the other rows directly after it:

```md
| `sessions.create` | `{ subject?: "case" \| "atlas", scanId?, hostDisplayName }` (scanId required for case, forbidden for atlas) | `{ sessionId, inviteCode, participantToken, participantId, role }` |
| `presence.heartbeat` | `{ sessionId, participantToken, clientId, interval }` | `{ roomToken, sessionToken }` |
| `presence.list` | `{ roomToken }` | `{ userId, online, lastDisconnected }[]` |
| `presence.disconnect` | `{ sessionToken }` (unauthenticated, sendBeacon) | `null` |
| `cursors.move` | `{ sessionId, participantToken, cursor: null \| { node, localMm } }` | `null` |
| `cursors.list` | `{ sessionId, participantToken }` | `{ participantId, displayName, cursor }[]` (caller excluded) |
```

- [ ] **Step 7: Run the tests, typecheck and the full root suite**

Run: `npm run typecheck && npm test`
Expected: all PASS.

- [ ] **Step 8: Commit**

Run GitNexus `detect_changes()`. Then:

```bash
git add convex/schema.ts convex/cursors.ts convex/sessions.ts convex/tests/cursors.test.ts docs/CONVEX_BACKEND.md
git commit -m "feat(convex): cursors table for live 3D pointers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend rooms by subject (store, Join, TopNavBar)

**Files:**
- Modify: `frontend/src/share/stored.ts`, `types.ts`, `copy.ts`, `store.ts`, `useMprShare.ts`
- Modify: `frontend/src/routes/Join.tsx`, `frontend/src/components/TopNavBar.tsx`
- Test: `frontend/src/share/stored.test.ts`, `frontend/src/share/store.test.ts`

**Interfaces:**
- Consumes (from Task 2): `sessions.create({subject, …})`, and `sessions.join` returning `subject`.
- Produces:
  - `type Subject = 'case' | 'atlas'` and `Stored.subject: Subject` (`stored.ts`).
  - `roomPath(subject): string` (`stored.ts`).
  - `startShare(subject: Subject = 'case')` (`store.ts`).
  - `activeFor(s, subject): SessionState | null` (`store.ts`).
  - `OTHER_ROOM` (`copy.ts`).
  - `SessionState.subject`; `SessionState.view.sliceIndices: SliceIndices | null`.
  - `Scene` / `ViewerCommand` mirrors updated in Task 6.

- [ ] **Step 1: Impact check**

Run GitNexus `impact` upstream on `startShare`, `joinShare`, `loadStored`, `TopNavBar`, `useMprShare`. If the index cannot find a symbol, grep its callers instead (`grep -rn "startShare\|joinShare" frontend/src`) and report them.

- [ ] **Step 2: Write the failing tests**

Append to `frontend/src/share/stored.test.ts`. The first line below extends the existing import:

```ts
import { roomPath } from './stored';

describe('subject', () => {
  it('an entry saved before Learn rooms loads as a case room', () => {
    const s = fake();
    s.setItem('nv.share', JSON.stringify({ sessionId: 's1', participantToken: 't1', role: 'viewer', inviteCode: 'ABC123' }));
    expect(loadStored(s)?.subject).toBe('case');
  });
  it('rooms route to their page', () => {
    expect(roomPath('case')).toBe('/jobs/sample/mri');
    expect(roomPath('atlas')).toBe('/learn');
  });
});
```

Fixture updates:
- In `frontend/src/share/stored.test.ts`, change `const S: Stored = {…}` to include `subject: 'case'`.
- In `frontend/src/share/store.test.ts`, change the fake `'sessions:join'` return to `{ sessionId: 's1', participantToken: 'guest-t', participantId: 'p2', role: 'viewer', subject: 'case' }`.
- Also in `store.test.ts`, extend the `./store` import with `activeFor` and append:

```ts
describe('rooms by subject', () => {
  it('startShare("atlas") creates a Learn room with no scan lookup', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    expect(await startShare('atlas')).toBeNull();
    expect(f.calls).toEqual([['sessions:create', { subject: 'atlas', hostDisplayName: 'Host' }]]);
    expect(useShare.getState().stored).toMatchObject({ role: 'host', subject: 'atlas' });
  });
  it('a guest stores the subject the server reports', async () => {
    const f = fakeClient({ 'sessions:join': () => ({ sessionId: 's1', participantToken: 'g', participantId: 'p2', role: 'viewer', subject: 'atlas' }) });
    useClientForTest(f.client as never);
    await joinShare('ABC123', 'Student');
    expect(useShare.getState().stored?.subject).toBe('atlas');
  });
  it('activeFor only returns the session of the matching room', () => {
    const stored = { sessionId: 's1', participantToken: 't', role: 'host' as const, inviteCode: 'X', subject: 'atlas' as const };
    expect(activeFor({ stored, session: SESSION }, 'atlas')).toBe(SESSION);
    expect(activeFor({ stored, session: SESSION }, 'case')).toBeNull();
    expect(activeFor({ stored, session: { ...SESSION, status: 'ended' } }, 'atlas')).toBeNull();
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npm --prefix frontend test -- src/share`
Expected: FAIL, because `roomPath` and `activeFor` are not exported.

- [ ] **Step 4: Implement `stored.ts`**

Replace the `Stored` interface and `isStored`/`loadStored`:

```ts
export type Subject = 'case' | 'atlas';
export interface Stored { sessionId: string; participantToken: string; role: 'host' | 'viewer'; inviteCode: string; subject: Subject }

/** Where a room's guest lands: the case opens on its MRI page, Learn on /learn. */
export const roomPath = (subject: Subject): string => (subject === 'atlas' ? '/learn' : '/jobs/sample/mri');
```

```ts
const isStored = (v: unknown): v is Omit<Stored, 'subject'> & { subject?: Subject } => {
  const s = v as Stored | null;
  return !!s && typeof s.sessionId === 'string' && typeof s.participantToken === 'string' && (s.role === 'host' || s.role === 'viewer') && typeof s.inviteCode === 'string'
    && (s.subject === undefined || s.subject === 'case' || s.subject === 'atlas');
};

export function loadStored(s: Store | null = session()): Stored | null {
  try {
    const v: unknown = JSON.parse(s?.getItem(KEY) ?? 'null');
    return isStored(v) ? { ...v, subject: v.subject ?? 'case' } : null; // tabs saved before Learn rooms hold a case room
  } catch { return null; }
}
```

- [ ] **Step 5: Implement `types.ts` and `copy.ts`**

In `frontend/src/share/types.ts`, replace the `SessionState` interface:

```ts
export interface SessionState {
  sessionId: string;
  status: 'active' | 'ended';
  subject: 'case' | 'atlas';
  /** sliceIndices is null in Learn rooms (no scan). */
  view: { plane: Axis; tumorVisible: boolean; viewVersion: number; sliceIndices: SliceIndices | null; scene: Scene };
  me: Participant;
  participants: Participant[];
  isPresenter: boolean;
}
```

In `frontend/src/share/copy.ts`, add:

```ts
export const OTHER_ROOM = 'End the shared session on the other page first';
```

- [ ] **Step 6: Implement `store.ts`**

Make these edits:
- Extend the `./stored` import with `type Subject`.
- Change `startShare` to the version below.
- In `joinShare`, change the cast to include `subject: Subject` and the `begin` call to pass `subject: r.subject`.
- Add `activeFor` below `shareConfigured`.

```ts
/** The live session when it belongs to this page's room: case pages pass 'case', /learn passes 'atlas'. */
export const activeFor = (s: Pick<ShareState, 'stored' | 'session'>, subject: Subject): SessionState | null =>
  s.session?.status === 'active' && s.stored?.subject === subject ? s.session : null;
```

```ts
// shortcut: a Convex deployment that is down makes these await until it is back, add a timeout if that bites in the demo.
export async function startShare(subject: Subject = 'case'): Promise<string | null> {
  if (!client) return NOT_CONFIGURED;
  try {
    let args: Record<string, unknown> = { subject, hostDisplayName: 'Host' };
    if (subject === 'case') {
      const scan = (await client.query(api.scans.getByJobId, { jobId: 'sample' })) as { scanId: string } | null;
      if (!scan) return NO_SAMPLE;
      args = { ...args, scanId: scan.scanId };
    }
    const r = (await client.mutation(api.sessions.create, args)) as { sessionId: string; participantToken: string; inviteCode: string };
    begin({ sessionId: r.sessionId, participantToken: r.participantToken, role: 'host', inviteCode: r.inviteCode, subject });
    return null;
  } catch (e) { return messageFor(e); }
}
```

```ts
    const r = (await client.mutation(api.sessions.join, { inviteCode: code, displayName: name })) as { sessionId: string; participantToken: string; subject: Subject };
    begin({ sessionId: r.sessionId, participantToken: r.participantToken, role: 'viewer', inviteCode: code, subject: r.subject });
```

- [ ] **Step 7: Gate `useMprShare` on case rooms**

In `frontend/src/share/useMprShare.ts`, extend the `./store` import with `activeFor` and make these replacements:

```ts
  const remote = useShare(useShallow((s): MprRemote | null => {
    const live = jobId === 'sample' && s.stored?.role === 'viewer' ? activeFor(s, 'case') : null;
    return live?.me.following && live.view.sliceIndices ? { indices: live.view.sliceIndices, tumorVisible: live.view.tumorVisible } : null;
  }));
```

```ts
  const onCrosshair = useCallback((next: SliceIndices) => {
    const st = useShare.getState();
    const session = activeFor(st, 'case');
    const shared = session?.view.sliceIndices;
    if (jobId !== 'sample' || !session || !shared) return;
    if (st.stored?.role === 'host') {
      const prev = sent.current?.sessionId === session.sessionId ? sent.current.idx : shared;
      if (sameIndices(prev, next)) return;
      sent.current = { sessionId: session.sessionId, idx: next };
      void sendView([{ type: 'setCursor', sliceIndices: next }]);
    } else if (session.me.following && !sameIndices(next, shared)) {
      void setFollowing(false); // a guest's own click: stop following and browse locally (spec §2)
    }
  }, [jobId]);
```

```ts
  const hostSession = useShare((s) => (jobId === 'sample' && s.stored?.role === 'host' ? activeFor(s, 'case')?.sessionId ?? null : null));
```

- [ ] **Step 8: Join routes by subject**

In `frontend/src/routes/Join.tsx`:
- Extend the `../share/stored` import (add the import line `import { roomPath } from '../share/stored';`).
- Replace the two navigation targets:

```ts
  if (stored?.role === 'viewer' && stored.inviteCode === code) return <Navigate to={roomPath(stored.subject)} replace />;
```

```ts
    if (err) setError(err); else navigate(roomPath(useShare.getState().stored?.subject ?? 'case'));
```

Change the intro copy to `<p>You follow the host's view. You can stop following at any time.</p>`.

- [ ] **Step 9: TopNavBar shares on Learn**

In `frontend/src/components/TopNavBar.tsx`:
- Change the router import to `import { NavLink, useLocation, useParams } from 'react-router-dom';`.
- Change the copy import to `import { NOT_CONFIGURED, OTHER_ROOM, SAMPLE_ONLY } from '../share/copy';`.
- Add `import type { Subject } from '../share/stored';`.
- Replace the `why` line, the `startShare()` call and the Share wrapper condition:

```ts
  const { pathname } = useLocation();
  const learn = pathname === '/learn' || pathname.startsWith('/learn/');
  const subject: Subject = learn ? 'atlas' : 'case';
  const why = !shareConfigured() ? NOT_CONFIGURED : !learn && id !== 'sample' ? SAMPLE_ONLY : stored && stored.subject !== subject ? OTHER_ROOM : null;
```

```ts
    const e = await startShare(subject);
```

```tsx
      {(id || wsId || learn) && !guest && (
```

- [ ] **Step 10: Run tests and build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`

Expected: PASS. `tsc` may flag other readers of `view.sliceIndices` that now need a null check. Fix each one with an early return when the value is null, then re-run.

- [ ] **Step 11: Commit**

Run GitNexus `detect_changes()`. Then:

```bash
git add frontend/src/share frontend/src/routes/Join.tsx frontend/src/components/TopNavBar.tsx
git commit -m "feat(share): rooms by subject; Share on Learn, Join routes by subject

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Learn follow (scene mirror for structures)

**Files:**
- Modify: `frontend/src/share/sceneSync.ts`, `frontend/src/share/types.ts`, `frontend/src/share/useShareSync.ts`, `frontend/src/routes/Learn.tsx`
- Test: `frontend/src/share/sceneSync.test.ts`

**Interfaces:**
- Consumes:
  - From Task 5: `activeFor`, `Subject`, `setFollowing`.
  - From Task 1: the server accepts the atlas commands.
- Produces:
  - `Page = 'mri' | '3d' | 'learn'`, and `Scene` with required `structure: string | null; hiddenStructures: string[]; isolate: boolean`.
  - `sceneActions(prev, next, localHidden?: string[])`.
  - `sameStructures(a: Scene, b: Scene): boolean`.
  - `useShareSync(jobId, page, ready)`, where `page` may now be `'learn'`.

- [ ] **Step 1: Impact check**

Run GitNexus `impact` upstream on `sceneOf`, `sceneCommands`, `sceneActions`, `useShareSync`. Known callers: `Brain3D.tsx:83` and `MriWorkspace.tsx:45`, both passing `'3d'` / `'mri'`. Neither is affected by the widened `Page`.

- [ ] **Step 2: Write the failing tests**

In `frontend/src/share/sceneSync.test.ts`, extend the import with `sameStructures`, add `import type { Scene } from './sceneSync';`, and append inside the `describe`:

```ts
  const LEARN: Scene = { ...DEFAULT_SCENE, page: 'learn' };

  it('Learn reads structure state and pins the tumor fields', () => {
    const s = { ...initialState('atlas'), selectedStructure: 'thalamus_l', isolate: true, hiddenStructures: { b: true, a: true, c: false }, cameraTarget: 'tumor' as const };
    expect(sceneOf(s, 'learn')).toMatchObject({ page: 'learn', structure: 'thalamus_l', isolate: true, hiddenStructures: ['a', 'b'], cameraTarget: 'brain', layers: DEFAULT_SCENE.layers });
    expect(sceneOf(s, '3d')).toMatchObject({ structure: null, hiddenStructures: [], isolate: false });
  });
  it('Learn diffs select before isolate and hide/show by set', () => {
    const prev = { ...LEARN, hiddenStructures: ['a', 'b'] };
    const next = { ...LEARN, structure: 'x', isolate: true, hiddenStructures: ['b', 'c'] };
    expect(sceneCommands(prev, next)).toEqual([
      { type: 'setStructure', id: 'x' },
      { type: 'setStructureVisible', id: 'c', visible: false },
      { type: 'setStructureVisible', id: 'a', visible: true },
      { type: 'setIsolate', on: true },
    ]);
  });
  it('a first Learn apply also unhides what the guest hid locally, and skips tumor actions', () => {
    const acts = sceneActions(null, { ...LEARN, structure: 'x', hiddenStructures: ['b'] }, ['a', 'b']);
    expect(acts).toContainEqual({ type: 'selectStructure', id: 'x' });
    expect(acts).toContainEqual({ type: 'setStructureVisible', id: 'a', visible: true });
    expect(acts).not.toContainEqual({ type: 'setStructureVisible', id: 'b', visible: false });
    expect(acts.some((a) => a.type === 'setLayerVisible' || a.type === 'focusTumor')).toBe(false);
    expect(sceneActions(LEARN, { ...LEARN })).toEqual([]);
  });
  it('sameStructures ignores hidden order and non-structure fields', () => {
    expect(sameStructures({ ...LEARN, hiddenStructures: ['a', 'b'] }, { ...LEARN, explodeAmount: 1, hiddenStructures: ['b', 'a'] })).toBe(true);
    expect(sameStructures(LEARN, { ...LEARN, structure: 'x' })).toBe(false);
  });
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npm --prefix frontend test -- src/share/sceneSync.test.ts`
Expected: FAIL, because `sameStructures` is not exported.

- [ ] **Step 4: Implement `sceneSync.ts`**

Replace `Page`, `Scene`, `DEFAULT_SCENE` and `sceneOf`, extend `sceneCommands`, replace `sceneActions`, and add `sameStructures`:

```ts
export type Page = 'mri' | '3d' | 'learn';
/** Mirror of convex/lib/viewCommands.ts Scene (the DTO always fills the Learn fields). */
export interface Scene {
  page: Page;
  mode: Mode;
  brainOpacity: number;
  explodeAmount: number;
  hidden: Record<Hemi, boolean>;
  layers: Record<Layer, boolean>;
  cameraTarget: 'brain' | 'tumor';
  structure: string | null;
  hiddenStructures: string[];
  isolate: boolean;
}

export const DEFAULT_SCENE: Scene = {
  page: 'mri', mode: 'whole', brainOpacity: 0.3, explodeAmount: 0,
  hidden: { left: false, right: false }, layers: { edema: true, core: true, enhancing: true }, cameraTarget: 'brain',
  structure: null, hiddenStructures: [], isolate: false,
};
```

```ts
export const sceneOf = (s: ViewerState, page: Page): Scene => {
  const learn = page === 'learn';
  return {
    page, mode: s.mode, brainOpacity: s.brainOpacity, explodeAmount: s.explodeAmount, hidden: s.hidden,
    // Learn rooms reject tumor commands, so pin those fields: they never diff. Case pages never carry structures.
    layers: learn ? DEFAULT_SCENE.layers : s.layers,
    cameraTarget: learn ? 'brain' : s.cameraTarget,
    structure: learn ? s.selectedStructure : null,
    hiddenStructures: learn ? Object.keys(s.hiddenStructures).filter((id) => s.hiddenStructures[id]).sort() : [],
    isolate: learn && s.isolate,
  };
};
```

In `sceneCommands`, insert after the `cameraTarget` line:

```ts
  if (prev.structure !== next.structure) out.push({ type: 'setStructure', id: next.structure });
  for (const id of next.hiddenStructures) if (!prev.hiddenStructures.includes(id)) out.push({ type: 'setStructureVisible', id, visible: false });
  for (const id of prev.hiddenStructures) if (!next.hiddenStructures.includes(id)) out.push({ type: 'setStructureVisible', id, visible: true });
  if (prev.isolate !== next.isolate) out.push({ type: 'setIsolate', on: next.isolate });
```

```ts
/**
 * Guest side. prev null = apply everything; then `localHidden` (the guest's own hidden ids) is what gets unhidden.
 * A brain camera dispatches nothing: the guest's own orbit stays put.
 */
export function sceneActions(prev: Scene | null, next: Scene, localHidden: string[] = []): Action[] {
  const out: Action[] = [];
  const learn = next.page === 'learn';
  if (!learn && next.cameraTarget === 'tumor' && prev?.cameraTarget !== 'tumor') out.push({ type: 'focusTumor' });
  if (!prev || prev.mode !== next.mode) out.push({ type: 'setMode', mode: next.mode });
  if (!prev || prev.brainOpacity !== next.brainOpacity) out.push({ type: 'setOpacity', value: next.brainOpacity });
  if (!prev || prev.explodeAmount !== next.explodeAmount) out.push({ type: 'setExplosion', value: next.explodeAmount });
  for (const side of SIDES) if (!prev || prev.hidden[side] !== next.hidden[side]) out.push({ type: 'setHemisphereVisible', side, visible: !next.hidden[side] });
  if (!learn) {
    for (const layer of LAYERS) if (!prev || prev.layers[layer] !== next.layers[layer]) out.push({ type: 'setLayerVisible', layer, visible: next.layers[layer] });
    return out;
  }
  if (!prev || prev.structure !== next.structure) out.push({ type: 'selectStructure', id: next.structure });
  const was = prev ? prev.hiddenStructures : localHidden;
  for (const id of next.hiddenStructures) if (!was.includes(id)) out.push({ type: 'setStructureVisible', id, visible: false });
  for (const id of was) if (!next.hiddenStructures.includes(id)) out.push({ type: 'setStructureVisible', id, visible: true });
  if (!prev || prev.isolate !== next.isolate) out.push({ type: 'setIsolate', on: next.isolate });
  return out;
}

/** Same selection, isolate and hidden set (order-free): the structure part a guest's own click changes. */
export const sameStructures = (a: Scene, b: Scene): boolean =>
  a.structure === b.structure && a.isolate === b.isolate
  && a.hiddenStructures.length === b.hiddenStructures.length && a.hiddenStructures.every((id) => b.hiddenStructures.includes(id));
```

In `frontend/src/share/types.ts`, change the `setPage` member and add three members before `resetView`:

```ts
  | { type: 'setPage'; page: Page }
```

```ts
  | { type: 'setStructure'; id: string | null }
  | { type: 'setStructureVisible'; id: string; visible: boolean }
  | { type: 'setIsolate'; on: boolean }
```

Change the sceneSync import there to `import type { Page, Scene } from './sceneSync';`.

- [ ] **Step 5: `useShareSync` for Learn**

Replace the body of `frontend/src/share/useShareSync.ts`:

```ts
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { dispatch } from '../actions/dispatch';
import { useViewer } from '../actions/store';
import { DEFAULT_SCENE, sameStructures, sceneActions, sceneOf, sceneSender, type Page, type Scene } from './sceneSync';
import { activeFor, sendView, setFollowing, useShare } from './store';

/** The host streams its page + 3D scene; a following guest goes to that page and mirrors the scene once `ready`. Learn is the atlas room. */
export function useShareSync(jobId: string, page: Page, ready: boolean): void {
  const navigate = useNavigate();
  const learn = page === 'learn';
  const role = useShare((s) => (jobId === (learn ? 'atlas' : 'sample') && activeFor(s, learn ? 'atlas' : 'case') ? s.stored?.role ?? null : null));
  const scene = useShare((s) => (role === 'viewer' && s.session?.me.following ? s.session.view.scene : null));
  const applied = useRef<Scene | null>(null);
  const applying = useRef(false);

  useEffect(() => {
    if (role !== 'host' || !ready) return;
    const sender = sceneSender(useShare.getState().session?.view.scene ?? DEFAULT_SCENE, (cmds) => void sendView(cmds));
    sender.push(sceneOf(useViewer.getState(), page)); // announces the page and the state this page loaded with
    const off = useViewer.subscribe((s) => sender.push(sceneOf(s, page)));
    return () => { off(); sender.flush(); };
  }, [role, ready, page]);

  // shortcut: a guest's own 3D tweaks while following stay until the host's next change, apply the full scene on every update if that confuses people.
  useEffect(() => {
    if (!scene) { applied.current = null; return; } // re-following applies the whole scene again
    if (scene.page !== page) { navigate(scene.page === 'learn' ? '/learn' : `/jobs/sample/${scene.page}`); return; }
    if (!ready) return;
    applying.current = true;
    for (const a of sceneActions(applied.current, scene, sceneOf(useViewer.getState(), page).hiddenStructures)) dispatch(a, 'pointer');
    applying.current = false;
    applied.current = scene;
  }, [scene, page, ready, navigate]);

  // A following guest's own structure click (tree, canvas, toolbar) stops following, like a slice click on /mri (spec §2.3).
  const following = scene !== null;
  useEffect(() => {
    if (!learn || !following || !ready) return;
    return useViewer.subscribe((s) => {
      const a = applied.current;
      if (!applying.current && a && !sameStructures(sceneOf(s, 'learn'), a)) void setFollowing(false);
    });
  }, [learn, following, ready]);
}
```

- [ ] **Step 6: Wire Learn**

In `frontend/src/routes/Learn.tsx`, add `import { useShareSync } from '../share/useShareSync';`, then insert after `const [missing, setMissing] = useState<string[]>([]);`:

```ts
  useShareSync('atlas', 'learn', atlas !== null);
```

- [ ] **Step 7: Run tests and build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`
Expected: PASS. The existing sceneSync tests still pass, because `sceneOf(initialState('sample'), 'mri')` equals the widened `DEFAULT_SCENE`.

- [ ] **Step 8: Commit**

Run GitNexus `detect_changes()`. Then:

```bash
git add frontend/src/share frontend/src/routes/Learn.tsx
git commit -m "feat(share): Learn follow mirrors structure select, hide and isolate

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Presence client loop, face pile, online dots

**Files:**
- Create: `frontend/src/share/presence.ts`, `frontend/src/share/FacePile.tsx`
- Modify: `frontend/src/share/client.ts`, `store.ts`, `SharePopover.tsx`, `SharePopover.module.css`, `frontend/src/components/TopNavBar.tsx`
- Test: `frontend/src/share/presence.test.ts`

**Interfaces:**
- Consumes (from Task 3): `presence:heartbeat`, `presence:list`, `presence:disconnect`.
- Produces:
  - `startPresence(client, auth, convexUrl, onOnline): () => void`.
  - `HEARTBEAT_MS`.
  - `useShare` state `online: Set<string>` (participant ids).
  - `convexUrl` export from `client.ts`.
  - `<FacePile session/>`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/share/presence.test.ts`:

```ts
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_MS, startPresence } from './presence';

type Ref = Parameters<typeof getFunctionName>[0];
const AUTH = { sessionId: 's1', participantToken: 't1' };

function fake() {
  const calls: [string, unknown][] = [];
  const subs: { name: string; args: unknown; onData: (v: unknown) => void; closed: boolean }[] = [];
  const client = {
    mutation: async (ref: Ref, args: unknown) => {
      const name = getFunctionName(ref);
      calls.push([name, args]);
      return name === 'presence:heartbeat' ? { roomToken: 'room', sessionToken: 'sess' } : null;
    },
    onUpdate: (ref: Ref, args: unknown, onData: (v: unknown) => void) => {
      const sub = { name: getFunctionName(ref), args, onData, closed: false };
      subs.push(sub);
      return () => { sub.closed = true; };
    },
  };
  return { client, calls, subs };
}

const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
const win = new EventTarget();
const sendBeacon = vi.fn(() => true);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', { sendBeacon });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); sendBeacon.mockClear(); doc.visibilityState = 'visible'; });

describe('startPresence', () => {
  it('heartbeats, lists the room, reports online participants only', async () => {
    const f = fake();
    const online = vi.fn();
    const stop = startPresence(f.client as never, AUTH, 'https://x.convex.cloud', online);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls[0]).toEqual(['presence:heartbeat', { ...AUTH, clientId: expect.any(String), interval: HEARTBEAT_MS }]);
    expect(f.subs[0]).toMatchObject({ name: 'presence:list', args: { roomToken: 'room' } });
    f.subs[0].onData([{ userId: 'p1', online: true }, { userId: 'p2', online: false }]);
    expect(online).toHaveBeenLastCalledWith(new Set(['p1']));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(f.calls.filter((c) => c[0] === 'presence:heartbeat')).toHaveLength(2);
    expect(f.subs).toHaveLength(1); // same room token: no resubscribe
    stop();
  });

  it('hidden tab disconnects; visible again heartbeats; pagehide beacons', async () => {
    const f = fake();
    const stop = startPresence(f.client as never, AUTH, 'https://x.convex.cloud', () => {});
    await vi.advanceTimersByTimeAsync(0);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    expect(f.calls.at(-1)).toEqual(['presence:disconnect', { sessionToken: 'sess' }]);
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls.at(-1)?.[0]).toBe('presence:heartbeat');
    win.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).toHaveBeenCalledWith('https://x.convex.cloud/api/mutation', expect.any(Blob));
    stop();
  });

  it('stop unsubscribes, disconnects and stops the timer', async () => {
    const f = fake();
    const stop = startPresence(f.client as never, AUTH, 'https://x.convex.cloud', () => {});
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(f.subs[0].closed).toBe(true);
    expect(f.calls.at(-1)).toEqual(['presence:disconnect', { sessionToken: 'sess' }]);
    const n = f.calls.length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(f.calls).toHaveLength(n);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `npm --prefix frontend test -- src/share/presence.test.ts`
Expected: FAIL, because the `./presence` module is not found.

- [ ] **Step 3: Implement `presence.ts`**

```ts
import type { ConvexClient } from 'convex/browser';
import { api } from './client';

type Client = Pick<ConvexClient, 'mutation' | 'onUpdate'>;
interface Auth { sessionId: string; participantToken: string }
interface Row { userId: string; online: boolean }

export const HEARTBEAT_MS = 10_000;

/**
 * Who is online in this room (spec §2.1). Same protocol as the component's stock usePresence,
 * on our own ConvexClient (its hook has no slot for our participant token). Returns stop.
 */
export function startPresence(client: Client, auth: Auth, convexUrl: string, onOnline: (ids: Set<string>) => void): () => void {
  const clientId = crypto.randomUUID();
  let sessionToken: string | null = null;
  let roomToken: string | null = null;
  let unlist: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const beat = async () => {
    try {
      const r = (await client.mutation(api.presence.heartbeat, { ...auth, clientId, interval: HEARTBEAT_MS })) as { roomToken: string; sessionToken: string };
      if (stopped) return;
      sessionToken = r.sessionToken;
      if (r.roomToken === roomToken) return;
      roomToken = r.roomToken;
      unlist?.();
      unlist = client.onUpdate(api.presence.list, { roomToken }, (rows: Row[]) => onOnline(new Set(rows.filter((x) => x.online).map((x) => x.userId))));
    } catch { /* offline or session over: the next tick retries; sessions.get reports an end */ }
  };
  const run = () => { void beat(); timer ??= setInterval(() => void beat(), HEARTBEAT_MS); };
  const pause = () => {
    if (timer) { clearInterval(timer); timer = null; }
    if (sessionToken) client.mutation(api.presence.disconnect, { sessionToken }).catch(() => {});
  };
  // The page may be gone before a websocket send flushes; a beacon is fire-and-forget over HTTP (as the stock hook does).
  const beacon = () => {
    if (sessionToken) navigator.sendBeacon(`${convexUrl}/api/mutation`, new Blob([JSON.stringify({ path: 'presence:disconnect', args: { sessionToken } })], { type: 'application/json' }));
  };
  const onVisibility = () => (document.visibilityState === 'hidden' ? pause() : run());

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', beacon);
  run();
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', beacon);
    unlist?.();
    pause();
  };
}
```

- [ ] **Step 4: Run the test to confirm it passes**

Run: `npm --prefix frontend test -- src/share/presence.test.ts`
Expected: PASS.

- [ ] **Step 5: Start and stop presence from the store**

In `frontend/src/share/client.ts`, add:

```ts
/** '' when unset (tests, no Convex): presence stays off. */
export const convexUrl: string = url ?? '';
```

In `frontend/src/share/store.ts`:
- Change the client import to `import { api, convex, convexUrl } from './client';` and add `import { startPresence } from './presence';`.
- Add `online: Set<string>` to `ShareState` and `online: new Set()` to the initial state.
- Add `let stopPresence: (() => void) | null = null;` after `let unsubscribe`.
- Change `drop` and `watch`:

```ts
function drop(notice: string | null): void {
  unsubscribe?.();
  unsubscribe = null;
  stopPresence?.();
  stopPresence = null;
  clearStored();
  useShare.setState({ stored: null, session: null, notice, syncNote: null, online: new Set() });
}

function watch(s: Stored): void {
  unsubscribe?.();
  unsubscribe = client!.onUpdate(api.sessions.get, auth(s), (session: SessionState) => useShare.setState({ session }), (e: Error) => {
    const code = codeOf(e);
    if (code === 'SESSION_ENDED') drop(SESSION_ENDED);
    else if (code && STALE.has(code)) drop(null);
    else console.error('[share]', e);
  });
  stopPresence?.();
  stopPresence = convexUrl ? startPresence(client!, auth(s), convexUrl, (online) => useShare.setState({ online })) : null;
}
```

In `frontend/src/share/store.test.ts`, change `beforeEach` to also reset `online: new Set()`.

- [ ] **Step 6: Face pile and roster dots**

Create `frontend/src/share/FacePile.tsx`:

```tsx
import { colorOf } from './cursorSync';
import css from './SharePopover.module.css';
import { useShare } from './store';
import type { SessionState } from './types';

const MAX_FACES = 4;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

/** Online participants only (presence), not the durable roster. */
export function FacePile({ session }: { session: SessionState }) {
  const online = useShare((s) => s.online);
  const here = session.participants.filter((p) => online.has(p.participantId));
  if (here.length === 0) return null;
  return (
    <ul className={css.pile} aria-label={`${here.length} online`}>
      {here.slice(0, MAX_FACES).map((p) => (
        <li key={p.participantId} className={css.face} title={p.displayName} style={{ background: colorOf(p.participantId) }}>{initials(p.displayName)}</li>
      ))}
      {here.length > MAX_FACES && <li className={css.face}>+{here.length - MAX_FACES}</li>}
    </ul>
  );
}
```

`FacePile` imports `colorOf` from `./cursorSync`, which Task 8 creates. Create the minimal file now. Task 8 Step 3 replaces it with the full module:

```ts
const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0fa3b1', '#f032e6', '#7a9a01'];

/** Stable colour per participant: the same id gets the same colour on every screen. */
export function colorOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
```

Append to `frontend/src/share/SharePopover.module.css`:

```css
.pile { display: flex; gap: 2px; margin: 0; padding: 0; list-style: none; }
.face { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #555; color: #fff; font: 600 10px/1 system-ui, sans-serif; }
.dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: #9aa0a6; }
.dotOn { background: #2ea043; }
```

In `frontend/src/share/SharePopover.tsx`, add `const online = useShare((s) => s.online);` after the `syncNote` line, and replace the roster `<li>`:

```tsx
          <li key={p.participantId}>
            <span className={`${css.dot} ${online.has(p.participantId) ? css.dotOn : ''}`} role="img" aria-label={online.has(p.participantId) ? 'online' : 'offline'} />
            {p.displayName}{p.role === 'host' ? ' (host)' : p.following ? ' · following' : ''}
          </li>
```

In `frontend/src/components/TopNavBar.tsx`, add `import { FacePile } from '../share/FacePile';`, then insert directly before `{guest && session && <FollowBanner session={session} />}`:

```tsx
      {session?.status === 'active' && <FacePile session={session} />}
```

- [ ] **Step 7: Run tests and build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`
Expected: PASS.

- [ ] **Step 8: Commit**

Run GitNexus `detect_changes()`. Then:

```bash
git add frontend/src/share frontend/src/components/TopNavBar.tsx
git commit -m "feat(share): presence heartbeat loop, face pile and online dots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Live 3D cursors (send, receive, draw)

**Files:**
- Modify: `frontend/src/share/cursorSync.ts` (from the Task 7 stub to the full module)
- Create: `frontend/src/share/RemoteCursors.tsx`, `frontend/src/share/RemoteCursors.module.css`, `frontend/src/viewer/glbNames.test.ts`
- Modify: `frontend/src/share/types.ts`, `store.ts`, `frontend/src/viewer/AtlasCanvas.tsx`, `frontend/src/viewer/CaseCanvas.tsx`
- Test: `frontend/src/share/cursorSync.test.ts`, `frontend/src/viewer/glbNames.test.ts`

**Interfaces:**
- Consumes:
  - From Task 4: `cursors:move`, `cursors:list`.
  - From Task 5: `activeFor`, `Subject`.
  - From Task 7: `online`.
- Produces:
  - `Cursor { node: string; localMm: [number, number, number] }` and `RemoteCursor { participantId; displayName; cursor: Cursor | null }` (`types.ts`).
  - `cursorSender(send, ms = 100): { push(c: Cursor | null): void; flush(): void }`.
  - `cursorOf(object, point): Cursor | null`.
  - `colorOf(id): string`.
  - `sendCursor(c)` and `watchCursors(onRows): () => void` (`store.ts`).
  - `useCursorPush(subject | null)` and `<RemoteCursors subject/>`.

- [ ] **Step 1: Impact check**

Run GitNexus `impact` upstream on `AtlasScene` (known LOW) and `CaseScene`. Report the results.

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/share/cursorSync.test.ts`:

```ts
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { colorOf, cursorOf, cursorSender } from './cursorSync';

afterEach(() => vi.useRealTimers());
const A = { node: 'n', localMm: [1, 2, 3] as [number, number, number] };

describe('cursorSender', () => {
  it('sends the latest point once per window, only on change', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const s = cursorSender(send, 100);
    s.push({ ...A, localMm: [0, 0, 0] });
    s.push(A);
    vi.advanceTimersByTime(100);
    expect(send.mock.calls).toEqual([[A]]);
    s.push({ ...A });
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('sends a single null after the pointer leaves, none before anything was sent', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const s = cursorSender(send, 100);
    s.push(null); vi.advanceTimersByTime(100);
    expect(send).not.toHaveBeenCalled();
    s.push(A); vi.advanceTimersByTime(100);
    s.push(null); vi.advanceTimersByTime(100);
    s.push(null); vi.advanceTimersByTime(100);
    expect(send.mock.calls).toEqual([[A], [null]]);
  });
});

describe('colorOf', () => {
  it('is stable per id', () => {
    expect(colorOf('p1')).toBe(colorOf('p1'));
    expect(colorOf('p1')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('cursorOf', () => {
  it('stores the hit in the mesh frame, so the receiver can re-project after explode', () => {
    const parent = new THREE.Group(); parent.position.set(10, 0, 0);
    const mesh = new THREE.Mesh(); mesh.name = 'thalamus_l'; mesh.position.set(0, 5, 0);
    parent.add(mesh); parent.updateMatrixWorld(true);
    const c = cursorOf(mesh, new THREE.Vector3(11, 5, 0));
    expect(c?.node).toBe('thalamus_l');
    expect(c?.localMm.map((v) => Math.round(v))).toEqual([1, 0, 0]);
    mesh.position.set(0, 50, 0); parent.updateMatrixWorld(true); // receiver exploded further
    expect(mesh.localToWorld(new THREE.Vector3(...c!.localMm)).toArray()).toEqual([11, 50, 0]);
  });
  it('ignores unnamed and hidden objects', () => {
    const g = new THREE.Group(); const m = new THREE.Mesh(); g.add(m);
    expect(cursorOf(m, new THREE.Vector3())).toBeNull();
    m.name = 'x'; g.visible = false;
    expect(cursorOf(m, new THREE.Vector3())).toBeNull();
  });
});
```

Create `frontend/src/viewer/glbNames.test.ts`:

```ts
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Mesh node names straight from the GLB JSON chunk (header 12 B, chunk length at byte 12, JSON from byte 20). */
function meshNodeNames(rel: string): string[] {
  const b = readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
  const gltf = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { nodes?: { name?: string; mesh?: number }[] };
  return (gltf.nodes ?? []).filter((n) => n.mesh !== undefined).map((n) => n.name ?? '');
}

// Cursors are anchored by node name (spec §2.2): a blank or duplicate name would put a dot on the wrong mesh.
describe('GLB mesh node names are unique', () => {
  it.each(['../../public/atlas/brain_atlas.glb', '../../../backend/seed/sample/model.glb'])('%s', (rel) => {
    const names = meshNodeNames(rel);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n, i) => !n || names.indexOf(n) !== i)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npm --prefix frontend test -- src/share/cursorSync.test.ts src/viewer/glbNames.test.ts`

Expected:
- cursorSync FAILS, because `cursorSender` / `cursorOf` are not exported.
- The GLB test either passes or reports real duplicates. If it reports duplicates, stop and tell the user: cursors on those meshes would land on the first same-named mesh.

- [ ] **Step 4: Implement `cursorSync.ts` (full)**

Replace `frontend/src/share/cursorSync.ts`:

```ts
import type * as THREE from 'three';
import type { Cursor } from './types';

const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0fa3b1', '#f032e6', '#7a9a01'];

/** Stable colour per participant: the same id gets the same colour on every screen. */
export function colorOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** The hit in the hit mesh's own frame (spec §2.2), or null for an unnamed or hidden object. */
export function cursorOf(object: THREE.Object3D, point: THREE.Vector3): Cursor | null {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return null;
  if (!object.name) return null;
  const [x, y, z] = object.worldToLocal(point.clone()).toArray();
  return { node: object.name, localMm: [x, y, z] };
}

const same = (a: Cursor | null, b: Cursor | null) =>
  a === b || (!!a && !!b && a.node === b.node && a.localMm.every((v, i) => v === b.localMm[i]));

/** Trailing throttle: at most one send per `ms`, only when the point changed; leaving sends one null. */
export function cursorSender(send: (c: Cursor | null) => void, ms = 100) {
  let sent: Cursor | null = null;
  let latest: Cursor | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (same(sent, latest)) return;
    sent = latest;
    send(latest);
  };
  return {
    push(c: Cursor | null) { latest = c; timer ??= setTimeout(flush, ms); },
    flush,
  };
}
```

In `frontend/src/share/types.ts`, append:

```ts
/** A pointer on the model: hit point in the hit mesh's local frame (convex/cursors.ts). */
export interface Cursor { node: string; localMm: [number, number, number] }
export interface RemoteCursor { participantId: string; displayName: string; cursor: Cursor | null }
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npm --prefix frontend test -- src/share/cursorSync.test.ts`
Expected: PASS.

- [ ] **Step 6: Store send/receive**

In `frontend/src/share/store.ts`, change the types import to `import type { Cursor, RemoteCursor, SessionState, ViewerCommand } from './types';` and append:

```ts
/** Any role. Best-effort: a dropped point is replaced by the next one. */
export function sendCursor(cursor: Cursor | null): void {
  const s = useShare.getState().stored;
  if (!client || !s) return;
  client.mutation(api.cursors.move, { ...auth(s), cursor }).catch(() => {});
}

/** Everyone else's cursors in this tab's room. An end or stale token is handled by the sessions.get subscription. */
export function watchCursors(onRows: (rows: RemoteCursor[]) => void): () => void {
  const s = useShare.getState().stored;
  if (!client || !s) return () => {};
  return client.onUpdate(api.cursors.list, auth(s), onRows, () => onRows([]));
}
```

- [ ] **Step 7: `RemoteCursors.tsx` + css**

Create `frontend/src/share/RemoteCursors.module.css`:

```css
.chip { padding: 0 6px; border-radius: 4px; color: #fff; font: 600 11px/1.6 system-ui, sans-serif; white-space: nowrap; transform: translate(10px, -50%); pointer-events: none; }
```

Create `frontend/src/share/RemoteCursors.tsx`:

```tsx
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { colorOf, cursorSender } from './cursorSync';
import css from './RemoteCursors.module.css';
import { activeFor, sendCursor, useShare, watchCursors } from './store';
import type { Subject } from './stored';
import type { Cursor, RemoteCursor } from './types';

const EASE_S = 0.12;
const DOT_MM = 2.5;

const useRoomSession = (subject: Subject | null) => useShare((s) => (subject ? activeFor(s, subject)?.sessionId ?? null : null));

/** Pointer → shared cursor for this canvas; null outside a live session of this page's room. */
export function useCursorPush(subject: Subject | null): ((c: Cursor | null) => void) | null {
  const sessionId = useRoomSession(subject);
  const sender = useMemo(() => (sessionId ? cursorSender(sendCursor) : null), [sessionId]);
  useEffect(() => () => { sender?.push(null); sender?.flush(); }, [sender]); // leaving the page hides our dot for the others
  return sender ? sender.push : null;
}

/** Everyone else's pointer as a dot + name chip, re-projected through this screen's own explode (spec §2.1). */
export function RemoteCursors({ subject }: { subject: Subject | null }) {
  const sessionId = useRoomSession(subject);
  const online = useShare((s) => s.online);
  const [rows, setRows] = useState<RemoteCursor[]>([]);
  useEffect(() => (sessionId ? watchCursors(setRows) : undefined), [sessionId]);
  if (!sessionId) return null;
  return <>{rows.map((r) => (r.cursor && online.has(r.participantId) ? <RemoteDot key={r.participantId} id={r.participantId} name={r.displayName} cursor={r.cursor} /> : null))}</>;
}

function RemoteDot({ id, name, cursor }: { id: string; name: string; cursor: Cursor }) {
  const scene = useThree((s) => s.scene);
  const node = useMemo(() => scene.getObjectByName(cursor.node), [scene, cursor.node]);
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  const placed = useRef(false);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || !node) return;
    node.localToWorld(target.set(...cursor.localMm)); // every frame: this screen's explode may move the mesh
    if (placed.current) g.position.lerp(target, 1 - Math.exp(-dt / EASE_S));
    else { g.position.copy(target); placed.current = true; }
  });
  if (!node) return null;
  const color = colorOf(id);
  return (
    <group ref={ref}>
      <mesh renderOrder={10}>
        <sphereGeometry args={[DOT_MM, 16, 12]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
      <Html style={{ pointerEvents: 'none' }}><span className={css.chip} style={{ background: color }}>{name}</span></Html>
    </group>
  );
}
```

- [ ] **Step 8: Pointer capture + mount in the canvases**

In `frontend/src/viewer/AtlasCanvas.tsx`:
- Add the imports `import { cursorOf } from '../share/cursorSync';` and `import { RemoteCursors, useCursorPush } from '../share/RemoteCursors';`.
- In `AtlasScene`, add `const push = useCursorPush('atlas');` after `const world = …`.
- Change the two pointer handlers:

```tsx
          onPointerMove={(e: ThreeEvent<PointerEvent>) => {
            const id = idOf(e);
            if (!pickable(id)) return; // not stopped → R3F tries the next hit
            e.stopPropagation();
            if (hover?.id !== id) setHover({ id, point: e.point.clone() });
            document.body.style.cursor = 'pointer';
            push?.(cursorOf(e.object, e.point));
          }}
          onPointerOut={(e: ThreeEvent<PointerEvent>) => {
            if (idOf(e) === hover?.id) { setHover(null); document.body.style.cursor = ''; }
            push?.(null); // the next pointer-move on another part wins inside the same throttle window
          }}
```

- Add `<RemoteCursors subject="atlas" />` directly after the closing `</group>`.

In `frontend/src/viewer/CaseCanvas.tsx`:
- Add the imports `import type { ThreeEvent } from '@react-three/fiber';`, `import { cursorOf } from '../share/cursorSync';` and `import { RemoteCursors, useCursorPush } from '../share/RemoteCursors';`.
- In `CaseScene`, add after `const target = …`:

```ts
  const room = jobId === 'sample' ? 'case' : null; // sharing is sample-only (W2)
  const push = useCursorPush(room);
```

Replace `<primitive object={cs.world} />` with:

```tsx
      <primitive
        object={cs.world}
        // handlers only during a session: without them R3F does not raycast the case at all
        onPointerMove={push ? (e: ThreeEvent<PointerEvent>) => {
          const c = cursorOf(e.object, e.point);
          if (!c) return; // hidden or unnamed: R3F tries the next hit
          e.stopPropagation();
          push(c);
        } : undefined}
        onPointerOut={push ? () => push(null) : undefined}
      />
      <RemoteCursors subject={room} />
```

- [ ] **Step 9: Run tests and build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`
Expected: PASS.

- [ ] **Step 10: Commit**

Run GitNexus `detect_changes()`. Expected scope: AtlasScene, CaseScene and the share modules. Then:

```bash
git add frontend/src/share frontend/src/viewer
git commit -m "feat(share): live 3D cursors on case /3d and Learn

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Gates + manual two-browser check

**Files:** none (verification only)

- [ ] **Step 1: All gates**

Run: `npm run typecheck && npm test && npm --prefix frontend run build && npm --prefix frontend test`
Expected: every command exits 0. Paste failures verbatim. Do not claim green without the output.

- [ ] **Step 2: Deploy to the dev deployment**

Run: `npx convex dev --once`. This needs the user's Convex login, so ask the user to run `! npx convex dev --once` if it is not authenticated. Then start the frontend with `npm --prefix frontend run dev`, with `VITE_CONVEX_URL` set in `frontend/.env.local`.

- [ ] **Step 3: Manual check (two browsers, or a normal window plus a private window)**

- `/jobs/sample/3d`:
  - Host clicks Share and copies the link. The guest joins and lands on `/jobs/sample/mri`. The host goes to 3D, and the guest follows.
  - Face piles show 2 avatars on both screens.
  - Moving the pointer over the brain shows a coloured dot with the name on the other screen.
  - Set a different explode on each screen: the dot stays on the same anatomical spot.
  - Close the guest tab: the host's pile drops to 1 within ~25 s, or at once via the beacon.
- `/learn`:
  - Host clicks Share, and the guest lands on `/learn`.
  - Select, hide (tree eye) and isolate on the host: the guest mirrors each.
  - X-Ray, opacity and L/R on the host mirror to the guest.
  - The guest clicks a structure: the banner flips to "Not following", and **Follow** snaps back.
  - Cursors work as on `/3d`.
- A host with a case room who opens `/learn` sees Share disabled with "End the shared session on the other page first".

- [ ] **Step 4: Report**

Tell the user what passed, what failed, and what was not checked. The PR needs Sage's review (schema change + guardrail 7). Do not open the PR unless the user asks.
