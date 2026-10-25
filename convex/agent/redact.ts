/** Shared by loop logging and the persistence boundary; never store capabilities. */
export function redactToolArgs(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(redactToolArgs);
  if (input && typeof input === "object") {
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [
      key, /token|secret|api[_-]?key|authorization|password/i.test(key) ? "[redacted]" : redactToolArgs(value),
    ]));
  }
  return input;
}
