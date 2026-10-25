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
      text: renderMarkdown(doc, (s) => s),
      attachments: [
        { filename: "report.md", content: toBase64(md), contentType: "text/markdown" },
        { filename: "report.docx", content: await renderDocx(doc), contentType: DOCX_TYPE },
      ],
    };
    const recipients = await ctx.runMutation(internal.reportMail.claimRecipients, { sessionId });
    for (const r of recipients) {
      try {
        // @agentmail/convex 0.1.0 types ctx as a mutation ctx; an action's runMutation is what it calls.
        const outboundId = await agentmail.sendMessage(ctx as unknown as Parameters<typeof agentmail.sendMessage>[0], inboxId, { ...message, to: r.email });
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
