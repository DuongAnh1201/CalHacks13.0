/**
 * seed — the demo fixture scan
 * ============================
 *
 * WHAT THIS IS FOR
 * ----------------
 * Phase 1 needs a scan row to open a session against, and it must exist before
 * Tom's inference pipeline does (BACKEND_CONTEXT §2: "Mock one scan and one
 * output manifest while ML work proceeds"). This file creates exactly one row
 * pointing at the `jobs/sample/` job that BACKEND_CONTRACT §2 requires the
 * imaging service to seed.
 *
 * HOW TO RUN IT
 * -------------
 *     npx convex run seed:seedSampleScan
 *
 * `npx convex run` can call internal functions; a browser cannot. That is the
 * whole reason this is an `internalMutation` — a public "seed the database"
 * endpoint is a public "overwrite the database" endpoint.
 *
 * Idempotent: it routes through `scans.register`, which patches the existing row
 * for the same `jobId` instead of inserting a second one. Run it as often as you
 * like.
 *
 * ============================================================================
 * HONESTY RULES THIS FILE FOLLOWS — read before adding a field
 * ============================================================================
 * BACKEND_CONTEXT guardrail 12 ("Don't promise what isn't built") and §5 ("no
 * fake demo numbers labeled as real") are load-bearing here, because a fixture
 * is precisely where a fabricated measurement would be easiest to slip in and
 * hardest to notice later.
 *
 * The tumor block is copied from the committed model report for `jobs/sample`,
 * while the affine stays a placeholder.
 *
 * So this fixture asserts only dataset properties and committed model findings:
 *
 *   SET, and true:
 *     isFixture: true          — the UI must surface this
 *     segmentationSource: "model" — the committed model run supplies the tumor
 *     tumor.volumesCm3         — copied from that report, without spatial claims
 *     dimensions / spacing     — the Decathlon Task01 grid (SPEC D2), which is
 *                                a property of the dataset, not a measurement
 *                                of a patient
 *     affineRowMajor           — a CENTRED AXIS-ALIGNED affine we constructed
 *                                ourselves. It is NOT this case's real NIfTI
 *                                affine. See the warning below.
 *     volumeExtentMm           — computed from the affine by `scans.register`
 *
 *   DELIBERATELY ABSENT:
 *     brain                    — the real brain centroid/bbox comes from
 *                                `report.brain` (BACKEND_CONTRACT §2.2). We do
 *                                not have it, so we do not invent it.
 *     tumor.centroidMm         — omitted while the affine remains a placeholder
 *
 * ============================================================================
 * !! THE AFFINE IS A PLACEHOLDER !!
 * ============================================================================
 * `centredAxisAlignedAffine` builds a 1 mm isotropic RAS affine centred on the
 * origin. A real Decathlon case has its own affine with its own origin, and it
 * is NOT centred.
 *
 * That is fine for Phase 1, whose job is to prove that two clients agree on a
 * slice index and a cursor position — self-consistency, which this affine gives.
 * It is NOT fine for the SPEC §5.3 alignment check, which compares a 3D marker
 * against a NiiVue crosshair on the real volume and must agree within 2 mm.
 *
 * SO: the moment the imaging service can serve `GET /jobs/sample/report`, the
 * real affine must replace this one. Until then anything built on top of this
 * fixture's coordinates is testing our maths, not our alignment. Tracked as an
 * open item in docs/CONVEX_BACKEND.md.
 */

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { centredAxisAlignedAffine, type Dimensions, type Vec3 } from "./lib/transform";

/**
 * The voxel grid of Medical Segmentation Decathlon Task01_BrainTumour.
 *
 * 240 x 240 x 155 at 1 mm isotropic. This is the BraTS-style preprocessed grid
 * every case in that dataset shares (SPEC D1/D2), and it is also the example
 * shape in BACKEND_CONTRACT §2.2. It describes the dataset, not a patient.
 */
const SAMPLE_DIMENSIONS: Dimensions = { i: 240, j: 240, k: 155 };
const SAMPLE_SPACING_MM: Vec3 = [1, 1, 1];

/**
 * Sequence order as the frontend's four upload slots present them
 * (SPEC §3: "4 labelled slots (T1c, T1, T2, FLAIR)").
 *
 * NOT the model's channel order. BACKEND_CONTRACT §4 flags that as unverified
 * and dangerous ("Feeding the wrong order still produces a confident-looking
 * mask, so this fails silently"), and it is Tom's `predict.py` that must assert
 * it. Convex only records which sequences a case has; it never reorders them.
 */
const SAMPLE_MODALITIES = ["t1c", "t1", "t2", "flair"];

/**
 * The seeded sample job id, fixed by BACKEND_CONTRACT §2: "seed `jobs/sample/`
 * ... so that `GET /jobs/sample/*` works immediately, with no upload and no
 * inference."
 */
export const SAMPLE_JOB_ID = "sample";

/**
 * Creates (or refreshes) the fixture scan.
 *
 * Asset paths are RELATIVE to the imaging service root — `/jobs/sample/...`,
 * matching the contract's routes. The frontend prefixes `VITE_API_URL`
 * (SPEC §6). Keeping the base URL out of the database means the same Convex
 * deployment works against localhost and against a tunnelled backend without a
 * data migration.
 *
 * `modelGlbPath` is listed even though the five-node GLB is still an open
 * backend action item (BACKEND_CONTRACT §"Action required first"). The path is
 * contractual; whether the file is there yet is a 404 the frontend already has
 * to handle (SPEC §9: "GLB missing brain_left/brain_right").
 */
export const seedSampleScan = internalMutation({
  args: {},
  handler: async (ctx): Promise<Id<"scans">> => {
    // A mutation cannot read the database and then call another mutation
    // directly as a function — it goes through `ctx.runMutation` with a
    // reference from the generated `internal` object. This keeps the called
    // function's argument validators in play (so the seed is checked exactly as
    // a webhook would be) and keeps both inside the SAME transaction.
    return await ctx.runMutation(internal.scans.register, {
      jobId: SAMPLE_JOB_ID,
      displayName: "Sample case (Decathlon Task01) — fixture",
      isFixture: true,
      modalityNames: SAMPLE_MODALITIES,
      dimensions: SAMPLE_DIMENSIONS,
      voxelSpacingMm: SAMPLE_SPACING_MM,
      // PLACEHOLDER — see the file header. Replace with the real NIfTI affine
      // as soon as `GET /jobs/sample/report` exists.
      affineRowMajor: [...centredAxisAlignedAffine(SAMPLE_SPACING_MM, SAMPLE_DIMENSIONS)],
      segmentationSource: "model",
      assets: {
        modelGlbPath: `/jobs/${SAMPLE_JOB_ID}/model.glb`,
        segNiftiPath: `/jobs/${SAMPLE_JOB_ID}/seg.nii.gz`,
        flairNiftiPath: `/jobs/${SAMPLE_JOB_ID}/flair.nii.gz`,
        reportPath: `/jobs/${SAMPLE_JOB_ID}/report`,
      },
      // From backend/seed/sample/report.json: a real model run on this case, not a fixture number (honesty rules above).
      tumor: { detected: true, volumesCm3: { whole: 136.28, core: 61.56, enhancing: 34.26 } },
    });
  },
});
