import { ConvexError } from 'convex/values';
import { describe, expect, it } from 'vitest';
import { codeOf, messageFor } from './copy';

describe('copy', () => {
  it('reads the app error code', () => {
    expect(codeOf(new ConvexError({ code: 'SESSION_ENDED', message: 'x' }))).toBe('SESSION_ENDED');
    expect(codeOf(new Error('boom'))).toBeNull();
    expect(codeOf(null)).toBeNull();
  });
  it('maps known codes, falls back to the server message, then a generic line', () => {
    expect(messageFor(new ConvexError({ code: 'INVALID_INVITE', message: 'x' }))).toBe("That invite link doesn't work. Ask the host for a new one.");
    expect(messageFor(new ConvexError({ code: 'INVALID_ARGUMENT', message: 'Slice index must be a whole number' }))).toBe('Slice index must be a whole number');
    expect(messageFor(new Error('socket'))).toBe('Something went wrong. Try again.');
  });
});
