# Convex Phase 1 test harness

A throwaway page to **watch live reactivity with your own eyes**, before the
real React frontend exists. Not part of the product — delete this whole
directory once the frontend team's app can do the same thing.

It uses `ConvexClient` from `convex/browser` directly (no React, no framework)
and is bundled with esbuild into one self-contained file so a plain
`<script type="module">` can load it with no build tooling in the browser.

## Run it

```bash
# 1. Make sure a local Convex deployment is running and seeded (from the repo root):
CONVEX_AGENT_MODE=anonymous npx convex dev          # leave this running in its own terminal
npx convex run seed:seedSampleScan                  # one-time, safe to repeat

# 2. Build and serve the harness:
npm run test-harness
```

That prints `http://localhost:5050`. Open it in **two separate browser tabs**
(not two windows of the same tab — use Ctrl/Cmd+click a link, or just copy the
URL into a new tab).

## What to do with the two tabs

**Tab A — presenter:**
1. Enter a name, pick the sample case, click **Create a new session**.
2. Copy the **invite code** shown.

**Tab B — viewer:**
1. Enter a different name, paste the invite code, click **Join as viewer**.

**Now, with both tabs visible side by side:**

3. In Tab A, click a plane button or **step slice**.
4. **Watch Tab B update by itself** — no click, no refresh, usually under
   half a second. This is the whole point of Phase 1: Convex pushed the change
   to Tab B because Tab B's `sessions.get` subscription read a row that Tab A's
   mutation just wrote.
5. In Tab B, click one of the two red "should fail" buttons. You should see a
   `[NOT_PRESENTER]` error above the roster, and **nothing changes** — the
   server rejected it, the button wasn't just hidden.
6. Refresh both tabs. The shared view should come back exactly as it was —
   nothing is held only in server memory.
7. Scroll to the bottom **"Raw sessions.get payload"** box in either tab and
   confirm it never contains an `inviteCode` or `token` field.

If step 4 works, you've directly observed the thing `docs/CONVEX_BACKEND.md`
calls "implemented but not yet accepted" become **accepted**.

## Rebuilding after an edit

`npm run test-harness` always rebuilds first. If you're iterating on
`app.js` alone with the server already running, just re-run
`npm run test-harness:build` and refresh the browser tab(s) — no server
restart needed, since it serves the file fresh off disk on every request.

## If something doesn't work

- **Blank page / console error about fetch failing:** the Convex deployment
  isn't running. Start it with `CONVEX_AGENT_MODE=anonymous npx convex dev` in
  another terminal and leave it running.
- **"No scans" in the dropdown:** run `npx convex run seed:seedSampleScan`.
- **Pointed at a different deployment:** append `?url=https://your-deployment.convex.cloud`
  to the harness URL.
