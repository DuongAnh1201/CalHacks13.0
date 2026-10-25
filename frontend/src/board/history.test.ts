import { describe, expect, it } from 'vitest';
import { createHistory, type Command } from './history';

const STALE = Object.assign(new Error('stale'), { data: { code: 'STALE' } });
const skippable = (e: unknown) => (e as { data?: { code?: string } }).data?.code === 'STALE';

function counter() {
  const log: string[] = [];
  const cmd = (label: string, failUndo?: unknown): Command => ({
    label,
    do: async () => { log.push(`do ${label}`); },
    undo: async () => { if (failUndo) throw failUndo; log.push(`undo ${label}`); },
  });
  return { log, cmd };
}

describe('history', () => {
  it('undo then redo replays in order', async () => {
    const { log, cmd } = counter();
    const h = createHistory({ skippable, onSkip: () => {} });
    await h.run(cmd('a')); await h.run(cmd('b'));
    await h.undo(); await h.undo(); await h.redo();
    expect(log).toEqual(['do a', 'do b', 'undo b', 'undo a', 'do a']);
    expect(h.sizes()).toEqual({ past: 1, future: 1 });
  });

  it('a new action clears redo', async () => {
    const { cmd } = counter();
    const h = createHistory({ skippable, onSkip: () => {} });
    await h.run(cmd('a')); await h.undo(); await h.run(cmd('b'));
    expect(h.sizes()).toEqual({ past: 1, future: 0 });
  });

  it('a STALE undo is dropped and reported, others rethrow and stay', async () => {
    const { cmd } = counter();
    const skipped: string[] = [];
    const h = createHistory({ skippable, onSkip: (l) => skipped.push(l) });
    await h.run(cmd('a', STALE));
    await h.undo();
    expect(skipped).toEqual(['a']);
    expect(h.sizes()).toEqual({ past: 0, future: 0 });
    const boom = new Error('net');
    await h.run(cmd('b', boom));
    await expect(h.undo()).rejects.toBe(boom);
    expect(h.sizes()).toEqual({ past: 1, future: 0 });
  });

  it('caps the past at `cap`', async () => {
    const { cmd } = counter();
    const h = createHistory({ skippable, onSkip: () => {}, cap: 2 });
    for (const l of ['a', 'b', 'c']) await h.run(cmd(l));
    expect(h.sizes().past).toBe(2);
  });

  it('a failed do is not recorded', async () => {
    const h = createHistory({ skippable, onSkip: () => {} });
    await expect(h.run({ label: 'x', do: async () => { throw new Error('no'); }, undo: async () => {} })).rejects.toThrow('no');
    expect(h.sizes().past).toBe(0);
  });
});
