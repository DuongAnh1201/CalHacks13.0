import { ConvexClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const url = import.meta.env.VITE_CONVEX_URL;

/** '' when unset (tests, no Convex): presence stays off. */
export const convexUrl: string = url ?? '';

/** null when VITE_CONVEX_URL is unset: Share is disabled, everything else works. */
export const convex = url ? new ConvexClient(url) : null;
// shortcut: untyped refs + hand-written ./types, because importing convex/_generated would make frontend tsc check convex/; switch if the frontend ever installs root deps.
export const api = anyApi;
