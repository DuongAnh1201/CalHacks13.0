# Session Report Email — Design

Date: 2026-10-24. Status: approved in brainstorming (sections 1–3).

## Goal

When the host ends a shared session, every participant automatically receives
the full session report by email in a clinical, educational format: an HTML
email body plus `report.md` and `report.docx` attachments (the audience is
medical students). Guests must give an email address to join.

## Non-goals

- Changing the in-app export (`convex/exportDoc.ts`, `buildMarkdown`, MCP export
  tools). Moving those onto the new `ReportDoc` is a later PR.
- Inbound mail, webhooks, resend buttons, delivery-status UI.
- Any clinical impression, diagnosis or interpretation. The report shows model
  output and session content only.

## Dependencies

- `@agentmail/convex` pinned to exactly `0.1.0` (pulls `svix`, `@convex-dev/workpool`).
- `docx` (Word document renderer).
- Convex env: `AGENTMAIL_API_KEY`, `AGENTMAIL_INBOX_ID`. Missing either → no email is sent, nothing else changes.

Register the component in `convex/convex.config.ts`:

```ts
import agentmail from "@agentmail/convex/convex.config";
app.use(agentmail);
```

Client: `new AgentMail(components.agentmail)`. Send API (from the package types):
`sendMessage(ctx: RunMutationCtx, inboxId: string, { to, subject, text?, html?, attachments?: { filename, content: string, contentType? }[] }): Promise<OutboundId>`.

## 1. Collecting emails

Join link and QR code both open `/join/:code` (`SharePopover.tsx:11,18` → `App.tsx` → `Join.tsx`), so one form covers both.

**Guests (mandatory).**
- `sessions.join` gains a required arg `email: v.string()`. Server validates: trimmed, ≤ 254 characters, matches `^[^\s@]+@[^\s@]+\.[^\s@]+$`. Failure throws `appError("INVALID_ARGUMENT", "Enter a valid email address.")`.
- On success, `join` inserts a `reportRecipients` row (`status: "pending"`).
- `Join.tsx` adds a required `type="email"` field under the name field. The Join button stays disabled until name and email are both valid. Consent line under the field:
  > When the host ends the session, we'll email the session report, including the transcript, to {email}. Educational, not clinically validated.
- `frontend/src/share/store.ts` `joinShare(code, name, email)` passes `email`.
- The existing reload redirect (stored viewer token) stays. The email was already saved at join.

**Host (optional).** The host never fills in a form (`startShare` calls `sessions.create` directly), so `sessions.create` is unchanged.
- `SharePopover` gets an "Email me the report" field plus a Save button.
- New mutation `reportMail.setMyEmail({ sessionId, participantToken, email })` authenticates the participant, applies the same validation, and upserts that participant's `reportRecipients` row. It throws `SESSION_ENDED` once the session has ended, because the send has already run.

**Storage.**

```ts
reportRecipients: defineTable({
  sessionId: v.id("sessions"),
  participantId: v.id("sessionParticipants"),
  email: v.optional(v.string()),            // cleared after a successful enqueue
  status: v.union(v.literal("pending"), v.literal("queued"), v.literal("sent"), v.literal("failed")),
  outboundId: v.optional(v.string()),
  sentAt: v.optional(v.number()),
}).index("by_session", ["sessionId"]).index("by_participant", ["participantId"]),
```

No public query returns this table. Addresses never reach the roster or any other client.

## 2. Report content (`ReportDoc`)

New file `convex/lib/clinicalReport.ts`. `buildReportDoc(input)` returns a plain `ReportDoc`, and three pure renderers take it: `renderHtml`, `renderMarkdown`, `renderDocx` (returns bytes).

Sections, in order:

1. **Header.** "Neuro Imaging Session Report", case ID (`jobId`), session date, participant display names, and the banner `EXPORT_NOTICE` ("Educational visualization; not clinically validated").
2. **Measurements (model output).** From `readExportReport(jobId)`: model name and version, segmentation source, tumor detected, side, lesion count, volumes in cm³ (whole, core, enhancing), and certainty when present. Values exact, no rounding beyond what the report holds. `null` report (atlas, learn) → "Measurements unavailable."
3. **Session discussion.** The final Scribe summary, or "Summary unavailable."
4. **Annotations.** Author and structure (and text) for each.
5. **Transcript.** Speaker, offset from session start (mm:ss), text.
6. **Next steps for learners.** Fixed text: "Review findings with a supervising clinician. Compare with the radiology report of record."

Every free-text value passes through the existing `exportText()` escaping and the `BANNED_EXPORT_WORDS` filter (→ `[redacted]`). The renderers never add an impression or diagnosis.

Email: subject `Neuro Imaging Session Report — {jobId}`. `html` comes from `renderHtml` and `text` from `renderMarkdown`. Attachments are `report.md` (`text/markdown`) and `report.docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`).

## 3. Sending flow

1. `sessions.end` → `notes:finalizeSession` (existing, `convex/notes.ts`). After the export step, `finalizeSession` runs `internal.reportMail.send({ sessionId })`, wrapped in `.catch(() => null)` like the export, so an email failure never breaks finalize.
2. `reportMail.send` (internalAction, `convex/reportMail.ts`):
   - If `AGENTMAIL_API_KEY` or `AGENTMAIL_INBOX_ID` is missing, log one line and return.
   - `claimRecipients` (internalMutation) returns all `pending` rows that still have an email and flips them to `queued` in the same transaction. A second run claims nothing, so each recipient gets at most one email.
   - Load the session data (participants, transcript, final summary, annotations) with an internal query, then call `readExportReport(jobId)` (failure → treat as `null`).
   - Build the `ReportDoc` and render it once.
   - For each claimed recipient, call `agentmail.sendMessage(ctx, inboxId, {...})`, then `recordSend` (internalMutation): `status: "sent"`, `outboundId`, `sentAt`, and clear `email`. If one recipient throws, `recordFailure` sets `status: "failed"` (email kept, for manual follow-up) and the loop continues.
3. Delivery retries belong to the component's workpool. No retry loop of our own.
4. One-time setup: `reportMail:setupInbox` (internalAction) calls `agentmail.createInbox(ctx, { displayName: "Neuro Imaging Reports" })` and returns the inbox id. The operator runs `npx convex run reportMail:setupInbox` once and sets `AGENTMAIL_INBOX_ID`.

## Open risks

- **Attachment encoding.** Whether `content` must be base64 or raw text is unknown. The first backend task is one real send to an owned inbox that checks both attachments open. The renderers' output format follows that result.
- **`docx` in the Convex default runtime.** Bundling is unverified. If it fails, put the renderer call in a `"use node"` action file. No `"use node"` actions exist in `convex/` today.
- **Address retention.** Clearing `reportRecipients.email` does not purge the AgentMail component's own outbound records, which likely keep `to`.

## Testing

- **convex-test** (register the component the way `convex/tests/presence.test.ts:39` registers presence, via the package's `test` export):
  - `join` without an email, or with a bad one, throws `INVALID_ARGUMENT`. A valid one creates a `pending` row.
  - `setMyEmail` upserts and rejects a bad token.
  - No public query result contains a recipient email.
  - `send` run twice → one `sendMessage` per recipient.
  - Missing env → zero sends, rows stay `pending`.
  - One recipient failing → the others are still `sent`, and the failed row is `failed`.
- **Renderer unit tests** (`clinicalReport`): notice present in all three outputs, banned words → `[redacted]`, Next steps present, null report → "Measurements unavailable", docx bytes start with `PK`.
- **Frontend:** `Join.test.ts` (email required, button disabled, consent line shows the address), `store.test.ts` (`joinShare` passes email to `sessions.join`), SharePopover owner email field.
