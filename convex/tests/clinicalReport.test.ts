import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildReportDoc, NEXT_STEPS, renderDocx, renderHtml, renderMarkdown, REPORT_TITLE, toBase64 } from "../lib/clinicalReport";
import { EXPORT_NOTICE, type ExportSnapshot } from "../lib/exportMarkdown";
import { readExportReport } from "../lib/exportReport";

const data = {
  annotations: [{ author: "human", authorName: "Sage", anchor: { kind: "structure", id: "hippocampus" }, text: "Looks malignant <script>x</script>", status: "accepted" }],
  summary: { text: "We discussed the prognosis.\nThen volumes." },
  messages: [
    { author: "agent", authorName: "Scribe", text: "AI context prognosis", createdAt: 4_000, toolSteps: [{ args: { token: "secret-tool" } }] },
    { author: "human", authorName: "Tom", text: "Room chat malignant <script>chat</script>", createdAt: 2_000 },
  ],
  screenshots: [
    { caption: "Whole view malignant", takenAt: 5_000, url: "https://images.example.com/shot.png" },
    { caption: "Insecure image", takenAt: 6_000, url: "http://images.example.com/insecure.png" },
    { caption: "Unsafe image", takenAt: 7_000, url: "javascript:alert(1)" },
  ],
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
    expect(doc.date).toBe("2026-10-24 (UTC)");
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
    const zip = await JSZip.loadAsync(b64, { base64: true });
    expect(await zip.file("word/document.xml")!.async("string")).toContain(EXPORT_NOTICE);
  });
  it("labels the UTC date when a local evening falls on the next UTC day", async () => {
    const doc = buildReportDoc({ ...await input(), endedAt: Date.parse("2026-10-24T23:43:00-07:00") });
    expect(doc.date).toBe("2026-10-25 (UTC)");
    for (const out of [renderMarkdown(doc), renderHtml(doc)]) expect(out).toContain("2026-10-25 (UTC)");
    const zip = await JSZip.loadAsync(await renderDocx(doc), { base64: true });
    expect(await zip.file("word/document.xml")!.async("string")).toContain("2026-10-25 (UTC)");
  });
  it("labels an interim summary in every format while preserving its text", async () => {
    const doc = buildReportDoc({ ...await input(), data: { ...data, summaryState: "interim" } });
    const label = "Interim summary (the final summary could not be written)";
    for (const out of [renderMarkdown(doc), renderHtml(doc)]) {
      expect(out).toContain(label);
      expect(out).toContain("Then volumes.");
    }
    const zip = await JSZip.loadAsync(await renderDocx(doc), { base64: true });
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain(label);
    expect(xml).toContain("Then volumes.");
  });
  it("keeps final summaries unlabelled and missing summaries unavailable", async () => {
    const final = buildReportDoc({ ...await input(), data: { ...data, summaryState: "final" } });
    const missing = buildReportDoc({ ...await input(), data: { ...data, summary: null, summaryState: "interim" } });
    for (const render of [renderMarkdown, renderHtml]) {
      expect(render(final)).not.toContain("Interim summary");
      expect(render(missing)).not.toContain("Interim summary");
      expect(render(missing)).toContain("Summary unavailable.");
    }
  });
  it("includes only present certainty values, including zero", async () => {
    const source = await input();
    const doc = buildReportDoc({ ...source, report: { ...source.report!, certainty: { whole: 0, core: null, enhancing: null } } });
    expect(doc.measurements?.filter(([label]) => label.endsWith("outline certainty"))).toEqual([["Whole tumor outline certainty", "0"]]);
    const without = buildReportDoc({ ...source, report: { ...source.report!, certainty: null } });
    expect(without.measurements?.filter(([label]) => label.endsWith("outline certainty"))).toEqual([]);
  });
  it("includes chronological chat, screenshot links and annotation status in every format", async () => {
    const doc = buildReportDoc(await input());
    const zip = await JSZip.loadAsync(await renderDocx(doc), { base64: true });
    const xml = await zip.file("word/document.xml")!.async("string");
    const rels = await zip.file("word/_rels/document.xml.rels")!.async("string");
    for (const out of [renderMarkdown(doc), renderHtml(doc), xml]) {
      for (const text of ["Chat", "Screenshots", "Human: Tom", "AI: Scribe", "Room chat", "AI context", "Whole view", "Insecure image", "Unsafe image", "+00:01", "+00:03", "+00:04", "accepted"]) expect(out).toContain(text);
      expect(out.indexOf("Room chat")).toBeLessThan(out.indexOf("AI context"));
      expect(out.indexOf("Annotations")).toBeLessThan(out.indexOf("Chat"));
      expect(out.indexOf("Chat")).toBeLessThan(out.indexOf("Screenshots"));
      expect(out.indexOf("Screenshots")).toBeLessThan(out.indexOf("Transcript"));
      expect(out).not.toMatch(/malignant|prognosis|secret-tool|<script>/i);
      expect(out).not.toContain("http://images.example.com/insecure.png");
      expect(out).not.toContain("javascript:alert");
    }
    expect(renderMarkdown(doc)).toContain("[View screenshot](https://images.example.com/shot.png)");
    expect(renderHtml(doc)).toContain('href="https://images.example.com/shot.png"');
    expect(rels).toContain("https://images.example.com/shot.png");
    expect(rels).not.toContain("http://images.example.com/insecure.png");
    expect(rels).not.toContain("javascript:");
  });
  it("base64-encodes utf-8 text", () => {
    const text = "cm³ — Tom";
    const back = new TextDecoder().decode(Uint8Array.from(atob(toBase64(text)), (c) => c.charCodeAt(0)));
    expect(back).toBe(text);
  });
});

describe("whiteboard report", () => {
  it("includes replies, resolved flag, stickies, text and a sketch count", async () => {
    const base = await input();
    const annotation = { ...base.data.annotations[0], _id: "a1" as any, resolvedAt: 1 };
    const doc = buildReportDoc({
      ...base,
      data: { ...base.data, annotations: [annotation] },
      replies: [{ annotationId: "a1", author: "human", authorName: "Judge", text: "Agree, diagnosis pending", createdAt: 2 } as any],
      board: [
        { authorName: "Judge", item: { kind: "sticky", text: "Check T2", color: "pink", anchor: { kind: "tumor" } }, createdAt: 3 } as any,
        { authorName: "Host", item: { kind: "text", text: "Rim", anchor: { kind: "tumor" } }, createdAt: 4 } as any,
        { authorName: "Host", item: { kind: "stroke" }, createdAt: 5 } as any,
      ],
    });
    expect(doc.annotations[0]).toMatchObject({ resolved: true, replies: [{ author: "Human: Judge", text: "Agree, [redacted] pending" }] });
    expect(doc.board).toEqual([
      { author: "Judge", kind: "Sticky", color: "pink", text: "Check T2" },
      { author: "Host", kind: "Text", color: null, text: "Rim" },
    ]);
    expect(doc.sketches).toBe(1);
    const zip = await JSZip.loadAsync(await renderDocx(doc), { base64: true });
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const out of [renderMarkdown(doc), renderHtml(doc), xml]) {
      expect(out).toContain(out === xml || out.startsWith("<!doctype") ? "Sticky notes &amp; text" : "Sticky notes & text");
      expect(out).toContain("Check T2");
      expect(out).toContain("1 sketch was drawn on the board.");
      expect(out).toContain("resolved");
    }
  });

});

describe("whiteboard report safety", () => {
  it("redacts and escapes board and reply text in all formats, with chronological board items", async () => {
    const base = await input();
    const doc = buildReportDoc({
      ...base,
      data: { ...base.data, annotations: [{ ...base.data.annotations[0], _id: "a1" as any }] },
      replies: [
        { annotationId: "other", author: "human", authorName: "Other", text: "Hidden reply", createdAt: 0 } as any,
        { annotationId: "a1", author: "human", authorName: "diagnosis <script>reply</script>", text: "malignant <script>reply-text</script>", createdAt: 2 } as any,
      ],
      board: [
        { authorName: "prognosis <script>board</script>", item: { kind: "sticky", color: "yellow", text: "Second diagnosis <script>sticky</script>" }, createdAt: 3 } as any,
        { authorName: "Host", item: { kind: "text", text: "First label" }, createdAt: 1 } as any,
        { item: { kind: "stroke" } } as any,
        { item: { kind: "stroke" } } as any,
      ],
    });
    expect(doc.board.map((row) => row.text)).toEqual(["First label", "Second [redacted] <script>sticky</script>"]);
    expect(doc.annotations[0].replies).toHaveLength(1);
    expect(JSON.stringify(doc)).not.toMatch(/diagnosis|malignant|prognosis|Hidden reply/);
    const zip = await JSZip.loadAsync(await renderDocx(doc), { base64: true });
    const xml = await zip.file("word/document.xml")!.async("string");
    for (const out of [renderMarkdown(doc), renderHtml(doc), xml]) {
      expect(out).toContain("2 sketches were drawn on the board.");
      expect(out).toContain("reply-text");
      expect(out).toContain("&lt;script&gt;");
      expect(out).not.toMatch(/diagnosis|malignant|prognosis|<script>|Hidden reply/);
      expect(out.indexOf("First label")).toBeLessThan(out.indexOf("Second"));
    }
  });
});
