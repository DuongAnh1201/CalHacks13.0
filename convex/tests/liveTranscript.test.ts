import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { api, internal } from '../_generated/api';
import schema from '../schema';
import type { Id } from '../_generated/dataModel';
import { STALE_MS, WRITE_INTERVAL_MS } from '../transcript';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z')); vi.stubEnv('ANTHROPIC_API_KEY', ''); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema);
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const h = await t.mutation(api.sessions.create, { scanId, hostDisplayName: 'Host' });
  const v = await t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: h.inviteCode, displayName: 'Guest' });
  const cap = (x: typeof h | typeof v) => ({ sessionId: x.sessionId, participantToken: x.participantToken });
  const host = cap(h), guest = cap(v);
  const on = (enabled = true) => t.mutation(api.transcript.setEnabled, { ...host, enabled });
  const write = (text: string, final = false, segmentId?: Id<'transcriptSegments'>) => t.mutation(api.transcript.updateLine, { ...guest, text, final, segmentId });
  return { t, host, guest, on, write, guestId: v.participantId };
}

describe('in-place live transcript', () => {
  it('is opt-in, keeps the host-only switch and remembers the one-time prompt', async () => {
    const { t, host, guest, on, write } = await setup();
    expect(await t.query(api.transcript.state, host)).toMatchObject({ enabled: false, promptDismissed: false });
    await expect(write('hello')).rejects.toThrow(/off/);
    await expect(t.mutation(api.transcript.setEnabled, { ...guest, enabled: true })).rejects.toThrow(/presenter/);
    await expect(t.mutation(api.transcript.dismissPrompt, guest)).rejects.toThrow(/presenter/);
    await t.mutation(api.transcript.dismissPrompt, host);
    expect(await t.query(api.transcript.state, host)).toMatchObject({ enabled: false, promptDismissed: true });
    await on();
    await on(false);
    expect(await t.query(api.transcript.state, guest)).toMatchObject({ promptDismissed: true, events: [expect.objectContaining({ kind: 'on' }), expect.objectContaining({ kind: 'off' })] });
  });

  it('shares interim words immediately, patches one row, throttles to <=3 writes/s and finalizes', async () => {
    const { t, guest, on, write } = await setup(); await on();
    const { segmentId } = await write('hel');
    expect(await t.query(api.transcript.list, guest)).toMatchObject({ segments: [{ text: 'hel', final: false }] });
    expect(await write('hello', false, segmentId)).toEqual({ retryAfterMs: WRITE_INTERVAL_MS });
    vi.advanceTimersByTime(WRITE_INTERVAL_MS + 2);
    expect(await write('hello world', false, segmentId)).toEqual({ segmentId });
    expect(await write('hello world.', true, segmentId)).toEqual({ retryAfterMs: WRITE_INTERVAL_MS });
    vi.advanceTimersByTime(WRITE_INTERVAL_MS + 2);
    await write('hello world.', true, segmentId);
    expect(await t.run((c) => c.db.query('transcriptSegments').collect())).toHaveLength(1);
    expect(await t.query(api.transcript.list, guest)).toMatchObject({ segments: [{ segmentId, text: 'hello world.', final: true }] });
    expect(await write('late final', true, segmentId)).toEqual({ closed: true });
    expect((await write('next utterance')).retryAfterMs).toBeGreaterThan(0);
  });

  it('rejects forged line ids, other meetings, invalid text and writes while muted', async () => {
    const { t, host, guest, guestId, on, write } = await setup(); await on();
    const { segmentId } = await write('mine');
    await expect(t.mutation(api.transcript.updateLine, { ...host, segmentId, text: 'forged', final: false })).rejects.toThrow(/not your/);
    await expect(t.mutation(api.transcript.updateLine, { ...guest, participantToken: 'nope', text: 'x', final: false })).rejects.toThrow(/token/);
    await expect(write('x'.repeat(501))).rejects.toThrow(/500/);
    await t.mutation(api.transcript.setMuted, { ...guest, muted: true });
    expect(await t.query(api.transcript.state, guest)).toMatchObject({ enabled: true, muted: [guestId], events: [expect.objectContaining({ kind: 'on' }), expect.objectContaining({ kind: 'mute' })] });
    await expect(write('not allowed')).rejects.toThrow(/muted/);
    expect((await t.query(api.transcript.list, host)).segments[0].final).toBe(true);
    await t.mutation(api.transcript.setMuted, { ...guest, muted: false });
    vi.advanceTimersByTime(WRITE_INTERVAL_MS + 2);
    await write('back');
  });

  it('settles after ten seconds without updates, not ten seconds from creation, and deletes empty lines', async () => {
    const { t, guest, on, write } = await setup(); await on();
    const { segmentId } = await write('still speaking');
    vi.advanceTimersByTime(9000);
    await write('last words', false, segmentId);
    vi.advanceTimersByTime(1000);
    await t.mutation(internal.transcript.cleanStale, { segmentId: segmentId! });
    expect((await t.query(api.transcript.list, guest)).segments[0].final).toBe(false);
    vi.advanceTimersByTime(9000);
    await t.mutation(internal.transcript.cleanStale, { segmentId: segmentId! });
    expect((await t.query(api.transcript.list, guest)).segments[0]).toMatchObject({ text: 'last words', final: true });
    vi.advanceTimersByTime(WRITE_INTERVAL_MS + 2);
    const blank = await write('');
    vi.advanceTimersByTime(STALE_MS + 2);
    await t.mutation(internal.transcript.cleanStale, { segmentId: blank.segmentId! });
    expect((await t.query(api.transcript.list, guest)).segments).toHaveLength(1);
  });

  it('settles on departure, notes-off and meeting-end before downstream summary/export work', async () => {
    const { t, host, guest, on, write } = await setup(); await on();
    await write('leaving');
    await t.mutation(api.transcript.finishOwn, guest);
    vi.advanceTimersByTime(WRITE_INTERVAL_MS + 2);
    await write('notes off'); await on(false);
    await on(); vi.advanceTimersByTime(WRITE_INTERVAL_MS + 2);
    await write('meeting ended');
    await t.mutation(api.sessions.end, host);
    const rows = (await t.query(api.transcript.list, guest)).segments;
    expect(rows.map((x) => [x.text, x.final])).toEqual([['leaving', true], ['notes off', true], ['meeting ended', true]]);
    await expect(write('after end')).rejects.toThrow(/ended/);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  });

  it('MCP and Markdown exports exclude interim lines but retain legacy final lines', async () => {
    const { t, host, guest, on, write } = await setup(); await on();
    await t.mutation(api.transcript.append, { ...host, text: 'legacy final' });
    const { segmentId } = await write('private unfinished');
    expect((await t.query(api.transcript.list, guest)).segments).toHaveLength(2);
    expect((await t.query(internal.transcript.readForMcp, { ...guest, jobId: 'sample', limit: 1 })).segments.map((s) => s.text)).toEqual(['legacy final']);
    const exported = await t.action(internal.exportDoc.request, { jobId: 'sample', sessionId: host.sessionId, participantToken: host.participantToken,
      sections: ['transcript'], format: 'md', agentName: 'Scribe' });
    const row = await t.query(internal.exportDoc.getRecord, { exportId: exported.exportId });
    const text = await t.run(async (c) => (await c.storage.get(row!.fileId!))!.text());
    expect(text).toContain('legacy final'); expect(text).not.toContain('private unfinished');
    vi.advanceTimersByTime(WRITE_INTERVAL_MS + 2);
    await write('now final', true, segmentId);
    expect((await t.query(internal.transcript.readForMcp, { ...guest, jobId: 'sample' })).segments.map((s) => s.text)).toEqual(['legacy final', 'now final']);
  });
});
