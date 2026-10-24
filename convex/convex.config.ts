import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// The built frontend owns the site root (https://<deployment>.convex.site/);
// our own HTTP actions, when we add convex/http.ts, live under /api.
const app = defineApp({ httpPrefix: "/api" });
app.use(staticHosting, { httpPrefix: "/" });
// Phase 3 online status, wrapped with session auth in convex/presence.ts.
app.use(presence);

export default app;
