/**
 * Authentication and authorization for Phase 1
 * ============================================
 *
 * EVERY public function in this backend starts by calling one of the
 * `require*` helpers below. That is the whole security model, and it is
 * deliberately concentrated in one small file so it can be reviewed in one
 * sitting.
 *
 * THE MODEL: BEARER CAPABILITY TOKENS
 * -----------------------------------
 * No auth provider is chosen yet (BACKEND_CONTEXT §3: "Not yet locked"), and
 * the demo has guest judges who will not sign up for anything. So:
 *
 *   sessions.create -> mints a session + a HOST participant + its token
 *   sessions.join   -> takes an invite code, mints a VIEWER participant + token
 *   everything else -> takes `{ participantToken }` and resolves it to a row
 *
 * The token IS the identity. There is no password, no session cookie, and no
 * `ctx.auth`. BACKEND_CONTEXT §6 explicitly sanctions this shape for
 * de-identified demo data: "a well-designed bearer invite capability can work
 * for de-identified demo cases only."
 *
 * WHAT THIS MODEL GETS RIGHT
 *  - A Convex document id is NOT a credential. Knowing a `sessionId` lets you do
 *    nothing at all; every call needs a token that we look up.
 *  - Tokens are 160-bit CSPRNG values (see `lib/tokens.ts`).
 *  - Tokens and invite codes are NEVER returned by a query, only by the single
 *    mutation that mints them.
 *  - Role is read from the SERVER's row, never from an argument. A client cannot
 *    claim to be the host.
 *
 * WHAT IT DOES NOT DO (known, accepted for the hackathon, written down so
 * nobody discovers it in a demo)
 *  - Tokens are stored in plaintext and never expire or rotate. A production
 *    build stores a SHA-256 digest and compares digests.
 *  - A leaked invite code is reusable by anyone, any number of times.
 *  - There is no account, so "the same person rejoining" creates a second
 *    participant row.
 *
 * MIGRATING TO A REAL AUTH PROVIDER LATER
 * ---------------------------------------
 * Only this file changes. `requireParticipant` would read `ctx.auth
 * .getUserIdentity()` instead of an argument token, and look the participant up
 * by `subject` instead of by `token`. Every call site already funnels through
 * these helpers, so no function signature outside here needs to move.
 *
 * JAVA ANALOGY
 * ------------
 * These are your Spring Security method-level checks — `@PreAuthorize("hasRole(
 * 'HOST')")` — written out by hand. `QueryCtx`/`MutationCtx` is the per-request
 * context object; `ctx.db` is the transaction-scoped repository. A `QueryCtx`
 * can only read, a `MutationCtx` can read and write, and TypeScript enforces
 * that: a function typed to take `QueryCtx` physically cannot write, which is
 * why the read-only helpers below are typed that way.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";
import { MAX_CREDENTIAL_LENGTH } from "./tokens";

/** A participant row with its secret stripped, safe to return to any client. */
export type PublicParticipant = {
  participantId: Id<"sessionParticipants">;
  displayName: string;
  role: "host" | "viewer";
  following: boolean;
  joinedAt: number;
};

/**
 * Projects a participant row into the shape clients are allowed to see.
 *
 * Note what is dropped: `token`. This function is the ONLY way participant data
 * should leave the backend — returning a raw `Doc<"sessionParticipants">` from a
 * query would hand every viewer every other viewer's credential. Routing all
 * reads through one projection is what makes that mistake hard to make.
 */
export function toPublicParticipant(doc: Doc<"sessionParticipants">): PublicParticipant {
  return {
    participantId: doc._id,
    displayName: doc.displayName,
    role: doc.role,
    following: doc.following,
    joinedAt: doc.joinedAt,
  };
}

/**
 * Resolves a bearer token to a participant row, or throws NOT_AUTHENTICATED.
 *
 * Uses the `by_token` index, so this is a single indexed point lookup and costs
 * the same whether there are 3 participants or 30,000. Scanning the table with
 * `.filter()` instead would get slower as the demo went on and would be charged
 * as reading every row.
 *
 * `.unique()` returns the single match, `null` for no match, and THROWS if there
 * are two. Throwing on a duplicate is correct here: two rows sharing a token
 * would be a serious invariant violation, and we would rather fail than pick one
 * arbitrarily.
 */
export async function requireParticipant(
  ctx: QueryCtx,
  participantToken: string,
): Promise<Doc<"sessionParticipants">> {
  // Cheap shape checks first, so an empty or oversized string never reaches the
  // index. Oversized gets the same code as unknown: it simply is not a token.
  if (participantToken.length === 0) {
    throw appError("NOT_AUTHENTICATED", "Missing participant token. Join the session again.");
  }
  if (participantToken.length > MAX_CREDENTIAL_LENGTH) {
    throw appError(
      "NOT_AUTHENTICATED",
      "This participant token is not valid. Join the session again.",
    );
  }

  const participant = await ctx.db
    .query("sessionParticipants")
    .withIndex("by_token", (q) => q.eq("token", participantToken))
    .unique();

  if (participant === null) {
    throw appError(
      "NOT_AUTHENTICATED",
      "This participant token is not valid. Join the session again.",
    );
  }
  return participant;
}

/**
 * Loads a session and refuses to hand back one that has ended.
 *
 * Separate from the membership check because `sessions.join` needs to load a
 * session BEFORE the caller is a member of it.
 */
export async function requireActiveSession(
  ctx: QueryCtx,
  sessionId: Id<"sessions">,
): Promise<Doc<"sessions">> {
  const session = await ctx.db.get(sessionId);
  if (session === null) {
    throw appError("NOT_FOUND", "That review session does not exist.");
  }
  if (session.status === "ended") {
    throw appError("SESSION_ENDED", "This review session has ended.");
  }
  return session;
}

/**
 * The standard check for "may this caller read/act in this session at all?".
 *
 * The important line is the `sessionId` comparison. Without it, a valid token
 * from session A would authenticate a caller and then be used to operate on
 * session B — authentication without authorization, which is the single most
 * common way a multi-tenant backend leaks across tenants.
 */
export async function requireSessionMember(
  ctx: QueryCtx,
  args: { sessionId: Id<"sessions">; participantToken: string },
): Promise<{ session: Doc<"sessions">; participant: Doc<"sessionParticipants"> }> {
  const participant = await requireParticipant(ctx, args.participantToken);

  if (participant.sessionId !== args.sessionId) {
    // Same message and code as a non-existent session on purpose: a caller
    // poking at session ids should not be able to tell "wrong session" from
    // "no such session", which would otherwise confirm that an id is real.
    throw appError("NOT_A_MEMBER", "You are not a member of that review session.");
  }

  const session = await requireActiveSession(ctx, args.sessionId);
  return { session, participant };
}

/**
 * Like `requireSessionMember`, but additionally demands the presenter role.
 *
 * This is the gate behind `sessions.updateView`, and it is what makes
 * "Guest attempts presenter-only mutation -> Rejected server-side"
 * (BACKEND_CONTEXT §13) true rather than aspirational. A viewer can read the
 * shared view and (Phase 2) chat and annotate, but cannot move the room.
 *
 * Takes a `MutationCtx` rather than a `QueryCtx` only as documentation: every
 * presenter-gated operation is a write, and typing it this way stops the helper
 * from being reused in a read path where it would be the wrong check.
 */
export async function requirePresenter(
  ctx: MutationCtx,
  args: { sessionId: Id<"sessions">; participantToken: string },
): Promise<{ session: Doc<"sessions">; participant: Doc<"sessionParticipants"> }> {
  const { session, participant } = await requireSessionMember(ctx, args);

  if (participant.role !== "host") {
    throw appError(
      "NOT_PRESENTER",
      "Only the presenter can change the shared view. Ask the host for control.",
    );
  }

  // Defence in depth: the role says host, so the session's `hostParticipantId`
  // must agree. If these ever disagree we have a corrupted room, and silently
  // trusting the role would let a stale host keep driving a session that has
  // been handed over (Phase 2+ will add a hand-over mutation).
  if (session.hostParticipantId !== participant._id) {
    throw appError(
      "NOT_PRESENTER",
      "You are no longer the presenter of this session.",
    );
  }

  return { session, participant };
}
