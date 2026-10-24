# W1 · MRI Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, **inline**, with the overrides in [Worker rules](#worker-rules). Steps use checkbox (`- [ ]`) syntax for tracking. Do only the tasks assigned to your label.

**Goal:** Remove the Explore tab. Add a workspace dashboard on `/`. After an upload the user lands in an MRI workspace that copies Figma frame 03 (`/jobs/:id/mri`). "Place in 3D" opens a 3D page that copies frame 04 (`/jobs/:id/3d`).

**Architecture:**
- Routes move into `App.tsx`, with legacy redirects in `routes/legacy.tsx`.
- New units:
  - `components/agent/`: the Neuro Agent panel. UI only, props for Tom's agents.
  - `viewer/MprPanel.tsx` + `viewer/slices.ts`: three NiiVue slice views kept in sync.
  - `viewer/applyView.ts`: store state → 3D scene graph.
  - `home/workspaces.ts` + `routes/Home.tsx`: the dashboard, saved in localStorage.
- Pages compose these units. All state changes still go through `dispatch(action, 'pointer')`.

**Tech Stack:** Vite 8, React 19.3, TS 6, react-router-dom 7.18, Zustand 5, R3F 9 / drei 10 / three 0.186, vitest 5 (node env, `src/**/*.test.ts` only, no DOM), and `@niivue/niivue@0.69.0` (new).

**Spec:** `docs/superpowers/specs/2026-10-24-w1-mri-workspace-design.md` (§8 = dashboard). **Issues:** #88 #85 #86 #87 #11 #12 #15 (milestone 9). Frontend work may overwrite Tom's frontend pieces, for example #71 CaseCanvas parity.

## Global Constraints

**Copy**
- Never copy Figma placeholder data. Every number and label comes from `report.json`.
- Banned: "Glioblastoma", "Grade IV", invented confidence, a patient name, "3.0 Tesla".
- Use "Tumor detected" / "No tumor detected" only.
- The word `h-e-a-l-t-h-y` is banned in `src/`: `src/copy.test.ts` fails on it. Figma's "Hide Healthy" becomes **"Hide Brain"**.
- No keyboard shortcuts and no copy that names a key. Figma's "Hold Space to talk" becomes "Click the mic to talk". Native Enter-to-submit in a `<form>` and Esc on a native `popover` are fine.

**Code**
- Styling: plain CSS modules plus the `--nv-*` tokens in `src/styles/tokens.css`. No Tailwind. Never create a `lib/` dir.
- Figma refs are references only, adapted to CSS modules:
  - `docs/figma/03-workspace.ref.tsx` (truncated after about line 900)
  - `docs/figma/03-workspace-right.ref.tsx`
  - `docs/figma/04-explore.ref.tsx`
  - `docs/figma/symbol-tool-call.ref.tsx`
  - the PNGs `03-workspace.png` and `04-explore.png`
- Icons: copy the exact file from `docs/figma/assets/` into `frontend/src/assets/figma/`. Never redraw an icon. File ↔ node map: `docs/figma/ASSETS.md`.
- Dependencies: `@niivue/niivue` is the only new one, pinned exact at `0.69.0` (published 2026-05-20; 1.0.0 is still an rc).
- Tests: no DOM, no JSX in tests. Component tests use `renderToStaticMarkup(createElement(...))` from `react-dom/server`.
- `main.tsx` uses `<StrictMode>`, so every effect must survive mount → cleanup → mount.

**Commands** (from `frontend/`):
- `npm test`
- `npx tsc -b`
- `npm run build`
- `npm run lint`

---

## Worker rules

**Checkout and git**
- One shared checkout at `/Users/kaydee/Developer/CalHacks13.0`, branch **`w1/mri-workspace`**, already checked out.
- **Never** `checkout`, `switch`, `stash`, `reset`, `rebase`, `merge` or `push`.
- Commit only your own paths, because other workers stage files in the same index:
  ```bash
  git add <your paths> && git commit -m "<msg>" -- <your paths>
  ```
  `-- <paths>` commits only those paths, even if someone else staged files.
- If `.git/index.lock` exists, wait 5 s and retry. Never delete it.

**executing-plans overrides**
- Inline only.
- No worktree, no ledger, no final code review, no finishing-a-development-branch, no push.

**GitNexus** (`repo: "CalHacks13.0"`)
- Before editing an existing function or component, run `impact({target, direction: "upstream", repo: "CalHacks13.0"})`.
- Before each commit, run `detect_changes({repo: "CalHacks13.0"})`.
- **Never** run `analyze`; only the lead re-indexes. The index is stale (6df3e28), so cross-check its results with `grep`.

**Other workers' files**
- `npx tsc -b` and `npm test` cover the whole app. If they fail only in files another worker owns, don't fix them. Report the failure to the lead and continue.

**Commit trailer** (last lines of every commit message):
```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01K7M6bvo7e35QCzCUTFpjvw
```

**Messages**
- `hc send lead "<msg>"`, only for **done** (task id, commit sha, test counts), **blocker**, or a **decision** you need. No acks.

## Owners and order

| Task | Worker | Issue | Starts after |
|---|---|---|---|
| T1 Routes + nav + SPEC | **fe** | #88 | now |
| T8 Home dashboard + `/upload` | **fe** | #88 | T1 |
| T2 Neuro Agent panel | **ai** | #86 | now |
| T3 NiiVue slice panel + `segUrl`/`flairUrl` | **be** | #11 | now |
| T4 MRI workspace page | **fe** | #85 | T1, T2, T3 |
| T5 Scene applies opacity / hide / explode / layers | **ai** | #12 #15 #71 | T2 |
| T6 3D page | **fe** | #87 | T2, T4, T5 |
| T7 Browser verification | **qa** | — | T1–T6, T8 |

**File ownership.** Touch nothing outside your rows.

| Worker | Files |
|---|---|
| fe | `App.tsx`, `TopNavBar.*`, `routes/*` (except `summary.ts`), `home/*`, `docs/SPEC.md` |
| ai | `components/agent/*`, `actions/store.ts`, `viewer/loadCase*`, `viewer/applyView*`, `viewer/CaseCanvas.tsx` |
| be | `package.json`, `package-lock.json`, `api/client.ts`, `viewer/slices*`, `viewer/MprPanel*` |

New icon files under `assets/figma/` belong to whoever copies them.

---

### Task 1 (fe, #88): Routes, nav, SPEC

**Files:**
- Create: `frontend/src/routes/legacy.tsx`, `frontend/src/routes/legacy.test.ts`
- Rename (`git mv`):
  - `routes/Results.tsx` → `routes/MriWorkspace.tsx`
  - `routes/Results.module.css` → `routes/MriWorkspace.module.css`
  - `routes/Explore.tsx` → `routes/Brain3D.tsx`
  - `routes/Explore.module.css` → `routes/Brain3D.module.css`
- Modify:
  - `frontend/src/App.tsx`
  - `frontend/src/components/TopNavBar.tsx`
  - `frontend/src/routes/Processing.tsx:46`
  - `MriWorkspace.tsx`: CTA link and css import
  - `Brain3D.tsx`: two links and css import
  - `docs/SPEC.md`: §3 route table and §14 Decision Log

**Interfaces:**
- Produces:
  - `legacyRoutes: RouteObject[]`
  - default exports `MriWorkspace` (from `routes/MriWorkspace.tsx`) and `Brain3D` (from `routes/Brain3D.tsx`)
  - `TopNavBar({ active }: { active: 'workspace' | 'learn' | null })`

- [ ] **Step 1: Write the failing test** in `frontend/src/routes/legacy.test.ts`

```ts
import { isValidElement } from 'react';
import { matchRoutes, resolvePath } from 'react-router-dom';
import { expect, it } from 'vitest';
import { legacyRoutes } from './legacy';

const target = (url: string) => {
  const el = matchRoutes(legacyRoutes, url)?.[0].route.element;
  if (!isValidElement<{ to: string }>(el)) throw new Error(`no redirect for ${url}`);
  return resolvePath(el.props.to, url).pathname;
};

it('/results redirects to /mri', () => expect(target('/jobs/abc/results')).toBe('/jobs/abc/mri'));
it('/explore redirects to /3d', () => expect(target('/jobs/abc/explore')).toBe('/jobs/abc/3d'));
```

- [ ] **Step 2: Run it.** `npm test -- legacy` → FAIL, "Cannot find module './legacy'".

- [ ] **Step 3: Implement** `frontend/src/routes/legacy.tsx`

```tsx
import { Navigate, type RouteObject } from 'react-router-dom';

// Old links keep working: /results became /mri, /explore became /3d (W1).
export const legacyRoutes: RouteObject[] = [
  { path: '/jobs/:id/results', element: <Navigate to="../mri" relative="path" replace /> },
  { path: '/jobs/:id/explore', element: <Navigate to="../3d" relative="path" replace /> },
];
```

- [ ] **Step 4: Run it.** `npm test -- legacy` → 2 PASS.

- [ ] **Step 5: Rename the pages and rewire the routes**

```bash
cd /Users/kaydee/Developer/CalHacks13.0/frontend/src/routes
git mv Results.tsx MriWorkspace.tsx && git mv Results.module.css MriWorkspace.module.css
git mv Explore.tsx Brain3D.tsx && git mv Explore.module.css Brain3D.module.css
```

Make these edits:

1. `MriWorkspace.tsx`
   - `export default function Results()` → `export default function MriWorkspace()`
   - `import css from './Results.module.css'` → `'./MriWorkspace.module.css'`
   - CTA `to={`/jobs/${id}/explore`}` → `to={`/jobs/${id}/3d`}`
2. `Brain3D.tsx`
   - `export default function Explore()` → `export default function Brain3D()`
   - css import → `'./Brain3D.module.css'`
   - `<TopNavBar active="explore" />` → `<TopNavBar active="workspace" />`
   - `to="/jobs/sample/explore"` → `to="/jobs/sample/3d"`
   - the "Back to results" link → `to={`/jobs/${id}/mri`}` with text `Analyze Cross-Sections`
3. `Processing.tsx:46`: `navigate(`/jobs/${id}/results`, …)` → `navigate(`/jobs/${id}/mri`, …)`

Run `grep -rn "Results\b\|Explore\b\|/results\|/explore" src`. The only hits left should be `legacy.tsx` and its test.

`frontend/src/App.tsx`:

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Brain3D from './routes/Brain3D';
import Learn from './routes/Learn';
import { legacyRoutes } from './routes/legacy';
import MriWorkspace from './routes/MriWorkspace';
import Processing from './routes/Processing';
import Upload from './routes/Upload';

const router = createBrowserRouter([
  { path: '/', element: <Upload /> },
  { path: '/jobs/:id/processing', element: <Processing /> },
  { path: '/jobs/:id/mri', element: <MriWorkspace /> },
  { path: '/jobs/:id/3d', element: <Brain3D /> },
  ...legacyRoutes,
  { path: '/learn', element: <Learn /> },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
```

`frontend/src/components/TopNavBar.tsx`. Delete the Explore link and the Help span (Help is a spec non-goal).

```tsx
import { NavLink, useParams } from 'react-router-dom';
import brandMark from '../assets/figma/664bf.svg';
import css from './TopNavBar.module.css';

type Active = 'workspace' | 'learn' | null;

export function TopNavBar({ active }: { active: Active }) {
  const { id = 'sample' } = useParams();
  const cls = (k: Active) => (k === active ? `${css.link} ${css.active}` : css.link);
  return (
    <header className={css.bar}>
      <NavLink to="/" className={css.brand}>
        <img src={brandMark} alt="" width={19} height={20} />
        NeuroVision
      </NavLink>
      <nav className={css.nav} aria-label="Main">
        <NavLink to={`/jobs/${id}/mri`} className={cls('workspace')}>MRI Workspace</NavLink>
        <NavLink to="/learn" className={cls('learn')}>Learning Mode</NavLink>
      </nav>
      <div className={css.chips}>
        <button className={css.chip} disabled title="Gestures arrive with ticket E1">Gestures off</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 6: Update the SPEC.**
  - In `docs/SPEC.md` §3, replace the `/jobs/:id/results` and `/jobs/:id/explore` rows with `/jobs/:id/mri` (MRI workspace, frame 03) and `/jobs/:id/3d` (3D page, frame 04). Note that the old paths redirect.
  - Append to §14:

```
- 2026-10-24 · h4 · W1: Explore tab removed; `/jobs/:id/results` → `/jobs/:id/mri` (MRI workspace, frame 03), `/jobs/:id/explore` → `/jobs/:id/3d` (3D page, frame 04); old paths redirect · user request, spec `docs/superpowers/specs/2026-10-24-w1-mri-workspace-design.md` · #88
```

- [ ] **Step 7: Verify.** Run `npm test && npx tsc -b && npm run lint`. All green.

- [ ] **Step 8: Commit**

```bash
cd /Users/kaydee/Developer/CalHacks13.0
P="frontend/src/App.tsx frontend/src/components/TopNavBar.tsx frontend/src/routes docs/SPEC.md"
git add $P && git commit -m "feat(routes): /mri and /3d replace /results and /explore, drop Explore tab (#88)" -- $P
```

---

### Task 8 (fe, #88): Home dashboard, Upload moves to `/upload`

The user's reference is the Figma file browser: a sidebar with a **New** menu and a grid of cards.
- **New → MRI Workspace** sends a first-time user to the upload flow.
- **New → Learning Mode** creates a Learning Mode workspace.
- The list is saved per browser. W2 moves it to Convex so it can be shared by link.

**Files:**
- Create: `frontend/src/home/workspaces.ts`, `frontend/src/home/workspaces.test.ts`, `frontend/src/routes/Home.tsx`, `frontend/src/routes/Home.module.css`
- Modify:
  - `frontend/src/App.tsx`
  - `frontend/src/components/TopNavBar.tsx`
  - `frontend/src/routes/Upload.tsx:55,74,114`
  - `frontend/src/routes/Processing.tsx:89`
  - `docs/SPEC.md` §3 and §14

**Interfaces:**
- Produces:
  - `type WorkspaceKind = 'mri' | 'learn'`
  - `interface Workspace { id: string; kind: WorkspaceKind; name: string; openedAt: number }`
  - `listWorkspaces(s?): Workspace[]`
  - `saveWorkspace(w, s?): void`
  - `hrefOf(w): string`
  - `ago(t, now?): string`
- Routes: `/` → Home, `/upload` → Upload, `/learn/:wsId` → Learn (the page ignores `wsId` in W1).

- [ ] **Step 1: Write the failing test** in `frontend/src/home/workspaces.test.ts`

```ts
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
```

- [ ] **Step 2: Run it.** `npm test -- workspaces` → FAIL, module not found.

- [ ] **Step 3: Implement** `frontend/src/home/workspaces.ts`

```ts
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

export const hrefOf = (w: Workspace) => (w.kind === 'mri' ? `/jobs/${w.id}/mri` : `/learn/${w.id}`);

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
export function ago(t: number, now = Date.now()): string {
  const min = Math.round((t - now) / 60_000);
  if (min > -1) return 'just now';
  if (min > -60) return rtf.format(min, 'minute');
  const h = Math.round(min / 60);
  return h > -24 ? rtf.format(h, 'hour') : rtf.format(Math.round(h / 24), 'day');
}
```

- [ ] **Step 4: Run it.** `npm test -- workspaces` → 5 PASS.

- [ ] **Step 5: Build the Home page** `frontend/src/routes/Home.tsx`

The New menu is a native `popover`: it closes on an outside click and on Esc, and needs no state. React 19 types it.

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';
import { ago, hrefOf, listWorkspaces, saveWorkspace, type Workspace, type WorkspaceKind } from '../home/workspaces';
import css from './Home.module.css';

const KIND: Record<WorkspaceKind, { label: string; hint: string }> = {
  mri: { label: 'MRI Workspace', hint: 'Upload a brain MRI and see the segmentation' },
  learn: { label: 'Learning Mode', hint: 'Explore a labelled brain atlas' },
};
const FILTERS = [['all', 'All workspaces'], ['mri', 'MRI'], ['learn', 'Learning']] as const;

export default function Home() {
  const navigate = useNavigate();
  const [items] = useState(() => listWorkspaces());
  const [filter, setFilter] = useState<'all' | WorkspaceKind>('all');
  const shown = items.filter((w) => filter === 'all' || w.kind === filter);

  const newLearn = () => {
    const id = crypto.randomUUID().slice(0, 8);
    saveWorkspace({ id, kind: 'learn', name: 'Learning Mode', openedAt: Date.now() });
    navigate(`/learn/${id}`);
  };
  const open = (w: Workspace) => saveWorkspace({ ...w, openedAt: Date.now() });

  return (
    <div className={css.page}>
      <TopNavBar active={null} />
      <div className={css.body}>
        <aside className={css.side}>
          <button className={css.new} popoverTarget="nv-new-menu">New workspace</button>
          <div id="nv-new-menu" popover="auto" className={css.menu}>
            <Link className={css.item} to="/upload"><b>{KIND.mri.label}</b><small>{KIND.mri.hint}</small></Link>
            <button className={css.item} type="button" onClick={newLearn}><b>{KIND.learn.label}</b><small>{KIND.learn.hint}</small></button>
          </div>
          <nav className={css.filters} aria-label="Filter workspaces">
            {FILTERS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={filter === k} className={css.filter} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </nav>
        </aside>
        <main className={css.main}>
          <h1 className={css.title}>Workspaces</h1>
          {shown.length === 0 ? (
            <div className={css.empty}>
              <p>No workspaces yet.</p>
              <Link className={css.cta} to="/upload">Upload your first MRI</Link>
              <button className={css.ghost} type="button" onClick={newLearn}>Open Learning Mode</button>
            </div>
          ) : (
            <ul className={css.grid}>
              {shown.map((w) => (
                <li key={w.id}>
                  <Link className={css.card} to={hrefOf(w)} onClick={() => open(w)}>
                    <div className={`${css.thumb} ${css[w.kind]}`} />
                    <div className={css.meta}>
                      <p className={css.name}>{w.name}</p>
                      <p className={css.when}>{KIND[w.kind].label} · opened {ago(w.openedAt)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
      <Footer />
    </div>
  );
}
```

`Home.module.css`. Follow the reference screenshots, light theme, with these rules:
- `.page`: the same shell as `MriWorkspace.module.css .page`.
- `.body`: `display:grid; grid-template-columns: 240px 1fr; gap: 24px; padding: 16px 24px; flex:1`.
- `.side`: a column, gap 8px.
- `.new`: a primary button with `background: var(--nv-primary)`, white text, `border-radius: var(--nv-radius-pill)`.
- `.menu` (popover top layer): `position: fixed; inset: auto; top: calc(var(--nv-header-h) + 72px); left: 24px; margin: 0; padding: 6px; border: 1px solid var(--nv-border); border-radius: 12px; background: #fff; box-shadow: var(--nv-shadow)`.
- `.item`: a block, padding 10px 12px, radius 8px, hover background `var(--nv-surface-warm)`, with `small` on its own line in `var(--nv-text-2)`.
- `.filter[aria-pressed="true"]`: the active row style, like the Figma Drafts row.
- `.grid`: `display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 24px; list-style:none; padding:0`.
- `.card`: `border: 1px solid var(--nv-border); border-radius: 12px; overflow:hidden; background:#fff`.
- `.thumb`: `aspect-ratio: 16/9`. `.mri` gets a dark `var(--nv-canvas-bg)` panel; `.learn` gets `var(--nv-surface-warm)`. Optionally put a matching icon from `docs/figma/assets/` on top (copy it, never redraw).
- At width ≤ 720px, `.body` becomes one column.

- [ ] **Step 6: Wire routes and record new workspaces.**

`App.tsx`:
- import Home;
- `{ path: '/', element: <Home /> }`;
- `{ path: '/upload', element: <Upload /> }`;
- add `{ path: '/learn/:wsId', element: <Learn /> }` next to `/learn`.

`TopNavBar.tsx`:
- `const { id } = useParams();`
- MRI Workspace `to={id ? `/jobs/${id}/mri` : '/upload'}`. With no job in the URL, the user goes to the first-upload flow.

`Upload.tsx`:
- Import `saveWorkspace`.
- Line 55: create the job, then save, then navigate:

  ```tsx
  try {
    const jobId = await createJob(slots as Record<Sequence, File>);
    saveWorkspace({ id: jobId, kind: 'mri', name: slots.flair!.name.replace(/\.nii(\.gz)?$/, ''), openedAt: Date.now() });
    navigate(`/jobs/${jobId}/processing`);
  }
  ```

  Keep the existing `catch`. Check the slot key for FLAIR in `api/upload.ts` `SEQUENCES` and use that key.
- Lines 74 and 114 (sample links): add `onClick={() => saveWorkspace({ id: s.id, kind: 'mri', name: s.title, openedAt: Date.now() })}`. Line 114 uses `id: 'sample', name: 'Sample case A'`.

`Processing.tsx:89`: `to="/"` → `to="/upload"`. Grep for any other `to="/"` or `navigate('/')` that means "upload again" and repoint it. The brand link stays `/`.

`docs/SPEC.md`:
- §3: `/` = workspace dashboard, `/upload` = Upload, `/learn/:wsId`.
- §14 line:

```
- 2026-10-24 · h4 · Home `/` becomes a workspace dashboard (New → MRI Workspace goes to `/upload`, New → Learning Mode creates `/learn/:wsId`); list kept in localStorage until W2 moves it to Convex · user request (Figma-style file browser) · #88
```

- [ ] **Step 7: Verify.** Run `npm test && npx tsc -b && npm run lint && npm run build`. Green.

- [ ] **Step 8: Commit**

```bash
cd /Users/kaydee/Developer/CalHacks13.0
P="frontend/src/home frontend/src/routes/Home.tsx frontend/src/routes/Home.module.css frontend/src/App.tsx frontend/src/components/TopNavBar.tsx frontend/src/routes/Upload.tsx frontend/src/routes/Processing.tsx docs/SPEC.md"
git add $P && git commit -m "feat(home): workspace dashboard on /, upload moves to /upload (#88)" -- $P
```

Add any icon you copied to `$P`.

---

### Task 2 (ai, #86): Neuro Agent panel (UI only)

**Files:**
- Create in `frontend/src/components/agent/`:
  - `types.ts`
  - `AgentPanel.tsx`
  - `AgentPanel.module.css`
  - `demo.ts`
  - `AgentPanel.test.ts`
  - `demo.test.ts`
- Copy icons:

```bash
cd /Users/kaydee/Developer/CalHacks13.0
cp docs/figma/assets/{3f35e,c9605,78c7f,61a1b,8e97a,6179e,941c5,2623b,bfdea,81241}.svg frontend/src/assets/figma/
```

  `f8d34.svg` (Tool Call check) is already there. Node map is in `docs/figma/ASSETS.md` § Frame 03:

  | File | Use |
  |---|---|
  | 3f35e | avatar |
  | c9605 | status dot |
  | 78c7f | chip dot |
  | 61a1b | active chip dot |
  | 8e97a | Voice tab |
  | 6179e | Script tab |
  | 941c5 | system msg |
  | 2623b | voice meta |
  | bfdea | Run |
  | 81241 | mic |

**Visual reference:** `docs/figma/03-workspace.ref.tsx` lines 157–380, node `44:271` "Neuro Agent Panel", plus `symbol-tool-call.ref.tsx` (node `45:30`) and `03-workspace.png` left column.

**Interfaces:**
- Produces the following, verbatim from spec §4. T4 and T6 use it, and Tom plugs his agents in through it.

```ts
// components/agent/types.ts
export type ToolCallRow = { call: string; ms: number; ok: boolean; message?: string };
export type AgentMessage =
  | { kind: 'system'; agent: string; text: string }
  | { kind: 'user'; text: string; via: 'text' | 'voice'; at: string }
  | { kind: 'agent'; agent: string; text: string; at: string; calls?: ToolCallRow[] }
  | { kind: 'confirm'; agent: string; text: string; confirmLabel: string; dismissLabel: string };

export interface AgentPanelProps {
  messages: AgentMessage[];
  status: 'ready' | 'listening' | 'offline';
  script?: string[];
  onSend?: (text: string) => void;      // absent → input disabled, placeholder "Agent not connected yet"
  onRun?: (lines: string[]) => void;    // absent → Run disabled
  onMic?: () => void;                   // absent → mic disabled
  onConfirm?: () => void;
  onDismiss?: () => void;
}
```

- It also produces:
  - `AgentPanel(props: AgentPanelProps)`
  - `ScriptBlock({ lines, onRun })`
  - `ToolCall({ row })`
  - `demoMessages(r: Report, page: 'mri' | '3d'): AgentMessage[]`

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/agent/AgentPanel.test.ts`:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentPanel, ScriptBlock, ToolCall } from './AgentPanel';
import type { AgentMessage, AgentPanelProps } from './types';

const MSGS: AgentMessage[] = [
  { kind: 'system', agent: 'Vision agent', text: 'Segmentation done: 12.0 cm³, Right hemisphere' },
  { kind: 'user', text: 'show the tumor', via: 'voice', at: '10:02' },
  { kind: 'agent', agent: 'Spatial UI', text: 'Focused on the tumor', at: '10:02', calls: [{ call: 'focusTumor()', ms: 41, ok: true }] },
  { kind: 'confirm', agent: 'Spatial UI', text: 'Place the 12.0 cm³ tumor on the 3D brain?', confirmLabel: 'Place in 3D', dismissLabel: 'Not now' },
];
const html = (p: Partial<AgentPanelProps>) => renderToStaticMarkup(createElement(AgentPanel, { messages: MSGS, status: 'offline', ...p }));
/** The opening tag of the element with this aria-label. */
const tag = (h: string, label: string) => h.match(new RegExp(`<[a-z]+[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? '';
const noop = () => {};

describe('AgentPanel', () => {
  it('renders every message kind', () => {
    const h = html({});
    for (const s of ['Neuro Agent', 'Segmentation done', 'show the tumor', 'Focused on the tumor', 'focusTumor()', '41 ms', 'Place in 3D', 'Not now']) expect(h).toContain(s);
  });
  it('disables input, mic and confirm buttons when their handler is absent', () => {
    const h = html({});
    expect(tag(h, 'Message the agent')).toContain('disabled');
    expect(h).toContain('Agent not connected yet');
    expect(tag(h, 'Talk to the agent')).toContain('disabled');
    expect(h).toMatch(/<button[^>]*disabled=""[^>]*>Place in 3D</);
  });
  it('enables them when handlers are passed', () => {
    const h = html({ onSend: noop, onMic: noop, onConfirm: noop, onDismiss: noop });
    expect(tag(h, 'Message the agent')).not.toContain('disabled');
    expect(tag(h, 'Talk to the agent')).not.toContain('disabled');
    expect(h).not.toMatch(/<button[^>]*disabled=""[^>]*>Place in 3D</);
  });
  it('never names a keyboard key', () => expect(html({})).not.toMatch(/\b(space|esc|enter|ctrl|cmd)\b/i));
});

describe('ScriptBlock', () => {
  const sb = (onRun?: (l: string[]) => void) => renderToStaticMarkup(createElement(ScriptBlock, { lines: ['focus tumor', 'opacity 40'], onRun }));
  it('Run is disabled without onRun', () => expect(tag(sb(), 'Run script')).toContain('disabled'));
  it('Run is enabled with onRun', () => expect(tag(sb(noop), 'Run script')).not.toContain('disabled'));
  it('shows the lines', () => expect(sb()).toContain('focus tumor\nopacity 40'));
});

describe('ToolCall', () => {
  it('failed call shows ✗ and its message', () => {
    const h = renderToStaticMarkup(createElement(ToolCall, { row: { call: 'setOpacity(2)', ms: 3, ok: false, message: 'Invalid opacity' } }));
    expect(h).toContain('✗');
    expect(h).toContain('Invalid opacity');
  });
});
```

`frontend/src/components/agent/demo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Report } from '../../api/types';
import { demoMessages } from './demo';

const tumor = { tumorDetected: true, side: 'right', volumesCm3: { whole: 136.28, core: 40, enhancing: 10 } } as Report;
const none = { tumorDetected: false, side: null, volumesCm3: { whole: 0, core: 0, enhancing: 0 } } as Report;

describe('demoMessages', () => {
  it('tumor on /mri: vision summary + place-in-3D confirm', () => {
    expect(demoMessages(tumor, 'mri')).toEqual([
      { kind: 'system', agent: 'Vision agent', text: 'Segmentation done: 136.3 cm³, Right hemisphere' },
      { kind: 'confirm', agent: 'Spatial UI', text: 'Place the 136.3 cm³ tumor on the 3D brain?', confirmLabel: 'Place in 3D', dismissLabel: 'Not now' },
    ]);
  });
  it('tumor on /3d: summary only', () => expect(demoMessages(tumor, '3d')).toHaveLength(1));
  it('no tumor: one line, contract wording', () => {
    expect(demoMessages(none, 'mri')).toEqual([{ kind: 'system', agent: 'Vision agent', text: 'No tumor detected' }]);
  });
});
```

- [ ] **Step 2: Run them.** `npm test -- agent` → FAIL, modules not found.

- [ ] **Step 3: Implement.** First, `types.ts` exactly as in the Interfaces block. Then `demo.ts`:

```ts
import type { Report } from '../../api/types';
import { cm3, sideLabel } from '../../routes/summary';
import type { AgentMessage } from './types';

/** Placeholder log until Tom's agents (#64/#65) feed the panel. Built only from report.json. */
export function demoMessages(r: Report, page: 'mri' | '3d'): AgentMessage[] {
  if (!r.tumorDetected) return [{ kind: 'system', agent: 'Vision agent', text: 'No tumor detected' }];
  const v = cm3(r.volumesCm3.whole);
  const msgs: AgentMessage[] = [{ kind: 'system', agent: 'Vision agent', text: `Segmentation done: ${v}, ${sideLabel(r.side)}` }];
  if (page === 'mri') msgs.push({ kind: 'confirm', agent: 'Spatial UI', text: `Place the ${v} tumor on the 3D brain?`, confirmLabel: 'Place in 3D', dismissLabel: 'Not now' });
  return msgs;
}
```

`AgentPanel.tsx`:
- Keep the structure and the aria-labels below; tests depend on them.
- Take subtitle and chip text from the ref, filtered by the copy rule.

```tsx
import { useState } from 'react';
import runIcon from '../../assets/figma/bfdea.svg';
import avatarIcon from '../../assets/figma/3f35e.svg';
import statusDot from '../../assets/figma/c9605.svg';
import chipDot from '../../assets/figma/78c7f.svg';
import voiceTabIcon from '../../assets/figma/8e97a.svg';
import scriptTabIcon from '../../assets/figma/6179e.svg';
import systemIcon from '../../assets/figma/941c5.svg';
import voiceMetaIcon from '../../assets/figma/2623b.svg';
import micIcon from '../../assets/figma/81241.svg';
import checkIcon from '../../assets/figma/f8d34.svg';
import type { AgentMessage, AgentPanelProps, ToolCallRow } from './types';
import css from './AgentPanel.module.css';

const STATUS = { ready: 'Ready', listening: 'Listening', offline: 'Offline' } as const;
const AGENTS = ['Orchestrator', 'Vision', 'Spatial UI', 'Clinical'] as const; // display only in W1

export function ToolCall({ row }: { row: ToolCallRow }) {
  return (
    <div className={row.ok ? css.call : `${css.call} ${css.fail}`} title={row.message}>
      {row.ok ? <img src={checkIcon} alt="ok" width={12} height={12} /> : <span aria-label="failed">✗</span>}
      <code className={css.callText}>{row.call}</code>
      <span className={css.ms}>{row.ms} ms</span>
      {!row.ok && row.message && <span className={css.callMsg}>{row.message}</span>}
    </div>
  );
}

export function ScriptBlock({ lines, onRun }: { lines: string[]; onRun?: (lines: string[]) => void }) {
  // shortcut: initial lines only; remount with a new key when the agent replaces the script
  const [text, setText] = useState(lines.join('\n'));
  const run = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    <div className={css.script}>
      <div className={css.scriptHead}>
        <span>Script</span>
        <button type="button" className={css.run} aria-label="Run script" disabled={!onRun || run.length === 0} onClick={() => onRun?.(run)}>
          <img src={runIcon} alt="" width={12} height={12} />Run
        </button>
      </div>
      <textarea className={css.lines} aria-label="Script commands" spellCheck={false} rows={Math.max(3, lines.length)} value={text} onChange={(e) => setText(e.target.value)} />
    </div>
  );
}

function Message({ m, onConfirm, onDismiss }: { m: AgentMessage; onConfirm?: () => void; onDismiss?: () => void }) {
  switch (m.kind) {
    case 'system':
      return <p className={css.system}><img src={systemIcon} alt="" width={14} height={14} /><b>{m.agent}</b> · {m.text}</p>;
    case 'user':
      return (
        <div className={css.user}>
          <p>{m.text}</p>
          <span className={css.meta}>{m.via === 'voice' && <img src={voiceMetaIcon} alt="voice" width={10} height={10} />}{m.at}</span>
        </div>
      );
    case 'agent':
      return (
        <div className={css.agent}>
          <p className={css.meta}><b>{m.agent}</b> · {m.at}</p>
          <p>{m.text}</p>
          {m.calls?.length ? <ul className={css.calls}>{m.calls.map((c, i) => <li key={i}><ToolCall row={c} /></li>)}</ul> : null}
        </div>
      );
    case 'confirm':
      return (
        <div className={css.confirm}>
          <p className={css.meta}><b>{m.agent}</b></p>
          <p>{m.text}</p>
          <div className={css.actions}>
            <button type="button" className={css.primary} disabled={!onConfirm} onClick={onConfirm}>{m.confirmLabel}</button>
            <button type="button" className={css.ghost} disabled={!onDismiss} onClick={onDismiss}>{m.dismissLabel}</button>
          </div>
        </div>
      );
  }
}

export function AgentPanel(p: AgentPanelProps) {
  const [tab, setTab] = useState<'voice' | 'script'>('voice');
  const [draft, setDraft] = useState('');
  return (
    <section className={css.panel} aria-label="Neuro Agent">
      <header className={css.head}>
        <span className={css.avatar}><img src={avatarIcon} alt="" width={16} height={16} /></span>
        <div className={css.titles}><h2 className={css.title}>Neuro Agent</h2><p className={css.sub}>Multi-agent assistant</p></div>
        <span className={`${css.status} ${css[p.status]}`} role="status"><img src={statusDot} alt="" width={6} height={6} />{STATUS[p.status]}</span>
      </header>
      <ul className={css.chips} aria-label="Agents">
        {AGENTS.map((a) => <li key={a} className={css.chip}><img src={chipDot} alt="" width={6} height={6} />{a}</li>)}
      </ul>
      <div className={css.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'voice'} className={css.tab} onClick={() => setTab('voice')}><img src={voiceTabIcon} alt="" width={12} height={12} />Voice</button>
        <button type="button" role="tab" aria-selected={tab === 'script'} className={css.tab} onClick={() => setTab('script')}><img src={scriptTabIcon} alt="" width={12} height={12} />Script</button>
      </div>
      <ol className={css.log} aria-live="polite">
        {p.messages.map((m, i) => <li key={i}><Message m={m} onConfirm={p.onConfirm} onDismiss={p.onDismiss} /></li>)}
      </ol>
      {tab === 'script' && <ScriptBlock lines={p.script ?? []} onRun={p.onRun} />}
      <form className={css.input} onSubmit={(e) => { e.preventDefault(); const t = draft.trim(); if (!p.onSend || !t) return; p.onSend(t); setDraft(''); }}>
        {tab === 'voice' && (
          <button type="button" className={css.mic} aria-label="Talk to the agent" disabled={!p.onMic} onClick={p.onMic} title={p.onMic ? 'Click the mic to talk' : 'Agent not connected yet'}>
            <img src={micIcon} alt="" width={18} height={18} />
          </button>
        )}
        <input className={css.text} aria-label="Message the agent" disabled={!p.onSend} value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder={p.onSend ? 'Type a command' : 'Agent not connected yet'} />
      </form>
    </section>
  );
}
```

`AgentPanel.module.css`:
- Port node `44:271` and its children from the ref (values shown there):
  - panel: white 92%, `1px solid var(--nv-primary)`, radius 12px, padding 20px 20px 16px, gap 14px, flex column
  - avatar: 32px circle, gradient `#2e6b8f → #1f4d66`
  - chips: pill, `#fbf9f5`, border `#c1c7ce`
  - tabs: `#eef0f2` track with a white selected tab (`[aria-selected="true"]`)
  - user bubble: `var(--nv-primary)` with white text, 280px, radius 10px, aligned right
  - confirm: `#e3eef4` with border `rgba(31,86,115,.5)`
  - script block: `#14222c` with `var(--nv-mono)` 11px white
  - input bar: `#e3eef4` pill; mic is a 44px `var(--nv-primary)` circle
  - Tool Call row: `#f3f5f7` per `symbol-tool-call.ref.tsx`
- `.log` scrolls (`overflow:auto; flex:1; min-height:0`).
- `[disabled]` gets `opacity:.5; cursor:not-allowed`.

- [ ] **Step 4: Run them.** `npm test -- agent` → all PASS. Then run `npm test && npx tsc -b && npm run lint`.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaydee/Developer/CalHacks13.0
P="frontend/src/components/agent frontend/src/assets/figma/3f35e.svg frontend/src/assets/figma/c9605.svg frontend/src/assets/figma/78c7f.svg frontend/src/assets/figma/61a1b.svg frontend/src/assets/figma/8e97a.svg frontend/src/assets/figma/6179e.svg frontend/src/assets/figma/941c5.svg frontend/src/assets/figma/2623b.svg frontend/src/assets/figma/bfdea.svg frontend/src/assets/figma/81241.svg"
git add $P && git commit -m "feat(agent): Neuro Agent panel, UI only with props for the agent system (#86)" -- $P
```

---

### Task 3 (be, #11): NiiVue slice panel

**Files:**
- Modify: `frontend/package.json`, `frontend/package-lock.json`, `frontend/src/api/client.ts`
- Create: `frontend/src/viewer/slices.ts`, `frontend/src/viewer/slices.test.ts`, `frontend/src/viewer/MprPanel.tsx`, `frontend/src/viewer/MprPanel.module.css`
- Icons for the view chips and tool strip: frame 03 nodes `43:902`–`43:999` (`c9b37 e74d7 05ed5 c18f8 94482 e5b0c d8034`). Confirm each at its ref line in `docs/figma/03-workspace.ref.tsx` (534–766). Copy only the ones you use.

**Visual reference:** `03-workspace.ref.tsx` lines 399–775 ("Section - CENTRAL…", `col-[4/span_6]`) and the `03-workspace.png` center column.

**Interfaces:**
- Produces:
  - `segUrl(id: string): string`
  - `flairUrl(id: string): string`
  - `MprPanel({ jobId }: { jobId: string })`: the whole center column (MPR header + 3 views + tool strip)
  - `labelColormap()`
  - `windowFor(p, lo, hi)`
  - `sliceOf(frac, n)`
  - `PRESETS`
  - `type Preset`
  - `AXIS_INDEX`
- Consumes:
  - `LAYERS` (`viewer/layers.ts`)
  - `dispatch({ type: 'setSlice', axis, offsetMm }, 'pointer')`
  - The backend already serves `GET /jobs/{id}/flair.nii.gz` and `/seg.nii.gz`. Check first with `curl -sI http://localhost:8000/jobs/sample/seg.nii.gz` (expect 200).

- [ ] **Step 1: Install the dependency.**

```bash
cd /Users/kaydee/Developer/CalHacks13.0/frontend && npm i -E @niivue/niivue@0.69.0
```

Open `node_modules/@niivue/niivue/build/index.d.ts` (or whatever `package.json` `types` points to) and confirm these names, which Step 5 uses:
- `Niivue`, `SLICE_TYPE`, `DRAG_MODE`
- `attachToCanvas`, `loadVolumes`, `setSliceType`, `broadcastTo`, `onLocationChange`
- `setGamma`, `setOpacity`, `updateGLVolume`, `moveCrosshairInVox`
- `scene.crosshairPos`
- `NVImage.setColormapLabel`, `cal_min` / `cal_max`, `robust_min` / `robust_max`, `hdr.dims`

If a name differs, use the installed one and note it in the commit body.

- [ ] **Step 2: Write the failing test** in `frontend/src/viewer/slices.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { flairUrl, segUrl } from '../api/client';
import { labelColormap, sliceOf, windowFor } from './slices';

describe('slices', () => {
  it('label colormap: index = seg label, 0 transparent, colours from layers.ts', () => {
    const cm = labelColormap();
    expect(cm.A[0]).toBe(0);
    expect([cm.R[1], cm.G[1], cm.B[1], cm.A[1]]).toEqual([242, 201, 76, 255]); // edema #F2C94C
    expect([cm.R[2], cm.G[2], cm.B[2]]).toEqual([242, 153, 74]);             // core #F2994A
    expect([cm.R[3], cm.G[3], cm.B[3]]).toEqual([235, 87, 87]);              // enhancing #EB5757
    expect(cm.labels).toHaveLength(4);
  });
  it('window presets are fractions of the robust range', () => {
    expect(windowFor('Brain', 10, 110)).toEqual([10, 110]);
    expect(windowFor('Bone', 10, 110)).toEqual([60, 110]);
  });
  it('slice number is 1-based and clamped', () => {
    expect(sliceOf(0, 155)).toBe(1);
    expect(sliceOf(0.5, 155)).toBe(78);
    expect(sliceOf(1, 155)).toBe(155);
  });
  it('NIfTI urls', () => {
    expect(segUrl('a b')).toMatch(/\/jobs\/a%20b\/seg\.nii\.gz$/);
    expect(flairUrl('x')).toMatch(/\/jobs\/x\/flair\.nii\.gz$/);
  });
});
```

- [ ] **Step 3: Run it.** `npm test -- slices` → FAIL.

- [ ] **Step 4: Implement the helpers.**

`api/client.ts`, next to `modelUrl`:

```ts
export const segUrl = (id: string) => `${API_URL}/jobs/${encodeURIComponent(id)}/seg.nii.gz`;
export const flairUrl = (id: string) => `${API_URL}/jobs/${encodeURIComponent(id)}/flair.nii.gz`;
```

`viewer/slices.ts` (no niivue import, so node vitest can load it):

```ts
import type { Axis } from '../actions/types';
import { LAYERS } from './layers';

export const AXIS_INDEX: Record<Axis, 0 | 1 | 2> = { sagittal: 0, coronal: 1, axial: 2 };

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** NiiVue label colormap for seg.nii.gz: index = seg label (SPEC §7.4), 0 = transparent background. */
export function labelColormap() {
  const cm = { R: [0], G: [0], B: [0], A: [0], labels: [''] };
  for (const l of [...LAYERS].sort((a, b) => a.seg - b.seg)) {
    const [r, g, b] = rgb(l.color);
    cm.R.push(r); cm.G.push(g); cm.B.push(b); cm.A.push(255); cm.labels.push(l.label);
  }
  return cm;
}

export type Preset = 'Brain' | 'Bone' | 'Subdural' | 'Perfusion';
export const PRESETS: readonly Preset[] = ['Brain', 'Bone', 'Subdural', 'Perfusion'];
// shortcut: Figma's CT preset names on an MRI, each a fraction of the FLAIR robust range (no Hounsfield units), rename when presets get a clinical owner
const FRACTION: Record<Preset, [number, number]> = { Brain: [0, 1], Bone: [0.5, 1], Subdural: [0.15, 0.75], Perfusion: [0.3, 0.9] };

export function windowFor(p: Preset, lo: number, hi: number): [number, number] {
  const [a, b] = FRACTION[p];
  return [lo + a * (hi - lo), lo + b * (hi - lo)];
}

/** 1-based slice number for a 0..1 crosshair fraction over n slices. */
export const sliceOf = (frac: number, n: number) => Math.min(n, Math.max(1, Math.floor(frac * n) + 1));
```

Run `npm test -- slices` → 4 PASS.

- [ ] **Step 5: Build `MprPanel`.**

Design:
- Each view is its own `SliceView` with its own Niivue instance. One view can fail and Retry without the others reloading.
- The parent keeps the instances that are ready and links them with `broadcastTo`, which gives one shared crosshair.
- Tool settings are applied to every instance that is ready.

```tsx
import { DRAG_MODE, Niivue, SLICE_TYPE } from '@niivue/niivue';
import { useCallback, useEffect, useRef, useState } from 'react';
import { dispatch } from '../actions/dispatch';
import type { Axis } from '../actions/types';
import { flairUrl, segUrl } from '../api/client';
import { AXIS_INDEX, labelColormap, PRESETS, sliceOf, windowFor, type Preset } from './slices';
import css from './MprPanel.module.css';

interface View { axis: Axis; label: string; type: SLICE_TYPE }
const VIEWS: readonly View[] = [
  { axis: 'axial', label: 'Axial', type: SLICE_TYPE.AXIAL },
  { axis: 'sagittal', label: 'Sagittal', type: SLICE_TYPE.SAGITTAL },
  { axis: 'coronal', label: 'Coronal', type: SLICE_TYPE.CORONAL },
];
const AXES: readonly Axis[] = ['sagittal', 'coronal', 'axial'];

function SliceView({ jobId, view, onNv }: { jobId: string; view: View; onNv: (axis: Axis, nv: Niivue | null) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const nvRef = useRef<Niivue | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [slice, setSlice] = useState({ n: 0, of: 0 });
  const i = AXIS_INDEX[view.axis];

  useEffect(() => {
    let live = true;
    const nv = new Niivue({ backColor: [0.08, 0.13, 0.17, 1], crosshairColor: [0.92, 0.34, 0.34, 1], isResizeCanvas: true });
    setState('loading');
    void (async () => {
      try {
        await nv.attachToCanvas(canvas.current!);
        nv.setSliceType(view.type);
        await nv.loadVolumes([{ url: flairUrl(jobId) }, { url: segUrl(jobId), opacity: 0.6 }]);
        if (!live) return;
        nv.volumes[1].setColormapLabel(labelColormap());
        nv.updateGLVolume();
        const of = nv.volumes[0].hdr!.dims[i + 1];
        const update = () => setSlice({ n: sliceOf(nv.scene.crosshairPos[i], of), of });
        nv.onLocationChange = (d) => {
          update();
          const mm = (d as { mm: ArrayLike<number> }).mm;
          // Keep the store cursor in step (SPEC §7.3); the 3D crosshair (C2) reads it later.
          for (const a of AXES) dispatch({ type: 'setSlice', axis: a, offsetMm: mm[AXIS_INDEX[a]] }, 'pointer');
        };
        update();
        nvRef.current = nv;
        setState('ready');
        onNv(view.axis, nv);
      } catch (e) {
        if (live) { console.error('[mpr]', view.axis, e); setState('error'); }
      }
    })();
    return () => { live = false; nv.onLocationChange = () => {}; nvRef.current = null; onNv(view.axis, null); };
  }, [jobId, view, i, attempt, onNv]);

  const go = (n: number) => {
    const nv = nvRef.current;
    if (!nv) return;
    const d = [0, 0, 0]; d[i] = n - slice.n;
    nv.moveCrosshairInVox(d[0], d[1], d[2]);
  };

  return (
    <figure className={css.view} data-axis={view.axis}>
      <canvas key={attempt} ref={canvas} className={css.canvas} />
      <figcaption className={css.chip}>{view.label}</figcaption>
      {state === 'ready' && (
        <div className={css.sliceBar}>
          <span className={css.mono}>{slice.n} / {slice.of}</span>
          <input type="range" min={1} max={slice.of} value={slice.n} aria-label={`${view.label} slice`} onChange={(e) => go(Number(e.target.value))} />
        </div>
      )}
      {state === 'loading' && <p className={css.overlay}>Loading {view.label.toLowerCase()} slice…</p>}
      {state === 'error' && (
        <div className={css.overlay} role="alert">
          <p>The {view.label.toLowerCase()} view could not load the scan.</p>
          <button type="button" className={css.retry} onClick={() => setAttempt((n) => n + 1)}>Retry</button>
        </div>
      )}
    </figure>
  );
}

export function MprPanel({ jobId }: { jobId: string }) {
  const [nvs, setNvs] = useState<Partial<Record<Axis, Niivue>>>({});
  const onNv = useCallback((axis: Axis, nv: Niivue | null) => setNvs((m) => {
    const next = { ...m };
    if (nv) next[axis] = nv; else delete next[axis];
    return next;
  }), []);
  const [preset, setPreset] = useState<Preset>('Brain');
  const [gamma, setGamma] = useState(1);
  const [mask, setMask] = useState(60);
  const [caliper, setCaliper] = useState(false);

  // One crosshair across the three views (#11).
  useEffect(() => {
    const all = Object.values(nvs);
    for (const nv of all) nv.broadcastTo(all.filter((o) => o !== nv), { '2d': true, '3d': true });
  }, [nvs]);

  // Tool settings apply to every loaded view, including one that just reloaded.
  useEffect(() => {
    for (const nv of Object.values(nvs)) {
      const v = nv.volumes[0];
      [v.cal_min, v.cal_max] = windowFor(preset, v.robust_min, v.robust_max);
      nv.setGamma(gamma);
      nv.setOpacity(1, mask / 100);
      nv.opts.dragMode = caliper ? DRAG_MODE.measurement : DRAG_MODE.contrast;
      nv.updateGLVolume();
    }
  }, [nvs, preset, gamma, mask, caliper]);

  const locked = Object.keys(nvs).length === 3;
  return (
    <section className={css.panel} aria-label="Slice views">
      <header className={css.head}>
        <h2 className={css.title}>Synchronized Multi-Planar Reconstruction</h2>
        <div className={css.presets} role="group" aria-label="Window preset">
          {PRESETS.map((p) => <button key={p} type="button" aria-pressed={preset === p} className={css.preset} onClick={() => setPreset(p)}>{p}</button>)}
        </div>
      </header>
      <div className={css.views}>
        {VIEWS.map((v) => <SliceView key={v.axis} jobId={jobId} view={v} onNv={onNv} />)}
      </div>
      <div className={css.tools}>
        <button type="button" aria-pressed={caliper} className={css.tool} onClick={() => setCaliper((c) => !c)}>Electronic Caliper</button>
        <label className={css.tool}>Contrast / Gamma <input type="range" min={0.3} max={3} step={0.1} value={gamma} onChange={(e) => setGamma(Number(e.target.value))} /></label>
        <label className={css.tool}>Mask Overlay {mask}% <input type="range" min={0} max={100} value={mask} onChange={(e) => setMask(Number(e.target.value))} /></label>
        <span className={locked ? `${css.lock} ${css.on}` : css.lock} role="status">{locked ? '3-Axis Triangulation Locked' : 'Linking views…'}</span>
      </div>
    </section>
  );
}
```

Notes:
- Each view loads the two NIfTIs itself, so the files load 3×. Add the comment `// shortcut: 3 instances load the NIfTIs 3×, share one NVImage when load time hurts` above `SliceView`.
- If the installed d.ts has a dispose or cleanup method on `Niivue`, call it in the effect cleanup.
- Do **not** call `WEBGL_lose_context`. StrictMode remounts on the same canvas, and a lost context cannot be revived.

`MprPanel.module.css`:
- `.views`: `display:grid; grid-template-columns: 1fr 1fr; grid-template-rows: minmax(320px, 1.4fr) minmax(220px, 1fr); gap: 12px`. Axial is the first child with `grid-column: 1 / -1`.
- `.view`: relative, radius 12px, `background: var(--nv-canvas-bg)`, overflow hidden, margin 0.
- `.canvas`: `width:100%; height:100%; display:block`.
- `.chip`, `.sliceBar`, `.overlay`: absolutely positioned over the canvas, per the ref.
- Header and tool strip: card styles from the ref (`#e8eff7` buttons; `[aria-pressed="true"]` is the primary tint).

- [ ] **Step 6: Verify.** Run `npm test && npx tsc -b && npm run lint && npm run build`. Green. Then smoke-test by hand: temporarily mount `<MprPanel jobId="sample" />` in any page on the dev server (`http://localhost:5173`), check that the three views render with the coloured overlay and that clicking one moves the crosshair in the others, then **remove the temporary mount**. T4 mounts it for real.

- [ ] **Step 7: Commit**

```bash
cd /Users/kaydee/Developer/CalHacks13.0
P="frontend/package.json frontend/package-lock.json frontend/src/api/client.ts frontend/src/viewer/slices.ts frontend/src/viewer/slices.test.ts frontend/src/viewer/MprPanel.tsx frontend/src/viewer/MprPanel.module.css"
git add $P && git commit -m "feat(viewer): NiiVue MPR slice panel with synced crosshair and tool strip (#11)" -- $P
```

Add any icon you copied to `$P`.

---

### Task 4 (fe, #85): MRI workspace page (frame 03)

Starts after T1, T2 (`components/agent`) and T3 (`MprPanel`, `segUrl`) are committed. The lead tells you when.

**Files:**
- Modify: `frontend/src/routes/MriWorkspace.tsx`, `frontend/src/routes/MriWorkspace.module.css`

**Visual reference:**
- `03-workspace.ref.tsx`: left column (lines 61–400, Patient Dataset card node `43:770`)
- `03-workspace-right.ref.tsx`: right column node `43:1002`, icons `1dae3 77060 79880 76bfc 49072`
- `03-workspace.png`

**Interfaces:**
- Consumes:
  - `AgentPanel`, `demoMessages(report, 'mri')`, `AgentMessage` (T2)
  - `MprPanel({ jobId })`, `segUrl(id)` (T3)
  - `initCase` (`actions/dispatch.ts`)

- [ ] **Step 1: Load the case and the demo log.**
  - In the `getReport(...).then` callback, after the abort check:

    ```tsx
    initCase({ jobId: id, hasTumor: r.tumorDetected, structureIds: new Set(), bboxMm: r.brain.bboxMm }); // setSlice clamps to the brain box
    setMessages(demoMessages(r, 'mri'));
    ```

  - Add `const [messages, setMessages] = useState<AgentMessage[]>([]);`.
  - Add `const navigate = useNavigate();`.

- [ ] **Step 2: Replace the `ready` grid** (the Scan card and the "Slices … ticket C1" placeholder go away)

```tsx
{report && phase === 'ready' && (
  <main className={css.grid}>
    <div className={css.left}>
      <article className={css.card} aria-label="Patient dataset">
        <header className={css.cardHead}><h2 className={css.cardTitle}>Patient Dataset</h2><span className={css.badge}>Verified NIfTI</span></header>
        <dl className={css.fields}>
          <div><dt>Subject</dt><dd className={css.mono}>{sample ? SAMPLES.find((s) => s.id === id)!.title : report.jobId}</dd></div>
          <div><dt>Shown</dt><dd>FLAIR</dd></div>
          <div><dt>Sequences</dt><dd>{sequenceLine(report.input.sequences)}</dd></div>
          <div><dt>Matrix</dt><dd>{report.input.shape.join(' × ')}</dd></div>
          <div><dt>Voxel spacing</dt><dd>{report.input.spacingMm.join(' × ')} mm</dd></div>
          <div><dt>Model</dt><dd>{report.model.arch} v{report.model.version}</dd></div>
        </dl>
      </article>
      <AgentPanel messages={messages} status="offline"
        onConfirm={() => navigate(`/jobs/${id}/3d`)}
        onDismiss={() => setMessages((m) => m.filter((x) => x.kind !== 'confirm'))} />
    </div>
    <MprPanel jobId={id} />
    <div className={css.right}>
      {/* existing AI Volumetric Analysis <article> unchanged, plus <Legend …/> moved in after the metrics */}
      <article className={css.ctaCard}>
        <p className={css.ctaKicker}>Spatial pipeline action</p>
        <Link className={css.cta} to={`/jobs/${id}/3d`}>
          Place Tumor in 3D Interactive Brain
          <img src={arrowIcon} alt="" width={16} height={16} />
        </Link>
        <div className={css.ctaRow}>
          <a className={css.ghost} href={segUrl(id)} download={`${id}-seg.nii.gz`}>Export NIfTI Mask</a>
          <button className={css.ghost} type="button" disabled title="Not available: the model has no threshold setting">Adjust Threshold</button>
        </div>
      </article>
    </div>
  </main>
)}
```

- [ ] **Step 3: CSS.**
  - `.grid`: `grid-template-columns: minmax(0,3fr) minmax(0,6fr) minmax(0,3fr); align-items: stretch; min-height: calc(100vh - var(--nv-header-h) - var(--nv-footer-h) - 32px)`.
  - `.left`: a flex column, gap 20px. AgentPanel fills the rest of the height (`flex:1; min-height:0`).
  - Restyle the cards to the frame (`rgba(251,249,245,.86)`, blur 9px, border `rgba(193,199,206,.3)`, radius 12px).
  - Below 1100px, stack the three columns: center first, then right, then left.

- [ ] **Step 4: Verify.**
  - Run `npm test && npx tsc -b && npm run lint && npm run build`. Green.
  - On `/jobs/sample/mri` in the dev server:
    - 3 slice views render;
    - the agent panel shows the vision line and the confirm;
    - Place in 3D (confirm or CTA) opens `/jobs/sample/3d`;
    - Export downloads `.nii.gz`;
    - Adjust Threshold is disabled with its title;
    - `grep -n "Glioblastoma\|Tesla\|confidence" src/routes/MriWorkspace.tsx` → none.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaydee/Developer/CalHacks13.0
P="frontend/src/routes/MriWorkspace.tsx frontend/src/routes/MriWorkspace.module.css"
git add $P && git commit -m "feat(mri): MRI workspace page per Figma frame 03 (#85)" -- $P
```

Add any icon you copied to `$P`.

---

### Task 5 (ai, #12 #15 #71): Scene applies X-Ray opacity, Hide Brain, explode and layers

**Files:**
- Create: `frontend/src/viewer/applyView.ts`, `frontend/src/viewer/applyView.test.ts`
- Modify:
  - `frontend/src/viewer/loadCase.ts`: add `brainLeft`/`brainRight` to `CaseScene`
  - `frontend/src/viewer/loadCase.test.ts`: one assertion
  - `frontend/src/actions/store.ts`: layers default on
  - `frontend/src/viewer/CaseCanvas.tsx`: replace the tumor-visibility effect

**Why these choices:**
- Tumor meshes are children of a hemisphere **group**. Hiding the group would hide the tumor too, so Hide Brain hides the brain **meshes**.
- With `layers` defaulting to all false, a tumor would stay hidden after `focusTumor`. The default becomes all true, so `resetView` restores it too.

**Interfaces:**
- Produces:
  - `CaseScene.brainLeft: THREE.Mesh`, `CaseScene.brainRight: THREE.Mesh`
  - `applyView(cs: CaseScene, v: ViewInput): void`
  - `EXPLODE_MM = 40`
- Store semantics T6 relies on:
  - tumor layer `l` visible ⇔ `tumorRevealed && layers[l]`;
  - brain material opacity = `mode === 'xray' ? brainOpacity : 1`;
  - brain mesh visible ⇔ `!hidden[side]`;
  - hemispheres offset ±`explodeAmount * 40` mm on RAS x.

- [ ] **Step 1: Write the failing test** in `frontend/src/viewer/applyView.test.ts`

```ts
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Report } from '../api/types';
import { applyView, EXPLODE_MM, type ViewInput } from './applyView';
import { buildCaseScene } from './loadCase';

const mesh = (name: string) => Object.assign(new THREE.Mesh(new THREE.BufferGeometry()), { name });
const glb = () => { const g = new THREE.Group(); ['brain_left', 'brain_right', 'edema', 'core', 'enhancing'].forEach((n) => g.add(mesh(n))); return g; };
const report = { tumorDetected: true, side: 'right', centroidMm: [150, 110, 70], brain: { centroidMm: [120, 105, 76], bboxMm: { min: [53, 21, 10], max: [188, 196, 141] } } } as Report;
const base: ViewInput = { tumorRevealed: true, layers: { edema: true, core: true, enhancing: true }, mode: 'whole', brainOpacity: 0.3, hidden: { left: false, right: false }, explodeAmount: 0 };
const scene = (v: Partial<ViewInput>) => { const cs = buildCaseScene(glb(), report); applyView(cs, { ...base, ...v }); return cs; };
const mat = (m: THREE.Mesh) => m.material as THREE.MeshStandardMaterial;

describe('applyView', () => {
  it('a tumor layer shows only when revealed and its layer is on', () => {
    expect(scene({}).tumor.core!.visible).toBe(true);
    expect(scene({ tumorRevealed: false }).tumor.core!.visible).toBe(false);
    const cs = scene({ layers: { edema: false, core: true, enhancing: true } });
    expect([cs.tumor.edema!.visible, cs.tumor.core!.visible]).toEqual([false, true]);
  });
  it('x-ray makes the brain transparent at brainOpacity; whole is opaque', () => {
    const x = scene({ mode: 'xray', brainOpacity: 0.4 });
    expect([mat(x.brainLeft).transparent, mat(x.brainLeft).opacity, mat(x.brainLeft).depthWrite]).toEqual([true, 0.4, false]);
    const w = scene({ mode: 'whole', brainOpacity: 0.4 });
    expect([mat(w.brainRight).transparent, mat(w.brainRight).opacity]).toEqual([false, 1]);
  });
  it('hiding the brain keeps the tumor visible', () => {
    const cs = scene({ hidden: { left: true, right: true } });
    expect([cs.brainLeft.visible, cs.brainRight.visible, cs.tumor.edema!.visible]).toEqual([false, false, true]);
  });
  it('explode moves the hemispheres apart along RAS x (+x = patient right)', () => {
    const cs = scene({ explodeAmount: 0.5 });
    expect(cs.hemiLeft.position.x).toBe(-0.5 * EXPLODE_MM);
    expect(cs.hemiRight.position.x).toBe(0.5 * EXPLODE_MM);
  });
});
```

Also add this to `loadCase.test.ts` in the 'puts tumor layers…' test:

```ts
expect(s.brainLeft.name).toBe('brain_left');
expect(s.brainRight.parent).toBe(s.hemiRight);
```

- [ ] **Step 2: Run them.** `npm test -- applyView loadCase` → FAIL.

- [ ] **Step 3: Implement.**

`loadCase.ts`:
- interface: `world: …; hemiLeft; hemiRight; brainLeft: THREE.Mesh; brainRight: THREE.Mesh; tumorCenter; cursorMarker; tumor`
- return: `return { world, hemiLeft, hemiRight, brainLeft: left!, brainRight: right!, tumorCenter, cursorMarker, tumor };`

`store.ts`: `layers: { edema: true, core: true, enhancing: true },`

`applyView.ts`:

```ts
import type * as THREE from 'three';
import type { ViewerState } from '../actions/types';
import type { Layer } from './layers';
import type { CaseScene } from './loadCase';

/** Hemisphere shift at explode 100 %, per side, in RAS mm. */
export const EXPLODE_MM = 40;

export type ViewInput = Pick<ViewerState, 'tumorRevealed' | 'layers' | 'mode' | 'brainOpacity' | 'hidden' | 'explodeAmount'>;

/** Store state → case scene graph. Plain three.js so node vitest covers it. */
export function applyView(cs: CaseScene, v: ViewInput): void {
  for (const [l, m] of Object.entries(cs.tumor) as [Layer, THREE.Mesh][]) m.visible = v.tumorRevealed && v.layers[l];
  const xray = v.mode === 'xray';
  for (const [m, side] of [[cs.brainLeft, 'left'], [cs.brainRight, 'right']] as const) {
    m.visible = !v.hidden[side];
    const mat = m.material as THREE.MeshStandardMaterial;
    if (mat.transparent !== xray) mat.needsUpdate = true; // transparency changes the shader program
    mat.transparent = xray;
    mat.opacity = xray ? v.brainOpacity : 1;
    mat.depthWrite = !xray;
  }
  cs.hemiLeft.position.x = -v.explodeAmount * EXPLODE_MM;
  cs.hemiRight.position.x = v.explodeAmount * EXPLODE_MM;
}
```

`CaseCanvas.tsx`:
- Remove `const revealed = …` and the effect commented `// shortcut: st.layers ignored…`.
- Add:

```tsx
import { useShallow } from 'zustand/react/shallow';
import { applyView } from './applyView';
// …inside CaseScene:
const view = useViewer(useShallow((s) => ({ tumorRevealed: s.tumorRevealed, layers: s.layers, mode: s.mode, brainOpacity: s.brainOpacity, hidden: s.hidden, explodeAmount: s.explodeAmount })));
useLayoutEffect(() => applyView(cs, view), [cs, view]);
```

- Above the focusTumor effect, add `// shortcut: frames the unexploded tumor position, add the hemisphere offset if focus-while-exploded looks wrong`.

- [ ] **Step 4: Run them.** `npm test` → all PASS, including `dispatch.test.ts`, which must not depend on the layer default. Then `npx tsc -b && npm run lint`.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaydee/Developer/CalHacks13.0
P="frontend/src/viewer/applyView.ts frontend/src/viewer/applyView.test.ts frontend/src/viewer/loadCase.ts frontend/src/viewer/loadCase.test.ts frontend/src/actions/store.ts frontend/src/viewer/CaseCanvas.tsx"
git add $P && git commit -m "feat(viewer): case scene applies x-ray opacity, hide brain, explode and layer toggles (#12 #15 #71)" -- $P
```

---

### Task 6 (fe, #87): 3D page (frame 04)

Starts after T2, T4 and T5 are committed.

**Files:**
- Modify: `frontend/src/routes/Brain3D.tsx`, `frontend/src/routes/Brain3D.module.css`
- Copy icons from `docs/figma/assets/`. Node map: `docs/figma/ASSETS.md` § Frame 04. Confirm each at its ref line.

  | File | Node | Use |
  |---|---|---|
  | `e71a8` | `43:1244` | toggle icon |
  | `73f19` | `43:1249` | hide (already present) |
  | `82e7a` | `43:1254` | focus |
  | `7e35a` | `45:134` | toast check (already present) |

**Visual reference:** `04-explore.ref.tsx` and `04-explore.png`:
- left column: pathology card, spatial toggles at lines 330–400;
- center: canvas, status pill, toast `45:134`, slider, structures bar;
- right: webcam card and the agent panel at lines ~590–760.

**Interfaces:**
- Consumes:
  - `AgentPanel`, `demoMessages(report, '3d')` (T2)
  - T5 store semantics
  - `StatusPill`, `ExplodeSlider` from `learn/`
  - `LAYERS`
  - `dispatch`

- [ ] **Step 1: Reveal on arrival.**
  - In the `getReport` then-callback after `initCase(...)`:

    ```tsx
    if (report.tumorDetected) dispatch({ type: 'focusTumor' }, 'pointer'); // "Place in 3D" lands with the tumor placed
    ```

  - Read store state: `const { mode, brainOpacity, hidden, layers, tumorRevealed } = useViewer(useShallow((s) => ({ mode: s.mode, brainOpacity: s.brainOpacity, hidden: s.hidden, layers: s.layers, tumorRevealed: s.tumorRevealed })));`

- [ ] **Step 2: Replace the `<main>` body** with three columns. Keep the existing `Result` fetch, `LoadBoundary`, error states and `modelFailed` logic.

```tsx
<main className={css.grid}>
  <aside className={css.left} aria-label="Case">
    {report && (
      <>
        <article className={css.card}>
          <p className={css.kicker}>Pathology</p>
          <h2 className={css.headline}>{headline(report)}</h2>
          <dl className={css.rows}>
            <dt>Side</dt><dd>{sideLabel(report.side)}</dd>
            {report.tumorDetected && <><dt>Whole tumor</dt><dd>{cm3(report.volumesCm3.whole)}</dd>
              <dt>Tumor core</dt><dd>{cm3(report.volumesCm3.core)}</dd>
              <dt>Enhancing</dt><dd>{cm3(report.volumesCm3.enhancing)}</dd>
              <dt>Lesions</dt><dd>{report.lesionCount}</dd></>}
          </dl>
        </article>
        <section className={css.card} aria-label="Spatial controls">
          <div className={css.toggles}>
            <button type="button" className={css.toggle} aria-pressed={mode === 'xray'} disabled={modelFailed}
              onClick={() => act({ type: 'setMode', mode: mode === 'xray' ? 'whole' : 'xray' })}>
              Brain Opacity <span className={css.mono}>{mode === 'xray' ? Math.round(brainOpacity * 100) : 100}</span>
            </button>
            <button type="button" className={css.toggle} disabled title="Needs Cutaway (#16)">Slices Intersect</button>
            <button type="button" className={css.toggle} aria-pressed={hidden.left && hidden.right} disabled={modelFailed}
              onClick={() => { const show = hidden.left && hidden.right; act({ type: 'setHemisphereVisible', side: 'left', visible: show }); act({ type: 'setHemisphereVisible', side: 'right', visible: show }); }}>
              Hide Brain
            </button>
            <button type="button" className={`${css.toggle} ${css.accent}`} disabled={!report.tumorDetected || modelFailed}
              title={report.tumorDetected ? undefined : 'No tumor detected in this scan'} onClick={() => act({ type: 'focusTumor' })}>
              Focus Tumor
            </button>
          </div>
          {mode === 'xray' && (
            <input type="range" min={0} max={100} value={Math.round(brainOpacity * 100)} aria-label="Brain opacity"
              onChange={(e) => act({ type: 'setOpacity', value: Number(e.target.value) / 100 })} />
          )}
          {!report.tumorDetected && <p className={css.note}>No tumor detected in this scan</p>}
        </section>
        <Link className={css.back} to={`/jobs/${id}/mri`}>Analyze Cross-Sections</Link>
      </>
    )}
  </aside>

  <section className={css.stage} aria-label="3D brain">
    {/* loading / unknown / offline / error blocks unchanged */}
    {report && (
      <>
        <LoadBoundary key={id} id={id} onFail={(f) => setFailedId(f ? id : null)}>
          <Suspense fallback={<p className={css.loading}>Loading 3D brain…</p>}>
            <CaseCanvas jobId={id} report={report} onLayers={setLayers} />
          </Suspense>
        </LoadBoundary>
        {!modelFailed && (
          <>
            <div className={css.pill}><StatusPill /></div>
            {report.tumorDetected && tumorRevealed && (
              <div className={css.toast} role="status">
                <img src={checkIcon} alt="" width={14} height={14} />
                Tumor placed on the 3D brain · {sideLabel(report.side)} · {cm3(report.volumesCm3.whole)}
                <button type="button" className={css.undo} onClick={() => act({ type: 'resetView' })}>Undo</button>
              </div>
            )}
            <div className={css.explode}><ExplodeSlider /></div>
            <div className={css.structures} role="group" aria-label="Tumor layers">
              {LAYERS.map((l) => (
                <button key={l.layer} type="button" className={css.layer} aria-pressed={!!layers[l.layer] && !!available[l.layer]}
                  disabled={!available[l.layer]} title={available[l.layer] ? undefined : report.tumorDetected ? 'Not in this case' : 'No tumor detected in this scan'}
                  onClick={() => act({ type: 'setLayerVisible', layer: l.layer, visible: !layers[l.layer] })}>
                  <span className={css.swatch} style={{ background: l.color }} />{l.label}
                </button>
              ))}
            </div>
          </>
        )}
        {message && !message.ok && <p className={css.status} role="status">{message.message}</p>}
      </>
    )}
  </section>

  <aside className={css.right} aria-label="Assistants">
    <article className={css.card}>
      <p className={css.kicker}>Gesture control</p>
      <p className={css.webcam}>Webcam off</p>
      <p className={css.note}>Hand gestures arrive with issue #18.</p>
    </article>
    {report && <AgentPanel messages={demoMessages(report, '3d')} status="offline" />}
  </aside>
</main>
```

Rename the existing `layers` useState (the `onLayers` result) to `available`/`setAvailable` and pass `onLayers={setAvailable}`. Remove the `Legend` import and the old chips (Show tumor / Reset view); the toggles replace them. `checkIcon` is `../assets/figma/7e35a.svg`.

- [ ] **Step 3: CSS.**
  - `.grid`: `minmax(0,3fr) minmax(0,6fr) minmax(0,3fr)`, full height under the header.
  - `.stage`: relative and dark (`var(--nv-canvas-bg)`), radius 12px. `.pill` sits top-left, `.toast` top-center, `.explode` bottom-left, `.structures` bottom-center, all absolute and per the ref.
  - `.toggles`: a 2×2 grid; button styles follow ref lines 332–390 (`#e8eff7`; pressed `rgba(198,231,255,.3)` with a primary border).
  - Below 1100px, stack: stage, left, right.

- [ ] **Step 4: Verify.**
  - Run `npm test && npx tsc -b && npm run lint && npm run build`. Green.
  - On `/jobs/sample/3d`:
    - the tumor is placed and the camera flies to it;
    - the toast shows, and Undo hides the tumor and resets;
    - Brain Opacity → x-ray, and the slider changes it;
    - Hide Brain leaves only the tumor;
    - Explode 0→100 splits the hemispheres;
    - each layer chip toggles its mesh.
  - With a no-tumor job, Focus Tumor and the chips are disabled and the reason shows.

- [ ] **Step 5: Commit**

```bash
cd /Users/kaydee/Developer/CalHacks13.0
P="frontend/src/routes/Brain3D.tsx frontend/src/routes/Brain3D.module.css"
git add $P && git commit -m "feat(3d): 3D page per Figma frame 04 with spatial toggles and agent panel (#87)" -- $P
```

Add any icon you copied to `$P`.

---

### Task 7 (qa): Browser verification

Starts when the lead says T1–T6 and T8 are committed.

**Files:** Create `docs/qa/2026-10-24-w1/README.md` and screenshots in that dir. The format is the same as `docs/qa/2026-10-23-learn/README.md`.

- [ ] **Step 1: Run the automated checks.** From `frontend/`, run `npm test`, `npx tsc -b`, `npm run build` and `npm run lint`. Record counts and HEAD sha.

- [ ] **Step 2: Do the browser pass.** Use the dev server on `:5173` (already running; do not start another) and the backend on `:8000`. Use Chrome tools with screenshots for each row, and record a gif of the dashboard → upload → mri → 3d walk.

| # | Check |
|---|---|
| 1 | `/` dashboard: empty state with no storage; New menu opens and closes on outside click; New → MRI Workspace → `/upload`; New → Learning Mode → `/learn/<id>` and a card appears on `/` |
| 2 | Upload a real 4-file case → processing → lands on `/jobs/<id>/mri`; the dashboard shows the job card; the sample link also adds a card |
| 3 | Nav has only MRI Workspace + Learning Mode; no Explore, no Help; MRI Workspace with no job in the URL → `/upload` |
| 4 | `/jobs/sample/results` → `/jobs/sample/mri`, `/jobs/sample/explore` → `/jobs/sample/3d` (URL replaced) |
| 5 | `/mri` layout vs `docs/figma/03-workspace.png` (3/6/3 columns, cards, agent panel, tool strip) |
| 6 | 3 slice views with coloured overlay; clicking one moves the crosshair in the other two; slice `n / N` updates; slider moves the slice |
| 7 | Window presets, gamma, mask %, caliper each change the views; "3-Axis Triangulation Locked" after load |
| 8 | Agent panel: vision line from the report, confirm → `/3d`, Not now removes it; input/mic/Run disabled with "Agent not connected yet"; no key names on screen |
| 9 | Export NIfTI Mask downloads; Adjust Threshold disabled with its title |
| 10 | `/3d` layout vs `docs/figma/04-explore.png` |
| 11 | Arrival: tumor placed, camera on tumor, toast; Undo resets |
| 12 | Brain Opacity, Hide Brain, Focus Tumor, Explode, layer chips each change the scene; Slices Intersect disabled with "Needs Cutaway (#16)" |
| 13 | No-tumor case (if a no-tumor job exists; else mark N/A): controls disabled, reason shown, "No tumor detected" wording |
| 14 | Failure paths: stop the backend → offline + Retry on `/mri` and `/3d`; rename `seg.nii.gz` is not possible client-side, so block the URL in DevTools (Network request blocking) → each slice view shows its own error + Retry while the other columns work |
| 15 | No placeholder data anywhere: no Glioblastoma, Grade, confidence %, patient name, 3.0 Tesla |
| 16 | Console clean apart from known three/drei deprecation warnings |

- [ ] **Step 3: Report.** Write the README (table with PASS/FAIL + evidence file per row, totals). Commit it:

```bash
cd /Users/kaydee/Developer/CalHacks13.0
git add docs/qa/2026-10-24-w1 && git commit -m "docs(qa): W1 browser verification" -- docs/qa/2026-10-24-w1
```

Then `hc send lead "T7 <PASS|FAIL> <n>/<16>, sha <sha>, failures: <rows>"`. qa does not fix code.
