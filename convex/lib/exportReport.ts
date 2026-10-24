import { z } from "zod";
import { env } from "../_generated/server";
import sample from "../../backend/seed/sample/report.json";
import sample2 from "../../backend/seed/sample-2/report.json";

const regions = z.object({ whole: z.number().finite(), core: z.number().finite(), enhancing: z.number().finite() });
const nullableRegions = z.object({ whole: z.number().min(0).max(1).nullable(), core: z.number().min(0).max(1).nullable(), enhancing: z.number().min(0).max(1).nullable() });
export const exportReportSchema = z.object({
  jobId: z.string(), model: z.object({ name: z.string(), arch: z.string(), version: z.string() }),
  segmentationSource: z.enum(["model", "expert"]), tumorDetected: z.boolean(),
  side: z.enum(["left", "right", "bilateral"]).nullable(), lesionCount: z.number().int().nonnegative(),
  volumesCm3: regions, certainty: nullableRegions.nullable().optional(), expertDice: regions.optional(),
});
export type ExportReport = z.infer<typeof exportReportSchema>;

/** Only deployment-owned URLs and safe job ids; never use metrics from scans. */
export async function readExportReport(jobId: string): Promise<ExportReport | null> {
  if (jobId === "atlas" || jobId === "learn" || jobId === "/learn") return null;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(jobId)) throw new Error("Invalid case id.");
  let raw: unknown;
  const baseUrl = (env as typeof env & { IMAGING_API_URL?: string }).IMAGING_API_URL;
  if (baseUrl) {
    const base = new URL(baseUrl);
    if (!["https:", "http:"].includes(base.protocol)) throw new Error("Invalid imaging service URL.");
    const url = new URL(`jobs/${encodeURIComponent(jobId)}/report`, base.href.replace(/\/?$/, "/"));
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Report service unavailable.");
    raw = await response.json();
  } else {
    const seeds: Record<string, unknown> = { sample, "sample-2": sample2 };
    raw = seeds[jobId];
    if (!raw) return null;
  }
  const report = exportReportSchema.parse(raw);
  if (report.jobId !== jobId) throw new Error("Report case id mismatch.");
  return report;
}
