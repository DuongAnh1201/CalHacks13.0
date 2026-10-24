/**
 * scans — MRI case metadata
 * =========================
 *
 * WHAT A "SCAN" ROW IS
 * --------------------
 * A pointer to one case living in Tom's FastAPI service, plus the metadata the
 * collaborative layer needs in order to reason about coordinates and status.
 *
 * It is NOT a copy of the imaging data. The NIfTI volumes, `seg.nii.gz` and
 * `model.glb` stay on the imaging service's mounted `jobs/` volume; SPEC D9
 * ("Uploaded imagery never leaves our backend") and BACKEND_CONTEXT §3 ("Avoid
 * redundant binary copies") both point the same way. The browser fetches bytes
 * from `VITE_API_URL` directly and Convex never sees them.
 *
 * WHY CONVEX NEEDS THE GEOMETRY AT ALL
 * ------------------------------------
 * Two reasons, both about trust:
 *   1. The shared slice cursor must be bounded by the volume. A client that can
 *      set the cursor anywhere can desync the room; the bound has to be checked
 *      where the client cannot reach it.
 *   2. Phase 2 annotations are anchored in VOXEL coordinates and must be
 *      validated against the scan's dimensions and affine before being stored.
 *      An annotation outside the volume is silent data corruption.
 *
 * FUNCTION KINDS IN THIS FILE (the Convex concept to understand first)
 * --------------------------------------------------------------------
 *   query            — read-only, reactive, callable from the browser
 *   mutation         — read/write transaction, callable from the browser
 *   internalQuery    — read-only, NOT callable from the browser
 *   internalMutation — read/write, NOT callable from the browser
 *
 * "Internal" is a real boundary enforced by the server, not an obscure name:
 * internal functions are not in the public API surface at all, so a browser
 * cannot invoke one even if it knows the name (BACKEND_CONTEXT guardrail 4/5).
 *
 * Java analogy: `query`/`mutation` are `public` controller endpoints;
 * `internalQuery`/`internalMutation` are package-private service methods that
 * only other server code (an action, a scheduled job, or an authenticated
 * webhook) can call. `register`/`publishResult` are internal precisely because
 * only the imaging service should be able to say what a case contains.
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type QueryCtx,
} from "./_generated/server";
import { appError } from "./lib/errors";
import {
  asMat4,
  asVec3,
  sliceCount,
  volumeExtentMm,
  type Plane,
} from "./lib/transform";
import { vMat4RowMajor, vSegmentationSource, vVec3 } from "./schema";

// ---------------------------------------------------------------------------
// Public read model
// ---------------------------------------------------------------------------

/**
 * The scan shape returned to clients.
 *
 * This is a hand-written projection rather than the raw row, for the same reason
 * you would not return a JPA entity straight out of a Spring controller: the
 * row is free to grow fields (hashes, internal job bookkeeping, error details)
 * without those leaking into a public contract the frontend has typed against.
 *
 * `frontend/src/api/types.ts` mirrors this by hand — SPEC §6: "No codegen."
 */
export type PublicScan = {
  scanId: Id<"scans">;
  jobId: string;
  displayName: string;
  status: "uploaded" | "processing" | "completed" | "failed";
  segmentationSource: "model" | "expert" | "none";
  /** TRUE for a seeded demo case. The UI must surface this; see §"Honesty" below. */
  isFixture: boolean;
  modalityNames: string[];
  dimensions: { i: number; j: number; k: number };
  voxelSpacingMm: number[];
  coordinateSystem: "RAS";
  /** Voxel -> RAS mm, row-major. The frontend must TRANSPOSE for Three.js. */
  affineRowMajor: number[];
  volumeExtentMm: { min: number[]; max: number[] };
  brain?: { centroidMm: number[]; bboxMinMm: number[]; bboxMaxMm: number[] };
  tumor?: {
    detected: boolean;
    centroidMm?: number[];
    volumesCm3?: { whole: number; core: number; enhancing: number };
  };
  /** Paths relative to `VITE_API_URL`, e.g. "/jobs/sample/model.glb". */
  assets: {
    modelGlbPath?: string;
    segNiftiPath?: string;
    flairNiftiPath?: string;
    reportPath?: string;
  };
  /** Number of slices available in each plane, derived from dimensions + affine. */
  sliceCounts: { axial: number; coronal: number; sagittal: number };
  createdAt: number;
  errorMessage?: string;
};

/**
 * Projects a scan row into the public shape and derives the per-plane slice
 * counts.
 *
 * The slice counts are computed here rather than stored because they are a pure
 * function of `dimensions` + `affineRowMajor`. Storing them would be a second
 * source of truth that could drift from the affine — the exact failure mode
 * SPEC §5.3 treats as stop-the-line.
 */
export function toPublicScan(scan: Doc<"scans">): PublicScan {
  const planes: Plane[] = ["axial", "coronal", "sagittal"];
  const counts = {} as Record<Plane, number>;
  for (const plane of planes) {
    counts[plane] = sliceCount(scan, plane);
  }

  return {
    scanId: scan._id,
    jobId: scan.jobId,
    displayName: scan.displayName,
    status: scan.status,
    segmentationSource: scan.segmentationSource,
    isFixture: scan.isFixture,
    modalityNames: scan.modalityNames,
    dimensions: scan.dimensions,
    voxelSpacingMm: scan.voxelSpacingMm,
    coordinateSystem: scan.coordinateSystem,
    affineRowMajor: scan.affineRowMajor,
    volumeExtentMm: scan.volumeExtentMm,
    brain: scan.brain,
    tumor: scan.tumor,
    assets: scan.assets,
    sliceCounts: counts,
    createdAt: scan.createdAt,
    errorMessage: scan.errorMessage,
  };
}

/** Loads a scan by id or throws a typed NOT_FOUND. */
export async function loadScan(ctx: QueryCtx, scanId: Id<"scans">): Promise<Doc<"scans">> {
  const scan = await ctx.db.get(scanId);
  if (scan === null) {
    throw appError("NOT_FOUND", "That MRI case does not exist.");
  }
  return scan;
}

// ---------------------------------------------------------------------------
// Public queries
// ---------------------------------------------------------------------------

/**
 * Lists the cases available to open in a review session.
 *
 * AUTHORIZATION NOTE: this is intentionally unauthenticated, because a user has
 * to be able to pick a case BEFORE a session (and therefore a participant token)
 * exists. That is only safe because of what it returns: de-identified public
 * research cases (SPEC D2 — Medical Segmentation Decathlon Task01) and
 * fixtures, with no patient identifiers of any kind and no invite codes.
 *
 * If real uploaded cases ever land in this table, THIS FUNCTION MUST CHANGE
 * before they do — it would otherwise enumerate every case in the deployment.
 * The honest Phase 1 position is: only fixtures and public demo cases exist.
 *
 * `.collect()` is acceptable here and only here: the case list is on the order
 * of 3 rows. Everywhere else — chat especially — guardrail 8 requires
 * pagination.
 */
export const list = query({
  args: {},
  handler: async (ctx): Promise<PublicScan[]> => {
    const scans = await ctx.db.query("scans").order("desc").collect();
    return scans.map(toPublicScan);
  },
});

/**
 * Reads one case by its Convex id.
 *
 * Returns `null` rather than throwing when the id is unknown, because a React
 * component rendering a stale route should show "not found", not crash an
 * error boundary.
 */
export const get = query({
  args: { scanId: v.id("scans") },
  handler: async (ctx, args): Promise<PublicScan | null> => {
    const scan = await ctx.db.get(args.scanId);
    return scan === null ? null : toPublicScan(scan);
  },
});

/**
 * Reads one case by the imaging service's `jobId` string.
 *
 * This is the lookup the frontend routes need: SPEC §3 routes are
 * `/jobs/:id/explore`, so the browser holds a `jobId`, not a Convex id. Uses
 * the `by_jobId` index — a point lookup, not a table scan.
 */
export const getByJobId = query({
  args: { jobId: v.string() },
  handler: async (ctx, args): Promise<PublicScan | null> => {
    const scan = await ctx.db
      .query("scans")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();
    return scan === null ? null : toPublicScan(scan);
  },
});

// ---------------------------------------------------------------------------
// Internal writes — only server-side callers
// ---------------------------------------------------------------------------

/**
 * Argument validators for registering a case, shared by `register` and by the
 * seed script so the two cannot drift apart.
 */
const registerArgs = {
  jobId: v.string(),
  displayName: v.string(),
  isFixture: v.boolean(),
  modalityNames: v.array(v.string()),
  dimensions: v.object({ i: v.number(), j: v.number(), k: v.number() }),
  voxelSpacingMm: vVec3,
  affineRowMajor: vMat4RowMajor,
  segmentationSource: vSegmentationSource,
  assets: v.object({
    modelGlbPath: v.optional(v.string()),
    segNiftiPath: v.optional(v.string()),
    flairNiftiPath: v.optional(v.string()),
    reportPath: v.optional(v.string()),
  }),
  brain: v.optional(
    v.object({ centroidMm: vVec3, bboxMinMm: vVec3, bboxMaxMm: vVec3 }),
  ),
  tumor: v.optional(
    v.object({
      detected: v.boolean(),
      centroidMm: v.optional(vVec3),
      volumesCm3: v.optional(
        v.object({ whole: v.number(), core: v.number(), enhancing: v.number() }),
      ),
    }),
  ),
};

/**
 * Registers a case, or updates the existing row for the same `jobId`.
 *
 * WHY INTERNAL: only the imaging service may declare what a case contains. If a
 * browser could call this it could rewrite a scan's affine and thereby move
 * everybody's annotations. Phase 5 exposes it through an authenticated HTTP
 * action (`convex/http.ts`) that checks a shared secret and then calls this.
 *
 * IDEMPOTENT ON `jobId`: re-registering the same job patches the existing row
 * instead of creating a duplicate. This matters because a retried webhook is a
 * normal event, not an error, and two rows for one job would split a review
 * session from its own annotations.
 *
 * VALIDATION DONE HERE (not left to the caller):
 *  - spacing is 3 finite numbers, affine is 16 finite numbers
 *  - the affine is actually invertible
 *  - dimensions are positive integers
 *  - the affine maps RAS axes onto voxel axes unambiguously
 * `volumeExtentMm` is COMPUTED, never accepted from the caller, so it can never
 * disagree with the affine.
 */
export const register = internalMutation({
  args: registerArgs,
  handler: async (ctx, args): Promise<Id<"scans">> => {
    // --- validate geometry before anything is written ---
    asVec3(args.voxelSpacingMm, "voxelSpacingMm");
    asMat4(args.affineRowMajor, "affineRowMajor");

    const dims = [args.dimensions.i, args.dimensions.j, args.dimensions.k];
    if (dims.some((n) => !Number.isInteger(n) || n < 1)) {
      throw appError(
        "BAD_SCAN_GEOMETRY",
        `Scan dimensions must be positive whole numbers, got ${JSON.stringify(args.dimensions)}.`,
      );
    }

    const geometry = { dimensions: args.dimensions, affineRowMajor: args.affineRowMajor };

    // `volumeExtentMm` inverts nothing, but `sliceCount` does invert the affine
    // and does run the RAS->voxel axis mapping. Calling both here means a scan
    // that cannot support slice indexing is rejected at registration time
    // rather than at demo time. The helpers throw plain Errors, so wrap them in
    // a typed one the caller can act on.
    let extent: { min: number[]; max: number[] };
    try {
      extent = volumeExtentMm(geometry);
      sliceCount(geometry, "axial");
      sliceCount(geometry, "coronal");
      sliceCount(geometry, "sagittal");
    } catch (cause) {
      throw appError(
        "BAD_SCAN_GEOMETRY",
        `This scan's affine cannot be used for slice indexing: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
      );
    }

    const now = Date.now();
    const row = {
      jobId: args.jobId,
      displayName: args.displayName,
      status: "uploaded" as const,
      segmentationSource: args.segmentationSource,
      isFixture: args.isFixture,
      modalityNames: args.modalityNames,
      dimensions: args.dimensions,
      voxelSpacingMm: args.voxelSpacingMm,
      coordinateSystem: "RAS" as const,
      affineRowMajor: args.affineRowMajor,
      volumeExtentMm: extent,
      brain: args.brain,
      tumor: args.tumor,
      assets: args.assets,
      createdAt: now,
    };

    const existing = await ctx.db
      .query("scans")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .unique();

    if (existing !== null) {
      // Keep the original `createdAt` and `status`: re-registering metadata is
      // not a new upload, and it must not silently reset a job that has already
      // progressed to "completed".
      await ctx.db.patch(existing._id, { ...row, createdAt: existing.createdAt, status: existing.status });
      return existing._id;
    }

    return await ctx.db.insert("scans", row);
  },
});

/**
 * Moves a case's lifecycle status, mirroring BACKEND_CONTRACT §2.1.
 *
 * Internal for the same reason as `register`: only the imaging service knows
 * whether inference has finished. Phase 5 calls this from the HTTP ingest
 * action.
 *
 * `errorMessage` must be the contract's safe `error.message` string, never an
 * exception trace (schema.ts says so on the field too).
 */
export const setStatus = internalMutation({
  args: {
    scanId: v.id("scans"),
    status: v.union(
      v.literal("uploaded"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    await loadScan(ctx, args.scanId);
    if (args.status === "failed" && args.errorMessage === undefined) {
      throw appError("INVALID_ARGUMENT", "A failed scan must carry a user-facing error message.");
    }
    await ctx.db.patch(args.scanId, {
      status: args.status,
      // Clear a stale message when leaving the failed state, so the UI cannot
      // show yesterday's error next to today's successful result.
      errorMessage: args.status === "failed" ? args.errorMessage : undefined,
    });
  },
});

/**
 * Internal read used by other server code (actions, scheduled functions) that
 * needs the full row rather than the public projection.
 *
 * Exists so those callers do not reach into `ctx.db` from an action — they
 * cannot; an action has no database handle and must go through a query. This is
 * the Convex equivalent of a service method an async worker calls.
 */
export const getInternal = internalQuery({
  args: { scanId: v.id("scans") },
  handler: async (ctx, args): Promise<Doc<"scans"> | null> => {
    return await ctx.db.get(args.scanId);
  },
});
