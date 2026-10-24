/**
 * Typed application errors
 * ========================
 *
 * HOW CONVEX ERRORS REACH THE BROWSER
 * -----------------------------------
 * If a Convex function throws a plain `Error`, the client gets a generic
 * "Server Error" and the real message is only visible in the server logs. That
 * is the safe default (it stops an accidental stack trace or secret from leaking
 * to a user), but it is useless for things the UI must react to, like
 * "you are not the presenter".
 *
 * `ConvexError` is the opt-in escape hatch: whatever you put in its `data`
 * payload is delivered verbatim to the caller. So the rule is:
 *
 *   - expected, user-facing failure  -> `throw appError("CODE", "message")`
 *   - programming bug / invariant    -> `throw new Error(...)`  (stays private)
 *
 * Java analogy: `ConvexError` is a checked exception that is part of the API
 * contract; a plain `Error` is a `RuntimeException` you never meant the caller
 * to see.
 *
 * On the client:
 *
 *   import { ConvexError } from "convex/values";
 *   try { await updateView({ ... }); }
 *   catch (e) {
 *     if (e instanceof ConvexError) {
 *       const { code, message } = e.data as { code: string; message: string };
 *     }
 *   }
 *
 * THE `{ code, message }` SHAPE IS DELIBERATE
 * -------------------------------------------
 * It is the same envelope the imaging service already uses for its 422s
 * (BACKEND_CONTRACT.md §2.1: `"error": { "code": "...", "message": "..." }`),
 * so the frontend can funnel both backends into one error renderer instead of
 * two. The code set below is Convex-specific and additive; it does not clash
 * with the contract's imaging codes.
 */

import { ConvexError } from "convex/values";

/**
 * Error codes returned by the Convex collaboration layer.
 *
 * Keeping these as a union type rather than free strings means a typo in a
 * `throw` is a compile error, and the frontend can exhaustively switch on them.
 */
export type AppErrorCode =
  /** The bearer token does not match any participant. Re-join. */
  | "NOT_AUTHENTICATED"
  /** Valid token, but it belongs to a different session than the one addressed. */
  | "NOT_A_MEMBER"
  /** Valid member, but the role is not allowed to do this (e.g. viewer moving the shared view). */
  | "NOT_PRESENTER"
  /** Valid member, but not allowed to change this record (e.g. removing someone else's annotation). */
  | "NOT_ALLOWED"
  /** The invite code is unknown, or the session it points at is over. */
  | "INVALID_INVITE"
  /** A referenced session / scan / participant row does not exist. */
  | "NOT_FOUND"
  /** The session has been ended by its host. */
  | "SESSION_ENDED"
  /** Arguments were well-typed but semantically wrong (bad slice index, empty name, ...). */
  | "INVALID_ARGUMENT"
  /** The scan's stored geometry is unusable (bad affine, non-RAS, zero dimension). */
  | "BAD_SCAN_GEOMETRY";

export type AppErrorData = { code: AppErrorCode; message: string };

/**
 * Builds a `ConvexError` carrying a code the frontend can switch on.
 *
 * Usage is always `throw appError(...)`, never `appError(...)` on its own —
 * it returns the error rather than throwing so that TypeScript's
 * control-flow analysis still works at the call site (`throw` is a statement
 * that narrows types; a function call is not).
 */
export function appError(code: AppErrorCode, message: string): ConvexError<AppErrorData> {
  return new ConvexError({ code, message });
}
