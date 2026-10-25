import type { ExportReport } from "./exportReport";
import { reportLines } from "./exportMarkdown";

export interface FinalFacts {
  attendees: { name: string; role: "host" | "viewer" }[];
  questions: { who: string; text: string }[];
  report: ExportReport | null;
}
export interface FinalAi {
  timeline: string[];
  actionItems: string[];
}

const oneLine = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

/** Numbers the AI-written items may use: exactly those in the report findings. */
export function allowedNumbers(report: ExportReport | null): string[] {
  return report ? [...new Set((reportLines(report).join(" ").match(/\d+(?:[.,]\d+)?/g) ?? []))] : [];
}

/**
 * The stored final meeting summary. Code writes attendees, key findings
 * (report.json only, with its source), and questions asked; the model supplies
 * only the timeline and the action items (already Guard-checked). Screenshots
 * and the full transcript follow in the Markdown export.
 */
export function composeFinalSummary(facts: FinalFacts, ai: FinalAi): string {
  const out: string[] = [];
  out.push("## Attendees", ...(facts.attendees.map((a) => `- ${oneLine(a.name, 64)} (${a.role})`).length
    ? facts.attendees.map((a) => `- ${oneLine(a.name, 64)} (${a.role})`) : ["- Not recorded."]));
  out.push("", "## Timeline", ...(ai.timeline.length ? ai.timeline.map((t) => `- ${t}`) : ["- Nothing was recorded."]));
  out.push("", "## Key findings");
  if (facts.report) {
    const lines = reportLines(facts.report).filter((l) => l !== "");
    out.push(...lines.map((l) => (l.includes(" | ") || l.startsWith("---") ? l : `- ${l}`)));
  } else out.push("- No patient report is available for this case.");
  out.push("", "## Questions asked", ...(facts.questions.length
    ? facts.questions.map((q) => `- ${oneLine(q.who, 64)}: "${oneLine(q.text, 200).replace(/"/g, "'")}"`) : ["- None recorded."]));
  out.push("", "## Action items", ...(ai.actionItems.length ? ai.actionItems.map((t) => `- ${t}`) : ["- None recorded."]));
  out.push("", "Screenshots (in order, with captions) and the full transcript follow in the Markdown export.");
  return out.join("\n");
}
