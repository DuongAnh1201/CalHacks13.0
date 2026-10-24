import { z } from "zod";
import atlas from "../../frontend/public/atlas/structures.json";
import anatomy from "../../frontend/src/content/anatomy.json";
import sample from "../../backend/seed/sample/report.json";
import sample2 from "../../backend/seed/sample-2/report.json";
import type { ReportContext } from "./definitions";

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const regions = z.object({ whole: z.number().finite(), core: z.number().finite(), enhancing: z.number().finite() });
const certainty = z.object({ whole: z.number().min(0).max(1).nullable(), core: z.number().min(0).max(1).nullable(), enhancing: z.number().min(0).max(1).nullable() });
const box = z.object({ min: vec3, max: vec3 });
export const reportSchema = z.object({
  jobId: z.string(), coordinateFrame: z.literal("RAS_mm"),
  model: z.object({ name: z.string(), arch: z.string(), version: z.string() }),
  segmentationSource: z.enum(["model", "expert"]), tumorDetected: z.boolean(),
  side: z.enum(["left", "right", "bilateral"]).nullable(), lesionCount: z.number().int().nonnegative(),
  centroidMm: vec3.nullable(), bboxMm: box.nullable(), volumesCm3: regions,
  brain: z.object({ centroidMm: vec3, bboxMm: box }),
  input: z.object({ shape: vec3, spacingMm: vec3, sequences: z.array(z.string()) }),
  certainty: certainty.nullable().optional(), expertDice: regions.optional(),
}).passthrough();
export type Report = z.infer<typeof reportSchema>;
export type Structure = typeof atlas.structures[number];
export { atlas, anatomy };
export const NO_REPORT = "There is no patient report on this page (template atlas).";
export const MISSING_REPORT = "There is no report for this case.";
export const NO_TUMOR = "No tumor detected in this scan";
export const NOTICE = "Educational visualization; not clinically validated.";
export interface KnowledgeData {
  readReport(jobId: string): Promise<Report | null>;
}

/** No arbitrary URLs from tools; only this deployment-owned base and safe IDs. */
export function fileData(baseUrl?: string): KnowledgeData {
  const seeds: Record<string, unknown> = { sample, "sample-2": sample2 };
  return { async readReport(jobId) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(jobId)) return null;
    let raw: unknown;
    if (baseUrl) {
      const base = new URL(baseUrl);
      if (!['https:', 'http:'].includes(base.protocol)) throw new Error("Invalid imaging service URL");
      const response = await fetch(new URL(`jobs/${encodeURIComponent(jobId)}/report`, base.href.replace(/\/?$/, '/')), { signal: AbortSignal.timeout(10000) });
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error("Report service unavailable");
      }
      raw = await response.json();
    } else raw = seeds[jobId];
    if (!raw) return null;
    const report = reportSchema.parse(raw);
    if (report.jobId !== jobId) throw new Error("Report job identifier mismatch");
    return report;
  }};
}
export async function reportFor(data: KnowledgeData, context: ReportContext) {
  if (context.page === 'learn' || context.page === '/learn' || !context.job_id) {
    return { report: null, message: NO_REPORT };
  }
  const report = await data.readReport(context.job_id);
  return { report, message: report ? null : MISSING_REPORT };
}
