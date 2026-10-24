/**
 * Tests for the shared-view command reducer.
 *
 * Still no database: `applyCommand` is a pure function, so every rule about what
 * a presenter may do to the shared view is tested here with plain literals.
 * `sessions.test.ts` then only has to prove the plumbing (authorization,
 * persistence, two clients agreeing) rather than re-testing the rules.
 */

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import { centredAxisAlignedAffine, sliceIndexFromCursor, type Dimensions, type Vec3 } from "../lib/transform";
import {
  applyCommand,
  defaultSharedView,
  viewsEqual,
  type ScanForView,
  type SharedView,
} from "../lib/viewCommands";

const DIMS: Dimensions = { i: 240, j: 240, k: 155 };

/** A case with no segmentation at all. */
const UNSEGMENTED: ScanForView = {
  dimensions: DIMS,
  affineRowMajor: centredAxisAlignedAffine([1, 1, 1], DIMS),
};

/** A case where the model ran and found a tumor. */
const WITH_TUMOR: ScanForView = { ...UNSEGMENTED, tumor: { detected: true } };

/** A case where the model ran and found nothing. NOT the same as UNSEGMENTED. */
const NO_TUMOR_FOUND: ScanForView = { ...UNSEGMENTED, tumor: { detected: false } };

/**
 * Asserts that a thunk throws a `ConvexError` carrying a specific code.
 *
 * Checking the CODE rather than the message is what lets the wording change
 * without breaking tests, while still pinning the contract the frontend
 * switches on.
 */
function expectAppError(fn: () => unknown, code: AppErrorCode): AppErrorData {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    const data = (error as ConvexError<AppErrorData>).data;
    expect(data.code).toBe(code);
    return data;
  }
  throw new Error(`expected a ConvexError with code ${code}, but nothing was thrown`);
}

describe("defaultSharedView", () => {
  it("opens axial, at the centre of the volume, with the tumor hidden", () => {
    const view = defaultSharedView(UNSEGMENTED);
    expect(view.plane).toBe("axial");
    // SPEC §4 mode 1: "tumor hidden until revealed".
    expect(view.tumorVisible).toBe(false);
    // The centred fixture affine puts the grid centre at the RAS origin.
    for (const component of view.cursorRasMm) {
      expect(Math.abs(component)).toBeLessThan(1e-9);
    }
  });
});

describe("setPlane", () => {
  it("changes the plane without moving the cursor", () => {
    // The whole reason the cursor is stored in millimetres: switching plane must
    // keep you looking at the same physical point (SPEC §4).
    const start = defaultSharedView(UNSEGMENTED);
    const moved = applyCommand(UNSEGMENTED, start, { type: "setSlice", index: 30 });
    const switched = applyCommand(UNSEGMENTED, moved, { type: "setPlane", plane: "coronal" });

    expect(switched.plane).toBe("coronal");
    expect(switched.cursorRasMm).toEqual(moved.cursorRasMm);
  });

  it("is a no-op when already on that plane", () => {
    const start = defaultSharedView(UNSEGMENTED);
    const same = applyCommand(UNSEGMENTED, start, { type: "setPlane", plane: "axial" });
    // `viewsEqual` is what `sessions.updateView` uses to skip the database write
    // and avoid waking every subscriber for nothing.
    expect(viewsEqual(start, same)).toBe(true);
  });
});

describe("setSlice", () => {
  const start: SharedView = defaultSharedView(UNSEGMENTED);

  it("moves to an absolute slice index", () => {
    const next = applyCommand(UNSEGMENTED, start, { type: "setSlice", index: 42 });
    // Re-deriving the index from the resulting cursor is the real assertion:
    // it proves the mm value actually lands on slice 42.
    const check = applyCommand(UNSEGMENTED, next, { type: "setSlice", index: 42 });
    expect(viewsEqual(next, check)).toBe(true);
  });

  it("clamps past the end instead of erroring", () => {
    // Policy: a legitimate interaction that ran off the end clamps, so a
    // presenter dragging a slider does not get an error toast mid-demo.
    const past = applyCommand(UNSEGMENTED, start, { type: "setSlice", index: 9999 });
    const last = applyCommand(UNSEGMENTED, start, { type: "setSlice", index: 154 });
    expect(viewsEqual(past, last)).toBe(true);

    const before = applyCommand(UNSEGMENTED, start, { type: "setSlice", index: -50 });
    const first = applyCommand(UNSEGMENTED, start, { type: "setSlice", index: 0 });
    expect(viewsEqual(before, first)).toBe(true);
  });

  it("rejects a fractional index", () => {
    // Policy: input that could only come from a bug is rejected, not clamped.
    expectAppError(
      () => applyCommand(UNSEGMENTED, start, { type: "setSlice", index: 12.5 }),
      "INVALID_ARGUMENT",
    );
  });
});

describe("stepSlice", () => {
  const start: SharedView = defaultSharedView(UNSEGMENTED);

  it("moves one slice forward and back", () => {
    const up = applyCommand(UNSEGMENTED, start, { type: "stepSlice", delta: 1 });
    const back = applyCommand(UNSEGMENTED, up, { type: "stepSlice", delta: -1 });
    expect(viewsEqual(start, back)).toBe(true);
    expect(viewsEqual(start, up)).toBe(false);
  });

  it("stops at the end of the volume rather than wrapping or erroring", () => {
    const last = applyCommand(UNSEGMENTED, start, { type: "setSlice", index: 154 });
    const past = applyCommand(UNSEGMENTED, last, { type: "stepSlice", delta: 1 });
    // No-op, so `sessions.updateView` will report `applied: false` and write
    // nothing. This is what stops a held gesture at the end of the volume from
    // writing to the database on every frame.
    expect(viewsEqual(last, past)).toBe(true);
  });

  it("caps an absurd jump", () => {
    // A trackpad fling or jittery gesture must not teleport the room.
    const huge = applyCommand(UNSEGMENTED, start, { type: "stepSlice", delta: 100000 });
    const capped = applyCommand(UNSEGMENTED, start, { type: "stepSlice", delta: 32 });
    expect(viewsEqual(huge, capped)).toBe(true);
  });

  it("treats a zero step as a no-op, not an error", () => {
    const same = applyCommand(UNSEGMENTED, start, { type: "stepSlice", delta: 0 });
    expect(viewsEqual(start, same)).toBe(true);
  });

  it("rejects a fractional delta", () => {
    expectAppError(
      () => applyCommand(UNSEGMENTED, start, { type: "stepSlice", delta: 0.5 }),
      "INVALID_ARGUMENT",
    );
  });

  it("steps along the current plane's axis, not a fixed one", () => {
    const coronal = applyCommand(UNSEGMENTED, start, { type: "setPlane", plane: "coronal" });
    const stepped = applyCommand(UNSEGMENTED, coronal, { type: "stepSlice", delta: 5 });
    // Only the coronal (RAS y) component may have changed.
    expect(stepped.cursorRasMm[0]).toBeCloseTo(coronal.cursorRasMm[0], 9);
    expect(stepped.cursorRasMm[2]).toBeCloseTo(coronal.cursorRasMm[2], 9);
    expect(stepped.cursorRasMm[1]).not.toBeCloseTo(coronal.cursorRasMm[1], 9);
  });
});

describe("setTumorVisible", () => {
  const start: SharedView = defaultSharedView(UNSEGMENTED);

  it("reveals the tumor on a segmented case with a tumor", () => {
    const shown = applyCommand(WITH_TUMOR, start, { type: "setTumorVisible", visible: true });
    expect(shown.tumorVisible).toBe(true);
  });

  it("refuses to reveal a tumor the model did not find, with the exact SPEC wording", () => {
    const data = expectAppError(
      () => applyCommand(NO_TUMOR_FOUND, start, { type: "setTumorVisible", visible: true }),
      "INVALID_ARGUMENT",
    );
    // SPEC §7.3 fixes this string, and BACKEND_CONTRACT §5 forbids the word
    // "healthy". The UI shows it verbatim, so it is part of the contract.
    expect(data.message).toBe("No tumor detected in this scan.");
  });

  it("distinguishes 'not segmented' from 'no tumor found'", () => {
    const data = expectAppError(
      () => applyCommand(UNSEGMENTED, start, { type: "setTumorVisible", visible: true }),
      "INVALID_ARGUMENT",
    );
    expect(data.message).toMatch(/no segmentation yet/);
    expect(data.message).not.toMatch(/healthy/i);
  });

  it("always allows hiding the tumor, even with no tumor", () => {
    // Hiding is the safe direction, and refusing it would make `resetView`
    // (which hides the tumor) fail on an unsegmented case.
    const hidden = applyCommand(UNSEGMENTED, start, { type: "setTumorVisible", visible: false });
    expect(hidden.tumorVisible).toBe(false);
  });
});

describe("resetView", () => {
  it("returns to the default view from anywhere", () => {
    const start = defaultSharedView(WITH_TUMOR);
    let view = applyCommand(WITH_TUMOR, start, { type: "setPlane", plane: "sagittal" });
    view = applyCommand(WITH_TUMOR, view, { type: "setSlice", index: 7 });
    view = applyCommand(WITH_TUMOR, view, { type: "setTumorVisible", visible: true });
    expect(viewsEqual(view, start)).toBe(false);

    const reset = applyCommand(WITH_TUMOR, view, { type: "resetView" });
    expect(viewsEqual(reset, start)).toBe(true);
  });
});

describe("immutability", () => {
  it("never mutates the view it was given", () => {
    // There is no `final` in TypeScript, so this is enforced by test rather than
    // by the compiler. It matters because `sessions.updateView` compares the
    // before and after views to decide whether to write.
    const start = defaultSharedView(UNSEGMENTED);
    const snapshot: SharedView = {
      scene: structuredClone(start.scene),
      plane: start.plane,
      cursorRasMm: [...start.cursorRasMm] as Vec3,
      tumorVisible: start.tumorVisible,
    };
    applyCommand(UNSEGMENTED, start, { type: "setSlice", index: 100 });
    applyCommand(UNSEGMENTED, start, { type: "setPlane", plane: "coronal" });
    applyCommand(UNSEGMENTED, start, { type: "resetView" });
    expect(viewsEqual(start, snapshot)).toBe(true);
    expect(start.plane).toBe(snapshot.plane);
  });
});

describe("viewsEqual", () => {
  it("tolerates floating-point noise below a nanometre", () => {
    // The cursor round-trips through the affine and its inverse, so a
    // mathematically unchanged value can differ in the last bits of a double.
    const a = defaultSharedView(UNSEGMENTED);
    const b: SharedView = { ...a, cursorRasMm: [a.cursorRasMm[0] + 1e-12, a.cursorRasMm[1], a.cursorRasMm[2]] };
    expect(viewsEqual(a, b)).toBe(true);
  });

  it("detects a real sub-millimetre move", () => {
    const a = defaultSharedView(UNSEGMENTED);
    const b: SharedView = { ...a, cursorRasMm: [a.cursorRasMm[0] + 0.01, a.cursorRasMm[1], a.cursorRasMm[2]] };
    expect(viewsEqual(a, b)).toBe(false);
  });
});

describe("Phase B scene commands", () => {
  const base = () => defaultSharedView(WITH_TUMOR);

  it("starts from the frontend's initial scene", () => {
    expect(base().scene).toEqual({
      page: "mri", mode: "whole", brainOpacity: 0.3, explodeAmount: 0,
      hidden: { left: false, right: false }, layers: { edema: true, core: true, enhancing: true }, cameraTarget: "brain",
    });
  });
  it("setCursor moves all three planes at once and clamps", () => {
    const next = applyCommand(WITH_TUMOR, base(), { type: "setCursor", sliceIndices: { axial: 10, coronal: 20, sagittal: 999 } });
    expect(sliceIndexFromCursor(WITH_TUMOR, "axial", next.cursorRasMm)).toBe(10);
    expect(sliceIndexFromCursor(WITH_TUMOR, "coronal", next.cursorRasMm)).toBe(20);
    expect(sliceIndexFromCursor(WITH_TUMOR, "sagittal", next.cursorRasMm)).toBe(239);
    expectAppError(() => applyCommand(WITH_TUMOR, base(), { type: "setCursor", sliceIndices: { axial: 1.5, coronal: 0, sagittal: 0 } }), "INVALID_ARGUMENT");
  });
  it("setOpacity / setExplosion clamp to 0..1 and reject non-finite", () => {
    expect(applyCommand(WITH_TUMOR, base(), { type: "setOpacity", value: 2 }).scene.brainOpacity).toBe(1);
    expect(applyCommand(WITH_TUMOR, base(), { type: "setExplosion", value: -1 }).scene.explodeAmount).toBe(0);
    expectAppError(() => applyCommand(WITH_TUMOR, base(), { type: "setExplosion", value: Number.NaN }), "INVALID_ARGUMENT");
  });
  it("page, mode, hemisphere", () => {
    let v = applyCommand(WITH_TUMOR, base(), { type: "setPage", page: "3d" });
    v = applyCommand(WITH_TUMOR, v, { type: "setMode", mode: "exploded" });
    v = applyCommand(WITH_TUMOR, v, { type: "setHemisphereVisible", side: "left", visible: false });
    expect(v.scene).toMatchObject({ page: "3d", mode: "exploded", hidden: { left: true, right: false } });
  });
  it("layers and the tumor camera need a tumor; hiding a layer never does", () => {
    expectAppError(() => applyCommand(UNSEGMENTED, defaultSharedView(UNSEGMENTED), { type: "setLayerVisible", layer: "core", visible: true }), "INVALID_ARGUMENT");
    expectAppError(() => applyCommand(NO_TUMOR_FOUND, defaultSharedView(NO_TUMOR_FOUND), { type: "setCameraTarget", target: "tumor" }), "INVALID_ARGUMENT");
    expect(applyCommand(UNSEGMENTED, defaultSharedView(UNSEGMENTED), { type: "setLayerVisible", layer: "core", visible: false }).scene.layers.core).toBe(false);
    expect(applyCommand(WITH_TUMOR, base(), { type: "setCameraTarget", target: "tumor" }).scene.cameraTarget).toBe("tumor");
  });
  it("resetView resets the scene; viewsEqual sees scene changes", () => {
    const moved = applyCommand(WITH_TUMOR, base(), { type: "setExplosion", value: 0.5 });
    expect(viewsEqual(base(), moved)).toBe(false);
    expect(applyCommand(WITH_TUMOR, moved, { type: "resetView" }).scene.explodeAmount).toBe(0);
    expect(viewsEqual(base(), { ...base() })).toBe(true);
  });
});
