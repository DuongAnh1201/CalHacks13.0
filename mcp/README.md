# neuro-mcp

The Convex HTTP endpoint `https://<deployment>.convex.site/mcp` serves one stateless MCP server/transport per request. It uses the SDK's Web Standards Streamable HTTP transport in JSON-response mode; there is no separate production server and no Node runtime in the HTTP action. GET/DELETE return 405 after authentication because there are no sessions or persistent SSE streams.

## Configuration

- `MCP_TOKEN`: required Convex environment secret. Missing/incorrect bearer credentials return 401. No actual token is supplied by this repository.
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

`page: "learn"` or `"/learn"` always suppresses report access, even with a job ID. No job also means no patient report; the server never silently chooses a sample. A missing case says there is no report. No tumor says **"No tumor detected in this scan"**. `certainty` is outline certainty, uncalibrated, and is never synthesized from expertDice. Missing/null certainty is explicitly unavailable. Educational wording is guarded on tool/resource outputs.

Resources: `atlas://structures` is listed; `report://{jobId}` is a resource template. There is no chat search, viewer mutation, summary or export placeholder in this issue.

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
        "MCP_URL": "https://<deployment>.convex.site/mcp",
        "MCP_TOKEN": "<configure locally>"
      }
    }
  }
}
```

Claude Code can use the same stdio command and environment. The proxy requires HTTPS except for loopback testing. stdout is reserved for MCP; failures print a generic message to stderr without the token.

This first endpoint uses the deployment's MCP_TOKEN for both in-app and Desktop access. Dedicated per-user token issuance/rotation is not implemented here. A future per-user authenticator must resolve the author to Claude Desktop and ignore service run headers.

## Module integration and author identity

New modules export `registerExportTools(server: McpServer, deps: McpDependencies): void` (or `registerAnnotations`, `registerMessages`, `registerSummaries`) and are added to `createServer(deps, modules)`. Shared types are in `convex/mcp/types.ts`. `deps.data` reads reports, and `deps.ctx` is the actual Convex HTTP `ActionCtx` providing `runQuery`, `runMutation`, `runAction` and storage. No extra server is created by a tool module.

`deps.caller` is verified by the HTTP adapter. It contains `kind: "service"`, the SHA-256 `tokenHash`, `agentName`, and its identical `authorName` alias. Default author: `"Claude Desktop"`. After bearer-secret verification, the in-app action can send:

```text
X-Neuro-Agent-Run: {"agentName":"Scribe","runId":"<actual agent run id>"}
```

Only Navigator, Anatomy tutor and Scribe are accepted specialist names; malformed headers are rejected. This header is trusted because only the deployment-secret holder can use it; it is not a separate signature or a DB lookup of the run. The Desktop proxy does not forward run headers. Names in tool arguments are rejected, and cannot override the authenticated caller.

Writers call `authorFor({kind: 'agent', name: deps.caller.authorName, source: 'mcp'})`. Service authentication does **not** imply participant/session permission. A writer must separately validate session capability arguments before its internal DB/storage action. The private rate-limit function is referenced with `makeFunctionReference` so this additive module does not hand-edit generated API files.

D7=A: the Convex agent action must use an SDK MCP `Client` + `StreamableHTTPClientTransport` against this endpoint, list its tools and call them with the secret/run header; it must not bypass the server by invoking knowledge functions directly.

## Verification

```sh
npm run typecheck
npm test
npm run test:mcp-stdio
MCP_INSPECTOR_CHECK=1 npm run test:mcp-stdio
```

The edge tests execute actual SDK transport requests and `convex-test` HTTP routes, strict schemas, sample/sample-2 exact metrics and certainty, atlas/no-report/no-tumor cases, guarded wording, token auth, hash-only durable quotas and trusted author names. The stdio black-box test spawns the actual proxy against the same handler and compares file values. The optional Inspector test uses Inspector 2.5.0 to list tools/resources/templates and call sample metrics through the proxy; it uses an injected test token and an ephemeral local HTTP listener.

For a deployed endpoint, set MCP_URL/MCP_TOKEN in your local client environment and run:

```sh
npx --yes @modelcontextprotocol/inspector@2.5.0 --cli node mcp/stdio.mjs --method tools/list --format json
npx --yes @modelcontextprotocol/inspector@2.5.0 --cli node mcp/stdio.mjs --method resources/list --format json
```

Live Convex deployment and the Desktop GUI require deployment/client credentials and remain manual checks; the automated tests establish runtime compatibility and proxy behavior without setting a production token.
