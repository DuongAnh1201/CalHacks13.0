/**
 * sessions — NeuroVision Live Review rooms
 * ========================================
 *
 * THIS FILE IS PHASE 1. It is the whole point of the Convex layer: two devices
 * looking at one MRI case, where an authorized view change appears on the other
 * screen with no polling, no refresh and no WebSocket code of our own.
 *
 * HOW REACTIVITY ACTUALLY WORKS (the bit worth understanding)
 * ----------------------------------------------------------
 * In a Spring app, "the other tab sees the change" means you write a WebSocket
 * endpoint, track subscribers, and publish an event after the transaction
 * commits. Convex removes all of that:
 *
 *   1. A browser calls `useQuery(api.sessions.get, { sessionId, participantToken })`.
 *   2. The server runs the query AND RECORDS WHICH ROWS IT READ.
 *   3. When any mutation commits a write that touches one of those rows, Convex
 *      re-runs the query and pushes the new result down the open connection.
 *
 * So the only thing `updateView` does is `ctx.db.patch(...)`. Every subscriber
 * of every query that read that session row gets an update. There is no publish
 * step, no event bus, and no chance of the two drifting apart — the dependency
 * is derived from what the query actually read.
 *
 * The consequence for design: KEEP THE SHARED ROW SMALL AND SEMANTIC. Every
 * write to `sessions` costs a re-run of every subscriber's query. That is cheap
 * at one write per deliberate action and ruinous at 60 writes per second, which
 * is why camera pose and hand landmarks are not in this table (guardrail 7).
 *
 * TRANSACTIONS
 * ------------
 * A mutation handler is one serializable transaction, like a method annotated
 * `@Transactional(isolation = SERIALIZABLE)`. If it throws, nothing is written.
 * `sessions.create` relies on this: it inserts a session, inserts the host
 * participant, and patches the session's `hostParticipantId` — three writes that
 * no reader ever sees partially applied.
 *
 * Also inside a mutation: `Date.now()` returns the same value every time (the
 * transaction timestamp), and `fetch` is unavailable. External calls belong in
 * an `action` (Phase 4's LLM work).
 */

import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";
import {
  requireActiveSession,
  requirePresenter,
  requireSessionMember,
  toPublicParticipant,
  type PublicParticipant,
} from "./lib/auth";
import { appError } from "./lib/errors";
import { newInviteCode, newParticipantToken } from "./lib/tokens";
import { sliceIndexFromCursor, type Plane } from "./lib/transform";
import {
  applyCommand,
  defaultSharedView,
  viewsEqual,
  vViewerCommand,
  type SharedView,
  type ViewerCommand,
} from "./lib/viewCommands";
import { loadScan, toPublicScan, type PublicScan } from "./scans";

// ---------------------------------------------------------------------------
// Read model
// ---------------------------------------------------------------------------

/**
 * The shared view as the frontend consumes it.
 *
 * `cursorRasMm` is what we STORE (SPEC §5.2: the single shared position, in
 * millimetres). `sliceIndices` are DERIVED on every read. The frontend gets
 * both so it can drive NiiVue (which wants indices, three of them, one per
 * orthogonal view) and the Three.js marker (which wants millimetres) from a
 * single subscription without re-implementing the affine maths.
 */
export type SharedViewDto = {
  plane: Plane;
  cursorRasMm: number[];
  tumorVisible: boolean;
  viewVersion: number;
  /** Slice index in the CURRENT plane — the number a "slice 77 of 155" label shows. */
  sliceIndex: number;
  /** Total slices in the current plane. */
  sliceCount: number;
  /** Derived index for each plane, for the three linked 2D views (SPEC §3). */
  sliceIndices: { axial: number; coronal: number; sagittal: number };
};

/** Everything one subscription needs to render `/jobs/:id/explore` in Phase 1. */
export type SessionStateDto = {
  sessionId: Id<"sessions">;
  status: "active" | "ended";
  createdAt: number;
  updatedAt: number;
  scan: PublicScan;
  view: SharedViewDto;
  /** The caller's own membership. Lets the UI hide presenter-only controls. */
  me: PublicParticipant;
  /** Durable membership roster. NOT presence — see schema.ts. */
  participants: PublicParticipant[];
  /** The caller is the presenter. Convenience for the UI; equals `me.role === "host"`. */
  isPresenter: boolean;
};

/**
 * Builds the derived half of the view DTO.
 *
 * Note the three `sliceIndexFromCursor` calls: each inverts the affine, which is
 * a 4x4 adjugate. That is a few hundred floating-point operations per read —
 * irrelevant next to the cost of the database read, and far cheaper than the
 * class of bug you get from caching it.
 */
function toSharedViewDto(scan: Doc<"scans">, session: Doc<"sessions">): SharedViewDto {
  const cursor: [number, number, number] = [
    session.cursorRasMm[0],
    session.cursorRasMm[1],
    session.cursorRasMm[2],
  ];
  const indices = {
    axial: sliceIndexFromCursor(scan, "axial", cursor),
    coronal: sliceIndexFromCursor(scan, "coronal", cursor),
    sagittal: sliceIndexFromCursor(scan, "sagittal", cursor),
  };
  const counts = toPublicScan(scan).sliceCounts;

  return {
    plane: session.plane,
    cursorRasMm: session.cursorRasMm,
    tumorVisible: session.tumorVisible,
    viewVersion: session.viewVersion,
    sliceIndex: indices[session.plane],
    sliceCount: counts[session.plane],
    sliceIndices: indices,
  };
}

/** Reads the participant roster for a session, ordered oldest-first. */
async function listParticipants(
  ctx: QueryCtx,
  sessionId: Id<"sessions">,
): Promise<PublicParticipant[]> {
  // `.collect()` is bounded here by design: a review room is a handful of
  // people. Chat and annotations (Phase 2) must paginate instead (guardrail 8).
  const rows = await ctx.db
    .query("sessionParticipants")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();

  rows.sort((a, b) => a.joinedAt - b.joinedAt);
  return rows.map(toPublicParticipant);
}

/** Pulls just the synchronized fields out of a session row. */
function sharedViewOf(session: Doc<"sessions">): SharedView {
  return {
    plane: session.plane,
    cursorRasMm: [session.cursorRasMm[0], session.cursorRasMm[1], session.cursorRasMm[2]],
    tumorVisible: session.tumorVisible,
  };
}

// ---------------------------------------------------------------------------
// sessions.create
// ---------------------------------------------------------------------------

/**
 * Creates a review room for a case and makes the caller its presenter.
 *
 * RETURNS SECRETS, ONCE. The `inviteCode` and `participantToken` in the result
 * are the only time either value leaves the server. No query returns them.
 * The client must keep `participantToken` (sessionStorage is the right place —
 * it dies with the tab, which matches a hackathon demo) and put `inviteCode`
 * into the invite URL / QR code.
 *
 * AUTHORIZATION: none, deliberately. Anyone may open a room on a public demo
 * case; creating one grants no access to anything that existed before. When a
 * real auth provider lands, this is where `ctx.auth.getUserIdentity()` goes.
 */
export const create = mutation({
  args: {
    scanId: v.id("scans"),
    /** Untrusted label for the roster. Never used as identity (schema.ts). */
    hostDisplayName: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    sessionId: Id<"sessions">;
    inviteCode: string;
    participantToken: string;
    participantId: Id<"sessionParticipants">;
    role: "host";
  }> => {
    const displayName = normaliseDisplayName(args.hostDisplayName);
    const scan = await loadScan(ctx, args.scanId);

    // The starting view is derived from the scan's own geometry, so a room
    // always opens on a valid, in-bounds slice regardless of the case.
    const view = defaultSharedView(scan);
    const now = Date.now();

    const sessionId = await ctx.db.insert("sessions", {
      scanId: scan._id,
      // hostParticipantId is filled in three lines down; see the note in
      // schema.ts about this deferred reference inside one transaction.
      hostParticipantId: undefined,
      inviteCode: newInviteCode(),
      plane: view.plane,
      cursorRasMm: view.cursorRasMm,
      tumorVisible: view.tumorVisible,
      viewVersion: 1,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const participantToken = newParticipantToken();
    const participantId = await ctx.db.insert("sessionParticipants", {
      sessionId,
      token: participantToken,
      displayName,
      role: "host",
      // The presenter is the source of the shared view, so "following" is
      // meaningless for them; `true` keeps the field honest if the role is ever
      // handed over.
      following: true,
      joinedAt: now,
      lastSeenAt: now,
    });

    await ctx.db.patch(sessionId, { hostParticipantId: participantId });

    // Re-read the invite code rather than keeping the local variable, so this
    // function cannot return a code that failed to persist.
    const session = await requireActiveSession(ctx, sessionId);

    return {
      sessionId,
      inviteCode: session.inviteCode,
      participantToken,
      participantId,
      role: "host",
    };
  },
});

// ---------------------------------------------------------------------------
// sessions.join
// ---------------------------------------------------------------------------

/**
 * Joins a room using an invite code, as a viewer.
 *
 * This is the function behind the QR code (Phase 3): the frontend encodes
 * `https://app/join?code=XXXX-...`, the judge's phone opens it, and the page
 * calls this.
 *
 * SECURITY SHAPE:
 *  - The invite code, not the session id, is the capability. An attacker with a
 *    session id gets nothing.
 *  - Lookup goes through the `by_inviteCode` index, so it is a point lookup.
 *  - A wrong code and an ended session both return the same `INVALID_INVITE`
 *    code, so probing cannot distinguish "no such room" from "room is over".
 *  - A joiner is ALWAYS a viewer. There is no argument that can request the host
 *    role; role escalation would need a hand-over mutation that does not exist
 *    yet (Phase 2).
 *
 * NOT IDEMPOTENT, knowingly: joining twice creates two participant rows, because
 * without accounts there is nothing to deduplicate on. The roster will show the
 * judge twice if they reload a page that re-joins. The fix is for the client to
 * keep its `participantToken` in sessionStorage and call `sessions.get` instead
 * of re-joining; noted in docs/CONVEX_BACKEND.md as a known Phase 1 limit.
 */
export const join = mutation({
  args: {
    inviteCode: v.string(),
    displayName: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    sessionId: Id<"sessions">;
    participantToken: string;
    participantId: Id<"sessionParticipants">;
    role: "viewer";
  }> => {
    const displayName = normaliseDisplayName(args.displayName);

    const session = await ctx.db
      .query("sessions")
      .withIndex("by_inviteCode", (q) => q.eq("inviteCode", args.inviteCode.trim()))
      .unique();

    if (session === null || session.status === "ended") {
      throw appError("INVALID_INVITE", "That invite link is not valid any more.");
    }

    const now = Date.now();
    const participantToken = newParticipantToken();
    const participantId = await ctx.db.insert("sessionParticipants", {
      sessionId: session._id,
      token: participantToken,
      displayName,
      role: "viewer",
      // Default ON: a judge who scans a QR code expects to see what the
      // presenter is showing, immediately, without finding a toggle.
      following: true,
      joinedAt: now,
      lastSeenAt: now,
    });

    return { sessionId: session._id, participantToken, participantId, role: "viewer" };
  },
});

// ---------------------------------------------------------------------------
// sessions.get  — the reactive subscription
// ---------------------------------------------------------------------------

/**
 * THE query the explore page subscribes to. Everything Phase 1 needs, in one
 * reactive read.
 *
 * Because it reads the session row, the scan row and the participant rows,
 * Convex re-runs and re-pushes it when ANY of those change — a view update, a
 * new joiner, or the imaging service publishing a result. The client just gets
 * new props.
 *
 * WHAT IT DOES NOT RETURN: `inviteCode`, and any participant's `token`. A viewer
 * must not be able to read the room's invite capability out of a query result,
 * nor impersonate another participant (BACKEND_CONTEXT guardrail 5: "Don't leak
 * invite secrets in query results").
 *
 * On the React side:
 *
 *   const state = useQuery(api.sessions.get, { sessionId, participantToken });
 *   // `undefined` while loading; then re-renders on every server-side change.
 */
export const get = query({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
  },
  handler: async (ctx, args): Promise<SessionStateDto> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    const scan = await loadScan(ctx, session.scanId);

    return {
      sessionId: session._id,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      scan: toPublicScan(scan),
      view: toSharedViewDto(scan, session),
      me: toPublicParticipant(participant),
      participants: await listParticipants(ctx, session._id),
      isPresenter: participant.role === "host",
    };
  },
});

/**
 * The invite code, for the presenter only.
 *
 * Separate from `sessions.get` on purpose: `get` is subscribed to by every
 * participant, so putting the invite code in its result would hand the
 * capability to every viewer. This query is called once by the host when it
 * wants to render the QR code, and it hard-fails for anyone else.
 */
export const getInviteCode = query({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
  },
  handler: async (ctx, args): Promise<{ inviteCode: string }> => {
    const { session, participant } = await requireSessionMember(ctx, args);
    if (participant.role !== "host" || session.hostParticipantId !== participant._id) {
      throw appError("NOT_PRESENTER", "Only the presenter can see the invite link.");
    }
    return { inviteCode: session.inviteCode };
  },
});

// ---------------------------------------------------------------------------
// sessions.updateView  — the presenter-authorized write
// ---------------------------------------------------------------------------

/**
 * Applies one `ViewerCommand` to the shared view.
 *
 * This is the single write path for shared state. Pointer, keyboard, gesture and
 * voice all arrive here, which is what BACKEND_CONTEXT §7 means by "A recognized
 * command from voice and chat must flow through the same permission-checked
 * session state mutation". When Phase 4 adds `/jarvis next slice`, the parser
 * produces a command and calls this; it gets no privileges of its own.
 *
 * The handler is deliberately boring:
 *   1. authorize (presenter only)
 *   2. load the scan for its geometry
 *   3. run the pure reducer
 *   4. skip the write if nothing changed
 *   5. patch
 *
 * All the rules live in `lib/viewCommands.ts`, where they are tested without a
 * database.
 *
 * RETURN VALUE: `applied: false` with the unchanged `viewVersion` means the
 * command resolved to a no-op (already on the last slice, already on that
 * plane). It is a success, not an error — the UI should not flash a message. A
 * genuinely invalid command throws instead.
 *
 * RATE LIMITING: not implemented here. The command model already keeps traffic
 * to one write per deliberate action, and the no-op short-circuit below absorbs
 * a gesture held at the end of the volume. Throttling continuous input is the
 * frontend dispatcher's job (SPEC §7.3). A server-side limiter belongs with the
 * Phase 4 `/jarvis` work, where the thing being protected is LLM spend. Listed
 * as an open item in docs/CONVEX_BACKEND.md so it is a decision, not an
 * oversight.
 */
export const updateView = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    command: vViewerCommand,
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ applied: boolean; viewVersion: number; view: SharedViewDto }> => {
    const { session } = await requirePresenter(ctx, args);
    const scan = await loadScan(ctx, session.scanId);

    const current = sharedViewOf(session);
    const next = applyCommand(scan, current, args.command as ViewerCommand);

    if (viewsEqual(current, next)) {
      // No write at all. This keeps `viewVersion` meaningful ("the shared view
      // changed N times") and, more importantly, avoids waking up every
      // subscriber for a command that changed nothing.
      return {
        applied: false,
        viewVersion: session.viewVersion,
        view: toSharedViewDto(scan, session),
      };
    }

    const viewVersion = session.viewVersion + 1;
    await ctx.db.patch(session._id, {
      plane: next.plane,
      cursorRasMm: next.cursorRasMm,
      tumorVisible: next.tumorVisible,
      viewVersion,
      updatedAt: Date.now(),
    });

    // Re-read so the returned DTO is exactly what every other subscriber will
    // receive. Returning a locally-computed guess is how a presenter ends up
    // believing a value the rest of the room never got.
    const updated = await requireActiveSession(ctx, session._id);
    return { applied: true, viewVersion, view: toSharedViewDto(scan, updated) };
  },
});

// ---------------------------------------------------------------------------
// sessions.setFollowMode
// ---------------------------------------------------------------------------

/**
 * Sets whether the CALLER follows the presenter's shared view.
 *
 * Per-participant, as chosen in schema.ts. The server keeps writing one
 * authoritative shared view either way; this flag only tells the caller's own
 * client whether to apply it. That means:
 *  - a viewer who stops following cannot desync anyone else;
 *  - a viewer who resumes following snaps straight to the current shared view,
 *    because they were receiving it the whole time.
 *
 * A participant may only change their OWN flag. There is no `participantId`
 * argument, which is what makes that true — the target is always derived from
 * the token.
 */
export const setFollowMode = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
    following: v.boolean(),
  },
  handler: async (ctx, args): Promise<{ following: boolean }> => {
    const { participant } = await requireSessionMember(ctx, args);
    if (participant.following !== args.following) {
      await ctx.db.patch(participant._id, { following: args.following });
    }
    return { following: args.following };
  },
});

// ---------------------------------------------------------------------------
// sessions.end
// ---------------------------------------------------------------------------

/**
 * Ends a room. Presenter only.
 *
 * SOFT delete: the row stays and `status` becomes "ended". Nothing is
 * destroyed, because Phase 2 chat and annotations hang off this session and a
 * hard delete would take them with it. An ended session fails every
 * authorization check (`requireActiveSession`), so the invite code is dead and
 * no further writes are possible.
 */
export const end = mutation({
  args: {
    sessionId: v.id("sessions"),
    participantToken: v.string(),
  },
  handler: async (ctx, args): Promise<{ status: "ended" }> => {
    const { session } = await requirePresenter(ctx, args);
    await ctx.db.patch(session._id, { status: "ended", updatedAt: Date.now() });
    return { status: "ended" };
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Trims and length-checks a client-supplied display name.
 *
 * Reminder of what this is and is not: it is a LABEL for the roster. It is never
 * compared, never used for authorization, and never trusted (schema.ts,
 * `displayName`). The 64-character cap exists so one participant cannot make the
 * roster unreadable for everyone else.
 *
 * Deliberately NOT escaped or HTML-sanitised here. React escapes text content by
 * default, so escaping on the way in would double-encode an apostrophe into
 * `&#39;` in the UI. Sanitising belongs at the render boundary, not the storage
 * boundary.
 */
function normaliseDisplayName(raw: string): string {
  const name = raw.trim();
  if (name.length === 0) {
    throw appError("INVALID_ARGUMENT", "Please enter a display name.");
  }
  if (name.length > 64) {
    throw appError("INVALID_ARGUMENT", "Display names are limited to 64 characters.");
  }
  return name;
}
