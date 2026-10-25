# 3D Workspace Whiteboard — Design

Date: 2026-10-25. Status: approved in brainstorming (parts 1–3).

## Goal

Turn the /3d case page into a Miro-style collaborative board on top of the brain:
threaded comments (replacing pins), sticky notes, text labels, and a pen with a
highlighter mode, with per-user undo/redo on Cmd/Ctrl+Z.

## Decisions

- **Hybrid anchoring.** Comments, stickies and text anchor to a 3D point (RAS mm)
  and follow the brain on rotate/explode. Pen strokes are a flat overlay tied to the
  camera pose they were drawn at.
- **Comments are threads.** Bubble on the brain → thread popover with replies and
  Resolve. Existing pins become comment roots with zero replies; no migration.
- **v1 tools:** Select, Comment, Sticky, Text, Pen (+ Highlighter, + erase via Select).
- **Approach A:** keep `annotations` as the comment root (agent tools, MCP export,
  report email and summary keep working), add `annotationReplies` and `boardItems`.
- **Undo** is per user, per tab, own actions only, Figma/Miro style.

## Non-goals (v1)

Shapes, reactions, frames, live cursors while drawing, editing a stroke after
drawing, agent access to board items, board items on /mri, board without a session.

## 1. Data and backend

### Schema (`convex/schema.ts`)

`annotations` gains two optional fields (existing rows stay valid):

```ts
resolvedAt: v.optional(v.number()),
resolvedBy: v.optional(v.id("sessionParticipants")),
```

New tables:

```ts
annotationReplies: defineTable({
  ...vAuthor.fields,
  sessionId: v.id("sessions"),
  annotationId: v.id("annotations"),
  authorParticipantId: v.optional(v.id("sessionParticipants")),
  text: v.string(), // <= 1000 characters, enforced in the mutation
}).index("by_annotation", ["annotationId"]).index("by_session", ["sessionId"]),

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

```ts
const vStickyColor = v.union(v.literal("yellow"), v.literal("pink"), v.literal("blue"), v.literal("green"));
export const vBoardItem = v.union(
  v.object({ kind: v.literal("sticky"), anchor: vAnnotationAnchor, text: v.string(), color: vStickyColor }),
  v.object({ kind: v.literal("text"), anchor: vAnnotationAnchor, text: v.string() }),
  v.object({
    kind: v.literal("stroke"),
    camera: v.object({ position: vVec3, target: vVec3 }),
    points: v.array(v.number()), // flat x,y pairs, each in 0..1 of the stage; <= 2000 pairs
    color: v.string(),           // #rrggbb, validated
    width: v.number(),           // px, 1..32
    mode: v.union(v.literal("pen"), v.literal("highlight")),
  }),
);
```

Sticky/text text ≤ 280 characters (`MAX_ANNOTATION_LENGTH`). Sticky/text anchors
are `point` anchors in practice; the union reuses `vAnnotationAnchor`.

### Functions

All public functions authenticate with `requireSessionMember` like `annotations.ts`.
Cross-session ids answer `NOT_FOUND`.

`convex/board.ts`:

| Function | Who | Behaviour |
|---|---|---|
| `list` | member | All items of the session, oldest first, with `canRemove`. |
| `create` | member | Validates, inserts, returns `{ itemId, updatedAt }`. |
| `update` | member | Patches `anchor` / `text` / `color` (not strokes). Takes `expectedUpdatedAt`; mismatch → `STALE`. Returns new `updatedAt`. |
| `remove` | author or host | Deletes. Takes optional `expectedUpdatedAt` (undo path) → `STALE` on mismatch. |

Caps: 500 board items per session, of which at most 300 strokes → `INVALID_ARGUMENT`
("Board is full (500 items)." / "Too many sketches (300)."), same code as the existing annotation cap. Strokes > 2000 points
→ `INVALID_ARGUMENT`.

`convex/annotations.ts` additions:

- `reply({ sessionId, participantToken, annotationId, text })` — any member.
- `removeReply` — reply author or host.
- `resolve` / `unresolve` — annotation author or host; sets/clears `resolvedAt`, `resolvedBy`.
- `list` returns each annotation with `replies` (oldest first), `resolvedAt`.
- `remove` (and `agentRemove`) cascade-delete the annotation's replies. `remove` takes optional
  `ifNoReplies: true` (undo path) → `STALE` when the thread has replies.

New error code in `convex/lib/errors.ts` `AppErrorCode`: `STALE`.

Agent tools and MCP are unchanged; they keep reading/writing `annotations`.

### Report

`reportMail.load` (and therefore the session report email) also loads `boardItems`
and `annotationReplies`. `ReportDoc` (`convex/lib/clinicalReport.ts`) gains:

- Annotations: each with its replies and a "resolved" flag.
- New section "Sticky notes & text" after Annotations: author, kind, color, text.
- One line "N sketches were drawn on the board." when strokes exist.

All free text through `exportText()` as today.

## 2. Frontend

Reuses existing pieces: drei `<Html>` + `worldOf(cs, mm)` (`share/NotePins.tsx`)
for anchored items, and the case raycast in `viewer/CaseCanvas.tsx` that turns a
click into a scan point in mm.

### Toolbar (`frontend/src/board/Toolbar.tsx`, store `board/tool.ts`)

Floating vertical bar on the left of the stage, styled like the reference
screenshot: Select (V), Comment (C), Sticky (S), Text (T), Pen (P), Highlighter (H).
Shortcuts are letter keys, ignored while focus is in an input, textarea or
contenteditable. Esc returns to Select. Delete/Backspace removes the selected item.

The tool store replaces `useNoteUi.placing`. The rail keeps Case info, View and
Assistant; "Notes" becomes **Comments** (thread list, resolved hidden behind a
"Show resolved" toggle).

Without an active session the toolbar renders disabled with the hint
"Share to use the board".

### Anchored items (`board/BoardMarkers.tsx`)

- Comment / Sticky / Text tool: click on the brain → raycast mm point → inline
  editor at that point → Enter (Cmd/Ctrl+Enter for multi-line sticky) saves.
- Comment: avatar-initial bubble; click opens a thread popover (replies, reply box,
  Resolve/Reopen). Resolved comments are hidden on the brain.
- Sticky: ~140 px square card in its color; double-click edits; color dot cycles colors.
- Text: plain label.
- Select tool: drag an item; drop raycasts a new point → `board.update(anchor)`
  (comments: `annotations` anchor stays fixed in v1). Drop on empty space cancels.
- Items behind the brain fade (drei `Html` `occlude`).

### Pen layer (`board/StrokeLayer.tsx`)

- Full-stage SVG above the canvas. Pointer events captured only with Pen/Highlighter;
  orbit controls disabled while drawing.
- Points normalised to 0..1 of the stage; pointer-up saves the stroke with the
  current camera pose (one mutation per stroke).
- Visibility: opacity 1 when the camera is within 2° and 2 % distance of the stroke's
  pose, fading linearly to 0 at 10° / 10 %. Pure function `strokeOpacity(pose, current)`.
- Strokes from other poses collapse into "view" chips (one per distinct pose);
  click → camera tweens to that pose.
- Highlighter: width 16, 35 % alpha, `mix-blend-mode: multiply`. Pen: width 3.
- Erase: Select tool, click a stroke, Delete.

### /mri

Comments keep showing as today. Board items and strokes are /3d only.

## 3. Undo, errors, testing

### Undo/redo (`board/history.ts`, pure)

Every board change made by this user pushes `{ do, undo }` (async mutation calls):

| Action | Undo |
|---|---|
| create item | remove |
| create comment | `annotations.remove({ ifNoReplies: true })` |
| remove item | `board.create(payload)` (new id; the command tracks it) |
| move / edit / recolor | update back to previous values |
| resolve | unresolve (and vice versa) |

- Cmd/Ctrl+Z undo; Shift+Cmd/Ctrl+Z and Ctrl+Y redo; ignored while typing in inputs.
- Per user, per tab, capped at 100 entries; cleared on session end and reload; a new
  action clears redo.
- Update/remove commands carry the `updatedAt` they last saw. `STALE` or `NOT_FOUND`
  → drop that step, toast "Changed by someone else, skipped", continue.
- Undo during an in-progress stroke cancels the stroke.
- Replies are not undoable in v1 (delete instead).

### Errors

Mutation failures use the existing `messageFor(e)` copy. Cap errors show their
message. `SESSION_ENDED` follows the existing share-store drop.

### Tests

- `convex/tests/board.test.ts`: create/update/remove; author-or-host delete,
  any-member edit, non-member `NOT_FOUND`; caps; `STALE`; reply/resolve; reply
  cascade on delete.
- `convex/tests/clinicalReport.test.ts` / `reportMail.test.ts`: stickies, replies,
  resolved flag and sketch count in the report.
- Frontend unit: `history.test.ts` (undo, redo, stale skip, cap, redo cleared),
  stroke normalisation, `strokeOpacity`.
- Frontend: toolbar shortcuts; Cmd+Z inside a textarea does not trigger board undo.
- Manual QA on prod with two browsers.
