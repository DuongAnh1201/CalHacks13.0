import type { Doc } from "../_generated/dataModel";
import type { ExportReport } from "./exportReport";

export const EXPORT_SECTIONS = ["case", "report", "annotations", "summary", "conversation", "tool_steps"] as const;
/** Opt-in sections (#138): never part of the default set, always session-private. */
export const OPTIONAL_EXPORT_SECTIONS = ["screenshots", "transcript"] as const;
export const PRIVATE_SECTIONS = ["annotations", "summary", "conversation", "tool_steps", ...OPTIONAL_EXPORT_SECTIONS];
export const EXPORT_NOTICE = "Educational visualization; not clinically validated";
export const BANNED_EXPORT_WORDS = /\b(?:diagnosis|prognosis|survival|malignant|benign|healthy)\b/gi;
export type ExportSection = typeof EXPORT_SECTIONS[number];
export interface ExportScreenshot { caption: string; takenAt: number; url: string }
export interface ExportSnapshot {
  annotations: Doc<"annotations">[];
  summary: Doc<"sessionSummaries"> | null;
  messages: Doc<"messages">[];
  /** In capture order; only embedded when the "screenshots" section is requested. */
  screenshots?: ExportScreenshot[];
  /** Oldest first; only used by the "transcript" section. */
  transcript?: Doc<"transcriptSegments">[];
  /** Session start, the zero point of transcript and screenshot offsets. */
  startedAt?: number;
  /** "final": the meeting-end summary; "interim": an older running note; "unavailable": none (e.g. no API key). */
  summaryState?: "final" | "interim" | "unavailable";
}

const offset = (at: number, from?: number) => {
  const s = Math.max(0, Math.round((at - (from ?? at)) / 1000));
  return `+${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const safeUrl = (url: string) => /^https?:\/\/[^\s<>()]+$/.test(url);

/** Treat labels, notes and chat as quoted data, never Markdown instructions. */
export function exportText(text: string) {
  return text.replace(BANNED_EXPORT_WORDS, "[redacted]")
    .replace(/\\/g, "\\\\").replace(/([`*_{}\[\]()#+!|])/g, "\\$1")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function attribution(row: { author: "human" | "agent"; authorName: string }) {
  return `${row.author === "human" ? "Human" : "AI"}: ${exportText(row.authorName)}`;
}
function quote(text: string) { return exportText(text).split(/\r?\n/).map((line) => `> ${line}`).join("\n"); }

/** Tool inputs may include pairing capabilities: never put those in a document. */
function documentArgs(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(documentArgs);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      /token|secret|authorization|password|api[_-]?key/i.test(key) ? "[redacted]" : documentArgs(item)]));
  }
  return value;
}


/** The report facts as lines: the only place numbers come from (also used by the final meeting summary). */
export function reportLines(report: ExportReport): string[] {
  const lines = [`Source: ${report.segmentationSource === "model" ? "AI segmentation" : "Human expert segmentation"}; report.json.`,
    `Model: ${exportText(report.model.name)} (${exportText(report.model.arch)}, ${exportText(report.model.version)}).`,
    report.tumorDetected ? "Tumor outlined in this scan." : "No tumor detected in this scan",
    `Side: ${report.side ?? "not available"}.`, `Lesions: ${report.lesionCount}.`, "", "Region | Volume (cm³) | Outline certainty | Expert outline agreement (Dice)", "--- | ---: | ---: | ---:"];
  for (const key of ["whole", "core", "enhancing"] as const) {
    lines.push(`${key} | ${report.volumesCm3[key]} | ${report.certainty?.[key] ?? "not available"} | ${report.expertDice?.[key] ?? "not available"}`);
  }
  lines.push("", "Outline certainty is the mean model probability within the outlined region. It is not calibrated and describes the outline, not the tissue.");
  return lines;
}

/** Deterministic builder shared by the button and MCP: no model-generated facts. */
export function buildMarkdown(jobId: string, sections: readonly string[], report: ExportReport | null, data: ExportSnapshot): string {
  const parts = ["# NeuroVision export"];
  if (sections.includes("case")) {
    const label = ["atlas", "learn", "/learn"].includes(jobId)
      ? "Atlas (template brain, not a patient)" : `Case: ${exportText(jobId)}`;
    parts.push(`## Case\n\n${label}\n\nSource: app case context.`);
  }
  if (sections.includes("report")) {
    if (!report) parts.push("## Report\n\nNo patient report is available for this case.");
    else {
      const lines = ["## Report", "", ...reportLines(report)];
      parts.push(lines.join("\n"));
    }
  }
  if (sections.includes("annotations")) {
    parts.push("## Annotations\n\n" + (data.annotations.map((row) => {
      const anchor = row.anchor.kind === "structure" ? `structure ${exportText(row.anchor.id)}`
        : row.anchor.kind === "point" ? `RAS mm point (${row.anchor.ras_mm.join(", ")})` : "tumor";
      return `**${attribution(row)}** · ${row.status} · ${anchor}\n\n${quote(row.text)}`;
    }).join("\n\n") || "No matching annotations."));
  }
  if (sections.includes("summary")) {
    const state = data.summaryState;
    parts.push((state === "final" ? "## Meeting summary\n\n" : "## Latest summary\n\n") + (data.summary
      ? `**${attribution(data.summary)}**${state === "interim" ? " · interim (the final summary could not be written)" : ""}\n\n${quote(data.summary.text)}`
      : state === "unavailable" ? "Summary unavailable: no AI summary was written for this meeting (no API key, or the daily limit was reached)."
      : "No summary available."));
  }
  if (sections.includes("conversation")) {
    parts.push("## Conversation\n\n" + (data.messages.map((row) => `**${attribution(row)}** · ${row.role}\n\n${quote(row.text)}`).join("\n\n") || "No messages available."));
  }
  if (sections.includes("tool_steps")) {
    const steps = data.messages.flatMap((row) => (row.toolSteps ?? []).map((step) =>
      `**${attribution(row)}** · tool ${exportText(step.tool)} · ${step.ok ? "succeeded" : "failed"}\n\n${quote(step.message)}\n\nArguments (data):\n\n${quote(JSON.stringify(documentArgs(step.args)))}\n\nRecorded latency: ${step.ms} ms.`));
    parts.push("## Tool steps\n\n" + (steps.join("\n\n") || "No tool steps available."));
  }
  if (sections.includes("screenshots")) {
    const shots = data.screenshots ?? [];
    parts.push("## Screenshots\n\n" + (shots.map((shot, i) => {
      const caption = exportText(shot.caption);
      return `${i + 1}. **${caption}** · ${offset(shot.takenAt, data.startedAt)}` + (safeUrl(shot.url) ? `\n\n   ![${caption}](${shot.url})` : "\n\n   (image unavailable)");
    }).join("\n\n") || "No screenshots were taken."));
  }
  if (sections.includes("transcript")) {
    const rows = (data.transcript ?? []).filter((row) => row.final !== false);
    parts.push("## Transcript\n\nSpeech-to-text from the participants' browsers. It may contain recognition errors.\n\n" + (rows.map((row) =>
      `- ${offset(row.startedAt, data.startedAt)} **${exportText(row.speakerName)}**: ${exportText(row.text.replace(/\s+/g, " "))}`).join("\n") || "No transcript was recorded."));
  }
  parts.push(`---\n\n${EXPORT_NOTICE}`);
  return parts.join("\n\n") + "\n";
}
