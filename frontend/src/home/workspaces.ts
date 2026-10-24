export type WorkspaceKind = 'mri' | 'learn';
export interface Workspace { id: string; kind: WorkspaceKind; name: string; openedAt: number }

type Store = Pick<Storage, 'getItem' | 'setItem'>;
const KEY = 'nv.workspaces';

// shortcut: per-browser list in localStorage, W2 moves workspaces to Convex so they can be shared by link.
function local(): Store | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

const isWorkspace = (v: unknown): v is Workspace => {
  const w = v as Workspace | null;
  return !!w && typeof w.id === 'string' && (w.kind === 'mri' || w.kind === 'learn') && typeof w.openedAt === 'number';
};

export function listWorkspaces(s: Store | null = local()): Workspace[] {
  try {
    const v: unknown = JSON.parse(s?.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter(isWorkspace).sort((a, b) => b.openedAt - a.openedAt) : [];
  } catch { return []; }
}

/** Adds a workspace, or moves an existing id to the top with the new fields. */
export function saveWorkspace(w: Workspace, s: Store | null = local()): void {
  try { s?.setItem(KEY, JSON.stringify([w, ...listWorkspaces(s).filter((x) => x.id !== w.id)])); } catch { /* blocked or full: the list is a convenience */ }
}

export function removeWorkspace(id: string, s: Store | null = local()): void {
  try { s?.setItem(KEY, JSON.stringify(listWorkspaces(s).filter((x) => x.id !== id))); } catch { /* blocked or full: the list is a convenience */ }
}

export const hrefOf = (w: Workspace) => (w.kind === 'mri' ? `/jobs/${w.id}/mri` : `/learn/${w.id}`);

/** Card name for an upload: the FLAIR file stem minus a trailing sequence tag, else the job id. */
export function scanName(fileName: string, jobId: string): string {
  const stem = fileName.replace(/\.nii(\.gz)?$/i, '').replace(/[_\-. ]*(flair|t1ce|t1c|t1|t2)$/i, '');
  return stem ? stem : `Scan ${jobId}`;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function ago(t: number, now = Date.now()): string {
  const min = Math.round((t - now) / 60_000);
  if (min > -1) return 'just now';
  if (min > -60) return rtf.format(min, 'minute');
  const h = Math.round(min / 60);
  return h > -24 ? rtf.format(h, 'hour') : rtf.format(Math.round(h / 24), 'day');
}
