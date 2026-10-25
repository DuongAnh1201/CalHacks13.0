# Presence + 3D Cursors (case pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans, inline, with the overrides in "Worker rules" below. Steps use checkbox (`- [ ]`) syntax. Tick your own boxes in this file when a step is done, and commit the ticks with your task.

**Goal:** Remove Learning Mode from the app (T0). Then, in a live session of the sample case, people see who is online (heartbeat-based, expires) on `/jobs/sample/mri` and `/3d`, and see each other's pointer as a live 3D dot on the model on `/jobs/sample/3d`.

**Architecture:**
- Presence uses `@convex-dev/presence`, wrapped in our own token-checked functions. A thin client heartbeat loop runs on the existing `ConvexClient`.
- Cursors live in their own `cursors` table, one row per participant. Each row stores `{node, localMm}`: the hit point in the hit mesh's local frame. Every receiver re-projects that point through its own scene, so cursors stay correct even when explode settings differ.
- Session create/join/follow (W2) is unchanged.
- Learning Mode (`/learn`) is deleted from the frontend in T0. `/learn` links redirect to `/`. Backend `/learn` handling (agent eval cases, MCP page enum, export guards) stays as dead input; removing it is a follow-up.

**Tech Stack:**
- Convex 1.48 + `@convex-dev/presence@0.4.0`, convex-test + vitest (edge-runtime).
- React 19, react-three-fiber 9, drei 10, three 0.186, zustand 5.
- Frontend vitest uses the node env, runs `src/**/*.test.ts` only, and has no DOM.

Spec: `docs/superpowers/specs/2026-10-24-presence-cursors-design.md` (revised: Learning Mode removed, T0; reconciled with main, spec §R → tasks R1–R5 below. **T0–T7 are done; only R1–R5 are open.**)

## Global Constraints

- **Validation:** every new public Convex function validates its args.
- **Auth:** the existing `{ sessionId, participantToken }` pair, checked with `requireSessionMember` (`convex/lib/auth.ts`). A bad token throws `NOT_AUTHENTICATED`; an ended session throws `SESSION_ENDED`.
- **Presence identity** comes only from the token, never from client args: `roomId = session._id`, `userId = participant._id`.
- **Errors:** throw with `appError(code, message)` (`convex/lib/errors.ts`). Bad input → `INVALID_ARGUMENT`.
- **Limits:**
  - `clientId`: 1–64 chars.
  - Cursor node name: 1–128 chars.
  - `localMm`: exactly 3 finite numbers.
- **Cursor sends:** ≤ 10 Hz (trailing 100 ms throttle), only on change, best-effort (errors are swallowed).
- **Presence heartbeat:** interval 10 000 ms. The component times a tab out after 2.5 × interval.
- **Frontend Convex types:** no codegen. Use `anyApi` plus hand-written mirror types in `frontend/src/share/types.ts`.
- **Sharing scope:** sample case only (`jobId === 'sample'`), as in W2. **Superseded by R4:** any case the session reviews (`stored.jobId`), as on main.
- **Out of scope:**
  - Cursors on `/mri`. Backend `/learn` cleanup (`convex/agent/eval/*`, `convex/mcp/*`, `convex/exportDoc.ts`, `convex/lib/export*.ts`, `backend/atlas/*`).
  - Only T0 (fe) touches the Learning Mode files. Nobody deletes `frontend/public/atlas/structures.json` or `frontend/src/content/anatomy.json` (`convex/mcp/data.ts` imports both).
  - Do not touch `share/sceneSync.ts`, `share/useShareSync.ts`, `share/useMprShare.ts`, `convex/lib/viewCommands.ts`, or the fields of the `sessions` table.
- **Gates:**
  - Root: `npm run typecheck`, `npm test`.
  - Frontend: `npm --prefix frontend test`, `npm --prefix frontend run build`.

## Worker rules (every worker, every task)

- **One shared checkout.** Work in `/Users/kaydee/Developer/CalHacks13.0` on branch `agents/presence-cursors`.
  - Never run `git switch`, `checkout`, `stash`, `reset`, `rebase`, `merge`, `push`, or `git add -A` / `git add .`.
  - Stage only your task's files, by path.
- **Superpowers inline only:** run superpowers:executing-plans inline in your own session. No subagent-driven-development, no subagents, no worktree.
- **executing-plans overrides:** no worktree, no ledger, no final review, no finishing-a-development-branch, no push.
- **Decide routine things yourself.** Coordinate hand-offs and review requests directly with peers.
- **GitNexus:**
  - Run `impact({target, direction: "upstream"})` before editing an existing function or component.
  - Run `detect_changes()` before every commit.
  - No GitNexus MCP in your tool? Grep callers instead (`grep -rn "<symbol>" convex frontend/src`) and put the result in your done message.
  - Never run `gitnexus analyze`; lead re-indexes.
  - If `impact` reports HIGH or CRITICAL: stop and message lead.
- **Commit trailer:** every commit message ends with
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
- **Messaging:** `hc send <label> "<msg>"`. Labels: `lead` (orchestrator), `be`, `fe`, `ai`, `qa`.
  - Message **lead** only for: completed work (commit hash + test count), an unresolved blocker, or an important decision that needs user input. No chatter or progress updates.
  - Message **qa** when a task is ready for review.
  - Message a peer only when you need something from them, or when the "Ownership and order" table says they wait on you.
- **Secrets:** never print, log or commit `.env*` contents or tokens.
- **Reporting:** report failures verbatim. Never claim a gate is green without its output.

## Ownership and order

| Task | Owner | Depends on | Files |
|---|---|---|---|
| T0 Remove Learning Mode | fe | – | delete `frontend/src/routes/Learn.tsx` + css, `frontend/src/learn/*` (move `ExplodeSlider`, `StatusPill` + css to `frontend/src/components/`), `frontend/src/viewer/AtlasCanvas.tsx` + css, `anatomy.ts`, `anatomy.test.ts`, `atlasData.test.ts`, `frontend/src/content/index.ts`, `frontend/public/atlas/brain_atlas.glb`; modify `frontend/src/App.tsx`, `routes/legacy.tsx`, `legacy.test.ts`, `routes/Home.tsx`, `Home.module.css`, `home/workspaces.ts`, `workspaces.test.ts`, `routes/Brain3D.tsx`, `actions/dispatch.ts`, `README.md` |
| T1 Presence server | be | – | `package.json`, `package-lock.json`, `convex/convex.config.ts`, `convex/_generated/*`, `vitest.config.ts`, `convex/presence.ts`, `convex/tests/presence.test.ts` |
| T2 Cursors server | be | T1 committed | `convex/schema.ts`, `convex/cursors.ts`, `convex/sessions.ts` (`end` only), `convex/tests/cursors.test.ts`, `docs/CONVEX_BACKEND.md` |
| T3 Cursor math + types | ai | – | `frontend/src/share/cursorSync.ts`, `cursorSync.test.ts`, `frontend/src/share/types.ts`, `frontend/src/viewer/glbNames.test.ts` |
| T4 Presence client + store + face pile | fe | T0 + T3 committed | `frontend/src/share/presence.ts`, `presence.test.ts`, `client.ts`, `store.ts`, `store.test.ts`, `FacePile.tsx`, `SharePopover.tsx`, `SharePopover.module.css`, `frontend/src/components/TopNavBar.tsx` |
| T5 Remote cursors in 3D | ai | T4 committed | `frontend/src/share/RemoteCursors.tsx`, `RemoteCursors.module.css`, `frontend/src/viewer/CaseCanvas.tsx` |
| T6 Review each task | qa | each task | none |
| T7 Gates + two-browser check | qa (lead deploys) | T0–T5 PASS | `docs/qa/2026-10-24-presence-cursors/README.md` |

- be, ai and fe start at once (fe on T0).
- After T0, fe may write T4 code against the T3 interfaces below right away. Run `npm --prefix frontend test` only after ai reports T3 done.
- No unit gate touches the network. A running Convex deployment is needed only for T7.

---

### Task 0: Remove Learning Mode from the app (fe)

User decision (2026-10-24): Learning Mode is redundant next to the MRI flow, so delete it. The app becomes the MRI workspace flow only (Home → Upload → Processing → `/mri` → `/3d`).

- **Frontend only.** Backend `/learn` handling stays for now and is harmless once no page sends it: the agent eval `/learn` cases, the `convex/mcp` page enum, the `exportDoc` / `exportReport` / `exportMarkdown` guards, and `backend/atlas/build_atlas.py`. Removing it is a separate follow-up, because it changes eval thresholds.
- **Keep two data files.** `convex/mcp/data.ts` imports `frontend/public/atlas/structures.json` and `frontend/src/content/anatomy.json` for the MCP `explain_structure` tool. Deleting either breaks the Convex build. Moving them under `convex/` belongs to the backend follow-up.
- **Keep** the reducer actions `selectStructure`, `setIsolate` and `hiddenStructures` in `frontend/src/actions/*`. They are part of the agent/MCP action vocabulary (`convex/mcp/types.ts`, `convex/agent/eval/cases.ts`).

**Files:**
- Delete:
  - `frontend/src/routes/Learn.tsx`, `Learn.module.css`
  - `frontend/src/learn/InfoPanel.*`, `LearnToolbar.*`, `StructureTree.*`, `filter.ts`, `filter.test.ts`
  - `frontend/src/viewer/AtlasCanvas.tsx`, `AtlasCanvas.module.css`, `anatomy.ts`, `anatomy.test.ts`, `atlasData.test.ts`
  - `frontend/src/content/index.ts` (keep `anatomy.json`)
  - `frontend/public/atlas/brain_atlas.glb` (10.4 MB; keep `structures.json`)
- Move (`git mv`; Brain3D still uses both):
  - `frontend/src/learn/ExplodeSlider.tsx` + `.module.css` → `frontend/src/components/`
  - `frontend/src/learn/StatusPill.tsx` + `.module.css` → `frontend/src/components/`
- Modify:
  - `frontend/src/App.tsx`
  - `frontend/src/routes/legacy.tsx`, `legacy.test.ts`
  - `frontend/src/routes/Home.tsx`, `Home.module.css`
  - `frontend/src/home/workspaces.ts`, `workspaces.test.ts`
  - `frontend/src/routes/Brain3D.tsx` (two imports)
  - `frontend/src/actions/dispatch.ts` (one comment)
  - `README.md`
- Not yours: `frontend/src/viewer/CaseCanvas.tsx` line 19 still mentions AtlasCanvas in a comment. ai fixes it in T5.

**Interfaces:**
- Produces:
  - `WorkspaceKind = 'mri'`.
  - `/learn` and `/learn/*` redirect to `/`.
  - `ExplodeSlider` and `StatusPill` live in `frontend/src/components/`.

- [x] **Step 1: Impact**

Run GitNexus `impact` upstream on `AtlasCanvas`, `ExplodeSlider`, `StatusPill`, `Learn`, `listWorkspaces` and `hrefOf`. Run it on `Home` too, and grep (`grep -rn "hrefOf\|from '../learn\|from '../content\|viewer/anatomy\|AtlasCanvas" frontend/src`), because the index misses some importers.

Expected: everything is reached only from `routes/Learn.tsx`, except that `Brain3D.tsx` imports `ExplodeSlider` / `StatusPill` and `Home.tsx` imports `hrefOf`. Report it.

- [x] **Step 2: Failing tests first**

In `frontend/src/routes/legacy.test.ts`, append:

```ts
it('/learn redirects home', () => {
  expect(target('/learn')).toBe('/');
  expect(target('/learn/ab12cd34')).toBe('/');
});
```

In `frontend/src/home/workspaces.test.ts`:

1. Replace the `'links each kind to its page'` test with:

```ts
  it('links a workspace to its MRI page', () => {
    expect(hrefOf(w('j1', 0))).toBe('/jobs/j1/mri');
  });
```

2. In `'drops rows that are not workspaces'`, add an old Learn row to the stored list. It must be dropped:

```ts
    const s = fake(); s.setItem('nv.workspaces', JSON.stringify([w('a', 1), { id: 3 }, null, { id: 'x', kind: 'chat' }, { id: 'l', kind: 'learn', name: 'Learning Mode', openedAt: 2 }]));
```

Run: `npm --prefix frontend test -- src/routes/legacy.test.ts src/home/workspaces.test.ts`
Expected: FAIL on the `/learn` redirect and on the learn row.

- [x] **Step 3: Delete and move**

```bash
git mv frontend/src/learn/ExplodeSlider.tsx frontend/src/learn/ExplodeSlider.module.css frontend/src/learn/StatusPill.tsx frontend/src/learn/StatusPill.module.css frontend/src/components/
git rm -rq frontend/src/learn frontend/src/routes/Learn.tsx frontend/src/routes/Learn.module.css frontend/src/viewer/AtlasCanvas.tsx frontend/src/viewer/AtlasCanvas.module.css frontend/src/viewer/anatomy.ts frontend/src/viewer/anatomy.test.ts frontend/src/viewer/atlasData.test.ts frontend/src/content/index.ts frontend/public/atlas/brain_atlas.glb
```

The moved files import `../actions/...` and `./X.module.css`. Both paths still resolve from `components/`.

In `frontend/src/routes/Brain3D.tsx`:
- `import { ExplodeSlider } from '../learn/ExplodeSlider';` → `import { ExplodeSlider } from '../components/ExplodeSlider';`
- `import { StatusPill } from '../learn/StatusPill';` → `import { StatusPill } from '../components/StatusPill';`

- [x] **Step 4: Routes**

In `frontend/src/App.tsx`, delete `import Learn from './routes/Learn';` and the two `/learn` route lines.

In `frontend/src/routes/legacy.tsx`, replace the comment and array:

```tsx
// Old links keep working: /results became /mri, /explore became /3d (W1); Learning Mode was removed (presence plan T0).
export const legacyRoutes: RouteObject[] = [
  { path: '/jobs/:id/results', element: <Navigate to="../mri" relative="path" replace /> },
  { path: '/jobs/:id/explore', element: <Navigate to="../3d" relative="path" replace /> },
  { path: '/learn/*', element: <Navigate to="/" replace /> },
];
```

- [x] **Step 5: Workspaces**

In `frontend/src/home/workspaces.ts`:

```ts
export type WorkspaceKind = 'mri';
```

```ts
  return !!w && typeof w.id === 'string' && w.kind === 'mri' && typeof w.openedAt === 'number';
```

```ts
export const hrefOf = (w: Workspace) => `/jobs/${w.id}/mri`;
```

Old Learn rows in a browser's localStorage are then dropped by `listWorkspaces`, and the next save writes the list back without them.

- [x] **Step 6: Home**

Replace `frontend/src/routes/Home.tsx`. This drops the Learning Mode menu item, the empty-state button, and the filter nav, which is pointless with one kind:

```tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import brainIcon from '../assets/figma/664bf.svg';
import { ApiError, getReport } from '../api/client';
import { Footer } from '../components/Footer';
import { TopNavBar } from '../components/TopNavBar';
import { ago, hrefOf, listWorkspaces, removeWorkspace, saveWorkspace, type Workspace } from '../home/workspaces';
import css from './Home.module.css';

const MRI = { label: 'MRI Workspace', hint: 'Upload a brain MRI and see the segmentation' };

export default function Home() {
  const [items, setItems] = useState(() => listWorkspaces());

  useEffect(() => {
    const ctl = new AbortController();
    for (const row of listWorkspaces()) {
      getReport(row.id, ctl.signal).catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        if (!(e instanceof ApiError) || e.status !== 404) return;
        removeWorkspace(row.id);
        setItems((list) => list.filter((x) => x.id !== row.id));
      });
    }
    return () => ctl.abort();
  }, []);

  const open = (w: Workspace) => saveWorkspace({ ...w, openedAt: Date.now() });

  return (
    <div className={css.page}>
      <TopNavBar />
      <div className={css.body}>
        <aside className={css.side}>
          <button className={css.new} popoverTarget="nv-new-menu">New workspace</button>
          <div id="nv-new-menu" popover="auto" className={css.menu}>
            <Link className={css.item} to="/upload"><b>{MRI.label}</b><small>{MRI.hint}</small></Link>
          </div>
        </aside>
        <main className={css.main}>
          <h1 className={css.title}>Workspaces</h1>
          {items.length === 0 ? (
            <div className={css.empty}>
              <p>No workspaces yet.</p>
              <Link className={css.cta} to="/upload">Upload your first MRI</Link>
            </div>
          ) : (
            <ul className={css.grid}>
              {items.map((w) => (
                <li key={w.id}>
                  <Link className={css.card} to={hrefOf(w)} onClick={() => open(w)}>
                    <div className={`${css.thumb} ${css.mri}`}>
                      <img src={brainIcon} alt="" width={40} height={40} />
                    </div>
                    <div className={css.meta}>
                      <p className={css.name}>{w.name}</p>
                      <p className={css.when}>{MRI.label} · opened {ago(w.openedAt)}</p>
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

In `frontend/src/routes/Home.module.css`, delete:
- the `.filters { … }`, `.filter { … }` and `.filter[aria-pressed="true"] { … }` rules (lines 69–87);
- the `.ghost { … }` rule (lines 103–109). The new Home no longer uses it, and CSS modules are per file, so other routes' `.ghost` is unaffected;
- the `.learn { … }` line (135).

- [x] **Step 7: Comment + README**

In `frontend/src/actions/dispatch.ts` line 11, change the comment's `AtlasCanvas listens for 'reset'` to `CaseCanvas listens for 'reset'`.

In `README.md`:
- Line 32: replace `/learn (atlas)` with 14 spaces, so the `▲` keeps its column.
- Line 53: delete the `| Learning Mode `/learn` | …` row.
- Line 80: change `{routes,viewer,actions,api,components,learn,content}` to `{routes,viewer,actions,api,components,content}` (`content/anatomy.json` stays for MCP).

Leave `docs/SPEC.md` and the other historical docs as they are.

- [x] **Step 8: Gates**

Run: `npm --prefix frontend test && npm --prefix frontend run build && npm --prefix frontend run lint && npm run typecheck && grep -rn "learn/\|AtlasCanvas\|viewer/anatomy\|from '../content" frontend/src`

Expected:
- Tests, build, lint and root typecheck PASS. The root typecheck proves `convex/mcp/data.ts` still finds both JSON files.
- The grep prints only the `CaseCanvas.tsx` line 19 comment, which T5 owns.

- [x] **Step 9: Commit**

Run GitNexus `detect_changes()`. Expected scope: Home, App routes, legacy routes, workspaces, Brain3D imports, plus the deleted Learn symbols.

`git mv` / `git rm` in Step 3 already staged the moves and deletions. Stage the edits by path:

```bash
git add frontend/src/App.tsx frontend/src/routes/legacy.tsx frontend/src/routes/legacy.test.ts frontend/src/routes/Home.tsx frontend/src/routes/Home.module.css frontend/src/home/workspaces.ts frontend/src/home/workspaces.test.ts frontend/src/routes/Brain3D.tsx frontend/src/actions/dispatch.ts README.md
git commit -m "feat(frontend): remove Learning Mode; /learn redirects home

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Send `hc send qa "T0 ready: <hash>"` and `hc send lead "T0 done: <hash>, <n> tests"`. Then start T4.

---

### Task 1: Presence component + wrappers (be)

**Files:**
- Modify: root `package.json` (npm adds the dep), `convex/convex.config.ts`, `vitest.config.ts`
- Create: `convex/presence.ts`, `convex/tests/presence.test.ts`
- Regenerate: `convex/_generated/*`

**Interfaces:**
- Produces (exact; fe's T4 calls these by name through `anyApi`):
  - `api.presence.heartbeat({ sessionId, participantToken, clientId: string, interval: number })` → `{ roomToken: string, sessionToken: string }`
  - `api.presence.list({ roomToken })` → `{ userId: string, online: boolean, lastDisconnected: number }[]`. `userId` is a `sessionParticipants` id.
  - `api.presence.disconnect({ sessionToken })` → `null`. Its function path is `presence:disconnect`, which the browser beacon targets.

- [x] **Step 1: Install**

Run `npm install @convex-dev/presence@0.4.0` from the repo root.

- Expected: root `package.json` dependencies gain `"@convex-dev/presence": "^0.4.0"`.
- npm may also install the `react` / `react-dom` peers into root `node_modules`. That is harmless; leave it.

- [x] **Step 2: Register the component**

Replace `convex/convex.config.ts`:

```ts
import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

const app = defineApp({ httpPrefix: "/api" });
app.use(staticHosting, { httpPrefix: "/" });
app.use(presence);

export default app;
```

Run `npm run codegen`.

- Expected: `convex/_generated/api.d.ts` now has `presence` under `components`.
- If codegen fails with a missing-deployment or login error: stop and send `hc send lead "T1 blocked: codegen needs convex login"`. Lead asks the user to run `npx convex dev --once`.

In `vitest.config.ts`, change the inline list:

```ts
    server: { deps: { inline: ["convex-test", "@convex-dev/presence", "@convex-dev/batch-worker"] } },
```

Why: the presence test helper and its batch-worker child use `import.meta.glob`, which only works on code that Vite transforms.

- [x] **Step 3: Write the failing tests**

Create `convex/tests/presence.test.ts`:

```ts
import presenceTest from "@convex-dev/presence/test";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { AppErrorData } from "../lib/errors";
import schema from "../schema";

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ConvexError);
  await promise.catch((e: ConvexError<AppErrorData>) => expect(e.data.code).toBe(code));
}

async function room() {
  const t = convexTest({ schema });
  presenceTest.register(t);
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Judge" });
  return { t, host, viewer };
}

afterEach(() => vi.useRealTimers());

describe("presence", () => {
  it("room and user come from the token; list shows the caller online", async () => {
    const { t, viewer } = await room();
    const r = await t.mutation(api.presence.heartbeat, { sessionId: viewer.sessionId, participantToken: viewer.participantToken, clientId: "tab-1", interval: 10_000 });
    const rows = await t.query(api.presence.list, { roomToken: r.roomToken });
    expect(rows).toEqual([expect.objectContaining({ userId: viewer.participantId, online: true })]);
  });

  it("refuses a bad token and an ended session", async () => {
    const { t, host } = await room();
    await expectCode(t.mutation(api.presence.heartbeat, { sessionId: host.sessionId, participantToken: "nope", clientId: "tab", interval: 10_000 }), "NOT_AUTHENTICATED");
    await t.mutation(api.sessions.end, { sessionId: host.sessionId, participantToken: host.participantToken });
    await expectCode(t.mutation(api.presence.heartbeat, { sessionId: host.sessionId, participantToken: host.participantToken, clientId: "tab", interval: 10_000 }), "SESSION_ENDED");
  });

  it("rejects an empty or oversized clientId", async () => {
    const { t, host } = await room();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken, interval: 10_000 };
    await expectCode(t.mutation(api.presence.heartbeat, { ...auth, clientId: "" }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.presence.heartbeat, { ...auth, clientId: "x".repeat(65) }), "INVALID_ARGUMENT");
  });

  it("disconnect takes the tab offline", async () => {
    vi.useFakeTimers();
    const { t, host } = await room();
    const r = await t.mutation(api.presence.heartbeat, { sessionId: host.sessionId, participantToken: host.participantToken, clientId: "tab-1", interval: 10_000 });
    await t.mutation(api.presence.disconnect, { sessionToken: r.sessionToken });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const rows = await t.query(api.presence.list, { roomToken: r.roomToken });
    expect(rows).toEqual([expect.objectContaining({ userId: host.participantId, online: false })]);
  });
});
```

- [x] **Step 4: Run, expect failure**

Run: `npx vitest run convex/tests/presence.test.ts`
Expected: FAIL (`api.presence` is undefined).

- [x] **Step 5: Implement `convex/presence.ts`**

```ts
/**
 * presence — who is online in a review session right now (spec §1.1).
 *
 * Wraps @convex-dev/presence. Room and user are ALWAYS derived from the
 * participant token: roomId = session id, userId = participant id. The client
 * only names its own tab (clientId), which we prefix with the participant id
 * so one participant can never address another's tab.
 */
import { Presence } from "@convex-dev/presence";
import { v } from "convex/values";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";

const presence = new Presence(components.presence);

const MIN_INTERVAL_MS = 2_000;
const MAX_INTERVAL_MS = 60_000;

export const heartbeat = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    clientId: v.string(),
    interval: v.number(),
  },
  handler: async (ctx, args): Promise<{ roomToken: string; sessionToken: string }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    if (args.clientId.length === 0 || args.clientId.length > 64) {
      throw appError("INVALID_ARGUMENT", "clientId must be 1–64 characters.");
    }
    if (!Number.isFinite(args.interval)) throw appError("INVALID_ARGUMENT", "interval must be a number.");
    const interval = Math.min(Math.max(args.interval, MIN_INTERVAL_MS), MAX_INTERVAL_MS);
    return await presence.heartbeat(ctx, session._id, participant._id, `${participant._id}:${args.clientId}`, interval);
  },
});

/** No per-user reads, so every subscriber in a room shares one cached result (component README). */
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => await presence.list(ctx, roomToken),
});

/** Unauthenticated by necessity: it is called from navigator.sendBeacon on page hide. A leaked tab token can only mark that tab offline. */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => await presence.disconnect(ctx, sessionToken),
});
```

- [x] **Step 6: Run tests + typecheck**

Run: `npx vitest run convex/tests/presence.test.ts && npm run typecheck`

- Expected: PASS.
- If tsc rejects `presenceTest.register(t)` with a schema generic mismatch, change the line to `presenceTest.register(t as never);`. The helper only calls `t.registerComponent`.

- [x] **Step 7: Commit**

Run GitNexus `detect_changes()`. Then:

```bash
git add package.json package-lock.json convex/convex.config.ts convex/_generated vitest.config.ts convex/presence.ts convex/tests/presence.test.ts
git commit -m "feat(convex): presence component behind token-derived wrappers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Send `hc send qa "T1 ready: <hash>"` and `hc send lead "T1 done: <hash>, <n> tests"`.

---

### Task 2: `cursors` table + move/list + end cleanup (be)

**Files:**
- Modify: `convex/schema.ts`, `convex/sessions.ts` (`end` mutation only), `docs/CONVEX_BACKEND.md` (API table, after line 405)
- Create: `convex/cursors.ts`, `convex/tests/cursors.test.ts`

**Interfaces:**
- Produces (exact; fe's T4 calls these by name):
  - `api.cursors.move({ sessionId, participantToken, cursor: null | { node: string, localMm: number[] } })` → `null`
  - `api.cursors.list({ sessionId, participantToken })` → `{ participantId: string, displayName: string, cursor: null | { node, localMm } }[]`, excluding the caller

- [x] **Step 1: Write the failing tests**

Create `convex/tests/cursors.test.ts`:

```ts
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { AppErrorData } from "../lib/errors";
import schema from "../schema";

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toBeInstanceOf(ConvexError);
  await promise.catch((e: ConvexError<AppErrorData>) => expect(e.data.code).toBe(code));
}

async function room() {
  const t = convexTest({ schema });
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { inviteCode: host.inviteCode, displayName: "Judge" });
  const as = (r: { sessionId: Id<"sessions">; participantToken: string }) => ({ sessionId: r.sessionId, participantToken: r.participantToken });
  return { t, host: as(host), viewer: as(viewer), viewerId: viewer.participantId };
}

const AT = { node: "lh_cortex", localMm: [1, 2, 3] };

describe("cursors", () => {
  it("each participant writes only its own row; list excludes the caller", async () => {
    const { t, host, viewer, viewerId } = await room();
    await t.mutation(api.cursors.move, { ...viewer, cursor: AT });
    await t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, localMm: [4, 5, 6] } });
    expect(await t.query(api.cursors.list, host)).toEqual([{ participantId: viewerId, displayName: "Judge", cursor: { ...AT, localMm: [4, 5, 6] } }]);
    expect(await t.query(api.cursors.list, viewer)).toEqual([]);
    await t.mutation(api.cursors.move, { ...viewer, cursor: null });
    expect((await t.query(api.cursors.list, host))[0].cursor).toBeNull();
  });

  it("rejects bad points and node names", async () => {
    const { t, viewer } = await room();
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, localMm: [1, 2] } }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, localMm: [1, Number.NaN, 3] } }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, node: "" } }), "INVALID_ARGUMENT");
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: { ...AT, node: "n".repeat(129) } }), "INVALID_ARGUMENT");
  });

  it("end deletes the room's cursors and refuses later moves", async () => {
    const { t, host, viewer } = await room();
    await t.mutation(api.cursors.move, { ...viewer, cursor: AT });
    await t.mutation(api.sessions.end, host);
    expect(await t.run((ctx) => ctx.db.query("cursors").collect())).toEqual([]);
    await expectCode(t.mutation(api.cursors.move, { ...viewer, cursor: AT }), "SESSION_ENDED");
  });
});
```

- [x] **Step 2: Run, expect failure**

Run: `npx vitest run convex/tests/cursors.test.ts`
Expected: FAIL (`api.cursors` is undefined).

- [x] **Step 3: Table**

In `convex/schema.ts`, add a new table inside `defineSchema({...})`, after `sessionParticipants`:

```ts
  /**
   * Live 3D pointers, one row per participant (spec §1.2). Kept OUT of
   * `sessions` / `sessionParticipants` so `sessions.get` never re-runs at
   * pointer rate. This is the one high-frequency table (≤ 10 Hz per person
   * while the pointer moves, 0 when idle) — bends guardrail 7, Sage-reviewed.
   */
  cursors: defineTable({
    sessionId: v.id("sessions"),
    participantId: v.id("sessionParticipants"),
    /** Hit point in the hit mesh's local frame; null = the pointer is off the model. */
    cursor: v.union(v.null(), v.object({ node: v.string(), localMm: vVec3 })),
    updatedAt: v.number(),
  })
    .index("by_session", ["sessionId"])
    .index("by_participant", ["participantId"]),
```

- [x] **Step 4: `convex/cursors.ts`**

```ts
/**
 * cursors — live 3D pointers (spec §1.2). Any member may send its own;
 * the NOT_PRESENTER gate on the shared view is unrelated.
 */
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";
import { vVec3 } from "./schema";

const MAX_NODE = 128;
const vCursor = v.union(v.null(), v.object({ node: v.string(), localMm: vVec3 }));
type CursorValue = null | { node: string; localMm: number[] };

export const move = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), cursor: vCursor },
  handler: async (ctx, args): Promise<null> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const c = args.cursor;
    if (c && (c.node.length === 0 || c.node.length > MAX_NODE)) {
      throw appError("INVALID_ARGUMENT", `Node names are 1–${MAX_NODE} characters.`);
    }
    if (c && (c.localMm.length !== 3 || !c.localMm.every(Number.isFinite))) {
      throw appError("INVALID_ARGUMENT", "A cursor point is three finite numbers.");
    }
    const row = await ctx.db
      .query("cursors")
      .withIndex("by_participant", (q) => q.eq("participantId", participant._id))
      .unique();
    const doc = { cursor: c, updatedAt: Date.now() };
    if (row) await ctx.db.patch(row._id, doc);
    else await ctx.db.insert("cursors", { sessionId: session._id, participantId: participant._id, ...doc });
    return null;
  },
});

export const list = query({
  args: { sessionId: v.id("sessions"), participantToken: v.string() },
  handler: async (
    ctx,
    args,
  ): Promise<{ participantId: Id<"sessionParticipants">; displayName: string; cursor: CursorValue }[]> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const rows = await ctx.db
      .query("cursors")
      .withIndex("by_session", (q) => q.eq("sessionId", session._id))
      .collect();
    const out: { participantId: Id<"sessionParticipants">; displayName: string; cursor: CursorValue }[] = [];
    for (const r of rows) {
      if (r.participantId === participant._id) continue;
      const p = await ctx.db.get(r.participantId);
      if (p) out.push({ participantId: r.participantId, displayName: p.displayName, cursor: r.cursor });
    }
    return out;
  },
});
```

- [x] **Step 5: End clears cursors**

Run GitNexus `impact({target: "end", direction: "upstream"})` and report the risk.

In the `end` handler of `convex/sessions.ts`, insert directly after `const { session } = await requirePresenter(ctx, args);`:

```ts
    const cursors = await ctx.db.query("cursors").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();
    for (const c of cursors) await ctx.db.delete(c._id);
```

- [x] **Step 6: Docs**

In the API table of `docs/CONVEX_BACKEND.md`, add these rows directly after the `sessions.end` row (line 405):

```md
| `presence.heartbeat` | `{ sessionId, participantToken, clientId, interval }` | `{ roomToken, sessionToken }` |
| `presence.list` | `{ roomToken }` | `{ userId, online, lastDisconnected }[]` |
| `presence.disconnect` | `{ sessionToken }` (unauthenticated, sendBeacon) | `null` |
| `cursors.move` | `{ sessionId, participantToken, cursor: null \| { node, localMm } }` | `null` |
| `cursors.list` | `{ sessionId, participantToken }` | `{ participantId, displayName, cursor }[]` (caller excluded) |
```

- [x] **Step 7: Full root suite**

Run: `npm run typecheck && npm test`
Expected: all PASS, including the existing `sessions.test.ts`.

- [x] **Step 8: Commit**

Run GitNexus `detect_changes()`. Expected scope: the schema, `cursors.ts`, and `end` in `sessions.ts` only. Then:

```bash
git add convex/schema.ts convex/cursors.ts convex/sessions.ts convex/tests/cursors.test.ts docs/CONVEX_BACKEND.md
git commit -m "feat(convex): cursors table for live 3D pointers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Send `hc send qa "T2 ready: <hash>"` and `hc send lead "T2 done: <hash>, <n> tests"`.

---

### Task 3: Cursor math + mirror types (ai)

**Files:**
- Create: `frontend/src/share/cursorSync.ts`, `frontend/src/share/cursorSync.test.ts`, `frontend/src/viewer/glbNames.test.ts`
- Modify: `frontend/src/share/types.ts` (append only)

**Interfaces:**
- Produces (exact; fe's T4 and ai's T5 import these):
  - `types.ts`:
    - `interface Cursor { node: string; localMm: [number, number, number] }`
    - `interface RemoteCursor { participantId: string; displayName: string; cursor: Cursor | null }`
  - `cursorSync.ts`:
    - `colorOf(id: string): string` (returns `#rrggbb`)
    - `cursorOf(object: THREE.Object3D, point: THREE.Vector3): Cursor | null`
    - `cursorSender(send: (c: Cursor | null) => void, ms = 100): { push(c: Cursor | null): void; flush(): void }`

- [x] **Step 1: Write the failing tests**

Create `frontend/src/share/cursorSync.test.ts`:

```ts
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { colorOf, cursorOf, cursorSender } from './cursorSync';

afterEach(() => vi.useRealTimers());
const A = { node: 'n', localMm: [1, 2, 3] as [number, number, number] };

describe('cursorSender', () => {
  it('sends the latest point once per window, only on change', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const s = cursorSender(send, 100);
    s.push({ ...A, localMm: [0, 0, 0] });
    s.push(A);
    vi.advanceTimersByTime(100);
    expect(send.mock.calls).toEqual([[A]]);
    s.push({ ...A });
    vi.advanceTimersByTime(100);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('sends a single null after the pointer leaves, none before anything was sent', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const s = cursorSender(send, 100);
    s.push(null); vi.advanceTimersByTime(100);
    expect(send).not.toHaveBeenCalled();
    s.push(A); vi.advanceTimersByTime(100);
    s.push(null); vi.advanceTimersByTime(100);
    s.push(null); vi.advanceTimersByTime(100);
    expect(send.mock.calls).toEqual([[A], [null]]);
  });
});

describe('colorOf', () => {
  it('is stable per id', () => {
    expect(colorOf('p1')).toBe(colorOf('p1'));
    expect(colorOf('p1')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('cursorOf', () => {
  it('stores the hit in the mesh frame, so the receiver can re-project after explode', () => {
    const parent = new THREE.Group(); parent.position.set(10, 0, 0);
    const mesh = new THREE.Mesh(); mesh.name = 'lh_cortex'; mesh.position.set(0, 5, 0);
    parent.add(mesh); parent.updateMatrixWorld(true);
    const c = cursorOf(mesh, new THREE.Vector3(11, 5, 0));
    expect(c?.node).toBe('lh_cortex');
    expect(c?.localMm.map((v) => Math.round(v))).toEqual([1, 0, 0]);
    mesh.position.set(0, 50, 0); parent.updateMatrixWorld(true); // receiver exploded further
    expect(mesh.localToWorld(new THREE.Vector3(...c!.localMm)).toArray()).toEqual([11, 50, 0]);
  });
  it('ignores unnamed and hidden objects', () => {
    const g = new THREE.Group(); const m = new THREE.Mesh(); g.add(m);
    expect(cursorOf(m, new THREE.Vector3())).toBeNull();
    m.name = 'x'; g.visible = false;
    expect(cursorOf(m, new THREE.Vector3())).toBeNull();
  });
});
```

Create `frontend/src/viewer/glbNames.test.ts`:

```ts
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Mesh node names straight from the GLB JSON chunk (header 12 B, chunk length at byte 12, JSON from byte 20). */
function meshNodeNames(rel: string): string[] {
  const b = readFileSync(fileURLToPath(new URL(rel, import.meta.url)));
  const gltf = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8')) as { nodes?: { name?: string; mesh?: number }[] };
  return (gltf.nodes ?? []).filter((n) => n.mesh !== undefined).map((n) => n.name ?? '');
}

// Cursors are anchored by node name (spec §2.2): a blank or duplicate name would put a dot on the wrong mesh.
describe('sample case GLB mesh node names are unique', () => {
  it.each(['../../../backend/seed/sample/model.glb', '../../../backend/seed/sample-2/model.glb'])('%s', (rel) => {
    const names = meshNodeNames(rel);
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((n, i) => !n || names.indexOf(n) !== i)).toEqual([]);
  });
});
```

- [x] **Step 2: Run, expect failure**

Run: `npm --prefix frontend test -- src/share/cursorSync.test.ts src/viewer/glbNames.test.ts`

Expected:
- cursorSync: FAIL (module not found).
- GLB test: passes, or reports real duplicates. On duplicates, stop and send `hc send lead "T3 blocked: duplicate GLB node names: <list>"`.

- [x] **Step 3: Implement**

Create `frontend/src/share/cursorSync.ts`:

```ts
import type * as THREE from 'three';
import type { Cursor } from './types';

const PALETTE = ['#e6194b', '#3cb44b', '#4363d8', '#f58231', '#911eb4', '#0fa3b1', '#f032e6', '#7a9a01'];

/** Stable colour per participant: the same id gets the same colour on every screen. */
export function colorOf(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** The hit in the hit mesh's own frame (spec §2.2), or null for an unnamed or hidden object. */
export function cursorOf(object: THREE.Object3D, point: THREE.Vector3): Cursor | null {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return null;
  if (!object.name) return null;
  const [x, y, z] = object.worldToLocal(point.clone()).toArray();
  return { node: object.name, localMm: [x, y, z] };
}

const same = (a: Cursor | null, b: Cursor | null) =>
  a === b || (!!a && !!b && a.node === b.node && a.localMm.every((v, i) => v === b.localMm[i]));

/** Trailing throttle: at most one send per `ms`, only when the point changed; leaving sends one null. */
export function cursorSender(send: (c: Cursor | null) => void, ms = 100) {
  let sent: Cursor | null = null;
  let latest: Cursor | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (same(sent, latest)) return;
    sent = latest;
    send(latest);
  };
  return {
    push(c: Cursor | null) { latest = c; timer ??= setTimeout(flush, ms); },
    flush,
  };
}
```

Append to `frontend/src/share/types.ts`:

```ts
/** A pointer on the model: hit point in the hit mesh's local frame (convex/cursors.ts). */
export interface Cursor { node: string; localMm: [number, number, number] }
export interface RemoteCursor { participantId: string; displayName: string; cursor: Cursor | null }
```

- [x] **Step 4: Tests + build**

Run: `npm --prefix frontend test && npm --prefix frontend run build`

- Expected: PASS.
- If `tsc -b` rejects `node:fs` in `glbNames.test.ts` despite the triple-slash reference: add `"node"` to `types` in `frontend/tsconfig.app.json` (`["vite/client", "node"]`) and re-run. `@types/node` is already installed.

- [x] **Step 5: Commit**

Run GitNexus `detect_changes()`. Then:

```bash
git add frontend/src/share/cursorSync.ts frontend/src/share/cursorSync.test.ts frontend/src/share/types.ts frontend/src/viewer/glbNames.test.ts
git commit -m "feat(share): cursor throttle, colour and mesh-frame math

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add `frontend/tsconfig.app.json` to the `git add` if you changed it.

Then send:
- `hc send fe "T3 done: <hash> — cursorSync + Cursor types are in"`
- `hc send qa "T3 ready: <hash>"`
- `hc send lead "T3 done: <hash>, <n> tests"`

---

### Task 4: Presence client loop, store, face pile, online dots (fe)

**Files:**
- Create: `frontend/src/share/presence.ts`, `frontend/src/share/presence.test.ts`, `frontend/src/share/FacePile.tsx`
- Modify: `frontend/src/share/client.ts`, `store.ts`, `store.test.ts`, `SharePopover.tsx`, `SharePopover.module.css`, `frontend/src/components/TopNavBar.tsx`

**Interfaces:**
- Consumes:
  - T1, by name: `presence:heartbeat`, `presence:list`, `presence:disconnect`
  - T2, by name: `cursors:move`, `cursors:list`
  - T3: `colorOf`, types `Cursor`, `RemoteCursor`
- Produces (ai's T5 imports these from `store.ts`):
  - `useShare` state gains `online: Set<string>` (participant ids)
  - `sendCursor(cursor: Cursor | null): void`
  - `watchCursors(onRows: (rows: RemoteCursor[]) => void): () => void`
- Also produces:
  - `startPresence(client, auth, convexUrl, onOnline): () => void` and `HEARTBEAT_MS`
  - `convexUrl` export in `client.ts`
  - `<FacePile session/>`

- [x] **Step 1: Impact**

Run GitNexus `impact` upstream on `drop` and `watch` (both in `share/store.ts`), `SharePopover` and `TopNavBar`. Report the risk.

- [x] **Step 2: Failing test**

Create `frontend/src/share/presence.test.ts`:

```ts
import { getFunctionName } from 'convex/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_MS, startPresence } from './presence';

type Ref = Parameters<typeof getFunctionName>[0];
const AUTH = { sessionId: 's1', participantToken: 't1' };

function fake() {
  const calls: [string, unknown][] = [];
  const subs: { name: string; args: unknown; onData: (v: unknown) => void; closed: boolean }[] = [];
  const client = {
    mutation: async (ref: Ref, args: unknown) => {
      const name = getFunctionName(ref);
      calls.push([name, args]);
      return name === 'presence:heartbeat' ? { roomToken: 'room', sessionToken: 'sess' } : null;
    },
    onUpdate: (ref: Ref, args: unknown, onData: (v: unknown) => void) => {
      const sub = { name: getFunctionName(ref), args, onData, closed: false };
      subs.push(sub);
      return () => { sub.closed = true; };
    },
  };
  return { client, calls, subs };
}

const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
const win = new EventTarget();
const sendBeacon = vi.fn(() => true);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', win);
  vi.stubGlobal('navigator', { sendBeacon });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); sendBeacon.mockClear(); doc.visibilityState = 'visible'; });

describe('startPresence', () => {
  it('heartbeats, lists the room, reports online participants only', async () => {
    const f = fake();
    const online = vi.fn();
    const stop = startPresence(f.client as never, AUTH, 'https://x.convex.cloud', online);
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls[0]).toEqual(['presence:heartbeat', { ...AUTH, clientId: expect.any(String), interval: HEARTBEAT_MS }]);
    expect(f.subs[0]).toMatchObject({ name: 'presence:list', args: { roomToken: 'room' } });
    f.subs[0].onData([{ userId: 'p1', online: true }, { userId: 'p2', online: false }]);
    expect(online).toHaveBeenLastCalledWith(new Set(['p1']));
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    expect(f.calls.filter((c) => c[0] === 'presence:heartbeat')).toHaveLength(2);
    expect(f.subs).toHaveLength(1); // same room token: no resubscribe
    stop();
  });

  it('hidden tab disconnects; visible again heartbeats; pagehide beacons', async () => {
    const f = fake();
    const stop = startPresence(f.client as never, AUTH, 'https://x.convex.cloud', () => {});
    await vi.advanceTimersByTimeAsync(0);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    expect(f.calls.at(-1)).toEqual(['presence:disconnect', { sessionToken: 'sess' }]);
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.calls.at(-1)?.[0]).toBe('presence:heartbeat');
    win.dispatchEvent(new Event('pagehide'));
    expect(sendBeacon).toHaveBeenCalledWith('https://x.convex.cloud/api/mutation', expect.any(Blob));
    stop();
  });

  it('stop unsubscribes, disconnects and stops the timer', async () => {
    const f = fake();
    const stop = startPresence(f.client as never, AUTH, 'https://x.convex.cloud', () => {});
    await vi.advanceTimersByTimeAsync(0);
    stop();
    expect(f.subs[0].closed).toBe(true);
    expect(f.calls.at(-1)).toEqual(['presence:disconnect', { sessionToken: 'sess' }]);
    const n = f.calls.length;
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS * 3);
    expect(f.calls).toHaveLength(n);
  });
});
```

- [x] **Step 3: Run, expect failure**

Run: `npm --prefix frontend test -- src/share/presence.test.ts`
Expected: FAIL (`./presence` not found).

- [x] **Step 4: Implement `presence.ts`**

Create `frontend/src/share/presence.ts`:

```ts
import type { ConvexClient } from 'convex/browser';
import { api } from './client';

type Client = Pick<ConvexClient, 'mutation' | 'onUpdate'>;
interface Auth { sessionId: string; participantToken: string }
interface Row { userId: string; online: boolean }

export const HEARTBEAT_MS = 10_000;

/**
 * Who is online in this room (spec §2.1). Same protocol as the component's stock usePresence,
 * on our own ConvexClient (its hook has no slot for our participant token). Returns stop.
 */
export function startPresence(client: Client, auth: Auth, convexUrl: string, onOnline: (ids: Set<string>) => void): () => void {
  const clientId = crypto.randomUUID();
  let sessionToken: string | null = null;
  let roomToken: string | null = null;
  let unlist: (() => void) | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const beat = async () => {
    try {
      const r = (await client.mutation(api.presence.heartbeat, { ...auth, clientId, interval: HEARTBEAT_MS })) as { roomToken: string; sessionToken: string };
      if (stopped) return;
      sessionToken = r.sessionToken;
      if (r.roomToken === roomToken) return;
      roomToken = r.roomToken;
      unlist?.();
      unlist = client.onUpdate(api.presence.list, { roomToken }, (rows: Row[]) => onOnline(new Set(rows.filter((x) => x.online).map((x) => x.userId))));
    } catch { /* offline or session over: the next tick retries; sessions.get reports an end */ }
  };
  const run = () => { void beat(); timer ??= setInterval(() => void beat(), HEARTBEAT_MS); };
  const pause = () => {
    if (timer) { clearInterval(timer); timer = null; }
    if (sessionToken) client.mutation(api.presence.disconnect, { sessionToken }).catch(() => {});
  };
  // The page may be gone before a websocket send flushes; a beacon is fire-and-forget over HTTP (as the stock hook does).
  const beacon = () => {
    if (sessionToken) navigator.sendBeacon(`${convexUrl}/api/mutation`, new Blob([JSON.stringify({ path: 'presence:disconnect', args: { sessionToken } })], { type: 'application/json' }));
  };
  const onVisibility = () => (document.visibilityState === 'hidden' ? pause() : run());

  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', beacon);
  run();
  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', beacon);
    unlist?.();
    pause();
  };
}
```

- [x] **Step 5: Run, expect pass**

Run: `npm --prefix frontend test -- src/share/presence.test.ts`
Expected: PASS.

- [x] **Step 6: Store — online set, presence lifecycle, cursor send/receive**

**`frontend/src/share/client.ts`**: add after the `url` line:

```ts
/** '' when unset (tests, no Convex): presence stays off. */
export const convexUrl: string = url ?? '';
```

**`frontend/src/share/store.ts`**

1. Imports:

```ts
import { api, convex, convexUrl } from './client';
import { startPresence } from './presence';
import type { Cursor, RemoteCursor, SessionState, ViewerCommand } from './types';
```

2. `ShareState` and initial state:

```ts
interface ShareState { stored: Stored | null; session: SessionState | null; notice: string | null; syncNote: string | null; online: Set<string> }
```

```ts
export const useShare = create<ShareState>()(() => ({ stored: loadStored(), session: null, notice: null, syncNote: null, online: new Set<string>() }));
```

3. Add `let stopPresence: (() => void) | null = null;` directly after `let unsubscribe …`.

4. Replace `drop` and `watch`:

```ts
function drop(notice: string | null): void {
  unsubscribe?.();
  unsubscribe = null;
  stopPresence?.();
  stopPresence = null;
  clearStored();
  useShare.setState({ stored: null, session: null, notice, syncNote: null, online: new Set() });
}

function watch(s: Stored): void {
  unsubscribe?.();
  unsubscribe = client!.onUpdate(api.sessions.get, auth(s), (session: SessionState) => useShare.setState({ session }), (e: Error) => {
    const code = codeOf(e);
    if (code === 'SESSION_ENDED') drop(SESSION_ENDED);
    else if (code && STALE.has(code)) drop(null);
    else console.error('[share]', e);
  });
  stopPresence?.();
  stopPresence = convexUrl ? startPresence(client!, auth(s), convexUrl, (online) => useShare.setState({ online })) : null;
}
```

5. Append at the end of the file:

```ts
/** Any role. Best-effort: a dropped point is replaced by the next one. */
export function sendCursor(cursor: Cursor | null): void {
  const s = useShare.getState().stored;
  if (!client || !s) return;
  client.mutation(api.cursors.move, { ...auth(s), cursor }).catch(() => {});
}

/** Everyone else's cursors in this room. An end or stale token is handled by the sessions.get subscription. */
export function watchCursors(onRows: (rows: RemoteCursor[]) => void): () => void {
  const s = useShare.getState().stored;
  if (!client || !s) return () => {};
  return client.onUpdate(api.cursors.list, auth(s), onRows, () => onRows([]));
}
```

**`frontend/src/share/store.test.ts`**

1. Extend the `./store` import with `sendCursor` and `watchCursors`. Add `vi` to the vitest import.

2. Add directly after the imports:

```ts
vi.mock('./presence', () => ({ startPresence: vi.fn(() => () => {}) }));
```

Why: `frontend/.env.local` sets `VITE_CONVEX_URL`, so `watch()` would otherwise start a real presence loop in the node test env, which has no `document`.

3. In `fakeClient`, make subscriptions record what they subscribe to. Replace the `subs` declaration and the `onUpdate` sub line:

```ts
  const subs: { name: string; args: unknown; onData: (v: unknown) => void; onError?: (e: Error) => void; closed: boolean }[] = [];
```

```ts
      const sub = { name: getFunctionName(_ref), args: _args, onData, onError, closed: false };
```

4. `beforeEach`:

```ts
beforeEach(() => useShare.setState({ stored: null, session: null, notice: null, syncNote: null, online: new Set() }));
```

5. Append:

```ts
describe('cursors', () => {
  it('send and watch use the stored token; both are no-ops without a session', () => {
    const f = fakeClient(); useClientForTest(f.client as never);
    sendCursor(null);
    expect(watchCursors(() => {})).toBeTypeOf('function');
    expect(f.calls).toEqual([]);
    expect(f.subs).toHaveLength(0);
    useShare.setState({ stored: { sessionId: 's1', participantToken: 't', role: 'viewer', inviteCode: 'X' } });
    sendCursor({ node: 'n', localMm: [1, 2, 3] });
    watchCursors(() => {});
    expect(f.calls).toEqual([['cursors:move', { sessionId: 's1', participantToken: 't', cursor: { node: 'n', localMm: [1, 2, 3] } }]]);
    expect(f.subs.at(-1)).toMatchObject({ name: 'cursors:list', args: { sessionId: 's1', participantToken: 't' } });
  });
});
```

Existing tests must pass unchanged. The fixture matches `Stored` in `share/stored.ts` (`sessionId, participantToken, role, inviteCode`).

- [x] **Step 7: Face pile + roster dots**

Create `frontend/src/share/FacePile.tsx`:

```tsx
import { colorOf } from './cursorSync';
import css from './SharePopover.module.css';
import { useShare } from './store';
import type { SessionState } from './types';

const MAX_FACES = 4;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

/** Online participants only (presence), not the durable roster. */
export function FacePile({ session }: { session: SessionState }) {
  const online = useShare((s) => s.online);
  const here = session.participants.filter((p) => online.has(p.participantId));
  if (here.length === 0) return null;
  return (
    <ul className={css.pile} aria-label={`${here.length} online`}>
      {here.slice(0, MAX_FACES).map((p) => (
        <li key={p.participantId} className={css.face} title={p.displayName} style={{ background: colorOf(p.participantId) }}>{initials(p.displayName)}</li>
      ))}
      {here.length > MAX_FACES && <li className={css.face}>+{here.length - MAX_FACES}</li>}
    </ul>
  );
}
```

Append to `frontend/src/share/SharePopover.module.css`:

```css
.pile { display: flex; gap: 2px; margin: 0; padding: 0; list-style: none; }
.face { display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: #555; color: #fff; font: 600 10px/1 system-ui, sans-serif; }
.dot { display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: #9aa0a6; }
.dotOn { background: #2ea043; }
```

In `frontend/src/share/SharePopover.tsx`:
1. Add `const online = useShare((s) => s.online);` directly after the `syncNote` line.
2. Replace the roster `<li>`:

```tsx
          <li key={p.participantId}>
            <span className={`${css.dot} ${online.has(p.participantId) ? css.dotOn : ''}`} role="img" aria-label={online.has(p.participantId) ? 'online' : 'offline'} />
            {p.displayName}{p.role === 'host' ? ' (host)' : p.following ? ' · following' : ''}
          </li>
```

In `frontend/src/components/TopNavBar.tsx`:
1. Add `import { FacePile } from '../share/FacePile';` after the `FollowBanner` import.
2. Insert directly before `{guest && session && <FollowBanner session={session} />}`:

```tsx
      {session?.status === 'active' && <FacePile session={session} />}
```

- [x] **Step 8: Tests + build + lint**

Run: `npm --prefix frontend test && npm --prefix frontend run build && npm --prefix frontend run lint`
Expected: PASS.

- [x] **Step 9: Commit**

Run GitNexus `detect_changes()`. Then:

```bash
git add frontend/src/share/presence.ts frontend/src/share/presence.test.ts frontend/src/share/FacePile.tsx frontend/src/share/client.ts frontend/src/share/store.ts frontend/src/share/store.test.ts frontend/src/share/SharePopover.tsx frontend/src/share/SharePopover.module.css frontend/src/components/TopNavBar.tsx
git commit -m "feat(share): presence heartbeat loop, face pile and online dots

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then send:
- `hc send ai "T4 done: <hash> — sendCursor/watchCursors/online are in store.ts"`
- `hc send qa "T4 ready: <hash>"`
- `hc send lead "T4 done: <hash>, <n> tests"`

---

### Task 5: Remote cursors in the 3D view (ai)

**Files:**
- Create: `frontend/src/share/RemoteCursors.tsx`, `frontend/src/share/RemoteCursors.module.css`
- Modify: `frontend/src/viewer/CaseCanvas.tsx`

**Interfaces:**
- Consumes:
  - T3: `colorOf`, `cursorOf`, `cursorSender`, `Cursor`, `RemoteCursor`
  - T4: `useShare` (`online`, `session`), `sendCursor`, `watchCursors`
- Produces:
  - `useCursorPush(enabled: boolean): ((c: Cursor | null) => void) | null`
  - `<RemoteCursors enabled={boolean} />`

- [x] **Step 1: Impact**

Run GitNexus `impact({target: "CaseScene", direction: "upstream"})` and report the risk. The only expected caller is `CaseCanvas`.

T0 deleted `AtlasCanvas`. In `frontend/src/viewer/CaseCanvas.tsx` line 19, replace the comment
`// Same direction as AtlasCanvas HOME; the brain centroid is the scene origin.` with
`// Front-left three-quarter view; the brain centroid is the scene origin.`

- [x] **Step 2: `RemoteCursors.tsx` + css**

Create `frontend/src/share/RemoteCursors.module.css`:

```css
.chip { padding: 0 6px; border-radius: 4px; color: #fff; font: 600 11px/1.6 system-ui, sans-serif; white-space: nowrap; transform: translate(10px, -50%); pointer-events: none; }
```

Create `frontend/src/share/RemoteCursors.tsx`:

```tsx
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { colorOf, cursorSender } from './cursorSync';
import css from './RemoteCursors.module.css';
import { sendCursor, useShare, watchCursors } from './store';
import type { Cursor, RemoteCursor } from './types';

const EASE_S = 0.12;
const DOT_MM = 2.5;

const useLiveSession = (enabled: boolean) => useShare((s) => (enabled && s.session?.status === 'active' ? s.session.sessionId : null));

/** Pointer → shared cursor for this canvas; null outside a live session. */
export function useCursorPush(enabled: boolean): ((c: Cursor | null) => void) | null {
  const sessionId = useLiveSession(enabled);
  const sender = useMemo(() => (sessionId ? cursorSender(sendCursor) : null), [sessionId]);
  useEffect(() => () => { sender?.push(null); sender?.flush(); }, [sender]); // leaving the page hides our dot for the others
  return sender ? sender.push : null;
}

/** Everyone else's pointer as a dot + name chip, re-projected through this screen's own explode (spec §2.1). */
export function RemoteCursors({ enabled }: { enabled: boolean }) {
  const sessionId = useLiveSession(enabled);
  const online = useShare((s) => s.online);
  const [rows, setRows] = useState<RemoteCursor[]>([]);
  useEffect(() => (sessionId ? watchCursors(setRows) : undefined), [sessionId]);
  if (!sessionId) return null;
  return <>{rows.map((r) => (r.cursor && online.has(r.participantId) ? <RemoteDot key={r.participantId} id={r.participantId} name={r.displayName} cursor={r.cursor} /> : null))}</>;
}

function RemoteDot({ id, name, cursor }: { id: string; name: string; cursor: Cursor }) {
  const scene = useThree((s) => s.scene);
  const node = useMemo(() => scene.getObjectByName(cursor.node), [scene, cursor.node]);
  const ref = useRef<THREE.Group>(null);
  const target = useMemo(() => new THREE.Vector3(), []);
  const placed = useRef(false);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g || !node) return;
    node.localToWorld(target.set(...cursor.localMm)); // every frame: this screen's explode may move the mesh
    if (placed.current) g.position.lerp(target, 1 - Math.exp(-dt / EASE_S));
    else { g.position.copy(target); placed.current = true; }
  });
  if (!node) return null;
  const color = colorOf(id);
  return (
    <group ref={ref}>
      <mesh renderOrder={10} raycast={() => null}>
        <sphereGeometry args={[DOT_MM, 16, 12]} />
        <meshBasicMaterial color={color} depthTest={false} transparent />
      </mesh>
      <Html style={{ pointerEvents: 'none' }}><span className={css.chip} style={{ background: color }}>{name}</span></Html>
    </group>
  );
}
```

- [x] **Step 3: Pointer capture + mount in `CaseCanvas`**

In `frontend/src/viewer/CaseCanvas.tsx`:

1. Change line 2 to `import { Canvas, type ThreeEvent } from '@react-three/fiber';`.
2. Add `import { cursorOf } from '../share/cursorSync';` and `import { RemoteCursors, useCursorPush } from '../share/RemoteCursors';`.
3. In `CaseScene`, directly after `const target = useViewer((s) => s.cameraTarget);`, add:

```ts
  const live = jobId === 'sample'; // sharing is sample-only (W2)
  const push = useCursorPush(live);
```

4. Replace `<primitive object={cs.world} />` with:

```tsx
      <primitive
        object={cs.world}
        // handlers only during a session: without them R3F does not raycast the case at all
        onPointerMove={push ? (e: ThreeEvent<PointerEvent>) => {
          const c = cursorOf(e.object, e.point);
          if (!c) return; // hidden or unnamed: R3F tries the next hit
          e.stopPropagation();
          push(c);
        } : undefined}
        onPointerOut={push ? () => push(null) : undefined}
      />
      <RemoteCursors enabled={live} />
```

- [x] **Step 4: Tests + build + lint**

Run: `npm --prefix frontend test && npm --prefix frontend run build && npm --prefix frontend run lint`

- Expected: PASS.
- There is no unit test for the R3F component: frontend vitest has no DOM or WebGL. T7 covers it in the browser.

- [x] **Step 5: Commit**

Run GitNexus `detect_changes()`. Expected scope: `CaseScene` plus the new share module. Then:

```bash
git add frontend/src/share/RemoteCursors.tsx frontend/src/share/RemoteCursors.module.css frontend/src/viewer/CaseCanvas.tsx
git commit -m "feat(share): live 3D cursors on the sample case 3D view

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Send `hc send qa "T5 ready: <hash>"` and `hc send lead "T5 done: <hash>"`.

---

### Task 6: Review each task (qa)

**Files:** none (qa never edits source).

For each `T<n> ready: <hash>` message:

- [ ] `git show --stat <hash>`: every file must be in that task's row of "Ownership and order". Nothing on the Global Constraints out-of-scope list may be touched.
- [ ] `git show <hash>`: diff against the task's code blocks. Flag:
  - missing validation (lengths, finite numbers, token checks);
  - any `userId` / `roomId` taken from client args;
  - any cursor write path touching `sessions` or `sessionParticipants`.
- [ ] Run that task's gate command (its "Tests" or "Full root suite" step) and paste the pass/fail counts.
- [ ] Reply to the owner:
  - `hc send <owner> "T<n> PASS"`, or
  - `hc send <owner> "T<n> FAIL: <file:line> <problem>"`. Copy `lead` on every FAIL.

---

### Task 7: Gates + two-browser check (qa, lead deploys)

**Files:**
- Create: `docs/qa/2026-10-24-presence-cursors/README.md`

- [ ] **Step 1: All gates**

Run: `npm run typecheck && npm test && npm --prefix frontend run build && npm --prefix frontend test`
Expected: all exit 0. Paste failures verbatim.

- [ ] **Step 2: Deploy (lead)**

1. Lead asks the user to run `! npx convex dev --once` (it needs their Convex login).
2. Start the backend from the repo root: `docker compose up`.
3. Start the frontend: `npm --prefix frontend run dev` (`VITE_CONVEX_URL` is in `frontend/.env.local`).
4. Lead sends `hc send qa "deployed"`.

- [ ] **Step 3: Manual (one normal window + one private window)**

- [ ] Host opens `/jobs/sample/mri`, clicks Share, copies the link. Guest joins and lands on `/jobs/sample/mri`.
- [ ] Both face piles show 2 avatars. The Share popover shows 2 green dots.
- [ ] Host goes to 3D; guest follows. Each pointer over the brain shows a coloured dot with its name on the other screen.
- [ ] Set a different explode on each screen. The dot stays on the same anatomical spot.
- [ ] Move the pointer off the model. Its dot disappears on the other screen within ~0.2 s.
- [ ] Close the guest tab. The host's pile drops to 1 at once (beacon), or within ~25 s at most.
- [ ] Hide the guest tab (switch tabs). Host shows it offline; when it is visible again, it is back online.
- [ ] Host ends the session. Guest sees "session ended", and no dots remain.
- [ ] `/learn` and `/learn/anything` redirect to `/`. Home shows no Learning Mode item, button or filter.

- [ ] **Step 4: Report**

1. Write PASS/FAIL per line to `docs/qa/2026-10-24-presence-cursors/README.md`. Add screenshots if your tool can take them.
2. Commit it as `docs(qa): presence + cursors browser verification`, with the trailer.
3. Send `hc send lead "T7: <n> PASS / <m> FAIL, commit <hash>"`, and send each FAIL to its owner.

The PR needs Sage's review (schema change + guardrail 7). Do not open it unless the user asks.

---

## Reconcile with main (R1–R5) — open

Spec §R. Main has its own presence (Phase 3), chat, any-scan sharing and camera follow. One merge commit takes main's presence and keeps our cursors, face pile and Learn removal. Then one small commit widens cursors to any shared case.

**Merge-time rules (override "Worker rules" for R1–R3 only):**
- **be only:** be runs `git merge --no-ff --no-commit origin/main` once, in R1. Nobody else runs `merge`, and nobody runs `merge --abort` without lead.
- **No commits while the merge is open.** The first `git commit` would seal the merge; only ai commits it, at the end of R3. qa does not commit until R5.
- **Conflict files:** resolve only your rows of the table below, then `git add <path>` them.
- **Hand-off:** be → fe → ai, by `hc send`.
- **Local servers:** lead's `npx convex dev` and `npm --prefix frontend run dev` keep running. Convex re-pushes and regenerates `convex/_generated/` by itself once `convex/` has no conflict markers. Its log is at `/private/tmp/claude-501/-Users-kaydee-Developer-CalHacks13-0/278d7b85-2157-4412-b9ca-aaf8eab96b5e/scratchpad/convex-dev.log`.

**Resolution table** (`git checkout --theirs <path>` = take main):

| Path | Resolution | Owner |
|---|---|---|
| `convex/presence.ts` | main's | be |
| `convex/tests/presence.test.ts` | main's | be |
| `convex/convex.config.ts` | main's | be |
| `vitest.config.ts` | main's (inlines `@convex-dev/presence` + `@convex-dev/batch-worker`) | be |
| `convex/_generated/api.d.ts` | take main's, then let `convex dev` regenerate it. It must list `cursors`, `presence`, `messages` and `jobs`. | be |
| `package.json`, `package-lock.json`, `frontend/package*.json` (auto-merged) | run `npm install` and `npm --prefix frontend install` (main added `react-qr-code`). Stage any lock change. | be |
| `docs/CONVEX_BACKEND.md` (auto-merged) | main's §12 is the presence doc. Our cursors text must not describe the old heartbeat args (`clientId`, `participantToken`); fix or remove any line that does. | be |
| `convex/schema.ts`, `convex/sessions.ts` (auto-merged) | check that `cursors` table + `sessions.end` cursor cleanup survived alongside main's tables (`messages` …) | be |
| `frontend/src/share/presence.ts`, `presence.test.ts` | main's | fe |
| `frontend/src/share/SharePopover.tsx` | main's (online dots + QR) | fe |
| `frontend/src/share/SharePopover.module.css` (auto-merged) | check main's `.qr`, `.on`, `.off` and our face-pile classes are all present, no duplicates | fe |
| `frontend/src/share/store.ts` | main's, then append our `sendCursor` + `watchCursors` verbatim (code below) and add `Cursor, RemoteCursor` to the `./types` import | fe |
| `frontend/src/share/store.test.ts` | main's, then append our `describe('cursors', …)` block verbatim from `git show HEAD:frontend/src/share/store.test.ts` | fe |
| `frontend/src/share/types.ts` | both: main's `setCamera` variant + `ChatMessage`, then our `Cursor` + `RemoteCursor` | fe |
| `frontend/src/share/client.ts` (auto-merged) | exactly one `convexUrl` export: main's `string \| undefined` line. Delete ours (`string`, `''` when unset). | fe |
| `frontend/src/routes/Brain3D.tsx` | both: main's `SessionChat`, `useCameraShare`, `camera={camera}`; our `../components/ExplodeSlider` + `../components/StatusPill` imports (no `../learn/*`) | fe |
| `frontend/src/viewer/CaseCanvas.tsx` | both: main's `cameraSync` import, `CameraShare` + `camera?` prop, the three camera effects; our `cursorOf` + `RemoteCursors` imports, `live`/`push`, pointer handlers, `<RemoteCursors>`, our HOME comment | ai |

Store tail to append (fe, R2), unchanged from T4:

```ts
/** Any role. Best-effort: a dropped point is replaced by the next one. */
export function sendCursor(cursor: Cursor | null): void {
  const s = useShare.getState().stored;
  if (!client || !s) return;
  client.mutation(api.cursors.move, { ...auth(s), cursor }).catch(() => {});
}

/** Everyone else's cursors in this room. An end or stale token is handled by the sessions.get subscription. */
export function watchCursors(onRows: (rows: RemoteCursor[]) => void): () => void {
  const s = useShare.getState().stored;
  if (!client || !s) return () => {};
  return client.onUpdate(api.cursors.list, auth(s), onRows, () => onRows([]));
}
```

### Task R1: Start merge, resolve Convex + root (be)

- [ ] `git status` is clean, then run `git merge --no-ff --no-commit origin/main`. Expected conflicts: the 13 paths in the table (`convex/*`, `vitest.config.ts`, `frontend/*`).
- [ ] Resolve your rows, then `git add` them by path. Leave frontend conflicts untouched.
- [ ] Run `npm install && npm --prefix frontend install`.
- [ ] Wait until the convex-dev log shows a successful push after your resolution, then check `grep -c "cursors\|presence" convex/_generated/api.d.ts` > 0 and `git add convex/_generated`.
- [ ] Run `npm run typecheck && npm test` (root = `convex/` only; main's presence tests replace ours). Expected: exit 0.
- [ ] `hc send fe "R1 done: convex side resolved, <n> root tests pass; your rows next"`. Send nothing to lead unless blocked.

### Task R2: Resolve frontend share + Brain3D (fe)

- [ ] Run `impact` (or grep) on `useShare`, `startPresence`, `SharePopover`, `Brain3D`.
- [ ] Resolve your rows per the table, then `git add` them by path.
- [ ] `grep -rn "<<<<<<<\|>>>>>>>" frontend/src` → only `viewer/CaseCanvas.tsx` remains.
- [ ] `hc send ai "R2 done: your row (CaseCanvas) next"`.

### Task R3: Resolve CaseCanvas, run all gates, commit the merge (ai)

- [ ] Run `impact` on `CaseScene`, `CaseCanvas`.
- [ ] Resolve `CaseCanvas.tsx` per the table, keeping `live = jobId === 'sample'` for now (R4 widens it). Then `git add` it.
- [ ] `git diff --name-only --diff-filter=U` → empty, and `grep -rn "<<<<<<<" convex frontend/src docs` → empty.
- [ ] Gates: `npm run typecheck && npm test && npm --prefix frontend test && npm --prefix frontend run build`. Expected: all exit 0. Paste failures verbatim. A failure in someone else's row goes back to that owner by `hc send`; do not fix it yourself.
- [ ] `detect_changes({scope: "compare", base_ref: "main"})` (or `git diff --stat origin/main`): only this branch's files differ from main.
- [ ] Commit: `git commit -m "Merge origin/main into agents/presence-cursors" -m "Take main's Phase 3 presence (server, client, roster dots); keep cursors, face pile and Learning Mode removal." -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- [ ] Do R4 next, then `hc send qa "R3+R4 ready: <merge hash> <R4 hash>"` and `hc send lead "R3 done: <merge hash>, R4 done: <hash>, <root n>/<frontend n> tests"`.

### Task R4: Cursors on any shared case (ai)

**Files:** Modify `frontend/src/viewer/CaseCanvas.tsx` (the `live` line only); import `useShare` from `../share/store`.

- [ ] Replace

```ts
  const live = jobId === 'sample'; // sharing is sample-only (W2)
```

with

```ts
  const live = useShare((s) => s.stored?.jobId === jobId); // cursors on the case this session reviews; useCursorPush / RemoteCursors also require an active session
```

- [ ] Gates: `npm --prefix frontend test && npm --prefix frontend run build`. Expected: exit 0.
- [ ] Commit `feat(share): live 3D cursors on any shared case`, with the trailer.

### Task R5: Review + gates + browser re-run (qa)

- [ ] **Merge review.** Check `git show --stat <merge>` and `git diff origin/main..HEAD --stat`. Every path that differs from main must be in T0–T5 or R4's rows. Main's `convex/presence.ts`, `frontend/src/share/presence.ts` and `SharePopover.tsx` must be byte-identical to main's: `git diff origin/main HEAD -- <path>` prints nothing.
- [ ] **R4 review.** `git show <R4>`: one-line gate change plus the import.
- [ ] **Gates.** Run `npm run typecheck && npm test && npm --prefix frontend run build && npm --prefix frontend test`, then paste the counts.
- [ ] **Browser** (servers are already running; ask lead only if one is down). Re-run T7 Step 3, with these changes:
  - drop the "hide the guest tab → offline" line, because main keeps hidden tabs online by design;
  - add "a following guest sees the host's camera move and the host's cursor at the same time";
  - add "if a finished non-sample job exists (`GET http://localhost:8000/jobs`, or the Home list), share it and check cursors on its `/3d`". Otherwise mark that line SKIP and say why.
  - add "Session chat still sends both ways".
- [ ] **Report.** Append "## Re-run after merge with main" to `docs/qa/2026-10-24-presence-cursors/README.md`, one PASS/FAIL/SKIP per line. Commit it with the trailer. Send `hc send lead "R5: <n> PASS / <m> FAIL / <k> SKIP, commit <hash>"`, and send each FAIL to its owner.

Reconcile prompts (lead sends):

- **be:** "You are be. Plan `docs/superpowers/plans/2026-10-24-presence-cursors.md`, section 'Reconcile with main (R1–R5)'. Do **R1** exactly as written: superpowers:executing-plans inline, no subagents. You are the only one allowed to run `git merge`, once. Do not commit. Hand off to fe with `hc send fe`. Message lead only if blocked."
- **fe:** "You are fe. Same plan, section 'Reconcile with main'. Wait for be's 'R1 done', then do **R2**: your table rows only, no commit. Hand off to ai with `hc send ai`. Message lead only if blocked."
- **ai:** "You are ai. Same plan, section 'Reconcile with main'. Wait for fe's 'R2 done', then do **R3** (you commit the merge) and **R4**. Send owners' gate failures back to them. Done message to qa + lead per the plan."
- **qa:** "You are qa. Same plan, section 'Reconcile with main'. Do not commit anything while the merge is open. Wait for ai's 'R3+R4 ready', then do **R5**. Report to lead per the plan."

---

## Worker prompts (lead sends one per pane with `hc send <label> "<prompt>"`)

**be** (Codex):

> You are `be`. Plan: `docs/superpowers/plans/2026-10-24-presence-cursors.md`. Read "Global Constraints", "Worker rules" and "Ownership and order" first, then do **Task 1, then Task 2** exactly as written (superpowers:executing-plans, inline). Shared checkout on branch `agents/presence-cursors`: never switch, stash, reset, push or `git add -A`; stage your files by path. Run each step's command and paste failures verbatim. After each task: `hc send qa "T<n> ready: <hash>"` and `hc send lead "T<n> done: <hash>, <n> tests"`. If `npm run codegen` needs a Convex login, stop and `hc send lead "T1 blocked: codegen needs convex login"`. Do not touch `sessions` fields, `viewCommands.ts`, or the backend `/learn` handling (follow-up).

**ai** (Claude):

> You are `ai`. Plan: `docs/superpowers/plans/2026-10-24-presence-cursors.md`. Read "Global Constraints", "Worker rules" and "Ownership and order" first. Do **Task 3 now**; when committed, `hc send fe "T3 done: <hash>"`. Then wait for fe's `T4 done` message and do **Task 5**. superpowers:executing-plans, inline, no worktree. Shared checkout on branch `agents/presence-cursors`: never switch, stash, reset, push or `git add -A`. If the GLB test finds duplicate node names, stop and message lead. fe deletes Learning Mode in T0; do not touch those files. In T5, also fix the `AtlasCanvas` comment on `CaseCanvas.tsx` line 19 (Task 5 Step 1).

**fe** (Cursor):

> You are `fe`. Plan: `docs/superpowers/plans/2026-10-24-presence-cursors.md`. Read "Global Constraints", "Worker rules" and "Ownership and order" first, then do **Task 0** (remove Learning Mode) and send `hc send qa "T0 ready: <hash>"` and `hc send lead "T0 done: <hash>, <n> tests"`. Then do **Task 4** exactly as written. You may write T4 code once T0 is committed, but run `npm --prefix frontend test` only after ai sends `T3 done` (you import `colorOf` and the `Cursor` types from it). Shared checkout on branch `agents/presence-cursors`: never switch, stash, reset, push or `git add -A`; stage your files by path. When committed: `hc send ai "T4 done: <hash>"`, `hc send qa "T4 ready: <hash>"`, `hc send lead "T4 done: <hash>, <n> tests"`. Keep `structures.json` and `content/anatomy.json`; the Convex MCP imports them.

**qa** (Claude):

> You are `qa`. Plan: `docs/superpowers/plans/2026-10-24-presence-cursors.md`. Read "Worker rules" first (superpowers inline only, no subagents). Do **Task 6** for every `T<n> ready` message (scope check, diff vs plan, run that task's gate, reply PASS/FAIL to the owner, copy lead on FAIL). When T0–T5 all PASS, do **Task 7** Step 1, then wait for lead's `deployed` message before Steps 3–4. Never edit source files; you only commit the QA README. Shared checkout: never switch, stash, reset or push.
