import { internalMutation } from '../_generated/server';
import { v } from 'convex/values';

export const consume = internalMutation({
  args: { tokenHash: v.string() },
  handler: async (ctx, { tokenHash }) => {
    const now = Date.now();
    const row = await ctx.db.query('mcpRateLimits').withIndex('by_token_hash', q => q.eq('tokenHash', tokenHash)).unique();
    const windowMs = 60_000;
    if (!row) {
      await ctx.db.insert('mcpRateLimits', { tokenHash, windowStart: now, count: 1 });
      return { allowed: true, retryAfter: 0 };
    }
    if (now - row.windowStart >= windowMs) {
      await ctx.db.patch(row._id, { windowStart: now, count: 1 });
      return { allowed: true, retryAfter: 0 };
    }
    if (row.count >= 120) return { allowed: false, retryAfter: Math.ceil((windowMs - (now - row.windowStart)) / 1000) };
    await ctx.db.patch(row._id, { count: row.count + 1 });
    return { allowed: true, retryAfter: 0 };
  },
});
