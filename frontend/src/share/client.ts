import { ConvexClient } from 'convex/browser';
import { anyApi } from 'convex/server';

const url = import.meta.env.VITE_CONVEX_URL;
export const convexUrl: string | undefined = url || undefined;

/** null when VITE_CONVEX_URL is unset: Share is disabled, everything else works. */
export const convex = url ? new ConvexClient(url) : null;
// shortcut: untyped refs + hand-written ./types, because importing convex/_generated would make frontend tsc check convex/; switch if the frontend ever installs root deps.
export const api = anyApi;
