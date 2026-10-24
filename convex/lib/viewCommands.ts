/**
 * The shared view command model
 * =============================
 *
 * ONE COMMAND LANGUAGE, FOUR INPUT DEVICES
 * ----------------------------------------
 * A presenter can change the shared view by clicking a control, pressing a key,
 * making a pinch gesture, or saying "Jarvis, next slice". BACKEND_CONTEXT §7 and
 * SPEC §7.3 both insist those four paths converge on ONE typed, validated
 * command type before anything is written. This file is that convergence point
 * on the server.
 *
 * The practical payoff: when Phase 4 adds `/jarvis next slice`, the parser's job
 * is to produce a `{ type: "stepSlice", delta: 1 }` and nothing else. It does not
 * get its own code path, its own bounds checks, or its own chance to write an
 * out-of-range slice index. The LLM is never allowed to write to the database —
 * it is only allowed to propose one of these five values, which are then checked
 * here exactly as a mouse click would be (guardrail 6).
 *
 * WHY THIS IS A PURE FUNCTION
 * ---------------------------
 * `applyCommand` takes the current view and returns the next view. It has no
 * `ctx`, touches no database, and performs no I/O. That means:
 *   - it is exhaustively unit-testable with plain literals, no mock DB;
 *   - the mutation in `sessions.ts` stays a 10-line read-apply-patch;
 *   - the same function could later run on the client to produce an optimistic
 *     update that is guaranteed to match what the server will do.
 *
 * Java analogy: this is the `apply(State, Command) -> State` method of an
 * event-sourced aggregate — all the rules, none of the plumbing.
 *
 * WHAT IS *NOT* HERE, ON PURPOSE
 * ------------------------------
 * Camera orbit, zoom, pinch progress, hand landmarks, pointer position. Those
 * are local to one browser and would be tens of writes per second
 * (guardrail 7: "Do not stream camera/gesture samples to Convex"). Only
 * semantically meaningful, must-agree-on values are commands.
 *
 * SPEC §7.3 defines a larger `Action` union for the frontend (`setMode`,
 * `setOpacity`, `setExplosion`, `setCutPlane`, `setLayerVisible`, ...). Most of
 * those are presentation-only and stay client-local. The mapping is noted
 * against each command below; widening the shared set is a Phase 2 decision to
 * take WITH the frontend owners, not unilaterally.
 */

import { v } from "convex/values";
import { appError } from "./errors";
import {
  asVec3,
  clampToBoxMm,
  cursorForSliceIndex,
  sliceCount,
  sliceIndexFromCursor,
  volumeExtentMm,
  voxelToRasMm,
  type Plane,
  type ScanGeometry,
  type Vec3,
} from "./transform";

// ---------------------------------------------------------------------------
// The command type
// ---------------------------------------------------------------------------

/** The /3d page state a following guest mirrors (W2 Phase B). Mirrors frontend initialState(). */
export type Scene = {
  page: "mri" | "3d";
  mode: "whole" | "xray" | "exploded" | "cutaway";
  brainOpacity: number;
  explodeAmount: number;
  hidden: { left: boolean; right: boolean };
  layers: { edema: boolean; core: boolean; enhancing: boolean };
  cameraTarget: "brain" | "tumor";
};

export const DEFAULT_SCENE: Scene = {
  page: "mri", mode: "whole", brainOpacity: 0.3, explodeAmount: 0,
  hidden: { left: false, right: false }, layers: { edema: true, core: true, enhancing: true }, cameraTarget: "brain",
};

const vPage = v.union(v.literal("mri"), v.literal("3d"));
const vMode = v.union(v.literal("whole"), v.literal("xray"), v.literal("exploded"), v.literal("cutaway"));
const vSide = v.union(v.literal("left"), v.literal("right"));
const vLayer = v.union(v.literal("edema"), v.literal("core"), v.literal("enhancing"));
const vTarget = v.union(v.literal("brain"), v.literal("tumor"));

export const vScene = v.object({
  page: vPage, mode: vMode, brainOpacity: v.number(), explodeAmount: v.number(),
  hidden: v.object({ left: v.boolean(), right: v.boolean() }),
  layers: v.object({ edema: v.boolean(), core: v.boolean(), enhancing: v.boolean() }),
  cameraTarget: vTarget,
});

/**
 * Exactly the commands from BACKEND_CONTEXT §7.
 *
 * In TypeScript this is a "discriminated union": the `type` field tells the
 * compiler which other fields exist, so after `if (cmd.type === "setSlice")` the
 * compiler knows `cmd.index` is a number and that `cmd.plane` does not exist.
 *
 * Java has no direct equivalent before sealed interfaces; the closest is a
 * `sealed interface ViewerCommand permits SetPlane, SetSlice, ...` with records
 * for each case, switched over with pattern matching.
 */
export type ViewerCommand =
  /** Maps to SPEC §7.3 `setSlice.axis` / the Cutaway cut axis. */
  | { type: "setPlane"; plane: Plane }
  /** Absolute slice index in the current plane. Maps to SPEC `setSlice`. */
  | { type: "setSlice"; index: number }
  /** Relative move, for `next slice` / scroll / a gesture drag. */
  | { type: "stepSlice"; delta: number }
  /** Maps to SPEC §7.2 `tumorRevealed`. */
  | { type: "setTumorVisible"; visible: boolean }
  | { type: "setCursor"; sliceIndices: { axial: number; coronal: number; sagittal: number } }
  | { type: "setPage"; page: "mri" | "3d" }
  | { type: "setMode"; mode: "whole" | "xray" | "exploded" | "cutaway" }
  | { type: "setOpacity"; value: number }
  | { type: "setExplosion"; value: number }
  | { type: "setHemisphereVisible"; side: "left" | "right"; visible: boolean }
  | { type: "setLayerVisible"; layer: "edema" | "core" | "enhancing"; visible: boolean }
  | { type: "setCameraTarget"; target: "brain" | "tumor" }
  /** Maps to SPEC §7.3 `resetView`. */
  | { type: "resetView" };

/**
 * The Convex validator for the command union.
 *
 * This is the runtime half of the type above: Convex checks an incoming
 * argument against this BEFORE our handler runs, so a malformed command is
 * rejected at the edge with no code of ours executing. `v.union` of `v.object`s
 * discriminated by a `v.literal` is the standard encoding of a sealed union.
 *
 * `delta` is `v.number()` rather than a literal union of -1 and 1 so that a
 * scroll wheel or a gesture can send -5. The magnitude is bounded in
 * `applyCommand`, not in the type.
 */
export const vViewerCommand = v.union(
  v.object({
    type: v.literal("setPlane"),
    plane: v.union(v.literal("axial"), v.literal("coronal"), v.literal("sagittal")),
  }),
  v.object({ type: v.literal("setSlice"), index: v.number() }),
  v.object({ type: v.literal("stepSlice"), delta: v.number() }),
  v.object({ type: v.literal("setTumorVisible"), visible: v.boolean() }),
  v.object({ type: v.literal("setCursor"), sliceIndices: v.object({ axial: v.number(), coronal: v.number(), sagittal: v.number() }) }),
  v.object({ type: v.literal("setPage"), page: vPage }),
  v.object({ type: v.literal("setMode"), mode: vMode }),
  v.object({ type: v.literal("setOpacity"), value: v.number() }),
  v.object({ type: v.literal("setExplosion"), value: v.number() }),
  v.object({ type: v.literal("setHemisphereVisible"), side: vSide, visible: v.boolean() }),
  v.object({ type: v.literal("setLayerVisible"), layer: vLayer, visible: v.boolean() }),
  v.object({ type: v.literal("setCameraTarget"), target: vTarget }),
  v.object({ type: v.literal("resetView") }),
);

/**
 * Largest single `stepSlice` jump we accept.
 *
 * A trackpad fling or a jittery gesture can produce a huge delta; clamping the
 * magnitude keeps one event from teleporting the room across the volume. The
 * resulting index is clamped to the volume afterwards regardless, so this is
 * about keeping the interaction sane rather than about safety.
 */
const MAX_STEP_DELTA = 32;

// ---------------------------------------------------------------------------
// The shared view
// ---------------------------------------------------------------------------

/**
 * The synchronized part of the viewer state — the three values every
 * participant must agree on.
 *
 * This is a subset of the `sessions` row (it omits `viewVersion`, `status` and
 * the timestamps) so that the reducer cannot accidentally touch bookkeeping
 * fields.
 */
export type SharedView = {
  plane: Plane;
  cursorRasMm: Vec3;
  tumorVisible: boolean;
  scene: Scene;
};

/**
 * The scan facts the reducer needs: geometry, plus whether a tumor exists.
 *
 * `tumor: undefined` and `tumor: { detected: false }` are DIFFERENT states and
 * the UI must not merge them:
 *   undefined           -> "this case has not been segmented"
 *   { detected: false } -> "the model ran and found no tumor"
 * BACKEND_CONTRACT §5 forbids rendering either as "healthy".
 */
export type ScanForView = ScanGeometry & {
  tumor?: { detected: boolean };
};

/**
 * The view a session starts at, and the view `resetView` returns to.
 *
 * Choices and why:
 *  - plane `axial`: the conventional first read of a brain MRI, and the plane the
 *    Results page shows first (SPEC §3).
 *  - cursor at the CENTRE of the voxel grid: a defined, scan-independent
 *    starting point. Note it is the centre of the VOLUME, not of the brain —
 *    centring on the brain needs `report.brain.centroidMm`, which only a real
 *    report supplies, and inventing it for a fixture is exactly the kind of fake
 *    measurement guardrail 12 rules out.
 *  - `tumorVisible: false`: SPEC §4 mode 1 — "tumor hidden until revealed".
 *    Revealing the tumor should be a deliberate act in the demo, not the
 *    default.
 */
export function defaultSharedView(scan: ScanForView): SharedView {
  const d = scan.dimensions;
  const centreVoxel: Vec3 = [(d.i - 1) / 2, (d.j - 1) / 2, (d.k - 1) / 2];
  const extent = volumeExtentMm(scan);
  // Round-trip through the affine so the cursor is in RAS mm like every other
  // coordinate in the system, then clamp in case of a half-voxel overshoot.
  const centreMm = clampToBoxMm(voxelToRasMm(scan, centreVoxel), extent);
  return { plane: "axial", cursorRasMm: centreMm, tumorVisible: false, scene: { ...DEFAULT_SCENE, hidden: { ...DEFAULT_SCENE.hidden }, layers: { ...DEFAULT_SCENE.layers } } };
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

const PLANES = ["axial", "coronal", "sagittal"] as const;

/** Shared by every "show the tumor" command. The messages are fixed by SPEC §7.3 / BACKEND_CONTRACT §5. */
function requireTumor(scan: ScanForView): void {
  if (scan.tumor === undefined) {
    throw appError("INVALID_ARGUMENT", "This case has no segmentation yet, so there is nothing to highlight.");
  }
  // Wording fixed by SPEC §7.3 and BACKEND_CONTRACT §5. "No tumor
  // detected", never "healthy" — the UI shows this string verbatim.
  if (!scan.tumor.detected) throw appError("INVALID_ARGUMENT", "No tumor detected in this scan.");
}

function unit(value: number, what: string): number {
  if (!Number.isFinite(value)) throw appError("INVALID_ARGUMENT", `${what} must be a number, got ${value}.`);
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Applies one command to the shared view and returns the next view.
 *
 * VALIDATION POLICY — two different reactions, deliberately:
 *
 *   REJECT (throws an `INVALID_ARGUMENT` ConvexError) when the input could only
 *     come from a bug: a non-integer slice index, a NaN delta, revealing a tumor
 *     on a case that has none. These should surface to a developer.
 *
 *   CLAMP (silently) when the input is a legitimate interaction that ran off the
 *     end: slice 400 of a 155-slice volume, or a cursor nudged outside the
 *     volume. A presenter dragging a slider past the last slice should land on
 *     the last slice, not get an error toast mid-demo. SPEC §7.3 sets the same
 *     house rule: "The dispatcher validates and clamps every value."
 *
 * The returned object is always a NEW view; the input is never mutated. (There
 * is no `final` in TypeScript, so this is a convention the tests enforce rather
 * than something the compiler guarantees.)
 */
export function applyCommand(
  scan: ScanForView,
  view: SharedView,
  command: ViewerCommand,
): SharedView {
  const extent = volumeExtentMm(scan);

  // Normalise and bound-check the incoming cursor once, up front. The stored
  // cursor should already be valid, but a scan's geometry can be re-registered
  // under it, so treat it as untrusted input like everything else.
  const cursor = clampToBoxMm(asVec3(view.cursorRasMm, "cursorRasMm"), extent);

  switch (command.type) {
    case "setPlane": {
      // Changing the plane does NOT move the cursor. That is the whole point of
      // storing a 3D position instead of a slice number: switch from axial to
      // coronal and you are still looking at the same physical point, which is
      // what SPEC §4 means by "Switching mode never changes ... the cursor".
      return { ...view, plane: command.plane, cursorRasMm: cursor };
    }

    case "setSlice": {
      if (!Number.isInteger(command.index)) {
        throw appError(
          "INVALID_ARGUMENT",
          `Slice index must be a whole number, got ${command.index}.`,
        );
      }
      const count = sliceCount(scan, view.plane);
      const clamped = Math.min(Math.max(command.index, 0), count - 1);
      const next = cursorForSliceIndex(scan, view.plane, clamped, cursor);
      if (next === null) {
        // Only reachable if `count` and `cursorForSliceIndex` disagree, i.e. a
        // broken affine. Not a client error, so a plain Error (which stays
        // server-side) would hide it from us; a typed error is more useful.
        throw appError("BAD_SCAN_GEOMETRY", "This scan's geometry does not support slice indexing.");
      }
      return { ...view, cursorRasMm: clampToBoxMm(next, extent) };
    }

    case "stepSlice": {
      if (!Number.isFinite(command.delta) || !Number.isInteger(command.delta)) {
        throw appError("INVALID_ARGUMENT", `Slice step must be a whole number, got ${command.delta}.`);
      }
      if (command.delta === 0) {
        // A no-op step is not an error (a gesture can produce one), but it must
        // not bump `viewVersion`, so return the view unchanged and let the
        // caller notice nothing moved.
        return { ...view, cursorRasMm: cursor };
      }
      const delta = Math.min(Math.max(command.delta, -MAX_STEP_DELTA), MAX_STEP_DELTA);
      const current = sliceIndexFromCursor(scan, view.plane, cursor);
      const count = sliceCount(scan, view.plane);
      const target = Math.min(Math.max(current + delta, 0), count - 1);
      const next = cursorForSliceIndex(scan, view.plane, target, cursor);
      if (next === null) {
        throw appError("BAD_SCAN_GEOMETRY", "This scan's geometry does not support slice indexing.");
      }
      return { ...view, cursorRasMm: clampToBoxMm(next, extent) };
    }

    case "setTumorVisible": {
      // Turning the tumor OFF is always allowed, even with no tumor: it is the
      // safe direction and refusing it would make `resetView` inconsistent.
      if (command.visible) requireTumor(scan);
      return { ...view, tumorVisible: command.visible, cursorRasMm: cursor };
    }

    case "setCursor": {
      // shortcut: per-plane moves in sequence are exact for axis-aligned affines (the fixture); revisit for oblique scans after M4.
      let next = cursor;
      for (const plane of PLANES) {
        const index = command.sliceIndices[plane];
        if (!Number.isInteger(index)) throw appError("INVALID_ARGUMENT", `Slice index must be a whole number, got ${index}.`);
        const clamped = Math.min(Math.max(index, 0), sliceCount(scan, plane) - 1);
        const moved = cursorForSliceIndex(scan, plane, clamped, next);
        if (moved === null) throw appError("BAD_SCAN_GEOMETRY", "This scan's geometry does not support slice indexing.");
        next = moved;
      }
      return { ...view, cursorRasMm: clampToBoxMm(next, extent) };
    }
    case "setPage":
      return { ...view, cursorRasMm: cursor, scene: { ...view.scene, page: command.page } };
    case "setMode":
      return { ...view, cursorRasMm: cursor, scene: { ...view.scene, mode: command.mode } };
    case "setOpacity":
      return { ...view, cursorRasMm: cursor, scene: { ...view.scene, brainOpacity: unit(command.value, "Opacity") } };
    case "setExplosion":
      return { ...view, cursorRasMm: cursor, scene: { ...view.scene, explodeAmount: unit(command.value, "Explosion") } };
    case "setHemisphereVisible":
      return { ...view, cursorRasMm: cursor, scene: { ...view.scene, hidden: { ...view.scene.hidden, [command.side]: !command.visible } } };
    case "setLayerVisible":
      if (command.visible) requireTumor(scan); // hiding is the safe direction, like setTumorVisible
      return { ...view, cursorRasMm: cursor, scene: { ...view.scene, layers: { ...view.scene.layers, [command.layer]: command.visible } } };
    case "setCameraTarget":
      if (command.target === "tumor") requireTumor(scan);
      return { ...view, cursorRasMm: cursor, scene: { ...view.scene, cameraTarget: command.target } };

    case "resetView": {
      return defaultSharedView(scan);
    }
  }
}

/**
 * Has the view actually changed?
 *
 * Used by `sessions.updateView` to avoid bumping `viewVersion` and `updatedAt`
 * for a command that resolved to a no-op (a `stepSlice` already at the last
 * slice, a `setPlane` to the plane you are on). Without this, holding a gesture
 * at the end of the volume would write to the database on every frame, which is
 * exactly the traffic guardrail 7 is about.
 *
 * Millimetre comparison uses a tolerance rather than `===` because the cursor
 * round-trips through the affine and its inverse, so a value that is
 * mathematically unchanged can come back differing in the last bits of a double.
 * 1e-9 mm is a nanometre — far below any meaningful precision, and far above
 * floating-point noise.
 */
export function viewsEqual(a: SharedView, b: SharedView): boolean {
  if (a.plane !== b.plane) return false;
  if (a.tumorVisible !== b.tumorVisible) return false;
  const sa = a.scene, sb = b.scene;
  if (sa.page !== sb.page || sa.mode !== sb.mode || sa.brainOpacity !== sb.brainOpacity || sa.explodeAmount !== sb.explodeAmount || sa.cameraTarget !== sb.cameraTarget) return false;
  if (sa.hidden.left !== sb.hidden.left || sa.hidden.right !== sb.hidden.right) return false;
  if (sa.layers.edema !== sb.layers.edema || sa.layers.core !== sb.layers.core || sa.layers.enhancing !== sb.layers.enhancing) return false;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(a.cursorRasMm[i] - b.cursorRasMm[i]) > 1e-9) return false;
  }
  return true;
}
