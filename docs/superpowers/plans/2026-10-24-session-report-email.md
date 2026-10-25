# Session Report Email Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the host ends a shared session, every participant who gave an email gets the session report: a clinical-style HTML email with `report.md` and `report.docx` attached.

**Architecture:** Guests must give an email in `sessions.join`. The host can add one from the share popover. Addresses live in a private `reportRecipients` table. `notes:finalizeSession` (already scheduled by `sessions.end`) calls a new `reportMail:send` action after the export. That action builds one `ReportDoc` from the session snapshot and `report.json`, renders it three ways, and enqueues one AgentMail send per recipient through the `@agentmail/convex` component.

**Tech Stack:** Convex (mutations, internal actions, components), `@agentmail/convex@0.1.0`, `docx`, convex-test + vitest (edge-runtime), React 19 + CSS modules + vitest `renderToStaticMarkup` in `frontend/`.

**Spec:** `docs/superpowers/specs/2026-10-24-session-report-email-design.md`

## Global Constraints

- Shared git checkout on branch `feature/live-transcript-panel`: never switch, checkout, stash, reset, rebase or push. `git add <paths>` only, never `-A`.
- Run GitNexus `detect_changes()` before every commit. Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `@agentmail/convex` pinned exactly to `0.1.0`. `docx` pinned exactly (`npm install --save-exact docx@9`).
- No public query or mutation may return a `reportRecipients` row or any email address.
- Every free-text value in the report passes through `BANNED_EXPORT_WORDS` → `[redacted]`. No renderer adds an impression, diagnosis or interpretation.
- Copy, verbatim:
  - Title: `Neuro Imaging Session Report`
  - Banner: `EXPORT_NOTICE` ("Educational visualization; not clinically validated")
  - Next steps: `Review findings with a supervising clinician.` / `Compare with the radiology report of record.`
  - Consent: `When the host ends the session, we'll email the session report, including the transcript, to {email}. Educational, not clinically validated.`
  - Bad email error: `Enter a valid email address.`
- Email rule (server and client): trimmed, ≤ 254 characters, matches `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
- Backend gate (repo root): `npm run typecheck && npx vitest run convex/tests`
- Frontend gate (`frontend/`): `npx vitest run src && npx tsc -b && npx oxlint src`

## File Map

| File | Change | Task |
|---|---|---|
| `package.json`, `package-lock.json` | add `@agentmail/convex`, `docx` | 1 |
| `convex/convex.config.ts` | `app.use(agentmail)` | 1 |
| `convex/schema.ts` | `reportRecipients` table | 1 |
| `convex/lib/email.ts` | new: `normaliseEmail` | 1 |
| `convex/sessions.ts` | `join` takes `email`, inserts recipient | 1 |
| `convex/tests/*.test.ts` (17 files) | add `email` to every `api.sessions.join` call | 1 |
| `convex/lib/exportMarkdown.ts` | export `offset` | 2 |
| `convex/lib/clinicalReport.ts` | new: `ReportDoc`, builder, 3 renderers, `toBase64` | 2 |
| `convex/tests/clinicalReport.test.ts` | new | 2 |
| `convex/exportDoc.ts` | export `snapshot` | 3 |
| `convex/reportMail.ts` | new: `setMyEmail`, `load`, `claimRecipients`, `recordSend`, `send`, `setupInbox` | 3 |
| `convex/notes.ts` | `finalizeSession` calls `reportMail:send` | 3 |
| `convex/tests/reportMail.test.ts` | new | 3 |
| `convex/_generated/*` | regenerated | 1, 3 |
| `frontend/src/share/store.ts`, `store.test.ts` | `joinShare(code, name, email)`, `setReportEmail`, `validEmail` | 4 |
| `frontend/src/routes/Join.tsx`, `Join.module.css`, `Join.test.ts` | email field + consent | 4 |
| `frontend/src/share/SharePopover.tsx`, `SharePopover.test.ts` | host "Email me the report" | 4 |

Order: 1 → 2 (can run alongside 1) → 3 (needs 1 and 2) → 4 (needs 1 and the `reportMail.setMyEmail` from 3 for types) → 5 (manual, needs the user's AgentMail key).

---

### Task 1: Dependencies, schema, and required email at join

**Files:**
- Modify: `package.json`, `convex/convex.config.ts`, `convex/schema.ts`, `convex/sessions.ts:286-335`
- Create: `convex/lib/email.ts`
- Modify (tests): every `api.sessions.join` call in `convex/tests/` (notesTranscript, sessions ×4, presence, exportMember, notesFinal, games ×3, transcript, authorization ×2, messages, screenshots, annotations, jobs, call, cursors, liveTranscript, notes)
- Test: `convex/tests/sessions.test.ts`

**Interfaces:**
- Produces: `normaliseEmail(raw: string): string` (throws `appError("INVALID_ARGUMENT", "Enter a valid email address.")`); table `reportRecipients` (indexes `by_session`, `by_participant`); `api.sessions.join` args `{ inviteCode, displayName, email }`; `components.agentmail` in `convex/_generated/api`.

- [ ] **Step 1: Install dependencies**

From the repo root:
```bash
npm install --save-exact @agentmail/convex@0.1.0
npm install --save-exact docx@9
```
Expected: both appear in `package.json` `dependencies` without `^`.

- [ ] **Step 2: Register the component**

`convex/convex.config.ts`, add the import with the other component imports and the `use` after `app.use(presence);`:
```ts
import agentmail from "@agentmail/convex/convex.config";
// ...
// Session report email (docs/superpowers/specs/2026-10-24-session-report-email-design.md).
app.use(agentmail);
```

- [ ] **Step 3: Add the table**

`convex/schema.ts`, inside `defineSchema({ ... })` next to `exports`:
```ts
  // Session report email recipients. Private: no query returns this table.
  reportRecipients: defineTable({
    sessionId: v.id("sessions"),
    participantId: v.id("sessionParticipants"),
    /** Cleared once the send is enqueued; kept on failure for follow-up. */
    email: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("queued"), v.literal("sent"), v.literal("failed")),
    outboundId: v.optional(v.string()),
    sentAt: v.optional(v.number()),
  })
    .index("by_session", ["sessionId"])
    .index("by_participant", ["participantId"]),
```

- [ ] **Step 4: Regenerate**

Run: `npx convex codegen`
Expected: `convex/_generated/api.d.ts` now has `agentmail` under `components`. If codegen demands a deployment and fails, stop and report the exact error to lead-2 as a blocker. Do not run `convex dev` or `deploy`.

- [ ] **Step 5: Write the failing tests**

Append to `convex/tests/sessions.test.ts`. It already has an `expectAppError` helper and a seeded room setup; reuse them if present, otherwise copy `expectAppError` from `convex/tests/presence.test.ts:22-31`.
```ts
describe("join email (session report)", () => {
  async function hosted() {
    const t = convexTest({ schema });
    const scanId = await t.mutation(internal.seed.seedSampleScan, {});
    const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Host" });
    return { t, host };
  }
  it("rejects a malformed email", async () => {
    const { t, host } = await hosted();
    await expectAppError(t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Tom", email: "not-an-email" }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Tom", email: `${"a".repeat(250)}@x.io` }), "INVALID_ARGUMENT");
  });
  it("rejects a join without an email", async () => {
    const { t, host } = await hosted();
    await expect(t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Tom" } as never)).rejects.toThrow();
  });
  it("stores a trimmed address as a pending recipient", async () => {
    const { t, host } = await hosted();
    const guest = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Tom", email: "  tom@example.com " });
    const rows = await t.run((ctx) => ctx.db.query("reportRecipients").collect());
    expect(rows).toMatchObject([{ participantId: guest.participantId, email: "tom@example.com", status: "pending" }]);
  });
});
```

- [ ] **Step 6: Run to see it fail**

Run: `npx vitest run convex/tests/sessions.test.ts -t "join email"`
Expected: FAIL (type or validator error: extra field `email`).

- [ ] **Step 7: Implement**

Create `convex/lib/email.ts`:
```ts
import { appError } from "./errors";

/** Report-email address: trimmed, ≤ 254 chars, one @ and a dotted domain. */
export function normaliseEmail(raw: string): string {
  const email = raw.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw appError("INVALID_ARGUMENT", "Enter a valid email address.");
  }
  return email;
}
```
In `convex/sessions.ts` `join`: add `email: v.string(),` to `args` after `displayName`. Right after `const displayName = normaliseDisplayName(args.displayName);` add `const email = normaliseEmail(args.email);` (import from `./lib/email`). After the `sessionParticipants` insert:
```ts
    // Mandatory for guests: the report goes out when the host ends the session.
    await ctx.db.insert("reportRecipients", { sessionId: session._id, participantId, email, status: "pending" });
```

- [ ] **Step 8: Fix every existing join call**

Add `email: "guest@example.com"` to the args object of every `api.sessions.join` call under `convex/tests/` (list in **Files**). `grep -rn "sessions.join" convex/tests` must show no call without `email`. `npm run typecheck` flags any you miss.

- [ ] **Step 9: Run the backend gate**

Run: `npm run typecheck && npx vitest run convex/tests`
Expected: all pass, including the 3 new tests.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json convex/convex.config.ts convex/schema.ts convex/lib/email.ts convex/sessions.ts convex/_generated convex/tests
git commit -m "feat(report-mail): require an email at join and store recipients

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Clinical report document and renderers

**Files:**
- Modify: `convex/lib/exportMarkdown.ts:27` (export `offset`)
- Create: `convex/lib/clinicalReport.ts`
- Test: `convex/tests/clinicalReport.test.ts`

**Interfaces:**
- Consumes: `ExportSnapshot`, `EXPORT_NOTICE`, `BANNED_EXPORT_WORDS`, `exportText`, `offset` from `convex/lib/exportMarkdown.ts`; `ExportReport`, `readExportReport` from `convex/lib/exportReport.ts`.
- Produces:
  - `REPORT_TITLE`, `NEXT_STEPS: string[]`, `DOCX_TYPE`
  - `interface ReportInput { jobId: string; endedAt: number; participants: string[]; report: ExportReport | null; data: ExportSnapshot }`
  - `interface ReportDoc`
  - `buildReportDoc(input: ReportInput): ReportDoc`
  - `renderMarkdown(doc): string`
  - `renderHtml(doc): string`
  - `renderDocx(doc): Promise<string>` (base64)
  - `toBase64(text: string): string`

- [ ] **Step 1: Write the failing tests**

Create `convex/tests/clinicalReport.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run convex/tests/clinicalReport.test.ts`
Expected: FAIL, "Failed to resolve import ../lib/clinicalReport".

- [ ] **Step 3: Export `offset`**

`convex/lib/exportMarkdown.ts`: change `const offset = (at: number, from?: number) => {` to `export const offset = (at: number, from?: number) => {`.

- [ ] **Step 4: Implement `convex/lib/clinicalReport.ts`**

```ts
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { BANNED_EXPORT_WORDS, EXPORT_NOTICE, exportText, offset, type ExportSnapshot } from "./exportMarkdown";
import type { ExportReport } from "./exportReport";

export const REPORT_TITLE = "Neuro Imaging Session Report";
export const NEXT_STEPS = ["Review findings with a supervising clinician.", "Compare with the radiology report of record."];
export const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const CERTAINTY_NOTE = "Outline certainty is the mean model probability within the outlined region. It is not calibrated and describes the outline, not the tissue.";
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
  for (const [key, label] of REGIONS) rows.push([`${label} outline certainty`, String(r.certainty?.[key] ?? "not available")]);
  return rows;
}

export function buildReportDoc({ jobId, endedAt, participants, report, data }: ReportInput): ReportDoc {
  return {
    caseId: clean(jobId),
    date: new Date(endedAt).toISOString().slice(0, 10),
    participants: participants.map(clean),
    measurements: report ? measurements(report) : null,
    summary: data.summary ? clean(data.summary.text) : null,
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

export function renderMarkdown(doc: ReportDoc): string {
  const t = exportText;
  return [
    `# ${REPORT_TITLE}`,
    `**${EXPORT_NOTICE}**`,
    `Case ID: ${t(doc.caseId)}  \nSession date: ${doc.date}  \nParticipants: ${doc.participants.map(t).join(", ") || "none recorded"}`,
    "## Measurements (model output)\n\n" + (doc.measurements
      ? ["Measure | Value", "--- | ---", ...doc.measurements.map(([k, v]) => `${k} | ${t(v)}`)].join("\n") + `\n\n${CERTAINTY_NOTE}`
      : "Measurements unavailable."),
    "## Session discussion\n\n" + (doc.summary ? t(doc.summary) : "Summary unavailable."),
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
    + section("Session discussion", para(doc.summary ?? "Summary unavailable."))
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
```

- [ ] **Step 5: Run to see it pass**

Run: `npx vitest run convex/tests/clinicalReport.test.ts`
Expected: 8 passed. If `docx` fails to load under the edge-runtime test environment (Node-only import), stop and report the exact error to lead-2. The fallback (a `"use node"` action file) changes Task 3's layout, so lead-2 decides.

- [ ] **Step 6: Gate and commit**

Run: `npm run typecheck && npx vitest run convex/tests`
```bash
git add convex/lib/exportMarkdown.ts convex/lib/clinicalReport.ts convex/tests/clinicalReport.test.ts
git commit -m "feat(report-mail): clinical session report document with md, html and docx renderers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Sending on session end

**Files:**
- Modify: `convex/exportDoc.ts:25` (export `snapshot`), `convex/notes.ts:451-468` (`finalizeSession`)
- Create: `convex/reportMail.ts`
- Test: `convex/tests/reportMail.test.ts`

**Interfaces:**
- Consumes: Task 1 (`reportRecipients`, `normaliseEmail`, `components.agentmail`, `sessions.join` with email); Task 2 (`buildReportDoc`, `renderHtml`, `renderMarkdown`, `renderDocx`, `toBase64`, `REPORT_TITLE`, `DOCX_TYPE`); `readExportReport`; `requireSessionMember` from `convex/lib/auth.ts` (it already throws `SESSION_ENDED` for an ended session).
- Produces:
  - `api.reportMail.setMyEmail({ sessionId, participantToken, email }): null` (Task 4 calls this)
  - `internal.reportMail.send({ sessionId }): null`
  - `internal.reportMail.setupInbox({}): unknown` (the AgentMail inbox object)

- [ ] **Step 1: Write the failing tests**

Create `convex/tests/reportMail.test.ts`:
```ts
import { AgentMail } from "@agentmail/convex";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import schema from "../schema";

const finalize = makeFunctionReference<"action">("notes:finalizeSession");

async function expectAppError(promise: Promise<unknown>, code: AppErrorCode) {
  try { await promise; } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    expect((error as ConvexError<AppErrorData>).data.code).toBe(code);
    return;
  }
  throw new Error(`expected ${code}`);
}

async function room() {
  const t = convexTest({ schema });
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Host" });
  await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Tom", email: "tom@example.com" });
  await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Sage", email: "sage@example.com" });
  const end = () => t.mutation(api.sessions.end, { sessionId: host.sessionId, participantToken: host.participantToken });
  const rows = () => t.run((ctx) => ctx.db.query("reportRecipients").collect());
  return { t, host, end, rows };
}

beforeEach(() => {
  vi.useFakeTimers(); // scheduled finalizeSession stays queued; tests call actions directly
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("AGENTMAIL_API_KEY", "test-key");
  vi.stubEnv("AGENTMAIL_INBOX_ID", "inbox-1");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.clearAllTimers(); vi.useRealTimers(); });

describe("report mail", () => {
  it("sends one report per recipient, once", async () => {
    const spy = vi.spyOn(AgentMail.prototype, "sendMessage").mockResolvedValue("out-1" as never);
    const { t, host, end, rows } = await room();
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls.map((c) => c[1])).toEqual(["inbox-1", "inbox-1"]);
    expect(spy.mock.calls.map((c) => c[2].to).sort()).toEqual(["sage@example.com", "tom@example.com"]);
    const args = spy.mock.calls[0][2];
    expect(args.subject).toBe("Neuro Imaging Session Report — sample");
    expect(args.html).toContain("Educational visualization; not clinically validated");
    expect(args.attachments?.map((a) => a.filename)).toEqual(["report.md", "report.docx"]);
    expect(await rows()).toEqual([
      expect.objectContaining({ status: "sent", outboundId: "out-1" }),
      expect.objectContaining({ status: "sent", outboundId: "out-1" }),
    ]);
    expect((await rows()).every((r) => r.email === undefined)).toBe(true);
  });

  it("runs from finalizeSession", async () => {
    const spy = vi.spyOn(AgentMail.prototype, "sendMessage").mockResolvedValue("out-1" as never);
    const { t, host, end } = await room();
    await end();
    await t.action(finalize, { sessionId: host.sessionId });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("does nothing without AgentMail env", async () => {
    vi.stubEnv("AGENTMAIL_INBOX_ID", "");
    const spy = vi.spyOn(AgentMail.prototype, "sendMessage");
    const { t, host, end, rows } = await room();
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    expect(spy).not.toHaveBeenCalled();
    expect((await rows()).map((r) => r.status)).toEqual(["pending", "pending"]);
  });

  it("keeps sending when one recipient fails", async () => {
    vi.spyOn(AgentMail.prototype, "sendMessage").mockImplementation(async (_ctx, _inbox, args) => {
      if (args.to === "tom@example.com") throw new Error("boom");
      return "out-2" as never;
    });
    const { t, host, end, rows } = await room();
    await end();
    await t.action(internal.reportMail.send, { sessionId: host.sessionId });
    const byEmail = await rows();
    expect(byEmail.find((r) => r.status === "failed")?.email).toBe("tom@example.com");
    expect(byEmail.filter((r) => r.status === "sent")).toHaveLength(1);
  });

  it("lets the host add an email, upserting one row", async () => {
    const { t, host, rows } = await room();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken };
    await t.mutation(api.reportMail.setMyEmail, { ...auth, email: "first@example.com" });
    await t.mutation(api.reportMail.setMyEmail, { ...auth, email: "host@example.com" });
    const mine = (await rows()).filter((r) => r.participantId === host.participantId);
    expect(mine).toMatchObject([{ email: "host@example.com", status: "pending" }]);
    await expectAppError(t.mutation(api.reportMail.setMyEmail, { ...auth, email: "nope" }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.reportMail.setMyEmail, { ...auth, participantToken: "bad" }), "NOT_AUTHENTICATED");
  });

  it("refuses a host email after the session ended", async () => {
    const { t, host, end } = await room();
    await end();
    await expectAppError(t.mutation(api.reportMail.setMyEmail, {
      sessionId: host.sessionId, participantToken: host.participantToken, email: "host@example.com",
    }), "SESSION_ENDED");
  });

  it("never exposes addresses through public queries", async () => {
    const { t, host } = await room();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken };
    const view = await t.query(api.sessions.get, auth);
    const roster = await t.query(api.sessionParticipants.list, auth);
    expect(JSON.stringify([view, roster])).not.toContain("@example.com");
  });
});
```
If `api.sessionParticipants.list` takes different args, match its validator (see `convex/tests/sessions.test.ts:602`).

- [ ] **Step 2: Run to see it fail**

Run: `npx vitest run convex/tests/reportMail.test.ts`
Expected: FAIL (`internal.reportMail` does not exist).

- [ ] **Step 3: Export `snapshot`**

`convex/exportDoc.ts`: change `async function snapshot(` to `export async function snapshot(`.

- [ ] **Step 4: Implement `convex/reportMail.ts`**

```ts
import { AgentMail } from "@agentmail/convex";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { env, internalAction, internalMutation, internalQuery, mutation } from "./_generated/server";
import { snapshot } from "./exportDoc";
import { requireSessionMember } from "./lib/auth";
import { buildReportDoc, DOCX_TYPE, renderDocx, renderHtml, renderMarkdown, REPORT_TITLE, toBase64 } from "./lib/clinicalReport";
import { normaliseEmail } from "./lib/email";
import type { ExportSnapshot } from "./lib/exportMarkdown";
import { readExportReport } from "./lib/exportReport";

const mail = env as typeof env & { AGENTMAIL_API_KEY?: string; AGENTMAIL_INBOX_ID?: string };
const agentmail = new AgentMail(components.agentmail);

/** Any member (in practice the host, who skips the join form) sets where their report goes. */
export const setMyEmail = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), email: v.string() },
  handler: async (ctx, args): Promise<null> => {
    const { participant } = await requireSessionMember(ctx, args); // SESSION_ENDED once ended: the send already ran
    const email = normaliseEmail(args.email);
    const row = await ctx.db.query("reportRecipients").withIndex("by_participant", (q) => q.eq("participantId", participant._id)).unique();
    if (row) await ctx.db.patch(row._id, { email, status: "pending" });
    else await ctx.db.insert("reportRecipients", { sessionId: args.sessionId, participantId: participant._id, email, status: "pending" });
    return null;
  },
});

type Loaded = { jobId: string; endedAt: number; participants: string[]; data: ExportSnapshot };

export const load = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }): Promise<Loaded | null> => {
    const session = await ctx.db.get(sessionId);
    const scan = session ? await ctx.db.get(session.scanId) : null;
    if (!session || !scan) return null;
    const people = await ctx.db.query("sessionParticipants").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
    const data = await snapshot(ctx, scan.jobId, ["annotations", "summary", "transcript"], sessionId, true);
    return { jobId: scan.jobId, endedAt: session.updatedAt, participants: people.map((p) => p.displayName), data };
  },
});

/** Pending → queued in one transaction, so a second run claims nobody. */
export const claimRecipients = internalMutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }): Promise<{ id: Id<"reportRecipients">; email: string }[]> => {
    const rows = await ctx.db.query("reportRecipients").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
    const claimed = rows.filter((r) => r.status === "pending" && r.email);
    for (const r of claimed) await ctx.db.patch(r._id, { status: "queued" });
    return claimed.map((r) => ({ id: r._id, email: r.email! }));
  },
});

/** With an outboundId: sent, address dropped. Without: failed, address kept for follow-up. */
export const recordSend = internalMutation({
  args: { id: v.id("reportRecipients"), outboundId: v.optional(v.string()) },
  handler: async (ctx, { id, outboundId }): Promise<null> => {
    await ctx.db.patch(id, outboundId ? { status: "sent", outboundId, sentAt: Date.now(), email: undefined } : { status: "failed" });
    return null;
  },
});

/** Called by notes:finalizeSession after the export. Skips silently when AgentMail is not configured. */
export const send = internalAction({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, { sessionId }): Promise<null> => {
    const inboxId = mail.AGENTMAIL_INBOX_ID;
    if (!mail.AGENTMAIL_API_KEY || !inboxId) {
      console.log("reportMail: AGENTMAIL_API_KEY or AGENTMAIL_INBOX_ID unset, no report email sent");
      return null;
    }
    const loaded = await ctx.runQuery(internal.reportMail.load, { sessionId });
    if (!loaded) return null;
    // Render before claiming, so a render failure leaves recipients pending.
    const doc = buildReportDoc({ ...loaded, report: await readExportReport(loaded.jobId).catch(() => null) });
    const md = renderMarkdown(doc);
    const message = {
      subject: `${REPORT_TITLE} — ${loaded.jobId}`,
      html: renderHtml(doc),
      text: md,
      attachments: [
        { filename: "report.md", content: toBase64(md), contentType: "text/markdown" },
        { filename: "report.docx", content: await renderDocx(doc), contentType: DOCX_TYPE },
      ],
    };
    const recipients = await ctx.runMutation(internal.reportMail.claimRecipients, { sessionId });
    for (const r of recipients) {
      try {
        const outboundId = await agentmail.sendMessage(ctx, inboxId, { ...message, to: r.email });
        await ctx.runMutation(internal.reportMail.recordSend, { id: r.id, outboundId });
      } catch {
        await ctx.runMutation(internal.reportMail.recordSend, { id: r.id });
      }
    }
    return null;
  },
});

/** One-time: `npx convex run reportMail:setupInbox`, then set AGENTMAIL_INBOX_ID to the returned inbox id. */
export const setupInbox = internalAction({
  args: {},
  handler: async (ctx): Promise<unknown> => agentmail.createInbox(ctx, { displayName: "Neuro Imaging Reports" }),
});
```

- [ ] **Step 5: Hook into `finalizeSession`**

`convex/notes.ts`, next to `buildExportRef`:
```ts
const sendReportRef = makeFunctionReference<"action", { sessionId: Id<"sessions"> }, null>("reportMail:send");
```
In `finalizeSession`, after `if (exportId) await ctx.runAction(buildExportRef, { exportId }).catch(() => null);`:
```ts
    // Email the report to everyone who gave an address; never fails finalize.
    await ctx.runAction(sendReportRef, { sessionId }).catch(() => null);
```
Update the doc comment above `finalizeSession` with one line: "Then emails the session report (reportMail:send)."

- [ ] **Step 6: Regenerate, run, gate**

Run: `npx convex codegen && npx vitest run convex/tests/reportMail.test.ts`
Expected: 7 passed.
Run: `npm run typecheck && npx vitest run convex/tests`
Expected: all pass (`notesFinal` tests still pass: AgentMail env is unset there, so `send` returns early).

- [ ] **Step 7: Commit**

```bash
git add convex/exportDoc.ts convex/reportMail.ts convex/notes.ts convex/tests/reportMail.test.ts convex/_generated
git commit -m "feat(report-mail): email the session report when the host ends the session

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Frontend: email at join, host email in the share popover

**Files:**
- Modify: `frontend/src/share/store.ts:73-80`, `frontend/src/share/store.test.ts`
- Modify: `frontend/src/routes/Join.tsx`, `frontend/src/routes/Join.module.css`, `frontend/src/routes/Join.test.ts`
- Modify: `frontend/src/share/SharePopover.tsx`
- Create: `frontend/src/share/SharePopover.test.ts`

**Interfaces:**
- Consumes: `api.sessions.join({ inviteCode, displayName, email })` (Task 1), `api.reportMail.setMyEmail({ sessionId, participantToken, email })` (Task 3).
- Produces: `validEmail(s: string): boolean`, `joinShare(code, name, email): Promise<string | null>`, `setReportEmail(email): Promise<string | null>`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/share/store.test.ts`: change every `joinShare('ABC123', 'Ana')` / `joinShare('NOPE', 'Ana')` to pass a third argument `'ana@example.com'`, and add `setReportEmail` and `validEmail` to the import from `./store`. Then add:
```ts
  it('joinShare sends the email to sessions.join', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    await joinShare('ABC123', 'Ana', 'ana@example.com');
    expect(f.calls).toContainEqual(['sessions:join', { inviteCode: 'ABC123', displayName: 'Ana', email: 'ana@example.com' }]);
  });
  it('setReportEmail saves the address for this participant', async () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    await startShare('job-7');
    expect(await setReportEmail('host@example.com')).toBeNull();
    expect(f.calls).toContainEqual(['reportMail:setMyEmail', { sessionId: 's1', participantToken: 'host-t', email: 'host@example.com' }]);
  });
  it('validEmail matches the server rule', () => {
    expect(validEmail(' a@b.co ')).toBe(true);
    expect(validEmail('a@b')).toBe(false);
    expect(validEmail(`${'a'.repeat(250)}@x.io`)).toBe(false);
  });
```
If `fakeClient` exposes calls under a different name than `f.calls`, use the name the existing tests use.

`frontend/src/routes/Join.test.ts`, add inside `describe('Join', ...)`:
```ts
  it('requires an email and explains the report', () => {
    const h = html();
    expect(h).toMatch(/<input[^>]*type="email"[^>]*required/i);
    expect(h).toMatch(/<input[^>]*type="email"[^>]*maxLength="254"/i);
    expect(h).toContain('email the session report, including the transcript');
    expect(h).toContain('Educational, not clinically validated.');
  });
```
If attribute order in the output differs, match each attribute with its own regex on the email input.

Create `frontend/src/share/SharePopover.test.ts`:
```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SharePopover } from './SharePopover';

describe('SharePopover', () => {
  it('offers the host an email field for the report', () => {
    const h = renderToStaticMarkup(createElement(SharePopover, { session: { participants: [] } as never, inviteCode: 'ABC123' }));
    expect(h).toContain('Email me the report');
    expect(h).toMatch(/<input[^>]*type="email"/i);
  });
});
```

- [ ] **Step 2: Run to see it fail**

Run (from `frontend/`): `npx vitest run src/share src/routes/Join.test.ts`
Expected: FAIL (`setReportEmail` / `validEmail` not exported, no email input).

- [ ] **Step 3: Implement the store**

`frontend/src/share/store.ts`:
```ts
/** Same rule as convex/lib/email.ts. */
export const validEmail = (s: string) => s.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export async function joinShare(code: string, name: string, email: string): Promise<string | null> {
  if (!client) return NOT_CONFIGURED;
  try {
    const r = (await client.mutation(api.sessions.join, { inviteCode: code, displayName: name, email })) as { sessionId: string; participantToken: string; jobId: string };
    begin({ sessionId: r.sessionId, participantToken: r.participantToken, role: 'viewer', inviteCode: code, jobId: r.jobId });
    return null;
  } catch (e) { return messageFor(e); }
}

/** Where this participant's session report goes (the host has no join form). */
export async function setReportEmail(email: string): Promise<string | null> {
  const s = useShare.getState().stored;
  if (!client || !s) return NOT_CONFIGURED;
  try { await client.mutation(api.reportMail.setMyEmail, { ...auth(s), email }); return null; } catch (e) { return messageFor(e); }
}
```

- [ ] **Step 4: Implement the Join form**

`frontend/src/routes/Join.tsx`: import `validEmail` from `../share/store`. Add `const [email, setEmail] = useState('');`. Call `joinShare(code, name, email.trim())`. Under the name `<label>`:
```tsx
          <label className={css.label}>Email for the session report
            <input className={css.input} type="email" value={email} maxLength={254} required autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
          </label>
          <p className={css.consent}>When the host ends the session, we'll email the session report, including the transcript, to {email.trim() || 'this address'}. Educational, not clinically validated.</p>
```
Button: `disabled={!ready || busy || !name.trim() || !validEmail(email)}`.
`frontend/src/routes/Join.module.css`, add:
```css
.consent { margin: 0; font-size: 13px; line-height: 1.4; opacity: 0.75; }
```

- [ ] **Step 5: Implement the host field**

`frontend/src/share/SharePopover.tsx`: import `setReportEmail, validEmail` from `./store`. Add state:
```tsx
  const [email, setEmail] = useState('');
  const [mailNote, setMailNote] = useState<string | null>(null);
  const saveEmail = async () => setMailNote((await setReportEmail(email.trim())) ?? `The report will be emailed to ${email.trim()} when the session ends.`);
```
Above `<h3 className={css.h}>In this session</h3>`:
```tsx
      <label className={css.label}>Email me the report
        <input className={css.link} type="email" value={email} maxLength={254} autoComplete="email" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <button type="button" className={css.btn} disabled={!validEmail(email)} onClick={() => void saveEmail()}>Save</button>
      {mailNote && <p className={css.note} role="status">{mailNote}</p>}
```

- [ ] **Step 6: Gate**

Run (from `frontend/`): `npx vitest run src && npx tsc -b && npx oxlint src`
Expected: all pass. Optional browser check (`npm run dev`, open `/join/<code>` from a live share link and the QR code): the email field shows, Join stays disabled until both fields are valid, and the consent line shows the typed address.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/share/store.ts frontend/src/share/store.test.ts frontend/src/routes/Join.tsx frontend/src/routes/Join.module.css frontend/src/routes/Join.test.ts frontend/src/share/SharePopover.tsx frontend/src/share/SharePopover.test.ts
git commit -m "feat(report-mail): ask for an email at join and let the host add one

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Live send check (manual, needs the user)

This sends real email and sets deployment env, so the user runs it or explicitly approves it. It answers the two open risks in the spec: attachment encoding and `docx` bundling in Convex.

- [ ] **Step 1:** User sets the key: `npx convex env set AGENTMAIL_API_KEY <key>`.
- [ ] **Step 2:** `npx convex dev --once`. Expected: push succeeds. If bundling fails on `docx`, move `renderDocx` into a new `convex/reportDocx.ts` with `"use node";` exposing an `internalAction` that returns the base64, and call it from `send` via `ctx.runAction`.
- [ ] **Step 3:** `npx convex run reportMail:setupInbox`, then `npx convex env set AGENTMAIL_INBOX_ID <inbox id from output>`.
- [ ] **Step 4:** Start a share on `/jobs/sample/mri`, join from a second browser with an inbox you own (once by link, once by QR code), say a few lines with AI notes on, then End session.
- [ ] **Step 5:** In the received email, check:
  - The HTML body shows the banner, measurements, discussion, transcript and next steps.
  - `report.md` opens as readable text.
  - `report.docx` opens in Word or Google Docs.

  If either attachment arrives as base64 text instead of a file, AgentMail wants raw content. Change `content: toBase64(md)` to `content: md`, and report the docx behaviour.
- [ ] **Step 6:** In the Convex dashboard, the `reportRecipients` rows are `sent`, with no `email`.
