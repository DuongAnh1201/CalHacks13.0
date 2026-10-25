/**
 * Uploaded jobs -> Convex scans, so any finished case can be shared.
 *
 *   jobs.registerScan   public action   fetch a job's report from the imaging
 *                                       service and register (or refresh) its scan
 *
 * WHY AN ACTION THAT FETCHES, NOT A MUTATION THAT TRUSTS THE CLIENT
 * -----------------------------------------------------------------
 * The browser already has the report, but scan geometry decides how every
 * client maps slices. So the server reads the report itself from the imaging
 * service (FastAPI on RunPod) and validates it; the caller only names a job.
 * Mutations cannot `fetch` (guardrail 3), so this is an action that hands the
 * validated record to the existing `scans.register` internal mutation.
 *
 * CONFIG: the deployment needs `NEUROVISION_API_URL` (same value as the
 * frontend's VITE_API_URL):  npx convex env set NEUROVISION_API_URL <url>
 *
 * KNOWN LIMIT (same as the sample, docs/CONVEX_BACKEND.md M4): the report has
 * no affine yet, so the scan gets a centred axis-aligned placeholder built from
 * the report's real grid and spacing. Sharing syncs by voxel index, so slices
 * still line up between clients; RAS-mm annotation points will move once M4
 * publishes the real affine.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import { env } from "./lib/env";
import { appError } from "./lib/errors";
import { centredAxisAlignedAffine, type Vec3 } from "./lib/transform";

/** Job ids the imaging service issues: short, URL-safe. Anything else never reaches fetch. */
const JOB_ID = /^[A-Za-z0-9_-]{1,64}$/;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Registers the scan for a finished job and returns its id. Idempotent:
 * sharing the same job twice refreshes one row (scans.register upserts by jobId).
 */
export const registerScan = action({
  args: { jobId: v.string() },
  handler: async (ctx, { jobId }): Promise<{ scanId: Id<"scans"> }> => {
    if (!JOB_ID.test(jobId)) throw appError("INVALID_ARGUMENT", "That is not a valid job id.");

    const base = env("NEUROVISION_API_URL");
    if (!base) {
      throw appError("UNAVAILABLE", "Sharing uploaded scans is not configured (NEUROVISION_API_URL).");
    }

    const report = await fetchReport(base, jobId);
    const scan = scanFromReport(jobId, report);
    const scanId: Id<"scans"> = await ctx.runMutation(internal.scans.register, scan);
    return { scanId };
  },
});

async function fetchReport(base: string, jobId: string): Promise<unknown> {
  const url = `${base.replace(/\/+$/, "")}/jobs/${encodeURIComponent(jobId)}/report`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { signal: abort.signal });
  } catch {
    throw appError("UNAVAILABLE", "The imaging service did not answer. Try again in a moment.");
  } finally {
    clearTimeout(timer);
  }
  // Contract (docs/BACKEND_CONTRACT.md): 404 unknown job, 409 not finished yet.
  if (res.status === 404) throw appError("NOT_FOUND", "The imaging service does not know that job.");
  if (res.status === 409) throw appError("INVALID_ARGUMENT", "This scan is still processing. Share it once results are ready.");
  if (!res.ok) throw appError("UNAVAILABLE", `The imaging service answered ${res.status}.`);
  try {
    return await res.json();
  } catch {
    throw appError("UNAVAILABLE", "The imaging service sent an unreadable report.");
  }
}

// ---------------------------------------------------------------------------
// Report -> scans.register args. Every number is checked: the report is
// another service's output, not something to write through unexamined.
// ---------------------------------------------------------------------------

type Rec = Record<string, unknown>;

const isRec = (x: unknown): x is Rec => typeof x === "object" && x !== null && !Array.isArray(x);
const bad = (what: string) => appError("UNAVAILABLE", `The imaging service's report has an invalid ${what}.`);

function vec3(x: unknown, what: string): Vec3 {
  if (!Array.isArray(x) || x.length !== 3 || !x.every((n) => typeof n === "number" && Number.isFinite(n))) throw bad(what);
  return [x[0], x[1], x[2]];
}

function num(x: unknown, what: string): number {
  if (typeof x !== "number" || !Number.isFinite(x)) throw bad(what);
  return x;
}

export function scanFromReport(jobId: string, r: unknown) {
  if (!isRec(r) || !isRec(r.input)) throw bad("input section");
  const shape = vec3(r.input.shape, "input.shape");
  if (!shape.every((n) => Number.isInteger(n) && n >= 1 && n <= 2048)) throw bad("input.shape");
  const spacing = vec3(r.input.spacingMm, "input.spacingMm");
  if (!spacing.every((n) => n > 0 && n <= 50)) throw bad("input.spacingMm");
  const dimensions = { i: shape[0], j: shape[1], k: shape[2] };

  const sequences = Array.isArray(r.input.sequences) ? r.input.sequences.filter((s): s is string => typeof s === "string").slice(0, 8) : [];

  const brain = isRec(r.brain) && isRec(r.brain.bboxMm)
    ? { centroidMm: vec3(r.brain.centroidMm, "brain.centroidMm"), bboxMinMm: vec3(r.brain.bboxMm.min, "brain.bboxMm"), bboxMaxMm: vec3(r.brain.bboxMm.max, "brain.bboxMm") }
    : undefined;

  if (typeof r.tumorDetected !== "boolean") throw bad("tumorDetected");
  const tumor = r.tumorDetected
    ? {
        detected: true,
        centroidMm: r.centroidMm === undefined ? undefined : vec3(r.centroidMm, "centroidMm"),
        volumesCm3: isRec(r.volumesCm3)
          ? { whole: num(r.volumesCm3.whole, "volumesCm3"), core: num(r.volumesCm3.core, "volumesCm3"), enhancing: num(r.volumesCm3.enhancing, "volumesCm3") }
          : undefined,
      }
    : { detected: false };

  const source = r.segmentationSource === "expert" ? ("expert" as const) : ("model" as const);

  return {
    jobId,
    displayName: jobId.startsWith("sample") ? `Sample case (${jobId})` : `Uploaded case ${jobId}`,
    // A real model run on a real upload: not a fixture (guardrail 12).
    isFixture: false,
    modalityNames: sequences,
    dimensions,
    voxelSpacingMm: spacing,
    // PLACEHOLDER until the report carries the NIfTI affine (M4); see file header.
    affineRowMajor: [...centredAxisAlignedAffine(spacing, dimensions)],
    segmentationSource: source,
    assets: {
      modelGlbPath: `/jobs/${jobId}/model.glb`,
      segNiftiPath: `/jobs/${jobId}/seg.nii.gz`,
      flairNiftiPath: `/jobs/${jobId}/flair.nii.gz`,
      reportPath: `/jobs/${jobId}/report`,
    },
    brain,
    tumor,
  };
}
