#!/usr/bin/env node
/**
 * test-harness/serve.mjs — a dependency-free static file server.
 *
 * WHY NOT JUST `npx serve` OR PYTHON'S `http.server`?
 * ----------------------------------------------------
 * Both work fine too. This exists so `npm run test-harness` has zero new
 * dependencies and zero "do you have Python installed" questions — it's ~40
 * lines of Node's built-in `http` and `fs` modules, nothing else.
 *
 * It serves exactly this directory (test-harness/) on http://localhost:5050.
 * Open that URL in two separate browser tabs to watch Phase 1's reactivity —
 * see test-harness/README.md for the walkthrough.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT) || 5050;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    // Strip query string (the harness uses `?url=` to override the Convex
    // deployment) and default `/` to the harness page.
    const urlPath = (req.url ?? "/").split("?")[0];
    const relative = urlPath === "/" ? "/index.html" : urlPath;

    // Normalize and confirm the resolved path stays inside ROOT, so a request
    // like `/../../.env.local` can't read anything outside this directory.
    const resolved = normalize(join(ROOT, relative));
    if (!resolved.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }

    const body = await readFile(resolved);
    const contentType = CONTENT_TYPES[extname(resolved)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(body);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      res.writeHead(404).end("Not found");
    } else {
      res.writeHead(500).end(String(err));
    }
  }
});

server.listen(PORT, () => {
  console.log(`Test harness: http://localhost:${PORT}`);
  console.log(`Open that URL in TWO browser tabs to see Phase 1's live reactivity.`);
});
