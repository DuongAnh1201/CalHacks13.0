import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { BANNED_EXPORT_WORDS, EXPORT_NOTICE, exportText, offset, type ExportSnapshot } from "./exportMarkdown";
import type { ExportReport } from "./exportReport";

export const REPORT_TITLE = "Neuro Imaging Session Report";
export const NEXT_STEPS = ["Review findings with a supervising clinician.", "Compare with the radiology report of record."];
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const CERTAINTY_NOTE = "Outline certainty is the mean model probability within the outlined region. It is not calibrated and describes the outline, not the tissue.";
const INTERIM_SUMMARY = "Interim summary (the final summary could not be written)";
const TRANSCRIPT_NOTE = "Speech-to-text from the participants' browsers. It may contain recognition errors.";
const REGIONS = [["whole", "Whole tumor"], ["core", "Tumor core"], ["enhancing", "Enhancing tumor"]] as const;

export interface ReportInput { jobId: string; endedAt: number; participants: string[]; report: ExportReport | null; data: ExportSnapshot }
/** Format-neutral report; every string is already redacted, not yet escaped. */
export interface ReportDoc {
  caseId: string;
  date: string;
  participants: string[];
  /** [label, value] rows; null when the case has no report.json. */
  measurements: [string, string][] | null;
  summary: string | null;
  summaryInterim: boolean;
  annotations: { author: string; anchor: string; text: string }[];
  transcript: { at: string; speaker: string; text: string }[];
}

const clean = (text: string) => text.replace(BANNED_EXPORT_WORDS, "[redacted]");

function measurements(r: ExportReport): [string, string][] {
  const rows: [string, string][] = [
    ["Segmentation source", r.segmentationSource === "model" ? "AI segmentation" : "Human expert segmentation"],
    ["Model", clean(`${r.model.name} (${r.model.arch}, ${r.model.version})`)],
    ["Tumor outlined", r.tumorDetected ? "Yes" : "No"],
    ["Side", r.side ?? "not available"],
    ["Lesion count", String(r.lesionCount)],
  ];
  for (const [key, label] of REGIONS) rows.push([`${label} volume (cm³)`, String(r.volumesCm3[key])]);
  for (const [key, label] of REGIONS) {
    const certainty = r.certainty?.[key];
    if (certainty != null) rows.push([`${label} outline certainty`, String(certainty)]);
  }
  return rows;
}

export function buildReportDoc({ jobId, endedAt, participants, report, data }: ReportInput): ReportDoc {
  return {
    caseId: clean(jobId),
    date: `${new Date(endedAt).toISOString().slice(0, 10)} (UTC)`,
    participants: participants.map(clean),
    measurements: report ? measurements(report) : null,
    summary: data.summary ? clean(data.summary.text) : null,
    summaryInterim: !!data.summary && data.summaryState === "interim",
    annotations: data.annotations.map((row) => ({
      author: clean(`${row.author === "human" ? "Human" : "AI"}: ${row.authorName}`),
      anchor: row.anchor.kind === "structure" ? clean(`structure ${row.anchor.id}`)
        : row.anchor.kind === "point" ? `point (${row.anchor.ras_mm.join(", ")}) mm` : "tumor",
      text: clean(row.text),
    })),
    transcript: (data.transcript ?? []).filter((row) => row.final !== false).map((row) => ({
      at: offset(row.startedAt, data.startedAt), speaker: clean(row.speakerName), text: clean(row.text.replace(/\s+/g, " ")),
    })),
  };
}

export function renderMarkdown(doc: ReportDoc, t = exportText): string {
  return [
    `# ${REPORT_TITLE}`,
    `**${EXPORT_NOTICE}**`,
    `Case ID: ${t(doc.caseId)}  \nSession date: ${doc.date}  \nParticipants: ${doc.participants.map(t).join(", ") || "none recorded"}`,
    "## Measurements (model output)\n\n" + (doc.measurements
      ? ["Measure | Value", "--- | ---", ...doc.measurements.map(([k, v]) => `${k} | ${t(v)}`)].join("\n") + `\n\n${CERTAINTY_NOTE}`
      : "Measurements unavailable."),
    "## Session discussion\n\n" + (doc.summaryInterim ? `**${INTERIM_SUMMARY}**\n\n` : "") + (doc.summary ? t(doc.summary) : "Summary unavailable."),
    "## Annotations\n\n" + (doc.annotations.map((a) => `- **${t(a.author)}** · ${t(a.anchor)}: ${t(a.text)}`).join("\n") || "No annotations."),
    `## Transcript\n\n${TRANSCRIPT_NOTE}\n\n` + (doc.transcript.map((r) => `- ${r.at} **${t(r.speaker)}**: ${t(r.text)}`).join("\n") || "No transcript was recorded."),
    "## Next steps for learners\n\n" + NEXT_STEPS.map((s, i) => `${i + 1}. ${s}`).join("\n"),
    `---\n\n${EXPORT_NOTICE}`,
  ].join("\n\n") + "\n";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CELL = 'style="padding:4px 8px;border:1px solid #d0d7de;vertical-align:top;text-align:left"';
const H2 = 'style="font-size:16px;color:#0b3d5c;border-bottom:1px solid #d0d7de;padding-bottom:4px;margin:24px 0 8px"';
const para = (s: string) => `<p style="margin:0 0 8px">${esc(s).replace(/\n/g, "<br>")}</p>`;
const pairs = (rows: [string, string][]) =>
  `<table style="border-collapse:collapse;width:100%;font-size:14px">${rows.map(([k, v]) => `<tr><th ${CELL}>${esc(k)}</th><td ${CELL}>${esc(v)}</td></tr>`).join("")}</table>`;

/** Email body: inline styles only, since mail clients drop <style>. */
export function renderHtml(doc: ReportDoc): string {
  const section = (title: string, body: string) => `<h2 ${H2}>${esc(title)}</h2>${body}`;
  return `<!doctype html><html><body style="margin:0;background:#f6f8fa"><div style="max-width:680px;margin:0 auto;padding:24px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#1f2328;line-height:1.5">`
    + `<p style="background:#fff8e1;border:1px solid #e0b252;padding:8px 12px;font-weight:bold;margin:0 0 16px">${esc(EXPORT_NOTICE)}</p>`
    + `<h1 style="font-size:22px;margin:0 0 12px;color:#0b3d5c">${esc(REPORT_TITLE)}</h1>`
    + pairs([["Case ID", doc.caseId], ["Session date", doc.date], ["Participants", doc.participants.join(", ") || "none recorded"]])
    + section("Measurements (model output)", doc.measurements ? pairs(doc.measurements) + para(CERTAINTY_NOTE) : para("Measurements unavailable."))
    + section("Session discussion", (doc.summaryInterim ? para(INTERIM_SUMMARY) : "") + para(doc.summary ?? "Summary unavailable."))
    + section("Annotations", doc.annotations.length
      ? `<ul>${doc.annotations.map((a) => `<li><b>${esc(a.author)}</b> · ${esc(a.anchor)}: ${esc(a.text)}</li>`).join("")}</ul>` : para("No annotations."))
    + section("Transcript", para(TRANSCRIPT_NOTE) + (doc.transcript.length
      ? pairs(doc.transcript.map((r) => [`${r.at} ${r.speaker}`, r.text])) : para("No transcript was recorded.")))
    + section("Next steps for learners", `<ol>${NEXT_STEPS.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`)
    + `<p style="font-size:12px;color:#57606a;margin-top:24px">${esc(EXPORT_NOTICE)}</p></div></body></html>`;
}

/** Word document for learners' notes, returned as base64 (the attachment wire format). */
export async function renderDocx(doc: ReportDoc): Promise<string> {
  const p = (text: string) => new Paragraph({ text });
  const h2 = (text: string) => new Paragraph({ text, heading: HeadingLevel.HEADING_2 });
  const table = (rows: [string, string][]) => new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row) => new TableRow({ children: row.map((cell) => new TableCell({ children: [p(cell)] })) })),
  });
  const children = [
    new Paragraph({ children: [new TextRun({ text: EXPORT_NOTICE, bold: true })] }),
    new Paragraph({ text: REPORT_TITLE, heading: HeadingLevel.HEADING_1 }),
    table([["Case ID", doc.caseId], ["Session date", doc.date], ["Participants", doc.participants.join(", ") || "none recorded"]]),
    h2("Measurements (model output)"),
    ...(doc.measurements ? [table(doc.measurements), p(CERTAINTY_NOTE)] : [p("Measurements unavailable.")]),
    h2("Session discussion"),
    ...(doc.summaryInterim ? [p(INTERIM_SUMMARY)] : []),
    ...(doc.summary ?? "Summary unavailable.").split("\n").map(p),
    h2("Annotations"),
    ...(doc.annotations.length ? doc.annotations.map((a) => p(`${a.author} · ${a.anchor}: ${a.text}`)) : [p("No annotations.")]),
    h2("Transcript"),
    p(TRANSCRIPT_NOTE),
    ...(doc.transcript.length ? [table(doc.transcript.map((r) => [`${r.at} ${r.speaker}`, r.text]))] : [p("No transcript was recorded.")]),
    h2("Next steps for learners"),
    ...NEXT_STEPS.map((s, i) => p(`${i + 1}. ${s}`)),
    p(EXPORT_NOTICE),
  ];
  return Packer.toBase64String(new Document({ sections: [{ children }] }));
}

/** UTF-8 safe base64 (btoa alone breaks on cm³ and em dashes). */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
