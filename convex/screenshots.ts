import { v } from 'convex/values';
import { internalMutation, internalQuery, mutation, action, query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { requireSessionMember } from './lib/auth';
import { appError } from './lib/errors';
import { imageDimensions } from './lib/screenshotImage';
import { SCREENSHOT_INTERVAL_MS, SCREENSHOT_MAX_BYTES, SCREENSHOT_MEETING_CAP, screenshotReason, screenshotRequest } from './lib/screenshotPolicy';

const scope = { sessionId: v.id('sessions'), participantToken: v.string(), jobId: v.string() };
async function member(ctx: QueryCtx, args: { sessionId: Id<'sessions'>; participantToken: string; jobId: string }) {
  const result = await requireSessionMember(ctx, args);
  const scan = await ctx.db.get(result.session.scanId);
  if (!scan || scan.jobId !== args.jobId) throw appError('NOT_A_MEMBER', 'Not authorized for this case.');
  return result;
}
async function presenter(ctx: QueryCtx, args: { sessionId: Id<'sessions'>; participantToken: string; jobId: string }) {
  const result = await member(ctx, args);
  if (result.participant.role !== 'host' || result.session.hostParticipantId !== result.participant._id) throw appError('NOT_PRESENTER', 'Only the presenter may capture screenshots.');
}
async function budget(ctx: QueryCtx, sessionId: Id<'sessions'>) {
  const rows = await ctx.db.query('screenshots').withIndex('by_session', q => q.eq('sessionId', sessionId)).order('desc').take(SCREENSHOT_MEETING_CAP);
  if (rows.length >= SCREENSHOT_MEETING_CAP) throw appError('INVALID_ARGUMENT', 'Meeting screenshot limit reached (20).');
  if (rows[0] && Date.now() - rows[0].takenAt < SCREENSHOT_INTERVAL_MS) throw appError('INVALID_ARGUMENT', 'Screenshots must be at least 30 seconds apart.');
}
export const authorize = internalQuery({
  args: scope,
  handler: async (ctx, args) => { await presenter(ctx, args); },
});
export const generateUploadUrl = mutation({
  args: scope,
  handler: async (ctx, args) => {
    await presenter(ctx, args); await budget(ctx, args.sessionId);
    return ctx.storage.generateUploadUrl();
  },
});
const recordFields = {
  ...scope, storageId: v.id('_storage'), caption: v.string(), reason: v.string(), width: v.number(), height: v.number(),
  clientId: v.optional(v.string()), runId: v.optional(v.id('agentRuns')),
};
/** Existing files referenced by app records cannot be claimed/deleted as new uploads. */
export const referenced = internalQuery({
  args: { storageId: v.id('_storage') },
  handler: async (ctx, { storageId }) => Boolean(
    await ctx.db.query('screenshots').withIndex('by_storage', q => q.eq('storageId', storageId)).first() ||
    await ctx.db.query('exports').filter(q => q.eq(q.field('fileId'), storageId)).first()),
});
export const commit = internalMutation({
  args: recordFields,
  handler: async (ctx, args) => {
    await presenter(ctx, args); await budget(ctx, args.sessionId);
    if (await ctx.db.query('screenshots').withIndex('by_storage', q => q.eq('storageId', args.storageId)).first()) throw appError('INVALID_ARGUMENT', 'Screenshot already recorded.');
    if (args.runId) {
      const run = await ctx.db.get(args.runId);
      if (!run || run.sessionVerified !== true || run.sessionId !== args.sessionId || run.jobId !== args.jobId) throw appError('INVALID_ARGUMENT', 'Screenshot run does not match this session and case.');
    }
    const { participantToken: _, ...record } = args;
    return ctx.db.insert('screenshots', { ...record, takenAt: Date.now() });
  },
});
export const recordScreenshot = action({
  args: recordFields,
  handler: async (ctx, args): Promise<Id<'screenshots'>> => {
    // Authorize before touching arbitrary storage ids. Never delete existing records' files.
    await ctx.runQuery(internal.screenshots.authorize, { sessionId: args.sessionId, participantToken: args.participantToken, jobId: args.jobId });
    if (await ctx.runQuery(internal.screenshots.referenced, { storageId: args.storageId })) throw appError('INVALID_ARGUMENT', 'File already belongs to an app record.');
    try {
      const file = await ctx.storage.get(args.storageId);
      if (!file || !['image/jpeg', 'image/png'].includes(file.type) || file.size > SCREENSHOT_MAX_BYTES) throw appError('INVALID_ARGUMENT', 'Upload must be JPEG/PNG and at most 600 KB.');
      const dimensions = imageDimensions(new Uint8Array(await file.arrayBuffer()), file.type);
      if (!dimensions || !Number.isInteger(args.width) || !Number.isInteger(args.height) || args.width < 1 || args.width > 1280 || args.height < 1 ||
        dimensions.width !== args.width || dimensions.height !== args.height) throw appError('INVALID_ARGUMENT', 'Invalid screenshot dimensions or image format.');
      if (!args.reason.trim() || args.reason.trim().length > 120 || args.caption.length > 280 || (args.clientId?.length ?? 0) > 128) throw appError('INVALID_ARGUMENT', 'Use a reason of 1–120 characters and a caption of at most 280.');
      return await ctx.runMutation(internal.screenshots.commit, { ...args, reason: args.reason.trim(), caption: args.caption.trim() });
    } catch (error) {
      if (!await ctx.runQuery(internal.screenshots.referenced, { storageId: args.storageId })) await ctx.storage.delete(args.storageId);
      throw error;
    }
  },
});
export const list = query({
  args: scope,
  handler: async (ctx, args) => {
    await member(ctx, args);
    const rows = await ctx.db.query('screenshots').withIndex('by_session', q => q.eq('sessionId', args.sessionId)).order('desc').take(20);
    return Promise.all(rows.filter(row => row.jobId === args.jobId).map(async row => ({ screenshotId: row._id, caption: row.caption, reason: row.reason,
      takenAt: row.takenAt, width: row.width, height: row.height, url: await ctx.storage.getUrl(row.storageId) })));
  },
});
/** Presenter consumes run/annotation events. No key or model call is needed. */
export const events = query({
  args: { ...scope, since: v.number() },
  handler: async (ctx, args) => {
    await presenter(ctx, args);
    const out: { id: string; reason: string; runId?: Id<'agentRuns'> }[] = [];
    const runs = await ctx.db.query('agentRuns').withIndex('by_session', q => q.eq('sessionId', args.sessionId)).order('desc').take(20);
    for (const run of runs) {
      if (run.sessionVerified !== true || run.createdAt < args.since || run.jobId !== args.jobId || !['mri', '3d'].includes(run.page)) continue;
      if (screenshotRequest(run.text)) out.push({ id: `${run._id}:request`, reason: 'Screenshot requested', runId: run._id });
      for (const step of run.steps) {
        if (!step.ok) continue;
        const reason = screenshotReason(step.tool, step.args && typeof step.args === 'object' ? step.args : {});
        if (reason) out.push({ id: `${run._id}:${step.id}`, reason, runId: run._id });
      }
    }
    const annotations = await ctx.db.query('annotations').withIndex('by_session', q => q.eq('sessionId', args.sessionId)).order('desc').take(200);
    for (const note of annotations) if (note.jobId === args.jobId && note.createdAt >= args.since) out.push({ id: `annotation:${note._id}`, reason: 'Annotation added' });
    return out.reverse();
  },
});

/** Browser reports facts, never evaluates the capture policy itself. */
export const requestCapture = mutation({
  args: { ...scope, event: v.any() },
  handler: async (ctx, args) => {
    await presenter(ctx, args); await budget(ctx, args.sessionId);
    const e = args.event;
    if (!e || typeof e !== 'object') return null;
    if (e.kind === 'report') return e.jobId === args.jobId ? { reason: 'Report requested' } : null;
    if (e.kind === 'user_text') return screenshotRequest(String(e.text ?? '')) ? { reason: 'Screenshot requested' } : null;
    if (e.kind === 'action') {
      if (e.action?.type === 'focusTumor') return { reason: 'Tumor focused' };
      if (e.action?.type === 'setMode') {
        const reason = screenshotReason('set_mode', { mode: e.action.mode });
        return reason ? { reason } : null;
      }
    }
    return null;
  },
});
