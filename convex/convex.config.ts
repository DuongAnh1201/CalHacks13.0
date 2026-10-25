import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config";
import agentmail from "@agentmail/convex/convex.config";
import staticHosting from "@convex-dev/static-hosting/convex.config";

// The built frontend owns the site root (https://<deployment>.convex.site/);
// our own HTTP actions, when we add convex/http.ts, live under /api.
const app = defineApp({ httpPrefix: "/api" });
app.use(staticHosting, { httpPrefix: "/" });
// Phase 3 online status, wrapped with session auth in convex/presence.ts.
app.use(presence);
// Session report email (docs/superpowers/specs/2026-10-24-session-report-email-design.md).
app.use(agentmail);

export default app;
