# Convex Collaborative Backend — Phase 1

**Status: Phase 1 implemented and tested. Phases 2–6 not started.**
Owner: backend engineer. Written 2026-10-23.

This document covers the `convex/` directory: what is built, what it assumes,
where it disagrees with the existing specs, and what the next increment is.

It is written for a reader who knows Java/Spring and has not used Convex. If you
only want to call the functions, skip to [§6 Frontend quick reference](#6-frontend-quick-reference).

---

## 1. What Phase 1 delivers

Phase 1 is the Convex proof from `sage_context/BACKEND_CONTEXT.md` §11:

> Create one session; join with second browser tab/device. Build `sessions.get`,
> `sessions.updateView`, and reactive subscription. Verify switching
> plane/slice/tumor visibility updates second client automatically. Add a fixture
> scan record.
>
> **Accept:** two tabs viewing one session get identical meaningful shared state
> changes; no manual refresh.

Built:

| Thing | File | Notes |
|---|---|---|
| Schema: `scans`, `sessions`, `sessionParticipants` | `convex/schema.ts` | Phase 2+ tables deliberately absent |
| Coordinate transforms (voxel ↔ RAS mm) | `convex/lib/transform.ts` | Pure functions, 34 tests |
| Shared view command reducer | `convex/lib/viewCommands.ts` | Pure function, 20 tests |
| Bearer-token auth + role checks | `convex/lib/auth.ts` | One file, every call goes through it |
| Typed errors `{code, message}` | `convex/lib/errors.ts` | Same envelope as the imaging service's 422s |
| Capability token minting | `convex/lib/tokens.ts` | 80-bit invite codes, 160-bit participant tokens |
| Case metadata + registration | `convex/scans.ts` | Writes are internal-only |
| Sessions: create / join / get / updateView / setFollowMode / end | `convex/sessions.ts` | — |
| Membership roster | `convex/sessionParticipants.ts` | Membership, **not** presence |
| Demo fixture scan | `convex/seed.ts` | `npx convex run seed:seedSampleScan` |

**Not built, and not pretended to be:** chat, annotations, presence, QR
generation, JARVIS, the LLM, FastAPI, and any ML integration. Those are
Phases 2–5.

---

## 2. Convex for a Java developer

### 2.1 The one idea that matters: queries are subscriptions

In Spring, "the other tab sees the change" means you write a WebSocket endpoint,
track subscribers, and publish an event after the transaction commits — and the
publish can silently drift out of sync with what changed.

Convex removes that layer entirely:

1. A browser calls `useQuery(api.sessions.get, { ... })`.
2. The server runs your query handler **and records which rows it read**.
3. When any mutation commits a write touching one of those rows, Convex re-runs
   the query and pushes the new result down the open connection.

So `sessions.updateView` contains no publish step. It does `ctx.db.patch(...)`
and stops. Every subscriber of every query that read that row gets an update,
and the dependency cannot drift because it is derived from what the query
actually read.

**The design consequence:** keep the shared row small and semantic. Every write
to `sessions` re-runs every subscriber's query. That is cheap at one write per
deliberate action and ruinous at 60 writes per second — which is exactly why
camera pose and hand landmarks are not in the database.

### 2.2 Function kinds

| Convex | Roughly | Can write? | Callable from browser? | `fetch`? |
|---|---|---|---|---|
| `query` | `@GetMapping` | no | yes | no |
| `mutation` | `@PostMapping` + `@Transactional(SERIALIZABLE)` | yes | yes | no |
| `action` | `@Async` service method | only via `runMutation` | yes | **yes** |
| `internalQuery` / `internalMutation` / `internalAction` | package-private service method | — | **no** | — |

"Internal" is a real server-enforced boundary, not a naming convention: internal
functions are absent from the public API surface, so a browser cannot invoke one
even knowing its name. `scans.register` and `scans.setStatus` are internal
because only the imaging service may declare what a case contains.

`fetch` and `setTimeout` genuinely do not exist inside a query or mutation —
that is what keeps a mutation deterministic and retryable. External calls go in
an `action`, which a mutation can start with `ctx.scheduler.runAfter(0, ...)`.
This is why Phase 4's LLM work must be an action.

### 2.3 Things that surprised me, written down

- **`Date.now()` is frozen inside a mutation.** It returns the transaction's
  timestamp every time it is called. `sessions.create` calls it three times and
  gets three identical numbers — relied upon, not a coincidence.
- **Randomness works in a mutation.** `crypto.getRandomValues` is available and
  cryptographically secure; Convex seeds it per execution so a retry replays the
  same bytes. Verified on a real deployment.
- **There is no `WHERE` without an index.** Looking a row up by a field requires
  `.index(...)` in `schema.ts` first, then
  `.withIndex("by_token", q => q.eq("token", t))`. This is a feature: it makes
  an accidental full-table scan impossible to write by mistake.
- **`.unique()` throws if it finds two rows.** Used for token lookup, where two
  matches would be a serious invariant violation and picking one arbitrarily
  would be worse than failing.
- **`convex/_generated/` must be committed.** Convex writes it, but nothing
  typechecks without it and teammates have no credentials to regenerate it.

### 2.4 Where the type safety comes from

`convex/schema.ts` is the only place table shapes are declared. `ctx.db`'s types,
`Doc<"sessions">` and `Id<"scans">` are all derived from it by codegen, so there
is no DTO duplication and no mapping layer. The `v.*` validators in the schema
and in each function's `args` are enforced **at runtime**, so a malformed
argument is rejected before your handler runs. TypeScript is not the security
boundary; the validators are.

---

## 3. Design decisions, and why

### 3.1 The shared cursor is stored in millimetres, not as a slice index

`BACKEND_CONTEXT.md` §5 proposed `sessions.sliceIndex: number`.
`SPEC.md` §5.2 says the opposite, and is explicit:

> The **physical cursor is stored in RAS mm** and is the single shared position.
> Slice indices are derived from the cursor, never stored.

**Decision: follow SPEC.** `sessions.cursorRasMm` is authoritative; slice indices
are derived on every read and returned alongside, for all three planes
(`view.sliceIndices`). The API still *speaks* slice indices — `setSlice`,
`stepSlice`, `view.sliceIndex` — so BACKEND_CONTEXT's intent is met. Only the
storage differs.

Why this matters rather than being a style choice:

- Storing both would be two sources of truth for one value, which is how you get
  a 2 mm misalignment nobody can explain. SPEC §5.3 treats that as stop-the-line.
- A plane switch must not move the cursor. With a stored index, "slice 42" means
  something different in each plane and switching loses your position. With a 3D
  cursor it is free (test: *"changes the plane without moving the cursor"*).
- Phase 2 annotations are voxel-anchored. They need the same affine maths, so
  building it now means annotations inherit tested code.

### 3.2 Slice indices are derived through the affine, not assumed

"Axial slice 77" is an index into the NIfTI array, and **which** of i/j/k that is
depends on the scan's affine. A NIfTI can be stored in any of 48 orientations;
voxel k is not always superior–inferior.

`rasAxisToVoxelAxis()` reads the affine's upper-left 3×3, assigns each voxel axis
to whichever RAS axis it points along most strongly, and records the sign — the
standard orientation-code approach (same idea as nibabel's `aff2axcodes`).

It is **exact** for any affine that is a signed permutation of scaled axes, which
covers every BraTS-preprocessed scan (SPEC D1: co-registered, 1 mm isotropic).
A heavily oblique affine is **rejected at registration** rather than
approximated, because an approximation there produces a plausible number and a
wrong picture. Tested with a permuted-and-flipped affine and with a 45° oblique
one.

### 3.3 Validate-and-clamp vs validate-and-reject

Two different reactions, on purpose:

- **Reject** (`INVALID_ARGUMENT`) input that could only come from a bug: a
  fractional slice index, a NaN, revealing a tumor on a case that has none.
- **Clamp** silently when a legitimate interaction ran off the end: slice 400 of
  a 155-slice volume. A presenter dragging a slider past the last slice should
  land on the last slice, not get an error toast mid-demo. SPEC §7.3 sets the
  same house rule.

### 3.4 No-op commands do not write

`updateView` runs the pure reducer, compares before and after, and **skips the
patch entirely** if nothing changed, returning `{ applied: false }`. This is a
success, not an error — the UI must not flash a message.

It is also the main rate-limit mechanism: a "next slice" gesture held against the
end of the volume produces zero writes and therefore zero subscriber wake-ups
(test: *"absorbs a gesture held against the end of the volume"*).

### 3.5 Auth: bearer capability tokens

No auth provider is chosen (BACKEND_CONTEXT §3: "Not yet locked") and demo judges
will not sign up for anything. So:

- `sessions.create` mints a session, a host participant, and that participant's
  token.
- `sessions.join` takes an **invite code** and mints a viewer participant + token.
- Everything else takes `participantToken` and resolves it to a row.

What this gets right:

- A Convex document id is **not** a credential. Knowing a `sessionId` does
  nothing. BACKEND_CONTEXT §6: "session ID alone is not authorization."
- Role is read from the server's row, never from an argument.
- Tokens and invite codes are returned **only** by the mutation that mints them
  and by `sessions.getInviteCode` (presenter only). No other query returns them,
  and there is a test that serialises the whole `sessions.get` payload and greps
  it for every secret.
- A token valid for room A does nothing in room B (test:
  *"refuses a valid token from a DIFFERENT session"*).

#### Accepted limitations — read before the demo

1. **Tokens are stored in plaintext** and never expire or rotate. Production
   stores a SHA-256 digest. Acceptable here only because the data is
   de-identified public research imagery.
2. **A leaked invite code is reusable** by anyone, any number of times.
3. **Joining twice creates two participant rows**, because without accounts there
   is nothing to deduplicate on. If a judge reloads a page that re-joins, the
   roster shows them twice. Mitigation is client-side: keep `participantToken` in
   `sessionStorage` and call `sessions.get` instead of re-joining.

Migrating to Clerk/Convex Auth later changes **only** `convex/lib/auth.ts`:
`requireParticipant` would read `ctx.auth.getUserIdentity()` and look up by
`subject`. No function signature outside that file moves.

### 3.6 Follow mode is per-participant

BACKEND_CONTEXT §5 said to choose explicitly between a session-wide flag and a
per-participant one. **Chosen: per-participant.**

The server always writes one authoritative shared view. The flag only tells each
client whether to *apply* it. So a viewer who stops following cannot desync
anyone else, and resuming follow snaps straight to the current view with no
catch-up logic. `setFollowMode` has no `participantId` argument, which is what
makes "only your own flag" structurally true rather than merely checked.

### 3.7 Membership is not presence

`sessionParticipants` is durable membership: "these people are members of this
room and hold these permissions." It survives a refresh and a closed laptop.

Presence — "these people have a tab open right now" — is Phase 3 and **is not
built**. Rendering this roster as green "online" dots would be a lie. The
`lastSeenAt` column is the seed of that future work and is untouched.

---

## 4. Contract mismatches found during Phase 1

These need team decisions. I implemented the reading noted under each, and
nothing here blocks Phase 1.

### M1 — `SPEC.md` has no Convex layer at all *(needs a spec PR)*

`SPEC.md` v1.2 is marked **LOCKED for the hackathon** and its stack decision (D7)
is: "frontend = Vite + React + TS, R3F + drei, Zustand, NiiVue, MediaPipe.
Backend = Tom's FastAPI + MONAI + PyTorch (CPU) in Docker." There is no mention
of Convex, sessions, chat, presence, annotations, or QR joining anywhere in it.

`BACKEND_CONTEXT.md` describes a substantially different product — "NeuroLens
Live Review" — built on Convex as the primary application backend, aimed at the
**Best Use of Convex** prize.

Both files claim to be the source of truth. `CONTRIBUTING.md` says the spec wins
until changed through a PR, so **the collaborative layer is currently outside the
locked spec.** This should be a `SPEC.md` section plus a Decision Log entry
(`§14`, format `date · hour · decision · why · PR`), not just a directory that
appeared.

### M2 — The product has two names

`SPEC.md`/`BACKEND_CONTRACT.md` say **NeuroVision**. `BACKEND_CONTEXT.md` says
**NeuroLens**. I used "NeuroVision" in code comments, since that is what the
locked spec and the repo's docs use. Pick one before the pitch.

### M3 — Jarvis: deterministic-only vs LLM-backed

`SPEC.md` D8: "**Jarvis = deterministic.** Speech → rule-based parser → typed
`Action` → dispatcher. LLM intent fallback is P1 (text only). RAG medical answers
are P2."

`BACKEND_CONTEXT.md` §11 Phase 4 wants LLM-backed `/jarvis summarize chat` plus
stored rolling summaries and a `sessionSummaries` table.

These are reconcilable — SPEC's P1 "LLM intent fallback" is roughly
BACKEND_CONTEXT's Phase 4 — but the scope differs and SPEC D8 is a locked
decision. **Resolve before Phase 4 starts**, not during it. Phase 1 is unaffected.

### M4 — `report` has no affine *(needs Tom)*

`BACKEND_CONTRACT.md` §2.2 defines the report, and it carries `input.shape`,
`input.spacingMm`, `coordinateFrame: "RAS_mm"`, centroids and bboxes — but **not
the 4×4 NIfTI affine**.

Convex needs the affine to convert voxel ↔ RAS mm, which is required for:
- bounds-checking the shared slice cursor (Phase 1, working now on the fixture);
- bounds-checking voxel-anchored annotations server-side (Phase 2, blocking).

**Ask:** add the input affine to the report, e.g.
`"affineRowMajor": [16 numbers]` with the stated convention
`p_ras = A · [i, j, k, 1]ᵀ`, row-major. Tom's pipeline already has it — it is
applied to the GLB vertices (contract §1.2).

Spacing + shape is **not** a substitute: it gives the scale but not the origin or
the orientation, and reconstructing an affine from those is exactly the silent
misalignment SPEC §5.3 guards against.

### M5 — `plane` vs `axis`, `tumorVisible` vs `tumorRevealed`

Same concepts, different names across the two documents, and the value sets are
identical (`axial | coronal | sagittal`). The Convex API uses
BACKEND_CONTEXT's `plane` / `tumorVisible`; `lib/viewCommands.ts` documents the
mapping to SPEC's `Action` names against each command. Cosmetic, but worth
unifying in `frontend/src/api/types.ts` so the frontend does not translate twice.

### M6 — Shared view is a subset of `ViewerState`

SPEC §7.2's `ViewerState` has 12 fields. Phase 1 synchronizes three: `plane`,
`cursorRasMm`, `tumorVisible`. The rest — `mode`, `brainOpacity`,
`explodeAmount`, `cut`, `hidden`, `layers`, `selected`, `cameraTarget` — stay
client-local.

That is the right Phase 1 scope (it is what BACKEND_CONTEXT's acceptance test
names), but it means a presenter switching to Cutaway does **not** switch the
judge's view. Widening the shared set is a Phase 2 decision to take *with* the
frontend owners; the obvious candidates are `mode` and `layers`. Adding them is
mechanical: a field on `sessions`, a case in the command union, a case in
`applyCommand`.

---

## 5. Running it

```bash
npm install

# One-time: configure a local deployment with no Convex account.
# Writes CONVEX_DEPLOYMENT / CONVEX_URL to .env.local and regenerates
# convex/_generated/.
CONVEX_AGENT_MODE=anonymous npx convex dev --once

# Seed the fixture scan (internal function — a browser cannot call this).
npx convex run seed:seedSampleScan

npm run typecheck     # tsc --noEmit
npm test              # vitest, 91 tests
npm run dev           # watch mode: pushes on save, regenerates types
```

To use a real cloud deployment instead, run `npx convex login` then
`npx convex dev` and drop the `CONVEX_AGENT_MODE` variable.

### Manual two-tab check — the actual Phase 1 acceptance gate

The automated tests verify the data contract both clients observe. They **cannot**
verify the websocket push, because `convex-test` has no open subscriptions. That
has to be checked by hand once the React app exists:

1. `npm run dev` and start the frontend.
2. Tab A: create a session on the fixture scan. Note the invite code.
3. Tab B (ideally a second device): join with the code.
4. In Tab A, change plane / step slices.
5. **Tab B must update with no refresh and no click.**
6. Refresh both tabs; the shared view must persist.
7. In Tab B, try to change the view; it must be refused with `NOT_PRESENTER`.

Until step 5 has been observed on real hardware, Phase 1 is **implemented but
not accepted**.

---

## 6. Frontend quick reference

All functions live under `api.*` (public) — nothing else is callable from the
browser. Errors are `ConvexError` carrying `{ code, message }`:

```ts
import { ConvexError } from "convex/values";

try {
  await updateView({ sessionId, participantToken, command: { type: "stepSlice", delta: 1 } });
} catch (e) {
  if (e instanceof ConvexError) {
    const { code, message } = e.data as { code: string; message: string };
    // code: NOT_PRESENTER | NOT_AUTHENTICATED | NOT_A_MEMBER | INVALID_INVITE
    //     | NOT_FOUND | SESSION_ENDED | INVALID_ARGUMENT | BAD_SCAN_GEOMETRY
  }
}
```

### Queries (subscribe with `useQuery`)

| Function | Args | Returns |
|---|---|---|
| `scans.list` | `{}` | `PublicScan[]` — case picker |
| `scans.get` | `{ scanId }` | `PublicScan \| null` |
| `scans.getByJobId` | `{ jobId }` | `PublicScan \| null` — for `/jobs/:id/*` routes |
| `sessions.get` | `{ sessionId, participantToken }` | `SessionStateDto` — **the main subscription** |
| `sessions.getInviteCode` | `{ sessionId, participantToken }` | `{ inviteCode }` — presenter only |
| `sessionParticipants.list` | `{ sessionId, participantToken }` | `PublicParticipant[]` |

### Mutations (`useMutation`)

| Function | Args | Returns |
|---|---|---|
| `sessions.create` | `{ scanId, hostDisplayName }` | `{ sessionId, inviteCode, participantToken, participantId, role }` |
| `sessions.join` | `{ inviteCode, displayName }` | `{ sessionId, participantToken, participantId, role }` |
| `sessions.updateView` | `{ sessionId, participantToken, command }` | `{ applied, viewVersion, view }` |
| `sessions.setFollowMode` | `{ sessionId, participantToken, following }` | `{ following }` |
| `sessions.end` | `{ sessionId, participantToken }` | `{ status }` |

### `command` — the `ViewerCommand` union

```ts
type ViewerCommand =
  | { type: "setPlane"; plane: "axial" | "coronal" | "sagittal" }
  | { type: "setSlice"; index: number }        // absolute, integer
  | { type: "stepSlice"; delta: number }       // integer, magnitude capped at 32
  | { type: "setTumorVisible"; visible: boolean }
  | { type: "resetView" };
```

Pointer, keyboard, gesture and voice must all funnel into this. When Phase 4
adds `/jarvis next slice`, the parser's only job is to produce one of these — it
gets no privileges of its own.

### `sessions.get` result shape

```ts
{
  sessionId, status: "active" | "ended", createdAt, updatedAt,
  scan: {                       // PublicScan
    scanId, jobId, displayName, status, segmentationSource, isFixture,
    modalityNames, dimensions: {i,j,k}, voxelSpacingMm, coordinateSystem: "RAS",
    affineRowMajor,             // 16 numbers, ROW-major (see warning below)
    volumeExtentMm: { min, max },
    brain?, tumor?,             // absent until a real report exists
    assets: { modelGlbPath?, segNiftiPath?, flairNiftiPath?, reportPath? },
    sliceCounts: { axial, coronal, sagittal },
    createdAt, errorMessage?,
  },
  view: {
    plane, cursorRasMm,         // [x, y, z] RAS mm — the shared position
    tumorVisible, viewVersion,
    sliceIndex, sliceCount,     // for the CURRENT plane
    sliceIndices: { axial, coronal, sagittal },
  },
  me: { participantId, displayName, role, following, joinedAt },
  participants: [ /* same shape, no tokens */ ],
  isPresenter: boolean,
}
```

### Three things that will bite the frontend

1. **`affineRowMajor` is row-major.** `THREE.Matrix4.elements` is
   **column-major**. Feeding it straight in transposes your scan.
2. **`assets.*Path` are paths, not URLs.** Prefix `VITE_API_URL`.
3. **`isFixture: true` must be surfaced.** The fixture has no segmentation and
   its affine is a placeholder (see §7). Do not render it as a result.

---

## 7. Known gaps and open items

### Blocking Phase 2

- **The fixture's affine is a placeholder.** `seed.ts` builds a centred, 1 mm
  isotropic RAS affine. A real Decathlon case has its own, non-centred affine.
  This is self-consistent — enough to prove two clients agree — but it is **not**
  enough for the SPEC §5.3 alignment check (3D marker vs NiiVue crosshair within
  2 mm). Replace it the moment `GET /jobs/sample/report` exists. Needs **M4**.
- **M4: the report must carry the affine.** Needs Tom.

### Deliberately deferred, with reasons

- **No server-side rate limit on `updateView`.** The command model already keeps
  traffic to one write per deliberate action, and the no-op short-circuit absorbs
  a held gesture. Throttling continuous input is the frontend dispatcher's job
  (SPEC §7.3). A server limiter belongs with Phase 4, where the thing being
  protected is LLM spend. This is a decision, not an oversight.
- **No `http.ts` ingest endpoint.** Phase 5. `scans.register` / `scans.setStatus`
  are already internal mutations with the right shape for an authenticated HTTP
  action to call; `NEUROVISION_INGEST_SECRET` is reserved in `.env.example`.
- **`scans.list` is unauthenticated.** Safe only because the table holds nothing
  but de-identified public research cases and fixtures. **If real uploaded cases
  ever land in this table, this function must change first** — it would otherwise
  enumerate every case in the deployment.
- **No presenter hand-over.** `requirePresenter` already cross-checks
  `session.hostParticipantId`, so the check is ready for it.
- **Ended sessions are never cleaned up.** `status: "ended"` is a soft delete, so
  Phase 2 chat and annotations are not destroyed with the room. No cron yet.

### Next increment (Phase 2)

1. `messages.send` / `messages.list` — session-scoped, **paginated**
   (`.paginate()`, not `.collect()`; guardrail 8).
2. `annotations.create` / `list` / `remove` — voxel-anchored, bounds-checked with
   `isVoxelInBounds`, which is already written and tested.
3. Decide **M6**: whether `mode` and `layers` join the shared view.

Keep it to one testable increment, per `sage_context/AGENTS.md`.

---

## 8. Repo layout note

`convex/` is at the repo root, as `BACKEND_CONTEXT.md` §10 specifies.
`SPEC.md` §6 puts the React app at `frontend/` and Tom's service at `backend/`,
which does not conflict.

When the frontend lands it gets its **own** `package.json` and `tsconfig.json`
(the browser build needs DOM libs and JSX; the Convex runtime does not), and
imports generated types across the boundary:

```ts
import { api } from "../../convex/_generated/api";
```

There is exactly **one** TypeScript config for this directory,
`convex/tsconfig.json`. It is the file the Convex CLI generates and uses on every
push, so `npm run typecheck` (`tsc --noEmit -p convex`) points at the same one —
an editor cannot disagree with CI about what counts as an error. There is
deliberately no root `tsconfig.json`.

### Files this phase touched

Created: `convex/**`, `docs/CONVEX_BACKEND.md`, `.env.example`, `package.json`,
`package-lock.json`, `vitest.config.ts`.
Modified: `.gitignore` only — added Node entries, and un-ignored `convex/lib/`,
which the inherited Python `lib/` build-artifact rule was silently swallowing.

No teammate frontend, Python, or ML code exists in the repo yet, and nothing
outside the list above was created or changed. `docs/SPEC.md` and
`docs/BACKEND_CONTRACT.md` are untouched — the mismatches in §4 are for the team
to resolve by PR, not for this phase to edit unilaterally.

## 9. Shared human/agent records (#56)

These additive tables preserve `scans`, `sessions`, and `sessionParticipants`.
Human UI/REST functions (Sage) and agent/MCP functions use the same records.

| Table | Fields beyond attribution | Indexes |
|---|---|---|
| `annotations` | `jobId`, `sessionId?`, `text`, `anchor`, `status` | `by_job(jobId)`, `by_session(sessionId)` |
| `messages` | `jobId`, `sessionId?`, `clientId?`, `role`, `text`, `runId?`, `toolSteps?` | `by_job_time(jobId, createdAt)`, `by_session_time(sessionId, createdAt)`, `by_client_time(clientId, createdAt)`, `search_text` on text, filtered by job/session/client |
| `sessionSummaries` | `jobId`, `sessionId?`, `clientId?`, `text`, `coversUpTo`, `version` | `by_session(sessionId)`, `by_client(clientId)` |
| `exports` | `jobId`, `sessionId?`, `format`, `trigger`, `reason?`, `status`, `fileId?`, `error?`, `version`, `sections` | `by_job(jobId)`, `by_session(sessionId)` |

Every row requires the flat `vAuthor` fields from `convex/lib/author.ts`:
`author: "human" | "agent"`, `authorName: string`,
`source: "ui" | "rest" | "mcp" | "agent"`, and `createdAt: number` (server epoch ms).
`authorName` is an untrusted display label, never permission or identity.

`authorFor(caller)` takes **only a server-resolved caller**: a human participant
resolved by the authentication path (`{ kind: "human", displayName, source: "ui" | "rest" }`),
or an authenticated agent (`{ kind: "agent", name, source: "mcp" | "agent" }`).
Never accept author fields, caller kind, or source from the public request body.
Authenticate/authorize first, then spread the helper result into a write. The
helper projects known fields and supplies `Date.now()`; it does not authenticate.

For annotation creation, use `annotationFor(caller)` instead: it includes the
same attribution and sets initial `status: "suggested"` for an agent, `"accepted"`
for a human. **D10:** a human subsequently Accepts or Dismisses an agent note;
exports include only accepted notes unless all are explicitly requested. Schema
allows all three statuses so those later transitions remain possible. Creation
and transition policy must go through the shared mutations, never direct public
inserts. This PR provides schema/helpers only; #53/#54 own those functions.

Anchors are `{ kind: "point", ras_mm: number[] }` (RAS mm),
`{ kind: "structure", id: string }` (resolved atlas id), or `{ kind: "tumor" }`.
The shared annotation functions must enforce a finite 3-vector and bounds for
points, valid structures/tumor availability, and the 280-character limit. Convex
string/array schema validators enforce types; these semantic checks belong in
the shared mutation. MCP initially uses structure/tumor anchors until the report
carries an affine. Messages similarly require a 2000-character cap in their
shared insert function. Text and tool arguments are data, never instructions.

`toolSteps` holds `{ id, tool, args, ok, message, ms }[]`, matching the plan's run
steps. `runId` is an optional typed reference to the forthcoming `agentRuns`
table (#67), not a new run table owned by this task. Summaries use `coversUpTo`
for the last message time covered. Exports reference `_storage`, use `md | pdf`,
`manual | auto`, optional `job_done | left_explore | checkpoint` reasons, and an
array of section names. Versions let writers append instead of overwrite.

Checks: `npm run typecheck` and `npm test`. `convex-test` inserts each minimal
record, rejects each table without author, exercises the indexes/search, and
verifies the agent annotation helper path starts suggested. Deploying the schema
uses the same `npx convex dev` flow as §5; no deployment credentials belong in git.

Export lifecycle: new rows start `pending` with no file. The shared internal
mutation `exportRecords.setState` rejects `ready` without `fileId`; `failed`
requires a safe error message and has no file. `ready` rows have a storage file
and no error. Builders use this mutation to publish completion; UI callers can
render progress from `status` rather than infer it from `fileId`. Completed rows
are immutable: request a new version for a new export.

## 10. Shared Markdown exports and MCP (#62)

`internal.exportDoc.build({ exportId })` is the single deterministic builder for
human-button reservations (#61) and MCP exports. A request authorizes its scope,
creates a new `pending` row with the next per-job version, and invokes the builder.
The builder reads only requested sections, stores a UTF-8 Markdown Blob, and calls
`internal.exportRecords.setState` to publish `ready` with `fileId`. Failures leave
`failed` with a safe message and no file; an uncommitted uploaded file is deleted.
Rebuilding a ready row returns its existing URL instead of overwriting it.

The human mutation should authenticate its participant, create a `pending` export
with `authorFor(resolvedHumanCaller)`, and schedule
`internal.exportDoc.build({ exportId })`. The builder does not invent a second
human or agent formatting path. The MCP adapter calls the internal
`exportDoc.request` action, which checks the participant capability before
reserving a row with server-resolved agent attribution and `trigger: manual`.
The internal `agentName` argument is supplied by the MCP transport context only;
it is not in the public tool input schema.

Sections: `case`, `report`, `annotations`, `summary`, `conversation`, `tool_steps`.
The document always includes `Educational visualization; not clinically validated`.
The case is labelled `Atlas (template brain, not a patient)` for `atlas`/`learn`.
Report metrics come only from `report.json`: volumes, side, lesions, outline
certainty and expert outline agreement (Dice), with no percentage conversions or
scan-table substitutes. Missing report/empty certainty is stated explicitly.
Built-in `sample`/`sample-2` reports come from the checked-in JSON; other cases use
server-only `IMAGING_API_URL` when configured (the same setting as MCP knowledge
reads). Requests cannot supply a URL; fetched case ids and report fields are
validated. Seed fallback applies only when no imaging URL is configured.

Private sections require **both `session_id` and `participant_token`**. The server
checks membership and that the session's scan matches `job_id`. A valid MCP
service token alone grants neither session membership nor access to any chat,
summary, or annotation. Reads filter by both job and session; unrelated sessions
and standalone client rows are excluded. Atlas/report-only exports need no
participant capability and perform no private-table reads. Acquiring a participant
token from Desktop is pairing (#70), outside this task.

Annotations default to accepted only. Add `suggested_annotations` to `sections`
only when explicitly asked: it includes accepted plus suggested notes, never
dismissed ones. Every note, message, summary and tool step shows Human/AI and the
server-stamped display label; summaries use the latest appended row. User text,
labels and tool arguments are escaped/quoted as data, never instructions. The
builder redacts the contract's banned words and credential-like tool argument
fields (tokens/authorization/secrets) before writing the file; raw chat records
are unchanged.

`convex/mcp/exportTools.ts` exports `registerExportTools(server, deps)`, matching
#68's module registration pattern. `deps` needs its authenticated service caller
and ActionCtx; `caller.authorName`, if present, is server-resolved (`Claude Desktop`
for a per-user token, specialist name for the app). The current env-token fallback
is `Scribe`. The tool accepts `job_id`, `format`, `sections`, optional `session_id`
and `participant_token`, and returns `{ exportId, url, version }`. It defaults to
case/report sections. PDF is explicitly rejected; auto-export triggers are deferred.
Until #68 lands, import the module into that server and pass it through its
`createServer(deps, [registerExportTools])` extension list; this standalone module
does not add a second HTTP server or bypass #68's authentication/rate limit.

Validation: full Convex typecheck/tests, including actual SDK Client tool listing
and calls over an in-memory transport, exact metrics from both seeds, human/MCP
builder equivalence, session isolation, suggested-note selection, failure states,
idempotent ready builds, and banned-word filtering across every free-text section.

Local smoke: applied this builder to an isolated anonymous deployment, invoked
`exportDoc:request` for sample case/report sections, and fetched the returned
storage URL with curl while `convex dev` was running. HTTP 200 served Markdown
with the exact seed volumes and certainty plus the required notice.
