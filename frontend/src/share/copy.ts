export const SESSION_ENDED = 'The host ended the session';
export const SYNC_FAILED = "Couldn't sync. Will try again on the next change.";
export const NOT_CONFIGURED = 'Sharing is not configured';
export const OPEN_A_SCAN = 'Open a scan to share it';

const COPY: Record<string, string> = {
  INVALID_INVITE: "That invite link doesn't work. Ask the host for a new one.",
  SESSION_ENDED,
};

type AppErrorLike = { data?: { code?: unknown; message?: unknown } } | null;

/** ConvexError.data.code from convex/lib/errors.ts, or null for anything else. */
export const codeOf = (e: unknown): string | null => {
  const c = (e as AppErrorLike)?.data?.code;
  return typeof c === 'string' ? c : null;
};

export function messageFor(e: unknown): string {
  const code = codeOf(e);
  if (code && code in COPY) return COPY[code];
  const m = (e as AppErrorLike)?.data?.message;
  return typeof m === 'string' ? m : 'Something went wrong. Try again.';
}
