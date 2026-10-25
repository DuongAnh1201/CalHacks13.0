import { describe, expect, it } from "vitest";
import { buildReportDoc, NEXT_STEPS, renderDocx, renderHtml, renderMarkdown, REPORT_TITLE, toBase64 } from "../lib/clinicalReport";
import { EXPORT_NOTICE, type ExportSnapshot } from "../lib/exportMarkdown";
import { readExportReport } from "../lib/exportReport";

const data = {
  annotations: [{ author: "human", authorName: "Sage", anchor: { kind: "structure", id: "hippocampus" }, text: "Looks malignant <script>x</script>", status: "accepted" }],
  summary: { text: "We discussed the prognosis.\nThen volumes." },
  messages: [],
  startedAt: 1_000,
  transcript: [
    { speakerName: "Tom", text: "Whole  volume is large", startedAt: 66_000, final: true },
    { speakerName: "Tom", text: "interim words", startedAt: 70_000, final: false },
  ],
} as unknown as ExportSnapshot;
const input = async (jobId = "sample") => ({ jobId, endedAt: Date.UTC(2026, 9, 24), participants: ["Host", "Tom"], report: await readExportReport(jobId), data });

describe("clinical report", () => {
  it("redacts banned words in every field", async () => {
    const doc = buildReportDoc(await input());
    expect(JSON.stringify(doc)).not.toMatch(/malignant|prognosis/i);
    expect(doc.annotations[0].text).toContain("[redacted]");
    expect(doc.summary).toContain("[redacted]");
  });
  it("keeps final transcript lines only, with offsets", async () => {
    const doc = buildReportDoc(await input());
    expect(doc.transcript).toEqual([{ at: "+01:05", speaker: "Tom", text: "Whole volume is large" }]);
  });
  it("lists model measurements from report.json", async () => {
    const doc = buildReportDoc(await input());
    expect(doc.date).toBe("2026-10-24");
    expect(doc.measurements?.map(([k]) => k)).toContain("Lesion count");
    expect(doc.measurements?.map(([k]) => k)).toContain("Whole tumor volume (cm³)");
  });
  it("says measurements are unavailable without a report", async () => {
    const doc = buildReportDoc(await input("atlas"));
    expect(doc.measurements).toBeNull();
    expect(renderMarkdown(doc)).toContain("Measurements unavailable.");
    expect(renderHtml(doc)).toContain("Measurements unavailable.");
  });
  it("puts the notice, title and next steps in markdown and html", async () => {
    const doc = buildReportDoc(await input());
    for (const out of [renderMarkdown(doc), renderHtml(doc)]) {
      expect(out).toContain(EXPORT_NOTICE);
      expect(out).toContain(REPORT_TITLE);
      expect(out).toContain("Next steps for learners");
      for (const step of NEXT_STEPS) expect(out).toContain(step);
      expect(out).not.toMatch(/malignant|prognosis/i);
    }
  });
  it("escapes html", async () => {
    expect(renderHtml(buildReportDoc(await input()))).not.toContain("<script>");
  });
  it("renders a docx (zip) as base64", async () => {
    const b64 = await renderDocx(buildReportDoc(await input()));
    expect(atob(b64).slice(0, 2)).toBe("PK");
  });
  it("base64-encodes utf-8 text", () => {
    const text = "cm³ — Tom";
    const back = new TextDecoder().decode(Uint8Array.from(atob(toBase64(text)), (c) => c.charCodeAt(0)));
    expect(back).toBe(text);
  });
});
