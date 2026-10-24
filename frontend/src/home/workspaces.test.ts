import { describe, expect, it } from 'vitest';
import { ago, hrefOf, listWorkspaces, saveWorkspace, type Workspace } from './workspaces';

const fake = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const w = (id: string, openedAt: number, kind: Workspace['kind'] = 'mri'): Workspace => ({ id, kind, name: id, openedAt });

describe('workspaces', () => {
  it('empty, corrupt or blocked storage → []', () => {
    expect(listWorkspaces(fake())).toEqual([]);
    const s = fake(); s.setItem('nv.workspaces', 'not json');
    expect(listWorkspaces(s)).toEqual([]);
    expect(listWorkspaces(null)).toEqual([]);
    expect(() => saveWorkspace(w('a', 1), null)).not.toThrow();
  });
  it('newest first; saving the same id replaces it', () => {
    const s = fake();
    saveWorkspace(w('a', 1), s); saveWorkspace(w('b', 2), s); saveWorkspace(w('a', 3), s);
    expect(listWorkspaces(s).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('drops rows that are not workspaces', () => {
    const s = fake(); s.setItem('nv.workspaces', JSON.stringify([w('a', 1), { id: 3 }, null, { id: 'x', kind: 'chat' }]));
    expect(listWorkspaces(s).map((x) => x.id)).toEqual(['a']);
  });
  it('links each kind to its page', () => {
    expect(hrefOf(w('j1', 0))).toBe('/jobs/j1/mri');
    expect(hrefOf(w('l1', 0, 'learn'))).toBe('/learn/l1');
  });
  it('relative time', () => {
    const now = 1_000_000_000;
    expect(ago(now - 10_000, now)).toBe('just now');
    expect(ago(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(ago(now - 3 * 3_600_000, now)).toBe('3 hours ago');
    expect(ago(now - 26 * 3_600_000, now)).toBe('yesterday');
  });
});
