import { appError } from "./errors";

/** Report-email address: trimmed, ≤ 254 chars, one @ and a dotted domain. */
export function normaliseEmail(raw: string): string {
  const email = raw.trim();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw appError("INVALID_ARGUMENT", "Enter a valid email address.");
  }
  return email;
}
