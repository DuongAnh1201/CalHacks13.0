# neuro-mcp

The Convex HTTP endpoint `https://<deployment>.convex.site/api/mcp` serves one stateless MCP server/transport per request. The router stays at `/mcp`; main's `httpPrefix: "/api"` mounts it under `/api/mcp`, ahead of the SPA at `/`. Before #97 the URL was `https://<deployment>.convex.site/mcp`; use `/api/mcp` from #97 onward. The proxy takes the complete `NEURO_MCP_URL` and never hard-codes a deployment URL.

It uses the SDK's Web Standards Streamable HTTP transport in JSON-response mode; there is no separate production server and no Node runtime in the HTTP action. GET/DELETE return 405 after authentication because there are no sessions or persistent SSE streams.

## Configuration

- `MCP_TOKEN` on Convex: the in-app service secret only. It may supply a trusted run header. Desktop uses a separately issued personal token below. Missing, unknown, revoked or expired bearer credentials return 401. Personal tokens work independently of whether the service secret is configured. No actual token is supplied by this repository.
- `IMAGING_API_URL`: optional Convex environment setting, the imaging backend root reachable **from Convex**, for example an HTTPS tunnel rather than a laptop's localhost. The server reads `/jobs/{job_id}/report` (the report.json endpoint) from this fixed base. It never accepts an arbitrary report URL from a tool.
- Without `IMAGING_API_URL`, only `sample` and `sample-2` use their bundled `backend/seed/*/report.json` files. Other IDs explicitly have no report. With the setting present, the backend is authoritative even for samples; 404 does not silently substitute a bundled report.

The request quota is 120 authenticated HTTP requests per token per 60 seconds. A serializable internal Convex mutation updates the **separate final schema table** `mcpRateLimits`, indexed `by_token_hash`. It stores SHA-256 hashes, window timestamps and counts, never raw tokens. Rejected credentials do not consume quota. A full window returns 429 with `Retry-After`.

## Tools and resources

Strict object schemas (unknown properties rejected), snake_case names:

| Tool | Input | Data |
|---|---|---|
| `explain_structure` | `name`, optional `depth: brief/detailed` | anatomy.json + atlas structures.json; bilateral names return both sides |
| `explain_finding` | optional `job_id`, `page` | fixed template over report.json |
| `get_tumor_metrics` | optional `job_id`, `page`, `fields[]` | original volumesCm3, side, lesionCount, centroid/bbox, source, expertDice, certainty; sizeCm derives bbox extent / 10 |
| `get_report` | optional `job_id`, `page` | original scan facts/report with model metadata |
| `search` | `query`, optional `sources: [atlas,report]`, `job_id`, `page` | atlas name/group and report field/value matches with source URIs |
| `export_document` | `job_id`, `format: md`, `sections[]`, optional `session_id`, `participant_token` | shared Markdown builder, storage download URL, export id and version |
| `add_annotation` | `session_id`, `participant_token`, `text` (≤280), `anchor` point/structure/tumor | shared insert path; stored `suggested`, author agent, source mcp, name from the authenticated caller |
| `list_annotations` | `session_id`, `participant_token` | live human + AI notes; `can_remove` is true only for your own |
| `remove_annotation` | `session_id`, `participant_token`, `annotation_id` | removes only your own AI note (same agent name) |

`page: "learn"` or `"/learn"` always suppresses report access, even with a job ID. No job also means no patient report; the server never silently chooses a sample. A missing case says there is no report. No tumor says **"No tumor detected in this scan"**. `certainty` is outline certainty, uncalibrated, and is never synthesized from expertDice. Missing/null certainty is explicitly unavailable. Educational wording is guarded on tool/resource outputs.

Resources: `atlas://structures` is listed; `report://{jobId}` is a resource template. The HTTP adapter registers the shared export module alongside the knowledge tools. Private export sections require matching session_id and participant_token; a service token alone is not membership. Case/report-only exports need no participant capability. Suggested notes require explicit suggested_annotations selection; dismissed notes are excluded. PDF and auto-export are deferred. Pairing to obtain the Desktop participant capability is #70. There is no chat-search, viewer-mutation or summary-generation tool here.

## Claude Desktop / Claude Code

From the repository root run `npm ci`. The thin `mcp/stdio.mjs` proxy connects an SDK HTTP client to this exact endpoint and forwards MCP tools/resources over stdio; it has no local report logic.

Add a local Desktop MCP configuration (replace paths and configure your token locally; never commit it):

```json
{
  "mcpServers": {
    "neuro-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/CalHacks13.0/mcp/stdio.mjs"],
      "env": {
        "NEURO_MCP_URL": "https://<deployment>.convex.site/api/mcp",
        "MCP_TOKEN": "<paste your once-issued personal token locally>"
      }
    }
  }
}
```

Claude Code can use the same stdio command and environment. The proxy requires HTTPS except for loopback testing. stdout is reserved for MCP; failures print a generic message to stderr without the token.

### Issue or revoke a Desktop token (Tom/admin CLI)

Run against the intended configured Convex deployment (or use the CLI's explicit
`--prod` option when administering production):

```sh
npx convex run mcpTokens:issue '{"label":"Tom Desktop","ttlDays":30}'
```

The **internal action** returns `{ id, token, expiresAt }`; copy the token into
the Desktop proxy's local `MCP_TOKEN` setting above. This is a distinct token,
not the deployment's in-app service secret. Save it when issued: there is no
retrieval endpoint, and another issue call creates a new credential. Omitting
`ttlDays` makes a non-expiring token; supplied values must be positive. Labels
are administrative labels only and cannot choose the agent's name.

To revoke (use the returned `id`):

```sh
npx convex run mcpTokens:revoke '{"id":"<mcpTokens id>"}'
```

Revocation is idempotent. Rotate by issuing a new token, updating the local
configuration, and revoking the old id. Issuance and revocation are internal
functions; no browser or public MCP tool can administer credentials.

`mcpTokens:issue` generates 256 random bits and hashes the credential in an
action; the internal `issueRecord` mutation receives only SHA-256 and metadata.
The `mcpTokens` table stores `tokenHash`, `label`, `createdAt`, optional
`expiresAt`/`revokedAt`, and `lastUsedAt`, indexed by `by_hash`. A zero last-use
value means never used. Authentication reads this index, rejects revoked or
expired rows, and updates usage only on first use or after at least one minute;
the touch mutation rechecks both validity and the time to handle concurrent
requests. Rate limits remain keyed by the same token hash. Raw credentials are
not stored in either table. Personal tokens never confer session membership;
private export sections still need participant capabilities. Pairing/viewer
control is #70 part 2, not this token increment.

## Module integration and author identity

The HTTP adapter supplies `[registerExportTools]` to the handler's module list; this is the same server, service authentication, and quota used by knowledge tools.

New modules export `registerExportTools(server: McpServer, deps: McpDependencies): void` (or `registerAnnotations`, `registerMessages`, `registerSummaries`) and are added to `createServer(deps, modules)`. Shared types are in `convex/mcp/types.ts`. `deps.data` reads reports, and `deps.ctx` is the actual Convex HTTP `ActionCtx` providing `runQuery`, `runMutation`, `runAction` and storage. No extra server is created by a tool module.

`deps.caller` is verified by the HTTP adapter. It contains `kind: "service" | "user"`, the SHA-256 `tokenHash`, `agentName`, and its identical `authorName` alias. Personal-token callers always have kind `user`, author `Claude Desktop`, and no agentRunId; their run header is ignored entirely, including malformed JSON. Service callers retain the existing default label and specialist-header behavior. Only after matching the env service secret can the in-app action send:

```text
X-Neuro-Agent-Run: {"agentName":"Scribe","runId":"<actual agent run id>"}
```

For the env service credential, only Navigator, Anatomy tutor and Scribe are accepted specialist names; malformed headers are rejected. This header is trusted because only the deployment-secret holder can use it; it is not a separate signature or a DB lookup of the run. The Desktop proxy does not forward run headers. Names in tool arguments are rejected, and cannot override the authenticated caller.

Writers call `authorFor({kind: 'agent', name: deps.caller.authorName, source: 'mcp'})`. Neither service nor personal-token authentication implies participant/session permission. A writer must separately validate session capability arguments before its internal DB/storage action. The private rate-limit function is referenced with `makeFunctionReference` so this additive module does not hand-edit generated API files.

D7=A: the Convex agent action must use an SDK MCP `Client` + `StreamableHTTPClientTransport` against this endpoint, list its tools and call them with the secret/run header; it must not bypass the server by invoking knowledge functions directly.

## Verification

```sh
npm run typecheck
npm test
npm run test:mcp-stdio
MCP_INSPECTOR_CHECK=1 npm run test:mcp-stdio
```

The edge tests execute actual SDK transport requests and `convex-test` HTTP routes, strict schemas, sample/sample-2 exact metrics and certainty, atlas/no-report/no-tumor cases, guarded wording, token auth, hash-only durable quotas and trusted author names. The stdio black-box test spawns the actual proxy against the same handler and compares file values. The optional Inspector test uses Inspector 2.5.0 to list tools/resources/templates and call sample metrics through the proxy; it uses an injected test token and an ephemeral local HTTP listener.

For a deployed endpoint, save the Desktop-style MCP configuration above locally and use it with Inspector (Inspector does not automatically forward arbitrary parent environment variables):

```sh
npx --yes @modelcontextprotocol/inspector@2.5.0 --cli --config /path/to/local-mcp-config.json --server neuro-mcp --method tools/list --format json
npx --yes @modelcontextprotocol/inspector@2.5.0 --cli --config /path/to/local-mcp-config.json --server neuro-mcp --method resources/list --format json
```

An actual isolated anonymous `convex dev` deployment was also tested after #97, with a populated SPA fixture: `/learn` served HTML while `/api/mcp` returned authenticated MCP responses, bad tokens returned 401, and the real stdio proxy returned exact sample metrics and certainty. Cloud deployment and the Desktop GUI remain manual checks; no production MCP token was set.

References: [SDK Web Standards transport](https://github.com/modelcontextprotocol/typescript-sdk/blob/v1.x/src/server/webStandardStreamableHttp.ts), [Convex HTTP actions](https://docs.convex.dev/functions/http-actions).

Personal-token local smoke (#70 part 1): the admin CLI issued a disposable token
without displaying it in test output. An actual SDK Client used it at /api/mcp,
listed all six tools and requested a report export with a forged Scribe header;
the stored author remained Claude Desktop. CLI revocation made the next request
return 401. The test token was revoked and the isolated server stopped; no shared
or cloud credentials changed.
