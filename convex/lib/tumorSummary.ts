import { NO_TUMOR, type Report } from "../mcp/data";

/** Names of the three 3D tumor layers in the viewer (frontend/src/viewer/layers.ts). */
export const TUMOR_LAYERS = ["edema", "core", "enhancing"] as const;

const LABELS = {
  whole: { layer: "edema", label: "Whole outlined region (edema layer)" },
  core: { layer: "core", label: "Core" },
  enhancing: { layer: "enhancing", label: "Enhancing" },
} as const;

export interface TumorCard {
  tumorDetected: boolean;
  /** "No tumor detected in this scan" when there is nothing to summarize, else null. */
  message: string | null;
  side: Report["side"];
  lesionCount: number;
  source: string;
  regions: { region: keyof typeof LABELS; layer: (typeof TUMOR_LAYERS)[number]; label: string; volumeCm3: number; certainty: number | null }[];
  layers: readonly string[];
  certaintyNote: string;
  /** Ready-to-show plain text for the panel. Built from the same fields as above. */
  text: string;
}

const CERTAINTY_NOTE =
  "Outline certainty is the mean model probability within the outlined region. It is not calibrated and describes the outline, not the tissue.";

/** Code-built, no model. Every number is copied from report.json. */
export function buildTumorCard(report: Report): TumorCard {
  const source = `${report.segmentationSource === "expert" ? "Human expert segmentation" : "AI segmentation"}; report.json.`;
  if (!report.tumorDetected) {
    return {
      tumorDetected: false, message: NO_TUMOR, side: report.side, lesionCount: report.lesionCount, source,
      regions: [], layers: [], certaintyNote: CERTAINTY_NOTE, text: `${NO_TUMOR}.\nSource: ${source}`,
    };
  }
  const regions = (Object.keys(LABELS) as (keyof typeof LABELS)[]).map((region) => ({
    region, layer: LABELS[region].layer, label: LABELS[region].label,
    volumeCm3: report.volumesCm3[region], certainty: report.certainty?.[region] ?? null,
  }));
  const text = [
    "Tumor summary",
    `Side: ${report.side ?? "not available"} · Lesions: ${report.lesionCount}`,
    ...regions.map((r) => `${r.label}: ${r.volumeCm3} cm³ · outline certainty ${r.certainty ?? "not available"}`),
    `Source: ${source}`,
    `3D layers: ${TUMOR_LAYERS.join(", ")}.`,
    CERTAINTY_NOTE,
  ].join("\n");
  return {
    tumorDetected: true, message: null, side: report.side, lesionCount: report.lesionCount, source,
    regions, layers: TUMOR_LAYERS, certaintyNote: CERTAINTY_NOTE, text,
  };
}

/**
 * The exact "summarize the tumor" intent (the panel's chip / script line). Strict on
 * purpose: anything with extra requests ("... and zoom in") goes to the Router instead.
 */
export function tumorSummaryIntent(text: string): boolean {
  const t = text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return /^(?:(?:please|can you|could you) )*(?:(?:summari[sz]e|sum up|recap)(?: (?:the|this|that))? (?:tumou?r|lesion)(?: summary)?|(?:give me |show me |show )?(?:a |the )?(?:tumou?r|lesion) summary)$/.test(t);
}
