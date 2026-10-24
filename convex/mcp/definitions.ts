/** Shared knowledge-tool schemas; future registries should import these. */
import { z } from "zod";

const context = {
  job_id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/).optional(),
  page: z.enum(["learn", "/learn", "explore"]).optional(),
};
export const metricFields = ["volumesCm3", "side", "lesionCount", "sizeCm", "centroidMm", "bboxMm", "segmentationSource", "expertDice", "certainty", "tumorDetected"] as const;
export const knowledgeSchemas = {
  explain_structure: z.object({ name: z.string().trim().min(1).max(200), depth: z.enum(["brief", "detailed"]).optional() }).strict(),
  explain_finding: z.object(context).strict(),
  get_tumor_metrics: z.object({ ...context, fields: z.array(z.enum(metricFields)).max(metricFields.length).optional() }).strict(),
  get_report: z.object(context).strict(),
  search: z.object({ ...context, query: z.string().trim().min(1).max(200), sources: z.array(z.enum(["atlas", "report"])).min(1).max(2).optional() }).strict(),
};
export type ReportContext = z.infer<typeof knowledgeSchemas.get_report>;
