/**
 * Capability token generation
 * ===========================
 *
 * Two kinds of secret live in this project, and both are made here:
 *
 *   - INVITE CODE   — "anyone holding this may join session X as a viewer".
 *                     Travels in a URL and inside a QR code (Phase 3), so it is
 *                     short-ish and URL-safe.
 *   - PARTICIPANT TOKEN — "I am participant P of session X". Sent on every call.
 *                     Never appears in a URL; the client keeps it in memory or
 *                     sessionStorage.
 *
 * RANDOMNESS INSIDE A CONVEX MUTATION
 * -----------------------------------
 * A Convex mutation is a deterministic, serializable transaction, which raises
 * the obvious question: how can it generate a random number?
 *
 * The answer is that the Convex runtime SEEDS the randomness per execution and
 * records it, so a retried transaction replays the same bytes. From our side
 * `crypto.getRandomValues` is simply available and cryptographically secure
 * inside queries and mutations — unlike `fetch` and `setTimeout`, which are
 * genuinely unavailable there (those need an action).
 *
 * `Date.now()` behaves similarly: inside one mutation it returns the SAME value
 * every time it is called, namely the transaction's timestamp. That is why
 * `sessions.create` can stamp `createdAt`, `joinedAt` and `lastSeenAt` from
 * separate `Date.now()` calls and still get three identical numbers.
 *
 * Java analogy: `SecureRandom` that has been pre-seeded by the transaction
 * manager, plus a `Clock` frozen for the duration of the transaction.
 */

/**
 * Crockford-style base32 alphabet: no `I`, `L`, `O` or `U`.
 *
 * Why not base64 or plain hex?
 *  - An invite code gets read aloud across a hackathon table and typed on a
 *    phone. Removing the characters that look like each other (1/I/L, 0/O) and
 *    the one that forms accidental profanity (U) makes that survivable.
 *  - It is URL-safe and QR-friendly with no percent-encoding (QR codes encode
 *    uppercase alphanumerics in a denser mode than mixed case, so an all-caps
 *    code produces a visibly simpler, easier-to-scan symbol).
 */
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Draws `length` characters uniformly from the alphabet using the CSPRNG.
 *
 * REJECTION SAMPLING, and why it matters: the naive `byte % 32` is only unbiased
 * because 256 happens to be an exact multiple of 32. It is written out properly
 * anyway so that changing the alphabet length later cannot silently introduce a
 * modulo bias (with a 36-character alphabet, `% 36` would make the first 4
 * characters ~12% more likely than the rest).
 */
function randomBase32(length: number): string {
  const alphabetSize = BASE32_ALPHABET.length;
  // Largest multiple of alphabetSize that fits in a byte; bytes at or above this
  // are discarded rather than folded in.
  const limit = Math.floor(256 / alphabetSize) * alphabetSize;

  let out = "";
  while (out.length < length) {
    // Draw a generous batch so the loop almost always finishes in one pass.
    const bytes = new Uint8Array(length * 2);
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      if (b >= limit) continue; // biased tail -> discard
      out += BASE32_ALPHABET[b % alphabetSize];
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * An invite code: 16 base32 characters = 80 bits of entropy.
 *
 * Grouped as `XXXX-XXXX-XXXX-XXXX` purely for human legibility; the hyphens are
 * part of the stored string, so comparison stays a plain equality check on an
 * indexed field and there is no normalisation step to get wrong.
 *
 * 80 bits is far beyond guessable, which is the point: BACKEND_CONTEXT §6 is
 * explicit that "session ID alone is not authorization", so this code is the
 * actual access control on joining.
 */
export function newInviteCode(): string {
  const raw = randomBase32(16);
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

/**
 * Longest string accepted where a token or invite code is expected. Both are far
 * shorter (32 and 19 characters); anything longer is rejected before an index
 * lookup. Loose rather than exact so a later token format needs no migration.
 */
export const MAX_CREDENTIAL_LENGTH = 128;

/**
 * A participant bearer token: 32 base32 characters = 160 bits of entropy.
 *
 * Longer than the invite code because it is never typed by a human and it is the
 * credential for *acting* as a participant, not just for joining.
 */
export function newParticipantToken(): string {
  return randomBase32(32);
}
