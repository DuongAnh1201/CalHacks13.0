# 3D Workspace Whiteboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and execute INLINE in your own pane, task by task. Do not spawn subagents. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Miro-style board on the /3d page: threaded comments (replacing pins), sticky notes, text labels, pen + highlighter, per-user Cmd/Ctrl+Z undo.

**Architecture:** `annotations` stays the comment root (agent tools, MCP, report keep working) and gains replies + resolve. A new `boardItems` table holds stickies, text and strokes. Anchored items render with the existing drei `<Html>` + `worldOf` pin machinery; strokes are an SVG overlay tied to a camera pose. Undo is a client-side command stack whose steps are Convex mutations.

**Tech Stack:** Convex (+ convex-test, vitest), React 19 + R3F + drei, zustand, TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-25-3d-whiteboard-design.md`

## Workers and order

| Worker | Pane | Tasks | Starts |
|---|---|---|---|
| be (Codex) | backend | B1 → B2 → B3 | now |
| fe (Cursor) | frontend | F1 → F2 → F3 → F4 → F5 → F6 | now (frontend uses untyped `anyApi`, so it does not wait for be codegen); F4–F6 need B1+B2 deployed locally for manual checks |
| qa (Claude) | report-only | Q1 after B3, Q2 after F6, Q3 after both | on lead-2's signal |

be owns every file under `convex/`. fe owns every file under `frontend/`. Nobody edits the other side's files; contract changes go through lead-2.

## Coordination

- Everyone shares ONE checkout. Never switch/checkout/stash/reset/rebase/push; `git add <paths>` only, never `-A`.
- Talk to peers directly: `hc send <be|fe|qa> "<msg>"`. Name yourself first: `hc name <your-name>`.
- Make routine decisions yourself (naming, styling, small API shape inside your own files, test details). Record a deviation in the commit message.
- Message lead-2 only with: completed work (task ids, commit shas, gate counts), or an unresolved blocker that needs a decision. No progress updates, acks or chatter.
- Contract change needed? Agree it with the other side over `hc send`, then tell lead-2 in the completion message.

## Global Constraints

- ONE shared git checkout, branch `feature/live-transcript-panel`. Never switch/checkout/stash/reset/rebase/push. `git add <paths>` only, never `-A`.
- Before editing a symbol run GitNexus `impact({target, direction: "upstream"})`; before each commit run `detect_changes()`. Report HIGH/CRITICAL to lead-2 before proceeding.
- Text caps: sticky/text 280 chars (`MAX_ANNOTATION_LENGTH`), reply 1000 chars.
- Caps: 500 board items per session, of which ≤ 300 strokes; ≤ 2000 point pairs per stroke; stroke width 1..32; color `#rrggbb`.
- Over-cap errors use the existing code `INVALID_ARGUMENT` (the annotation cap already does). New code: `STALE` only.
- Every free-text value in reports goes through `clean()` / `exportText()`.
- No `board.restore`: undo of a delete calls `board.create` with the old payload (new id, caller becomes author).
- Backend gate: `npm run typecheck && npx vitest run convex`. Frontend gate: `npm --prefix frontend run build && npm --prefix frontend test && npm --prefix frontend run lint`.
- Commit messages end with `Co-Authored-By:` line of the agent that wrote them.

## Contract (both sides code against this)

```ts
// convex/schema.ts
type Anchor = { kind: "point"; ras_mm: number[] } | { kind: "structure"; id: string } | { kind: "tumor" };
type StickyColor = "yellow" | "pink" | "blue" | "green";
type BoardItem =
  | { kind: "sticky"; anchor: Anchor; text: string; color: StickyColor }
  | { kind: "text"; anchor: Anchor; text: string }
  | { kind: "stroke"; camera: { position: number[]; target: number[] }; points: number[]; color: string; width: number; mode: "pen" | "highlight" };

// board.list → PublicBoardItem[] (oldest first)
type PublicBoardItem = { itemId: string; item: BoardItem; authorName: string; mine: boolean; canRemove: boolean; createdAt: number; updatedAt: number };
// board.create({ sessionId, participantToken, item }) → { itemId, updatedAt }
// board.update({ ..., itemId, expectedUpdatedAt, patch: { anchor?, text?, color? } }) → { updatedAt }   // STALE if row changed; INVALID_ARGUMENT on strokes
// board.remove({ ..., itemId, expectedUpdatedAt? }) → { removed: true }                               // author or host; STALE if expected given and differs

// annotations.list → PublicAnnotation[] gains:
//   resolvedAt: number | null; canResolve: boolean;
//   replies: { replyId: string; text: string; author: "human" | "agent"; authorName: string; createdAt: number; canRemove: boolean }[]
// annotations.remove({ ..., annotationId, ifNoReplies? }) → STALE when ifNoReplies and replies exist
// annotations.reply({ ..., annotationId, text }) → { replyId }
// annotations.removeReply({ ..., replyId }) → { removed: true }   // reply author or host
// annotations.resolve / annotations.unresolve({ ..., annotationId }) → null   // annotation author or host
```

---

## Backend (be)

### Task B1: `boardItems` table and `convex/board.ts`

**Files:**
- Modify: `convex/schema.ts` (add `vStickyColor`, `vBoardItem`, table `boardItems`)
- Modify: `convex/lib/errors.ts` (add `STALE`)
- Modify: `convex/annotations.ts` (export `validateAnchor`, `isSessionHost`; no behaviour change)
- Create: `convex/board.ts`
- Test: `convex/tests/board.test.ts`

**Interfaces:**
- Produces: `api.board.list|create|update|remove` exactly as in Contract; `MAX_BOARD_ITEMS = 500`, `MAX_STROKES = 300`, `MAX_STROKE_POINTS = 2000` exported from `convex/board.ts`.

- [ ] **Step 1: Schema + error code**

In `convex/schema.ts`, after `vAnnotationAnchor`:

```ts
export const vStickyColor = v.union(v.literal("yellow"), v.literal("pink"), v.literal("blue"), v.literal("green"));
export const vBoardItem = v.union(
  v.object({ kind: v.literal("sticky"), anchor: vAnnotationAnchor, text: v.string(), color: vStickyColor }),
  v.object({ kind: v.literal("text"), anchor: vAnnotationAnchor, text: v.string() }),
  v.object({
    kind: v.literal("stroke"),
    camera: v.object({ position: vVec3, target: vVec3 }),
    points: v.array(v.number()), // flat x,y pairs in 0..1 of the stage
    color: v.string(),
    width: v.number(),
    mode: v.union(v.literal("pen"), v.literal("highlight")),
  }),
);
```

In the table map, next to `annotations`:

```ts
  boardItems: defineTable({
    sessionId: v.id("sessions"),
    jobId: v.string(),
    authorParticipantId: v.id("sessionParticipants"),
    authorName: v.string(), // display label only, never identity
    createdAt: v.number(),
    updatedAt: v.number(),
    updatedBy: v.id("sessionParticipants"),
    item: vBoardItem,
  }).index("by_session", ["sessionId"]),
```

In `convex/lib/errors.ts` add to `AppErrorCode`:

```ts
  /** The record changed (or vanished) since the caller last saw it; used by undo. */
  | "STALE"
```

In `convex/annotations.ts` change `function validateAnchor` → `export function validateAnchor` and `function isSessionHost` → `export function isSessionHost`.

- [ ] **Step 2: Write the failing tests** — `convex/tests/board.test.ts`

```ts
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { MAX_STROKE_POINTS } from "../board";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import schema from "../schema";

async function expectAppError(promise: Promise<unknown>, code: AppErrorCode): Promise<AppErrorData> {
  try { await promise; } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    const data = (error as ConvexError<AppErrorData>).data;
    expect(data.code).toBe(code);
    return data;
  }
  throw new Error(`expected ${code}`);
}

async function setUpRoom() {
  const t = convexTest({ schema });
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: host.inviteCode, displayName: "Judge" });
  const other = await t.mutation(api.sessions.join, { email: "o@example.com", inviteCode: host.inviteCode, displayName: "Other" });
  const asHost = { sessionId: host.sessionId, participantToken: host.participantToken };
  const asViewer = { sessionId: viewer.sessionId, participantToken: viewer.participantToken };
  const asOther = { sessionId: other.sessionId, participantToken: other.participantToken };
  return { t, scanId, asHost, asViewer, asOther };
}

const anchor = { kind: "point" as const, ras_mm: [10, -20, 5] };
const sticky = { kind: "sticky" as const, anchor, text: "Check T2", color: "yellow" as const };
const stroke = (n = 2) => ({
  kind: "stroke" as const, camera: { position: [0, 0, 300], target: [0, 0, 0] },
  points: Array.from({ length: n * 2 }, (_, i) => (i % 10) / 10), color: "#ff0000", width: 3, mode: "pen" as const,
});

describe("board", () => {
  it("a sticky one member creates is listed for the others", async () => {
    const { t, asHost, asViewer } = await setUpRoom();
    const { itemId } = await t.mutation(api.board.create, { ...asViewer, item: sticky });
    const rows = await t.query(api.board.list, asHost);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ itemId, item: sticky, authorName: "Judge", mine: false, canRemove: true });
    const mine = await t.query(api.board.list, asViewer);
    expect(mine[0]).toMatchObject({ mine: true, canRemove: true });
  });

  it("any member edits; a stale expectedUpdatedAt is rejected", async () => {
    const { t, asViewer, asOther } = await setUpRoom();
    const { itemId, updatedAt } = await t.mutation(api.board.create, { ...asViewer, item: sticky });
    const r = await t.mutation(api.board.update, { ...asOther, itemId, expectedUpdatedAt: updatedAt, patch: { text: "Edited" } });
    expect(r.updatedAt).toBeGreaterThanOrEqual(updatedAt);
    await expectAppError(t.mutation(api.board.update, { ...asViewer, itemId, expectedUpdatedAt: updatedAt - 1, patch: { color: "pink" } }), "STALE");
    expect((await t.query(api.board.list, asViewer))[0].item).toMatchObject({ text: "Edited", color: "yellow" });
  });

  it("only the author or the host removes", async () => {
    const { t, asHost, asViewer, asOther } = await setUpRoom();
    const a = await t.mutation(api.board.create, { ...asViewer, item: sticky });
    await expectAppError(t.mutation(api.board.remove, { ...asOther, itemId: a.itemId }), "NOT_ALLOWED");
    await t.mutation(api.board.remove, { ...asHost, itemId: a.itemId });
    const b = await t.mutation(api.board.create, { ...asViewer, item: sticky });
    await expectAppError(t.mutation(api.board.remove, { ...asViewer, itemId: b.itemId, expectedUpdatedAt: b.updatedAt - 1 }), "STALE");
    await t.mutation(api.board.remove, { ...asViewer, itemId: b.itemId, expectedUpdatedAt: b.updatedAt });
    expect(await t.query(api.board.list, asHost)).toHaveLength(0);
  });

  it("validates text, color, stroke shape and anchor", async () => {
    const { t, asViewer } = await setUpRoom();
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...sticky, text: "  " } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...sticky, text: "x".repeat(281) } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...stroke(), color: "red" } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...stroke(), width: 40 } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...stroke(), points: [0.1, 0.2, 0.3] } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...stroke(), points: [0.1, 1.5] } }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: stroke(MAX_STROKE_POINTS + 1) }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.board.create, { ...asViewer, item: { ...sticky, anchor: { kind: "point", ras_mm: [0, 0, 999] } } }), "INVALID_ARGUMENT");
  });

  it("strokes cannot be updated", async () => {
    const { t, asViewer } = await setUpRoom();
    const s = await t.mutation(api.board.create, { ...asViewer, item: stroke() });
    await expectAppError(t.mutation(api.board.update, { ...asViewer, itemId: s.itemId, expectedUpdatedAt: s.updatedAt, patch: { text: "x" } }), "INVALID_ARGUMENT");
  });

  it("an id from another session is NOT_FOUND", async () => {
    const { t, scanId, asViewer } = await setUpRoom();
    const other = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Elsewhere" });
    const s = await t.mutation(api.board.create, { ...asViewer, item: sticky });
    await expectAppError(t.mutation(api.board.remove, { sessionId: other.sessionId, participantToken: other.participantToken, itemId: s.itemId }), "NOT_FOUND");
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npx vitest run convex/tests/board.test.ts` → fails: `api.board` undefined.

- [ ] **Step 4: Implement `convex/board.ts`**

```ts
/**
 * The session whiteboard on /3d: sticky notes, text labels and pen strokes.
 * Comments are not here: they stay in `annotations` (agent tools and export read them).
 * Any member may add or edit; only the author or the host may remove (same rule as notes).
 */
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { isSessionHost, MAX_ANNOTATION_LENGTH, validateAnchor } from "./annotations";
import { requireSessionMember } from "./lib/auth";
import { appError } from "./lib/errors";
import { loadScan } from "./scans";
import { vAnnotationAnchor, vBoardItem, vStickyColor } from "./schema";

export const MAX_BOARD_ITEMS = 500;
export const MAX_STROKES = 300;
export const MAX_STROKE_POINTS = 2000;

type Item = Doc<"boardItems">["item"];
export type PublicBoardItem = {
  itemId: Id<"boardItems">; item: Item; authorName: string; mine: boolean; canRemove: boolean; createdAt: number; updatedAt: number;
};

function validateItem(scan: Doc<"scans">, item: Item): Item {
  if (item.kind === "stroke") {
    const p = item.points;
    if (p.length < 4 || p.length % 2 !== 0 || p.length > MAX_STROKE_POINTS * 2 || !p.every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
      throw appError("INVALID_ARGUMENT", `A sketch needs 2 to ${MAX_STROKE_POINTS} points inside the view.`);
    }
    if (!/^#[0-9a-f]{6}$/i.test(item.color)) throw appError("INVALID_ARGUMENT", "That color is not valid.");
    if (!(item.width >= 1 && item.width <= 32)) throw appError("INVALID_ARGUMENT", "Line width must be 1 to 32.");
    const pose = [...item.camera.position, ...item.camera.target];
    if (item.camera.position.length !== 3 || item.camera.target.length !== 3 || !pose.every(Number.isFinite)) {
      throw appError("INVALID_ARGUMENT", "That camera pose is not valid.");
    }
    return item;
  }
  const text = item.text.trim();
  if (!text) throw appError("INVALID_ARGUMENT", "Write something first.");
  if (text.length > MAX_ANNOTATION_LENGTH) throw appError("INVALID_ARGUMENT", `At most ${MAX_ANNOTATION_LENGTH} characters.`);
  return { ...item, text, anchor: validateAnchor(scan, item.anchor) };
}

async function rows(ctx: QueryCtx, sessionId: Id<"sessions">): Promise<Doc<"boardItems">[]> {
  return await ctx.db.query("boardItems").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
}

async function own(ctx: MutationCtx, sessionId: Id<"sessions">, itemId: Id<"boardItems">) {
  const row = await ctx.db.get(itemId);
  if (!row || row.sessionId !== sessionId) throw appError("NOT_FOUND", "That item is not on this board.");
  return row;
}

export const list = query({
  args: { sessionId: v.id("sessions"), participantToken: v.string() },
  handler: async (ctx, args): Promise<PublicBoardItem[]> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const host = isSessionHost(session, participant);
    return (await rows(ctx, session._id)).sort((a, b) => a.createdAt - b.createdAt).map((r) => ({
      itemId: r._id, item: r.item, authorName: r.authorName, createdAt: r.createdAt, updatedAt: r.updatedAt,
      mine: r.authorParticipantId === participant._id, canRemove: host || r.authorParticipantId === participant._id,
    }));
  },
});

export const create = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), item: vBoardItem },
  handler: async (ctx, args): Promise<{ itemId: Id<"boardItems">; updatedAt: number }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const scan = await loadScan(ctx, session.scanId);
    const item = validateItem(scan, args.item);
    const existing = await rows(ctx, session._id);
    if (existing.length >= MAX_BOARD_ITEMS) throw appError("INVALID_ARGUMENT", `Board is full (${MAX_BOARD_ITEMS} items).`);
    if (item.kind === "stroke" && existing.filter((r) => r.item.kind === "stroke").length >= MAX_STROKES) {
      throw appError("INVALID_ARGUMENT", `Too many sketches (${MAX_STROKES}).`);
    }
    const now = Date.now();
    const itemId = await ctx.db.insert("boardItems", {
      sessionId: session._id, jobId: scan.jobId, authorParticipantId: participant._id, authorName: participant.displayName,
      createdAt: now, updatedAt: now, updatedBy: participant._id, item,
    });
    return { itemId, updatedAt: now };
  },
});

export const update = mutation({
  args: {
    sessionId: v.id("sessions"), participantToken: v.string(), itemId: v.id("boardItems"), expectedUpdatedAt: v.number(),
    patch: v.object({ anchor: v.optional(vAnnotationAnchor), text: v.optional(v.string()), color: v.optional(vStickyColor) }),
  },
  handler: async (ctx, args): Promise<{ updatedAt: number }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const row = await own(ctx, session._id, args.itemId);
    if (row.updatedAt !== args.expectedUpdatedAt) throw appError("STALE", "Changed by someone else.");
    if (row.item.kind === "stroke") throw appError("INVALID_ARGUMENT", "Sketches cannot be edited.");
    if (args.patch.color !== undefined && row.item.kind !== "sticky") throw appError("INVALID_ARGUMENT", "Only sticky notes have a color.");
    const item = validateItem(await loadScan(ctx, session.scanId), { ...row.item, ...args.patch } as Item);
    // Strictly increasing, so two edits in one millisecond still look different to undo.
    const updatedAt = Math.max(Date.now(), row.updatedAt + 1);
    await ctx.db.patch(row._id, { item, updatedAt, updatedBy: participant._id });
    return { updatedAt };
  },
});

export const remove = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), itemId: v.id("boardItems"), expectedUpdatedAt: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ removed: true }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const row = await own(ctx, session._id, args.itemId);
    if (row.authorParticipantId !== participant._id && !isSessionHost(session, participant)) {
      throw appError("NOT_ALLOWED", "Only the author or the host can remove this.");
    }
    if (args.expectedUpdatedAt !== undefined && row.updatedAt !== args.expectedUpdatedAt) throw appError("STALE", "Changed by someone else.");
    await ctx.db.delete(row._id);
    return { removed: true };
  },
});
```

- [ ] **Step 5: Run, expect PASS** — `npx convex codegen && npx vitest run convex/tests/board.test.ts` then the backend gate.

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/lib/errors.ts convex/annotations.ts convex/board.ts convex/tests/board.test.ts convex/_generated
git commit -m "feat(board): boardItems table with sticky, text and stroke CRUD"
```

### Task B2: Comment replies, resolve, cascade

**Files:**
- Modify: `convex/schema.ts` (`annotations` gains `resolvedAt`, `resolvedBy`; new table `annotationReplies`)
- Modify: `convex/annotations.ts`
- Test: `convex/tests/annotations.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `isSessionHost` from B1.
- Produces: Contract's `annotations.*` additions; `MAX_REPLY_LENGTH = 1000`, `MAX_REPLIES_PER_THREAD = 100`.

- [ ] **Step 1: Schema**

In `annotations` table add:

```ts
    resolvedAt: v.optional(v.number()),
    resolvedBy: v.optional(v.id("sessionParticipants")),
```

New table:

```ts
  annotationReplies: defineTable({
    ...vAuthor.fields,
    sessionId: v.id("sessions"),
    annotationId: v.id("annotations"),
    authorParticipantId: v.optional(v.id("sessionParticipants")),
    text: v.string(), // <= MAX_REPLY_LENGTH, enforced in annotations.reply
  })
    .index("by_annotation", ["annotationId"])
    .index("by_session", ["sessionId"]),
```

- [ ] **Step 2: Failing tests** — append to `convex/tests/annotations.test.ts` (reuses its `setUpRoom`, `point`, `expectAppError`):

```ts
describe("annotations: threads", () => {
  it("members reply; replies come back with the thread, oldest first", async () => {
    const { t, asHost, asViewer } = await setUpRoom();
    const { annotationId } = await t.mutation(api.annotations.create, { ...asHost, text: "Lesion", anchor: point(1, 2, 3) });
    await t.mutation(api.annotations.reply, { ...asViewer, annotationId, text: "Agree" });
    await t.mutation(api.annotations.reply, { ...asHost, annotationId, text: "Check T2" });
    const [note] = await t.query(api.annotations.list, asViewer);
    expect(note.replies.map((r) => [r.authorName, r.text])).toEqual([["Judge", "Agree"], ["Presenter", "Check T2"]]);
    expect(note.replies.map((r) => r.canRemove)).toEqual([true, false]);
    expect(note.resolvedAt).toBeNull();
  });

  it("author or host resolves and reopens; others may not", async () => {
    const { t, asHost, asViewer } = await setUpRoom();
    const { annotationId } = await t.mutation(api.annotations.create, { ...asHost, text: "Lesion", anchor: point(1, 2, 3) });
    await expectAppError(t.mutation(api.annotations.resolve, { ...asViewer, annotationId }), "NOT_ALLOWED");
    await t.mutation(api.annotations.resolve, { ...asHost, annotationId });
    expect((await t.query(api.annotations.list, asViewer))[0].resolvedAt).toEqual(expect.any(Number));
    await t.mutation(api.annotations.unresolve, { ...asHost, annotationId });
    expect((await t.query(api.annotations.list, asViewer))[0].resolvedAt).toBeNull();
  });

  it("removing a thread removes its replies; ifNoReplies refuses when there are some", async () => {
    const { t, asHost, asViewer } = await setUpRoom();
    const { annotationId } = await t.mutation(api.annotations.create, { ...asHost, text: "Lesion", anchor: point(1, 2, 3) });
    await t.mutation(api.annotations.reply, { ...asViewer, annotationId, text: "Agree" });
    await expectAppError(t.mutation(api.annotations.remove, { ...asHost, annotationId, ifNoReplies: true }), "STALE");
    await t.mutation(api.annotations.remove, { ...asHost, annotationId });
    const left = await t.run((ctx) => ctx.db.query("annotationReplies").collect());
    expect(left).toHaveLength(0);
  });

  it("reply author or host removes a reply; text is validated", async () => {
    const { t, asHost, asViewer } = await setUpRoom();
    const { annotationId } = await t.mutation(api.annotations.create, { ...asHost, text: "Lesion", anchor: point(1, 2, 3) });
    await expectAppError(t.mutation(api.annotations.reply, { ...asViewer, annotationId, text: " " }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.annotations.reply, { ...asViewer, annotationId, text: "x".repeat(1001) }), "INVALID_ARGUMENT");
    const { replyId } = await t.mutation(api.annotations.reply, { ...asHost, annotationId, text: "Mine" });
    await expectAppError(t.mutation(api.annotations.removeReply, { ...asViewer, replyId }), "NOT_ALLOWED");
    await t.mutation(api.annotations.removeReply, { ...asHost, replyId });
    expect((await t.query(api.annotations.list, asHost))[0].replies).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run, expect FAIL** — `npx vitest run convex/tests/annotations.test.ts` → `api.annotations.reply` undefined.

- [ ] **Step 4: Implement in `convex/annotations.ts`**

Extend the header comment's WHAT LIVES HERE list with `reply`, `removeReply`, `resolve`, `unresolve`. Then:

```ts
export const MAX_REPLY_LENGTH = 1000;
export const MAX_REPLIES_PER_THREAD = 100;

export type PublicReply = { replyId: Id<"annotationReplies">; text: string; author: "human" | "agent"; authorName: string; createdAt: number; canRemove: boolean };
```

`PublicAnnotation` gains `resolvedAt: number | null; canResolve: boolean; replies: PublicReply[];`.

In `listLiveAnnotations`, load replies once and group:

```ts
  const replies = await ctx.db.query("annotationReplies").withIndex("by_session", (q) => q.eq("sessionId", session._id)).collect();
  const host = isSessionHost(session, participant);
  const byThread = new Map<string, PublicReply[]>();
  for (const r of replies.sort((a, b) => a.createdAt - b.createdAt)) {
    const list = byThread.get(r.annotationId) ?? [];
    list.push({ replyId: r._id, text: r.text, author: r.author, authorName: r.authorName, createdAt: r.createdAt,
      canRemove: host || r.authorParticipantId === participant._id });
    byThread.set(r.annotationId, list);
  }
```

and in the push: `resolvedAt: a.resolvedAt ?? null, canResolve: host || a.authorParticipantId === participant._id, replies: byThread.get(a._id) ?? []`.

```ts
async function deleteReplies(ctx: MutationCtx, annotationId: Id<"annotations">) {
  const rows = await ctx.db.query("annotationReplies").withIndex("by_annotation", (q) => q.eq("annotationId", annotationId)).collect();
  for (const r of rows) await ctx.db.delete(r._id);
  return rows.length;
}

async function threadIn(ctx: MutationCtx, session: Doc<"sessions">, annotationId: Id<"annotations">) {
  const a = await ctx.db.get(annotationId);
  if (a === null || a.sessionId !== session._id) throw appError("NOT_FOUND", "That annotation does not exist in this session.");
  return a;
}

export const reply = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), annotationId: v.id("annotations"), text: v.string() },
  handler: async (ctx, args): Promise<{ replyId: Id<"annotationReplies"> }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const a = await threadIn(ctx, session, args.annotationId);
    const text = args.text.trim();
    if (!text) throw appError("INVALID_ARGUMENT", "A reply needs some text.");
    if (text.length > MAX_REPLY_LENGTH) throw appError("INVALID_ARGUMENT", `A reply can be at most ${MAX_REPLY_LENGTH} characters.`);
    const count = (await ctx.db.query("annotationReplies").withIndex("by_annotation", (q) => q.eq("annotationId", a._id)).collect()).length;
    if (count >= MAX_REPLIES_PER_THREAD) throw appError("INVALID_ARGUMENT", `A thread can hold at most ${MAX_REPLIES_PER_THREAD} replies.`);
    const replyId = await ctx.db.insert("annotationReplies", {
      ...authorFor({ kind: "human", displayName: participant.displayName, source: "ui" }),
      sessionId: session._id, annotationId: a._id, authorParticipantId: participant._id, text,
    });
    return { replyId };
  },
});
```

Use `authorFor` (not `annotationFor`: replies have no `status`). Add `import { annotationFor, authorFor } from "./lib/author";`.

```ts
export const removeReply = mutation({
  args: { sessionId: v.id("sessions"), participantToken: v.string(), replyId: v.id("annotationReplies") },
  handler: async (ctx, args): Promise<{ removed: true }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const r = await ctx.db.get(args.replyId);
    if (r === null || r.sessionId !== session._id) throw appError("NOT_FOUND", "That reply does not exist in this session.");
    if (r.authorParticipantId !== participant._id && !isSessionHost(session, participant)) throw appError("NOT_ALLOWED", "Only the author or the host can remove this reply.");
    await ctx.db.delete(r._id);
    return { removed: true };
  },
});

function resolver(resolved: boolean) {
  return mutation({
    args: { sessionId: v.id("sessions"), participantToken: v.string(), annotationId: v.id("annotations") },
    handler: async (ctx, args): Promise<null> => {
      const { session, participant } = await requireSessionMember(ctx, args);
      const a = await threadIn(ctx, session, args.annotationId);
      if (a.authorParticipantId !== participant._id && !isSessionHost(session, participant)) throw appError("NOT_ALLOWED", "Only the author or the host can resolve this.");
      await ctx.db.patch(a._id, resolved ? { resolvedAt: Date.now(), resolvedBy: participant._id } : { resolvedAt: undefined, resolvedBy: undefined });
      return null;
    },
  });
}
export const resolve = resolver(true);
export const unresolve = resolver(false);
```

`remove` gains arg `ifNoReplies: v.optional(v.boolean())`; before `ctx.db.delete(annotation._id)`:

```ts
    if (args.ifNoReplies) {
      const any = await ctx.db.query("annotationReplies").withIndex("by_annotation", (q) => q.eq("annotationId", annotation._id)).first();
      if (any) throw appError("STALE", "Others replied; delete it from the thread instead.");
    }
    await deleteReplies(ctx, annotation._id);
```

`agentRemove`: call `await deleteReplies(ctx, annotation._id);` before its delete.

- [ ] **Step 5: Run, expect PASS** — `npx convex codegen && npx vitest run convex/tests/annotations.test.ts`, then the backend gate (MCP tests included: `npm test`).

- [ ] **Step 6: Commit**

```bash
git add convex/schema.ts convex/annotations.ts convex/tests/annotations.test.ts convex/_generated
git commit -m "feat(comments): replies, resolve and reply cascade on annotations"
```

### Task B3: Board and threads in the report email

**Files:**
- Modify: `convex/lib/clinicalReport.ts` (`ReportInput`, `ReportDoc`, three renderers)
- Modify: `convex/reportMail.ts` (`load`, `Loaded`)
- Test: `convex/tests/clinicalReport.test.ts`, `convex/tests/reportMail.test.ts`

**Interfaces:**
- Consumes: tables from B1, B2.
- Produces: `ReportDoc.annotations[i].replies: { author: string; text: string }[]`, `ReportDoc.annotations[i].resolved: boolean`, `ReportDoc.board: { author: string; kind: "Sticky" | "Text"; color: string | null; text: string }[]`, `ReportDoc.sketches: number`. `ReportInput` gains optional `board?: Doc<"boardItems">[]`, `replies?: Doc<"annotationReplies">[]`.

- [ ] **Step 1: Failing tests** — in `convex/tests/clinicalReport.test.ts`, extend the `input()` helper (or pass extra fields) and add:

```ts
  it("includes replies, resolved flag, stickies, text and a sketch count", async () => {
    const base = await input();
    const annotation = { ...base.data.annotations[0], _id: "a1" as any, resolvedAt: 1 };
    const doc = buildReportDoc({
      ...base,
      data: { ...base.data, annotations: [annotation] },
      replies: [{ annotationId: "a1", author: "human", authorName: "Judge", text: "Agree, diagnosis pending", createdAt: 2 } as any],
      board: [
        { authorName: "Judge", item: { kind: "sticky", text: "Check T2", color: "pink", anchor: { kind: "tumor" } }, createdAt: 3 } as any,
        { authorName: "Host", item: { kind: "text", text: "Rim", anchor: { kind: "tumor" } }, createdAt: 4 } as any,
        { authorName: "Host", item: { kind: "stroke" }, createdAt: 5 } as any,
      ],
    });
    expect(doc.annotations[0]).toMatchObject({ resolved: true, replies: [{ author: "Human: Judge", text: "Agree, [redacted] pending" }] });
    expect(doc.board).toEqual([
      { author: "Judge", kind: "Sticky", color: "pink", text: "Check T2" },
      { author: "Host", kind: "Text", color: null, text: "Rim" },
    ]);
    expect(doc.sketches).toBe(1);
    for (const out of [renderMarkdown(doc), renderHtml(doc)]) {
      expect(out).toContain("Sticky notes & text");
      expect(out).toContain("Check T2");
      expect(out).toContain("1 sketch was drawn on the board.");
      expect(out).toContain("resolved");
    }
  });
```

In `convex/tests/reportMail.test.ts`, in the existing happy-path send test, create one sticky (`api.board.create`) and one reply before ending the session, then assert the mocked fetch body's `text` contains the sticky text and the reply text.

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run convex/tests/clinicalReport.test.ts convex/tests/reportMail.test.ts`.

- [ ] **Step 3: Implement**

`ReportDoc`:

```ts
  annotations: { author: string; anchor: string; text: string; status: string; resolved: boolean; replies: { author: string; text: string }[] }[];
  board: { author: string; kind: "Sticky" | "Text"; color: string | null; text: string }[];
  sketches: number;
```

`buildReportDoc` (destructure `board = [], replies = []`):

```ts
    annotations: data.annotations.map((row) => ({
      /* existing fields */
      resolved: row.resolvedAt != null,
      replies: replies.filter((r) => r.annotationId === row._id).sort((a, b) => a.createdAt - b.createdAt)
        .map((r) => ({ author: clean(`${r.author === "human" ? "Human" : "AI"}: ${r.authorName}`), text: clean(r.text) })),
    })),
    board: board.slice().sort((a, b) => a.createdAt - b.createdAt).flatMap((r) => r.item.kind === "stroke" ? [] : [{
      author: clean(r.authorName), kind: r.item.kind === "sticky" ? "Sticky" as const : "Text" as const,
      color: r.item.kind === "sticky" ? r.item.color : null, text: clean(r.item.text),
    }]),
    sketches: board.filter((r) => r.item.kind === "stroke").length,
```

Renderers, right after Annotations (markdown shown; mirror in html with `esc` and docx with `p`):

```ts
const sketchLine = (n: number) => n ? `${n} sketch${n === 1 ? " was" : "es were"} drawn on the board.` : "";
// annotation line: append `${a.resolved ? " · resolved" : ""}` and, per reply, "\n  - ↳ **author**: text"
"## Sticky notes & text\n\n" + ([...doc.board.map((b) => `- **${t(b.author)}** · ${b.kind}${b.color ? ` (${b.color})` : ""}: ${t(b.text)}`), sketchLine(doc.sketches)].filter(Boolean).join("\n") || "Nothing was added to the board."),
```

`reportMail.load`: after annotations,

```ts
    const board = await ctx.db.query("boardItems").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
    const replies = await ctx.db.query("annotationReplies").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).collect();
    return { jobId: scan.jobId, endedAt: session.updatedAt, participants: people.map((p) => p.displayName), data, board, replies };
```

and `type Loaded` gains `board: Doc<"boardItems">[]; replies: Doc<"annotationReplies">[]`.

- [ ] **Step 4: Run, expect PASS** — backend gate.

- [ ] **Step 5: Commit**

```bash
git add convex/lib/clinicalReport.ts convex/reportMail.ts convex/tests/clinicalReport.test.ts convex/tests/reportMail.test.ts
git commit -m "feat(report-mail): include board items, comment replies and resolved state"
```

Then `hc send lead-2 "B1-B3 done <shas>, gate PASS <counts>"`.

---

## Frontend (fe)

All new UI lives in `frontend/src/board/`. Frontend calls Convex through untyped `api` (`share/client.ts`), so mirror types by hand in `share/types.ts`.

### Task F1: Types and store calls

**Files:**
- Modify: `frontend/src/share/types.ts`
- Modify: `frontend/src/share/store.ts`
- Test: `frontend/src/share/store.test.ts` (append)

**Interfaces:**
- Produces:
  - types `StickyColor`, `BoardItem`, `BoardRow` (= Contract `PublicBoardItem`), `CameraPoseDto = { position: number[]; target: number[] }`, `Reply`; `Note` gains `resolvedAt: number | null; canResolve: boolean; replies: Reply[]`.
  - `watchBoard(onRows: (r: BoardRow[]) => void): () => void`
  - `sessionCall<T>(fn: SessionFn, args: Record<string, unknown>): Promise<T>` — throws the raw error (keeps `.data.code`).
  - `type SessionFn = 'board.create' | 'board.update' | 'board.remove' | 'annotations.create' | 'annotations.remove' | 'annotations.reply' | 'annotations.removeReply' | 'annotations.resolve' | 'annotations.unresolve'`

- [ ] **Step 1: Types** — append to `share/types.ts`:

```ts
export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green';
export interface CameraPoseDto { position: number[]; target: number[] }
/** Mirror of convex/schema.ts vBoardItem. Strokes: flat x,y pairs in 0..1 of the stage. */
export type BoardItem =
  | { kind: 'sticky'; anchor: NoteAnchor; text: string; color: StickyColor }
  | { kind: 'text'; anchor: NoteAnchor; text: string }
  | { kind: 'stroke'; camera: CameraPoseDto; points: number[]; color: string; width: number; mode: 'pen' | 'highlight' };
/** Mirror of convex/board.ts PublicBoardItem. */
export interface BoardRow { itemId: string; item: BoardItem; authorName: string; mine: boolean; canRemove: boolean; createdAt: number; updatedAt: number }
/** Mirror of convex/annotations.ts PublicReply. */
export interface Reply { replyId: string; text: string; author: 'human' | 'agent'; authorName: string; createdAt: number; canRemove: boolean }
```

and extend `Note` with `resolvedAt: number | null; canResolve: boolean; replies: Reply[];`.

- [ ] **Step 2: Failing test** — append to `share/store.test.ts` (follow its existing fake-client setup):

```ts
it('sessionCall passes auth and rethrows the ConvexError data', async () => {
  const calls: unknown[] = [];
  const err = new ConvexError({ code: 'STALE', message: 'Changed' });
  const f = fakeClient({ 'board:update': (args) => { calls.push(args); throw err; } });
  useClientForTest(f.client as never);
  useShare.setState({ stored: { sessionId: 's1', participantToken: 'tok', role: 'host', inviteCode: 'c', jobId: 'sample' } as never });
  await expect(sessionCall('board.update', { itemId: 'i1' })).rejects.toBe(err);
  expect(calls).toEqual([{ sessionId: 's1', participantToken: 'tok', itemId: 'i1' }]);
});
```

`fakeClient(over)` (store.test.ts:11) keys handlers by `module:function`. Add `sessionCall` to the file's `./store` import; `ConvexError` is already imported.

- [ ] **Step 3: Run, expect FAIL** — `npm --prefix frontend test -- store`.

- [ ] **Step 4: Implement** — in `share/store.ts` next to `watchNotes`:

```ts
/** The session board (stickies, text, strokes), oldest first. A no-op outside a session. */
export function watchBoard(onRows: (r: BoardRow[]) => void): () => void {
  const s = useShare.getState().stored;
  if (!client || !s) return () => {};
  return client.onUpdate(api.board.list, auth(s), onRows, (e: Error) => console.error('[board]', e));
}

export type SessionFn = 'board.create' | 'board.update' | 'board.remove' | 'annotations.create' | 'annotations.remove'
  | 'annotations.reply' | 'annotations.removeReply' | 'annotations.resolve' | 'annotations.unresolve';

/** Board and comment writes. Throws with the ConvexError intact so undo can tell STALE from a real failure. */
export async function sessionCall<T>(fn: SessionFn, args: Record<string, unknown>): Promise<T> {
  const s = useShare.getState().stored;
  if (!client || !s) throw new Error(NOT_CONFIGURED);
  const [mod, name] = fn.split('.');
  return (await client.mutation(api[mod][name], { ...auth(s), ...args })) as T;
}
```

Add `useBoard(jobId)` in a new `frontend/src/board/useBoard.ts`, a copy of `share/useNotes.ts` with `watchBoard` / `BoardRow`.

- [ ] **Step 5: Run, expect PASS** — frontend gate.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/share/types.ts frontend/src/share/store.ts frontend/src/share/store.test.ts frontend/src/board/useBoard.ts
git commit -m "feat(board): client types, watchBoard and sessionCall"
```

### Task F2: Undo history and board commands

**Files:**
- Create: `frontend/src/board/history.ts`, `frontend/src/board/commands.ts`
- Test: `frontend/src/board/history.test.ts`

**Interfaces:**
- Consumes: `sessionCall`, `codeOf` (`share/copy.ts`).
- Produces:
  - `interface Command { label: string; do(): Promise<void>; undo(): Promise<void> }`
  - `createHistory(opts: { skippable(e: unknown): boolean; onSkip(label: string): void; cap?: number })` → `{ run(c): Promise<void>; undo(): Promise<void>; redo(): Promise<void>; clear(): void; sizes(): { past: number; future: number } }`
  - `history` singleton + `toast` zustand store `useBoardToast` (`{ text: string | null }`)
  - command factories in `commands.ts`: `createItem(item)`, `updateItem(row, patch)`, `removeItem(row)`, `createComment(text, anchor)`, `setResolved(annotationId, resolved)`.

- [ ] **Step 1: Failing tests** — `history.test.ts`:

```ts
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
```

- [ ] **Step 2: Run, expect FAIL** — `npm --prefix frontend test -- history`.

- [ ] **Step 3: Implement `history.ts`**

```ts
import { create } from 'zustand';
import { codeOf } from '../share/copy';

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
    clear() { past.length = 0; future.length = 0; },
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
```

- [ ] **Step 4: Implement `commands.ts`**

```ts
import { sessionCall } from '../share/store';
import type { BoardItem, BoardRow, NoteAnchor, StickyColor } from '../share/types';
import type { Command } from './history';

type Patch = { anchor?: NoteAnchor; text?: string; color?: StickyColor };
type Ref = { id: string; updatedAt: number };

const create = async (item: BoardItem, ref: Ref) => {
  const r = await sessionCall<{ itemId: string; updatedAt: number }>('board.create', { item });
  ref.id = r.itemId; ref.updatedAt = r.updatedAt;
};
const remove = (ref: Ref) => sessionCall('board.remove', { itemId: ref.id, expectedUpdatedAt: ref.updatedAt }).then(() => {});

/** Redo re-creates the item under a new id; `ref` follows it so later steps still find it. */
export function createItem(item: BoardItem): Command {
  const ref: Ref = { id: '', updatedAt: 0 };
  return { label: `add ${item.kind}`, do: () => create(item, ref), undo: () => remove(ref) };
}

export function removeItem(row: BoardRow): Command {
  const ref: Ref = { id: row.itemId, updatedAt: row.updatedAt };
  return { label: `delete ${row.item.kind}`, do: () => remove(ref), undo: () => create(row.item, ref) };
}

export function updateItem(row: BoardRow, patch: Patch): Command {
  const ref: Ref = { id: row.itemId, updatedAt: row.updatedAt };
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, (row.item as Record<string, unknown>)[k]])) as Patch;
  const apply = (p: Patch) => async () => {
    const r = await sessionCall<{ updatedAt: number }>('board.update', { itemId: ref.id, expectedUpdatedAt: ref.updatedAt, patch: p });
    ref.updatedAt = r.updatedAt;
  };
  return { label: `edit ${row.item.kind}`, do: apply(patch), undo: apply(before) };
}

export function createComment(text: string, anchor: NoteAnchor): Command {
  let id = '';
  return {
    label: 'add comment',
    do: async () => { id = (await sessionCall<{ annotationId: string }>('annotations.create', { text, anchor })).annotationId; },
    // ifNoReplies: undo never deletes other people's replies; the server answers STALE and the step is skipped.
    undo: () => sessionCall('annotations.remove', { annotationId: id, ifNoReplies: true }).then(() => {}),
  };
}

export function setResolved(annotationId: string, resolved: boolean): Command {
  const call = (r: boolean) => () => sessionCall(r ? 'annotations.resolve' : 'annotations.unresolve', { annotationId }).then(() => {});
  return { label: resolved ? 'resolve' : 'reopen', do: call(resolved), undo: call(!resolved) };
}
```

- [ ] **Step 5: Run, expect PASS** — frontend gate.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/board/history.ts frontend/src/board/history.test.ts frontend/src/board/commands.ts
git commit -m "feat(board): per-user undo history and board commands"
```

### Task F3: Tool store, toolbar, keyboard

**Files:**
- Create: `frontend/src/board/tool.ts`, `frontend/src/board/keys.ts`, `frontend/src/board/Toolbar.tsx`, `frontend/src/board/Toolbar.module.css`, `frontend/src/board/icons.tsx`
- Test: `frontend/src/board/keys.test.ts`

**Interfaces:**
- Produces:
  - `type Tool = 'select' | 'comment' | 'sticky' | 'text' | 'pen' | 'highlight'`
  - `useBoardTool` zustand: `{ tool: Tool; draft: { tool: 'comment' | 'sticky' | 'text'; mm: Vec3 } | null; selected: string | null; pose: CameraPoseDto | null; goToPose: { pose: CameraPoseDto; n: number } | null }` with setters `setTool`, `setBoardDraft`, `selectItem`, `setPose`, `requestPose`.
  - `keyAction(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, typing: boolean): KeyAction | null`, `type KeyAction = { type: 'undo' } | { type: 'redo' } | { type: 'tool'; tool: Tool } | { type: 'delete' }`
  - `useBoardKeys(enabled: boolean, onDelete: () => void)` hook; `<Toolbar disabled={boolean} />`.

- [ ] **Step 1: Failing tests** — `keys.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { keyAction } from './keys';

const k = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) =>
  ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, ...mods });

describe('keyAction', () => {
  it('maps undo and redo on mac and windows', () => {
    expect(keyAction(k('z', { metaKey: true }), false)).toEqual({ type: 'undo' });
    expect(keyAction(k('z', { ctrlKey: true }), false)).toEqual({ type: 'undo' });
    expect(keyAction(k('Z', { metaKey: true, shiftKey: true }), false)).toEqual({ type: 'redo' });
    expect(keyAction(k('y', { ctrlKey: true }), false)).toEqual({ type: 'redo' });
  });
  it('maps tool letters and Escape', () => {
    expect(keyAction(k('s'), false)).toEqual({ type: 'tool', tool: 'sticky' });
    expect(keyAction(k('h'), false)).toEqual({ type: 'tool', tool: 'highlight' });
    expect(keyAction(k('Escape'), false)).toEqual({ type: 'tool', tool: 'select' });
    expect(keyAction(k('Delete'), false)).toEqual({ type: 'delete' });
  });
  it('does nothing while typing, so Cmd+Z in a textarea stays native', () => {
    expect(keyAction(k('z', { metaKey: true }), true)).toBeNull();
    expect(keyAction(k('s'), true)).toBeNull();
    expect(keyAction(k('Backspace'), true)).toBeNull();
  });
  it('ignores letters with modifiers (browser shortcuts)', () => {
    expect(keyAction(k('c', { metaKey: true }), false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `tool.ts`**

```ts
import { create } from 'zustand';
import type { CameraPoseDto } from '../share/types';
import type { Vec3 } from '../viewer/transform';

export type Tool = 'select' | 'comment' | 'sticky' | 'text' | 'pen' | 'highlight';
export type Placeable = 'comment' | 'sticky' | 'text';
interface BoardTool {
  tool: Tool;
  /** A click on the brain with a placing tool: the inline editor opens here (scan mm). */
  draft: { tool: Placeable; mm: Vec3 } | null;
  selected: string | null;
  /** Live camera pose of this tab, for stroke fading. */
  pose: CameraPoseDto | null;
  /** A request like notes.goTo: the canvas acts when `n` changes. */
  goToPose: { pose: CameraPoseDto; n: number } | null;
}
export const useBoardTool = create<BoardTool>()(() => ({ tool: 'select', draft: null, selected: null, pose: null, goToPose: null }));
export const setTool = (tool: Tool) => useBoardTool.setState({ tool, draft: null });
export const setBoardDraft = (draft: BoardTool['draft']) => useBoardTool.setState({ draft });
export const selectItem = (selected: string | null) => useBoardTool.setState({ selected });
export const setPose = (pose: CameraPoseDto) => useBoardTool.setState({ pose });
export const requestPose = (pose: CameraPoseDto) => useBoardTool.setState((s) => ({ goToPose: { pose, n: (s.goToPose?.n ?? 0) + 1 } }));
export const isPlacing = (t: Tool): t is Placeable => t === 'comment' || t === 'sticky' || t === 'text';
```

- [ ] **Step 4: Implement `keys.ts`**

```ts
import { useEffect } from 'react';
import { history } from './history';
import { setTool, type Tool } from './tool';

export type KeyAction = { type: 'undo' } | { type: 'redo' } | { type: 'tool'; tool: Tool } | { type: 'delete' };
const LETTERS: Record<string, Tool> = { v: 'select', c: 'comment', s: 'sticky', t: 'text', p: 'pen', h: 'highlight' };

export function keyAction(e: Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey'>, typing: boolean): KeyAction | null {
  if (typing) return null;
  const key = e.key.toLowerCase();
  const mod = e.metaKey || e.ctrlKey;
  if (mod && key === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
  if (e.ctrlKey && key === 'y') return { type: 'redo' };
  if (mod || e.altKey) return null;
  if (e.key === 'Escape') return { type: 'tool', tool: 'select' };
  if (e.key === 'Delete' || e.key === 'Backspace') return { type: 'delete' };
  return LETTERS[key] ? { type: 'tool', tool: LETTERS[key] } : null;
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

export function useBoardKeys(enabled: boolean, onDelete: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      const a = keyAction(e, isTyping(e.target));
      if (!a) return;
      e.preventDefault();
      if (a.type === 'undo') void history.undo().catch((err) => console.error('[board]', err));
      else if (a.type === 'redo') void history.redo().catch((err) => console.error('[board]', err));
      else if (a.type === 'tool') setTool(a.tool);
      else onDelete();
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [enabled, onDelete]);
}
```

- [ ] **Step 5: Implement `Toolbar.tsx`** — a vertical pill (white, 8px radius, soft shadow, 40px buttons, matching the reference screenshot) of six buttons. Each button: `aria-label` + `title` with its shortcut ("Sticky note (S)"), `aria-pressed={tool === id}`, `onClick={() => setTool(id)}`. When `disabled`, every button is disabled and the bar has `title="Share to use the board"`. Icons in `icons.tsx` as 20px stroke SVGs (cursor arrow, speech bubble, square note with folded corner, "T", pen nib, highlighter). Below the buttons, Undo/Redo icon buttons calling `history.undo()` / `history.redo()`.

```tsx
import type { ReactNode } from 'react';
import { history } from './history';
import { CommentIcon, HighlightIcon, PenIcon, RedoIcon, SelectIcon, StickyIcon, TextIcon, UndoIcon } from './icons';
import { setTool, useBoardTool, type Tool } from './tool';
import css from './Toolbar.module.css';

const TOOLS: { id: Tool; label: string; icon: ReactNode }[] = [
  { id: 'select', label: 'Select (V)', icon: <SelectIcon /> },
  { id: 'comment', label: 'Comment (C)', icon: <CommentIcon /> },
  { id: 'sticky', label: 'Sticky note (S)', icon: <StickyIcon /> },
  { id: 'text', label: 'Text (T)', icon: <TextIcon /> },
  { id: 'pen', label: 'Pen (P)', icon: <PenIcon /> },
  { id: 'highlight', label: 'Highlighter (H)', icon: <HighlightIcon /> },
];

export function Toolbar({ disabled }: { disabled: boolean }) {
  const tool = useBoardTool((s) => s.tool);
  return (
    <div className={css.bar} role="toolbar" aria-label="Board tools" aria-orientation="vertical" title={disabled ? 'Share to use the board' : undefined}>
      {TOOLS.map((t) => (
        <button key={t.id} type="button" className={css.btn} aria-label={t.label} title={t.label} aria-pressed={tool === t.id}
          disabled={disabled} onClick={() => setTool(t.id)}>{t.icon}</button>
      ))}
      <hr className={css.sep} />
      <button type="button" className={css.btn} aria-label="Undo (⌘Z)" title="Undo (⌘Z)" disabled={disabled} onClick={() => void history.undo()}><UndoIcon /></button>
      <button type="button" className={css.btn} aria-label="Redo (⇧⌘Z)" title="Redo (⇧⌘Z)" disabled={disabled} onClick={() => void history.redo()}><RedoIcon /></button>
    </div>
  );
}
```

- [ ] **Step 6: Run, expect PASS** — frontend gate.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/board/tool.ts frontend/src/board/keys.ts frontend/src/board/keys.test.ts frontend/src/board/Toolbar.tsx frontend/src/board/Toolbar.module.css frontend/src/board/icons.tsx
git commit -m "feat(board): tool store, toolbar and keyboard shortcuts"
```

### Task F4: Anchored items — stickies, text, comment bubbles and threads

**Files:**
- Create: `frontend/src/board/BoardMarkers.tsx`, `frontend/src/board/BoardMarkers.module.css`, `frontend/src/board/Thread.tsx`, `frontend/src/board/DraftEditor.tsx`
- Modify: `frontend/src/viewer/CaseCanvas.tsx` (click → `setBoardDraft`; render `<BoardMarkers>`; pose reporting and `goToPose`)
- Modify: `frontend/src/share/NotePins.tsx` (stop rendering notes; keep `MarkerPins` and `Pin` for games)

**Interfaces:**
- Consumes: `useBoardTool`, `setBoardDraft`, `selectItem`, `setPose`, `isPlacing`; `history`, `createItem`, `updateItem`, `createComment`, `setResolved`; `sessionCall`; `anchorMm`, `scanMmToRas` (`share/notes.ts`); `worldOf` (`viewer/pins.ts`).
- Produces: `<BoardMarkers cs report notes rows />` (inside the R3F tree).

- [ ] **Step 1: CaseCanvas wiring**

Props gain `board?: BoardRow[]`. Replace the `placing` handler:

```tsx
  const tool = useBoardTool((s) => s.tool);
  ...
        onClick={isPlacing(tool) ? (e: ThreeEvent<MouseEvent>) => {
          if (e.delta > CLICK_SLOP_PX) return;
          const c = cursorOf(e.object, e.point);
          if (!c) return;
          e.stopPropagation();
          setBoardDraft({ tool, mm: c.localMm });
        } : undefined}
```

Replace `<NotePins cs={cs} report={report} notes={notes} />` with `<BoardMarkers cs={cs} report={report} notes={notes} rows={board} />`.

Report the pose for every tab (not only the host) and honour `goToPose`:

```tsx
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const p = new THREE.Vector3(), t = new THREE.Vector3();
    const emit = () => { c.getPosition(p); c.getTarget(t); setPose({ position: p.toArray(), target: t.toArray() }); };
    emit();
    c.addEventListener('update', emit);
    return () => c.removeEventListener('update', emit);
  }, []);

  const goToPose = useBoardTool((s) => s.goToPose);
  const seenPose = useRef(goToPose?.n);
  useEffect(() => {
    const c = controls.current;
    if (!c || !goToPose || goToPose.n === seenPose.current) return;
    seenPose.current = goToPose.n;
    const [px, py, pz] = goToPose.pose.position, [tx, ty, tz] = goToPose.pose.target;
    void c.setLookAt(px, py, pz, tx, ty, tz, true);
  }, [goToPose]);
```

- [ ] **Step 2: `BoardMarkers.tsx`**

Render, each through one `Anchored` helper that copies `NotePins`' `Pin` positioning (a `group` updated with `worldOf(cs, mm, ref.current.position)` in `useFrame`, children in drei `<Html center occlude zIndexRange={[20, 0]}>`):

- every unresolved `Note` with an `anchorMm` → a 28px round bubble with the author's initials; click → `selectItem(note.annotationId)`; when selected, `<Thread note={note} />` beside it.
- each `BoardRow` whose `item.kind` is `sticky` → a 140×140 card in `var(--sticky-<color>)`, text clamped to 7 lines; `text` → a label. Click → `selectItem(row.itemId)` (selected = 2px accent outline). Double-click → inline `<textarea>`; blur or Cmd/Ctrl+Enter → `history.run(updateItem(row, { text }))`, Esc cancels. Sticky shows 4 color dots when selected → `history.run(updateItem(row, { color }))`.
- Drag (tool `select`, pointerdown on a sticky/text): follow the pointer with `pointer-events: none` on the card; on pointerup, raycast the drop point with R3F `useThree().raycaster` against `cs.world` using the pointer's NDC; on a hit `history.run(updateItem(row, { anchor: { kind: 'point', ras_mm: scanMmToRas(localMm, report) } }))`; no hit → snap back. Use `cursorOf(hit.object, hit.point)?.localMm` exactly as `CaseCanvas` does.
- the draft (if `useBoardTool.draft`) → `<DraftEditor>` at the draft mm.

Errors from `history.run` → `toast(messageFor(e))`.

- [ ] **Step 3: `DraftEditor.tsx`**

```tsx
export function DraftEditor({ tool, onSave, onCancel }: { tool: Placeable; onSave(text: string): Promise<void>; onCancel(): void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => { if (!text.trim()) return; setBusy(true); try { await onSave(text); } finally { setBusy(false); } };
  return (
    <form className={css.draft} data-tool={tool} onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <textarea autoFocus maxLength={280} value={text} placeholder={tool === 'comment' ? 'Add a comment' : tool === 'sticky' ? 'Sticky note' : 'Text'}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && (tool !== 'sticky' || e.metaKey || e.ctrlKey) && !e.shiftKey) { e.preventDefault(); void submit(); }
        }} />
      <button type="submit" disabled={busy || !text.trim()}>{tool === 'comment' ? 'Post' : 'Add'}</button>
    </form>
  );
}
```

`onSave` in BoardMarkers:

```ts
const anchor = { kind: 'point' as const, ras_mm: scanMmToRas(draft.mm, report) };
await history.run(draft.tool === 'comment' ? createComment(text, anchor)
  : createItem(draft.tool === 'sticky' ? { kind: 'sticky', anchor, text, color: 'yellow' } : { kind: 'text', anchor, text }));
setBoardDraft(null);
```

- [ ] **Step 4: `Thread.tsx`** — popover (280px): root comment (author, time, text), replies list (each with × when `canRemove` → `sessionCall('annotations.removeReply', { replyId })`), reply `<textarea maxLength={1000}>` + Reply (`sessionCall('annotations.reply', { annotationId, text })`), Resolve/Reopen when `canResolve` → `history.run(setResolved(id, !note.resolvedAt))`, Delete when `canRemove` → `sessionCall('annotations.remove', { annotationId })` then `selectItem(null)`. Errors → inline `messageFor(e)`.

- [ ] **Step 5: NotePins** — remove the notes branch from `NotePins` (leave `MarkerPins`/`Pin`, export `Pin` for reuse if `Anchored` wants it). Grep for `NotePins` usages; `CaseCanvas` was the only one.

- [ ] **Step 6: Verify** — frontend gate; manual: `npx convex dev` (local), `npm --prefix frontend run dev`, share a case, place one comment, sticky, text; drag the sticky; rotate: items follow the brain; Cmd+Z removes the last one.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/board/BoardMarkers.tsx frontend/src/board/BoardMarkers.module.css frontend/src/board/Thread.tsx frontend/src/board/DraftEditor.tsx frontend/src/viewer/CaseCanvas.tsx frontend/src/share/NotePins.tsx
git commit -m "feat(board): anchored stickies, text and comment threads on the 3D brain"
```

### Task F5: Pen and highlighter layer

**Files:**
- Create: `frontend/src/board/stroke.ts`, `frontend/src/board/StrokeLayer.tsx`, `frontend/src/board/StrokeLayer.module.css`
- Test: `frontend/src/board/stroke.test.ts`

**Interfaces:**
- Consumes: `useBoardTool` (`tool`, `pose`, `selected`), `requestPose`, `history`, `createItem`.
- Produces: `normalise(points: {x:number;y:number}[], rect: {left:number;top:number;width:number;height:number}): number[]`, `simplify(flat: number[], minStep = 0.002): number[]`, `strokeOpacity(drawn: CameraPoseDto, now: CameraPoseDto): number`, `poseKey(p): string`, `<StrokeLayer rows={BoardRow[]} />`.

- [ ] **Step 1: Failing tests** — `stroke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalise, poseKey, simplify, strokeOpacity } from './stroke';

const pose = (x: number, y: number, z: number, d = 1) => ({ position: [x * d, y * d, z * d], target: [0, 0, 0] });

describe('stroke', () => {
  it('normalises client points to 0..1 of the stage, clamped', () => {
    expect(normalise([{ x: 110, y: 70 }, { x: 400, y: -5 }], { left: 10, top: 20, width: 200, height: 100 })).toEqual([0.5, 0.5, 1, 0]);
  });
  it('drops points closer than minStep', () => {
    expect(simplify([0, 0, 0.001, 0, 0.01, 0])).toEqual([0, 0, 0.01, 0]);
  });
  it('is fully visible at the drawing pose and fades by 10 degrees', () => {
    expect(strokeOpacity(pose(0, 0, 300), pose(0, 0, 300))).toBe(1);
    const a = (deg: number) => { const r = (deg * Math.PI) / 180; return pose(Math.sin(r), 0, Math.cos(r), 300); };
    expect(strokeOpacity(pose(0, 0, 300), a(1.5))).toBe(1);
    expect(strokeOpacity(pose(0, 0, 300), a(6))).toBeCloseTo(0.5, 1);
    expect(strokeOpacity(pose(0, 0, 300), a(12))).toBe(0);
  });
  it('fades with zoom', () => {
    expect(strokeOpacity(pose(0, 0, 300), pose(0, 0, 330))).toBe(0);
    expect(strokeOpacity(pose(0, 0, 300), pose(0, 0, 303))).toBe(1);
  });
  it('groups nearly equal poses under one key', () => {
    expect(poseKey(pose(0, 0, 300.04))).toBe(poseKey(pose(0, 0, 300)));
  });
});
```

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement `stroke.ts`**

```ts
import type { CameraPoseDto } from '../share/types';

type Rect = { left: number; top: number; width: number; height: number };
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const normalise = (pts: { x: number; y: number }[], r: Rect) =>
  pts.flatMap((p) => [clamp01((p.x - r.left) / r.width), clamp01((p.y - r.top) / r.height)]);

export function simplify(flat: number[], minStep = 0.002): number[] {
  const out = flat.slice(0, 2);
  for (let i = 2; i < flat.length; i += 2) {
    if (Math.hypot(flat[i] - out[out.length - 2], flat[i + 1] - out[out.length - 1]) >= minStep) out.push(flat[i], flat[i + 1]);
  }
  return out;
}

const sub = (a: number[], b: number[]) => a.map((n, i) => n - b[i]);
const len = (a: number[]) => Math.hypot(...a);

/**
 * How visible a stroke drawn at `drawn` is from `now`: 1 within 2° / 2 %, 0 beyond 10° / 10 %.
 * Measures view-direction angle, zoom change and target shift (relative to distance); the worst wins.
 */
export function strokeOpacity(drawn: CameraPoseDto, now: CameraPoseDto): number {
  const d0 = sub(drawn.position, drawn.target), d1 = sub(now.position, now.target);
  const l0 = len(d0), l1 = len(d1);
  if (!l0 || !l1) return 0;
  const cos = Math.min(1, Math.max(-1, d0.reduce((s, n, i) => s + n * d1[i], 0) / (l0 * l1)));
  const angle = (Math.acos(cos) * 180) / Math.PI;
  const zoom = (Math.abs(l1 - l0) / l0) * 100;
  const pan = (len(sub(now.target, drawn.target)) / l0) * 100;
  const worst = Math.max(angle, zoom, pan);
  return clamp01(1 - (worst - 2) / 8);
}

export const poseKey = (p: CameraPoseDto) => [...p.position, ...p.target].map((n) => Math.round(n)).join(',');
```

- [ ] **Step 4: `StrokeLayer.tsx`**

- Absolutely positioned over the stage (`inset: 0`), `pointer-events: none` except when tool is `pen`/`highlight` (then `auto`, `cursor: crosshair`, `touch-action: none`).
- `<svg viewBox="0 0 1 1" preserveAspectRatio="none">`; each stroke a `<polyline points=... fill="none" stroke={color} strokeWidth={width} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />` with `opacity = strokeOpacity(item.camera, pose) * (mode === 'highlight' ? 0.35 : 1)` and highlight strokes `style={{ mixBlendMode: 'multiply' }}`. Skip rendering when opacity is 0.
- Drawing: pointerdown → `setPointerCapture`, collect client points; pointermove → append, render live polyline; pointerup → `const points = simplify(normalise(raw, svg.getBoundingClientRect()))`; if `points.length >= 4` → `history.run(createItem({ kind: 'stroke', camera: pose!, points, color: tool === 'highlight' ? '#ffd400' : '#e5484d', width: tool === 'highlight' ? 16 : 3, mode: tool === 'highlight' ? 'highlight' : 'pen' }))`. Escape or Cmd+Z during a drag cancels the in-progress stroke (listen for keydown while drawing, `stopPropagation` so `useBoardKeys` does not also undo).
- Select + Erase: with tool `select`, each visible stroke's polyline gets `pointer-events: stroke` and a 12px transparent hit-line twin; click → `selectItem(row.itemId)` (selected stroke drawn with a dashed outline). Delete is handled by the page (F6).
- View chips: group strokes with opacity 0 by `poseKey(item.camera)`; render a row of chips at the top centre "✎ 3 sketches · view" → `requestPose(item.camera)`.

- [ ] **Step 5: Run gate; manual check** — draw, rotate (fades), chip snaps back, highlighter translucent, Cmd+Z removes the stroke.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/board/stroke.ts frontend/src/board/stroke.test.ts frontend/src/board/StrokeLayer.tsx frontend/src/board/StrokeLayer.module.css
git commit -m "feat(board): pen and highlighter strokes tied to the camera pose"
```

### Task F6: Page wiring, Comments panel, toast

**Files:**
- Modify: `frontend/src/routes/Brain3D.tsx`
- Modify: `frontend/src/share/NotesPanel.tsx` (3D mode becomes the Comments list)
- Create: `frontend/src/board/Toast.tsx`

**Interfaces:**
- Consumes: everything above; `useBoard(jobId)`.

- [ ] **Step 1: Brain3D**
  - `const board = useBoard(id);` pass `board` to `CaseCanvas`.
  - Inside the stage, next to the canvas: `<StrokeLayer rows={board} />`, `<Toolbar disabled={!live} />` (left side of the stage, vertically centred, below the case header), `<Toast />`.
  - `useBoardKeys(live, onDelete)` where `onDelete` removes the selected item: a `BoardRow` with `canRemove` → `history.run(removeItem(row))`; a `Note` with `canRemove` → `sessionCall('annotations.remove', { annotationId })` (not undoable in v1 when it has replies).
  - Remove the dock "Pin note" button and `pinning`/`focusTool` wiring; the rail item `notes` becomes `{ id: 'notes', label: 'Comments', icon: <CommentIcon />, badge: notes.filter((n) => !n.resolvedAt).length, panel: <NotesPanel report={report} notes={notes} mode="3d" /> }`.
  - On session end (`live` → false): `history.clear(); setTool('select'); selectItem(null); setBoardDraft(null);`.
- [ ] **Step 2: NotesPanel** — in `mode === '3d'`: drop the place-a-pin form (comments are created with the C tool); list threads with reply count and "Resolved" badge, a "Show resolved" checkbox (default off); clicking a row → `goToMm(anchorMm(...))` and `selectItem(annotationId)`. `mode === 'mri'` unchanged.
- [ ] **Step 3: Toast** — fixed bottom-centre pill reading `useBoardToast`; `role="status"`.
- [ ] **Step 4: Gate + manual** — full frontend gate; local two-browser check of every bullet in Q3.
- [ ] **Step 5: Commit**

```bash
git add frontend/src/routes/Brain3D.tsx frontend/src/share/NotesPanel.tsx frontend/src/board/Toast.tsx
git commit -m "feat(board): wire the whiteboard into the 3D workspace"
```

Then `hc send lead-2 "F1-F6 done <shas>, gate PASS <counts>"`.

---

## QA (qa, report-only — never edits code)

### Task Q1: Backend review (after B3)

- [ ] Read `git diff <B1 parent>..<B3 sha> -- convex/`. Check against spec §1 and the Contract: auth on every public function (`requireSessionMember`), cross-session ids → NOT_FOUND, author-or-host deletes, STALE on mismatched `expectedUpdatedAt`, caps, text trimming, reply cascade in both `remove` and `agentRemove`, no recipient/board data leaked through a public query of another session, report text passed through `clean`.
- [ ] Run backend gate; paste counts.
- [ ] Report to lead-2: `path:line: severity: problem. fix.` one per line, or `Q1 PASS`.

### Task Q2: Frontend review (after F6)

- [ ] Read `git diff <F1 parent>..<F6 sha> -- frontend/`. Check: `keyAction` ignores typing targets; history never records a failed `do`; `createComment` undo uses `ifNoReplies`; strokes saved once per pointer-up; no secrets or emails in URLs; every icon button has `aria-label`; toolbar disabled outside a session; `/mri` unchanged.
- [ ] Run frontend gate; paste counts.
- [ ] Report as Q1.

### Task Q3: Two-browser manual QA (local, after Q1+Q2 pass)

Run `npx convex dev` and `npm --prefix frontend run dev`; host in one Chrome window, guest (incognito) via the invite link. Check and report each line PASS/FAIL with a screenshot on FAIL:

1. Toolbar shows 6 tools + undo/redo; disabled with "Share to use the board" before sharing.
2. V/C/S/T/P/H switch tools; typing "s" in chat does not switch.
3. Comment: click brain → editor → Post; guest sees the bubble at the same anatomy; guest replies; host resolves → bubble hidden for both; Comments panel "Show resolved" shows it.
4. Sticky: place, edit (double-click), recolor, drag to another spot; guest sees each change.
5. Text: place and edit.
6. Pen: draw; rotate 15° → stroke hidden and a "view" chip appears; click chip → camera returns, stroke visible.
7. Highlighter: translucent wide stroke.
8. Undo/redo: Cmd+Z removes last own action; Shift+Cmd+Z redoes; Cmd+Z inside the chat box undoes text only.
9. Stale undo: host edits a guest sticky, guest presses Cmd+Z on their own earlier edit → toast "Changed by someone else, skipped".
10. Delete: guest cannot delete host's sticky (no effect); host can delete any.
11. End session → report email contains comment replies, resolved flag, "Sticky notes & text", sketch count.
12. Agent still adds comments (Assistant: "pin a note on the tumor").
