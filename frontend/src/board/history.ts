import { create } from 'zustand';
import { codeOf } from '../share/copy';
import { clearRefs } from './commands';

export interface Command { label: string; do(): Promise<void>; undo(): Promise<void> }

/**
 * Per-user, per-tab undo for the board. Each step is a pair of Convex mutations, so a step can go
 * stale when someone else changed the record: that step is dropped with a notice, like Figma.
 */
export function createHistory({ skippable, onSkip, cap = 100 }: { skippable(e: unknown): boolean; onSkip(label: string): void; cap?: number }) {
  const past: Command[] = [];
  const future: Command[] = [];
  let busy = false; // one step at a time: a held Cmd+Z must not interleave mutations
  const step = async (from: Command[], to: Command[], run: (c: Command) => Promise<void>) => {
    if (busy) return;
    const c = from.pop();
    if (!c) return;
    busy = true;
    try { await run(c); to.push(c); }
    catch (e) { if (skippable(e)) onSkip(c.label); else { from.push(c); throw e; } }
    finally { busy = false; }
  };
  return {
    async run(c: Command) {
      await c.do();
      past.push(c);
      if (past.length > cap) past.shift();
      future.length = 0;
    },
    undo: () => step(past, future, (c) => c.undo()),
    redo: () => step(future, past, (c) => c.do()),
    clear() { past.length = 0; future.length = 0; clearRefs(); },
    sizes: () => ({ past: past.length, future: future.length }),
  };
}

export const useBoardToast = create<{ text: string | null }>()(() => ({ text: null }));
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(text: string) {
  clearTimeout(toastTimer);
  useBoardToast.setState({ text });
  toastTimer = setTimeout(() => useBoardToast.setState({ text: null }), 3000);
}

export const history = createHistory({
  skippable: (e) => ['STALE', 'NOT_FOUND'].includes(codeOf(e) ?? ''),
  onSkip: () => toast('Changed by someone else, skipped'),
});
