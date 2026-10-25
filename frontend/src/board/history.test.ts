import { describe, expect, it, vi } from 'vitest';
import { codeOf } from '../share/copy';
import { createItem, updateItem } from './commands';
import { createHistory, type Command } from './history';

const board = vi.hoisted(() => {
  let n = 0;
  let row: { id: string; updatedAt: number } | null = null;
  const stale = () => Object.assign(new Error('stale'), { data: { code: 'STALE', message: 'Changed' } });
  return {
    reset() { n = 0; row = null; },
    get row() { return row; },
    async call(fn: string, args: Record<string, unknown>) {
      if (fn === 'board.create') {
        n += 1;
        row = { id: `id${n}`, updatedAt: n * 10 };
        return { itemId: row.id, updatedAt: row.updatedAt };
      }
      if (fn === 'board.update' || fn === 'board.remove') {
        if (!row || args.itemId !== row.id || args.expectedUpdatedAt !== row.updatedAt) throw stale();
        if (fn === 'board.remove') { row = null; return { removed: true }; }
        row = { id: row.id, updatedAt: row.updatedAt + 1 };
        return { updatedAt: row.updatedAt };
      }
      throw new Error(fn);
    },
  };
});

vi.mock('../share/store', () => ({
  sessionCall: (fn: string, args: Record<string, unknown>) => board.call(fn, args),
}));

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

  it('undo of an edit then undo of the create removes the item', async () => {
    board.reset();
    const h = createHistory({ skippable: (e) => codeOf(e) === 'STALE', onSkip: () => {} });
    const item = { kind: 'sticky' as const, anchor: { kind: 'point' as const, ras_mm: [1, 2, 3] }, text: 'A', color: 'yellow' as const };
    await h.run(createItem(item));
    const created = board.row;
    if (!created) throw new Error('missing row');
    await h.run(updateItem({
      itemId: created.id, item, authorName: 'A', mine: true, canRemove: true, createdAt: 0, updatedAt: created.updatedAt,
    }, { text: 'B' }));
    await h.undo();
    await h.undo();
    expect(board.row).toBeNull();
  });

  it('a failed do is not recorded', async () => {
    const h = createHistory({ skippable, onSkip: () => {} });
    await expect(h.run({ label: 'x', do: async () => { throw new Error('no'); }, undo: async () => {} })).rejects.toThrow('no');
    expect(h.sizes().past).toBe(0);
  });
});
