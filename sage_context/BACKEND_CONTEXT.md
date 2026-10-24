# NeuroLens — Backend & Convex Context

> **Purpose:** Source-of-truth engineering brief for Codex (or any coding assistant) working on NeuroLens's backend and Convex integration. Read this before editing the project. Last drafted: **October 23, 2026 (Cal Hacks 13.0)**.
>
> **Status:** Architecture decisions and proposed API contracts, **not** a claim that any listed function or feature has been implemented. Inspect the actual repository first. Preserve existing working code and adapt names/contracts where necessary.

## 0. One-minute summary

**NeuroLens** is a gesture- and voice-controlled 3D brain MRI visualization platform with tumor segmentation. The differentiating feature for **Cal Hacks — Best Use of Convex** is **NeuroLens Live Review**: two or more people join the same MRI review session, follow shared slice/plane/tumor visibility, see one another's presence, place anatomically anchored annotations, and communicate in real-time chat. A contextual **JARVIS** command interface works both via voice and via chat messages prefixed `/jarvis`. The chat also supports session summaries and retrieval of past discussion.

**Architecture decision:** **Convex (TypeScript)** is the primary collaborative/application backend. **FastAPI (Python)** is a separate, narrow imaging/ML-integration REST service **only where Python is needed**. The actual segmentation model is owned by a teammate. React/Three.js, MediaPipe gesture detection, microphone speech recognition, QR UI, and brain visualization are owned by frontend teammates.

**Not in scope:** Runpod, Apify, a stand-alone diagnostic AI assistant, model training, replacing Convex with FastAPI, bespoke WebSockets, Kubernetes, complex queues, or replay/history-of-every-gesture. Do not reintroduce these without a new team decision.

## 1. Project objectives and demo outcome

**Priority:** Best Use of Convex, not merely "uses Convex as storage." Convex must be visibly indispensable to multi-user spatial collaboration.

**Core (MUST build)**
1. Shared review sessions with invite link.
2. Real-time synchronization of **selected MRI case, plane, slice index, and tumor highlight visibility**; support presenter-follow mode.
3. Persistent, synchronized spatial annotations stored in **MRI voxel coordinates** (not viewport/pixel coordinates).
4. Real-time session chat.

**High-value (BUILD after core)**
5. Live participant presence; join/leave indicator.
6. QR-code joining (frontend encodes invite URL; backend supplies session/invite information).
7. JARVIS commands from **voice and `/jarvis ...` chat**, using a common, validated command/action format. Changes propagate to everyone via Convex.
8. Session-scoped JARVIS memory: rolling conversation summary, on-demand summary, and targeted retrieval of earlier chat context. Conversation history acts as retrieval/context, **not model fine-tuning**.

**Deliberately excluded:** Session replay timeline, production-grade medical diagnosis, unconstrained agent actions, high-frequency gesture streaming, live raw-patient data.

**Sponsor demo (target 45–60 seconds):** Open a preprocessed de-identified MRI case on presenter laptop → judge scans QR code to join on a second screen → participant presence appears → presenter says "Jarvis, show axial view and highlight the tumor" → both views update → presenter changes slices with gestures and shared slice changes are reflected → judge posts an anchored annotation → marker appears in corresponding anatomical coordinates on presenter screen → a chat message appears immediately → `/jarvis summarize this session` returns a summary grounded in session chat.

## 2. Team boundaries — do not overlap

| Component | Owner | Notes |
|---|---|---|
| Convex schema, TypeScript queries/mutations/actions, session auth, chat, commands, memory, presence | **Backend engineer** | Primary responsibility |
| Python FastAPI REST endpoints, scan upload/validation, API-to-Convex integration, status/results publication | **Backend engineer** | Only when needed; do not duplicate Convex collaboration endpoints |
| Model selection, MRI model preprocessing, tensor generation, inference, mask postprocessing, prediction accuracy | **ML teammate** | Contract discussed below; work in parallel |
| 3D rendering, spatial mapping in Three.js, React dashboard, MediaPipe hand detection, speech-to-text/JARVIS microphone, visual annotations/QR code | **Frontend teammate(s)** | Convex called directly from React |
| Geometry export / MRI slice asset generation | **Decide at integration** | Suggested: ML/imaging teammate produces aligned segmentation mask and precomputed visualization assets; backend serves/registers manifest. Do not silently claim this work for backend if teammates own it. |

**Critical clarification about "ML API must be finished first":** It does **not** block Convex sessions, chat, presence, annotations, or state synchronization. Agree now on *input/output contracts*. Mock one scan and one output manifest while ML work proceeds. Integration with real inference is the only dependent phase.

## 3. Technology choices

### Convex collaborative backend — TypeScript
- **Convex** for data persistence, reactive queries, transactional mutations, scheduled/internal functions, and real-time subscriptions to React.
- **TypeScript** in `convex/` for native Convex backend code: queries, mutations, actions, HTTP actions.
- **React Convex client** (`convex/react`): `useQuery`, `useMutation`, optionally `useAction`.
- **Convex file storage** for moderate-sized prepared assets if practical; otherwise keep big raw volumes and large assets in the imaging service/object storage and store references/metadata in Convex. Avoid redundant binary copies.
- Optional **Convex Presence component** if it saves time and fits the current SDK. If not, implement short-lived heartbeats with explicit stale cleanup. Never conflate historical membership with active presence.
- **Convex Agent component** is an *optional* implementation aid for persistent threads, tools, and retrieval. Not required to ship simple custom session chat. Choose **one authoritative chat store**—do not duplicate chat messages in an ad hoc table AND an Agent store without a migration/ownership plan.

### Imaging REST service — Python
- **Python 3.11 + FastAPI + Uvicorn + Pydantic**, `python-multipart` for uploads.
- **NiBabel + NumPy** for MRI/NIfTI inspection if required by this service.
- **PyTorch/MONAI** remain in the ML teammate's inference environment. Do not force them into the Convex deployment.
- **Convex official Python client** or authenticated Convex HTTP action to publish resulting case status and artifact metadata.
- The Python service may run locally during development. **Hosting is still to be chosen.** Dropping Runpod means there is no confirmed GPU host. Precomputed MRI case must work without live inference.

### Frontend integrations (not backend work)
- React/TypeScript, Three.js / React Three Fiber.
- MediaPipe hands and browser speech recognition (availability/permissions vary). Frontend translates gestures/recognized text into commands, then calls Convex only for *shared semantic state changes*.
- No separate custom chat WebSocket server needed. Convex handles subscriptions internally.

### JARVIS LLM provider
- **Not yet locked**. Use an API accessible from **Convex actions**, with a server-side secret. Do not hardwire a provider without checking team credits/availability.
- Basic deterministic view commands **must work even if LLM provider is down**.
- Chat/JARVIS is scoped to collaboration, visual control, and *summarizing/discovering what participants said*, not giving independent patient diagnoses or treatment advice.

## 4. Data flow

### A. Session/collaboration
1. React creates a Convex review session and receives an ID/invite URL.
2. Guests use link/QR to join. Server establishes membership and permissions.
3. React subscribes to session state, messages, annotations, scan metadata, and presence via Convex queries/hooks.
4. Voice, chat, and gestures use the **same command semantics**. Presenter emits semantic changes (`setPlane`, `stepSlice`, `setTumorVisible`, etc.), not webcam frames.
5. Convex mutation validates permissions and bounds, writes the shared state, and subscribed clients rerender.
6. Annotation coordinates are anchored in voxel-space of the **same scan**, preserved across camera orientation and devices.

### B. MRI imaging and ML
1. Frontend uploads supported MRI volume(s) to Python FastAPI (or uses a precomputed demo case).
2. FastAPI validates, assigns case/job ID, records processing status and stores files; never claims a completed inference at upload time.
3. Backend calls ML teammate's agreed Python function **or** an independent inference endpoint. Choice remains open; no one should invent a URL.
4. ML returns a segmentation mask **with alignment/orientation information**; preferably NIfTI `.nii.gz` in the original physical coordinate system, or a published transform.
5. Imaging pipeline produces a **case manifest** plus aligned slice/mesh assets as agreed with ML/frontend.
6. Python securely notifies Convex of `processing`/`completed`/`failed`, and registers asset references.
7. Convex `scans` query updates dashboard and collaborators; frontend fetches heavy assets separately.

**MRI input is model-dependent:** potentially T1, T1c, T2, FLAIR, all aligned NIfTI files. **Do not assume a single 2D JPEG can yield an accurate 3D tumor mesh.** Confirm actual input set with ML teammate. Distinguish an annotated mask from a model prediction in metadata.

## 5. Proposed schemas and indexes (adapt to repo)

These are *logical* tables and field guidelines, not a migration already applied. Favor schema validators in `convex/schema.ts` and indexed session-scoped queries. Use Convex-generated `Id<"table">` for internal references.

### `scans`
- `_id`, `displayName`, `status: "uploaded"|"processing"|"completed"|"failed"`
- `segmentationSource: "annotation"|"model"|"none"`
- `modalityNames: string[]`, `dimensions: {i,j,k}`, `voxelSpacingMm: [number,number,number]`
- `orientation`, spatial affine/transform manifest reference, case manifest URL/storage ID
- Asset references: brain mesh, tumor mesh, slice manifest, optional overlay; avoid embedding huge blobs.
- Actual derived metrics (e.g., tumor volume mm³) only if computed; no fake demo numbers labeled as real.
- `createdBy`, `createdAt`, `errorMessage?` (safe, no secrets).

### `sessions`
- `_id`, `scanId`, `hostParticipantId`/host user ID
- `plane: "axial"|"coronal"|"sagittal"`, `sliceIndex: number`, `tumorVisible: boolean`
- `followPresenter: boolean` / per-participant follow preference (choose explicitly)
- `viewVersion: number`, `updatedAt`, `createdAt`, `status`
- Join capability/invite code (use an unguessable secure token, rotate if necessary; **session ID alone is not authorization**).
- Keep 60-FPS camera matrix/hand landmarks **out** of this record.

### `sessionParticipants` (durable membership)
- `sessionId`, `participantId`/authenticated user ID, `displayName`, `role: "host"|"viewer"`, `joinedAt`
- `by_session` and unique identity lookup. Do not use a client-supplied display name as trusted identity.
- Optional heartbeat `lastSeenAt` **only** as presence fallback; separate membership and online status.

### `annotations`
- `sessionId`, `scanId`, `authorParticipantId`, `text`, `voxel: { i, j, k }`, `createdAt`
- Index `by_session` and optionally `by_session_created`.
- Bounds-check voxel against scan dimensions, validate matching scan, and preserve mapping between NIfTI and Three.js coordinate systems.

### `messages`
- `sessionId`, `authorParticipantId` or bot/system author, `body`, `kind: "user"|"jarvis"|"system"`, `createdAt`
- Optional `commandStatus`/response link for `/jarvis` messages.
- Index `by_session_created`; paginate. All retrieval and summaries must be **session-scoped**.

### `sessionSummaries`
- `sessionId`, `summary`, `summarizedThroughMessageId` or monotonic message sequence, `updatedAt`, `version`
- Store enough bookkeeping to summarize **only new messages** rather than repeatedly resending entire chat.
- One current rolling summary per session. Use optimistic version checks or serialized scheduling to avoid out-of-order overwrites.

### `jarvisRequests` (optional but recommended)
- `sessionId`, `messageId`, `requestedBy`, `status: "pending"|"completed"|"failed"`, `intent`, `result`, `createdAt`
- Useful to prevent duplicate LLM calls, show agent typing/status, and capture failures.

**Presence:** Prefer official component if available. Otherwise heartbeat/last-seen plus expiry and UI-side grace periods. Don't claim exact join/leave notifications from an unimplemented presence mechanism.

## 6. Convex function contract — proposed

### Sessions
| Function | Kind | Behavior |
|---|---|---|
| `sessions.create` | public mutation | Creates session, host capability/membership; returns session ID/join info |
| `sessions.join` | public mutation | Validates invite, creates membership; returns safe role/info |
| `sessions.get` | public query | Read session only if authorized |
| `sessions.updateView` | public mutation | Presenter-authorized semantic state update; bounds checks; increments `viewVersion` |
| `sessions.setFollowMode` | mutation | Controls per-participant view following if implemented |

### Chat and annotations
| Function | Kind | Behavior |
|---|---|---|
| `messages.send` | mutation | Validate membership, insert chat, schedule JARVIS work when `/jarvis` prefix present |
| `messages.list` | query | Reactive, **paginated**, session-scoped chat |
| `annotations.create` | mutation | Validate member, scan association, integer voxel coordinates and text limits |
| `annotations.list` | query | Reactive session annotations |
| `annotations.remove` | mutation | Only author/host, as agreed |

### JARVIS / memory
| Function | Kind | Behavior |
|---|---|---|
| `jarvis.executeCommand` | preferably internal mutation for validated deterministic commands | Apply whitelisted plane/slice/tumor changes to session state |
| `jarvis.handlePrompt` | **internal action** | Parse complex request, call external LLM if necessary, request validated mutation/tool calls, save response |
| `jarvis.summarizeSession` | internal action + internal mutation | Summarize incremental chat context, persist rolling summary |
| `jarvis.getSummary` | query | Read latest session summary if authorized |
| `jarvis.findChatContext` | internal query | Retrieve recent and/or bounded indexed messages within same session |

### Scans / integration
| Function | Kind | Behavior |
|---|---|---|
| `scans.get` | query | Read safe metadata/status and asset URLs after permission check |
| `scans.register` | mutation/internal mutation | Register accepted case metadata, not giant MRI binary |
| `scans.markProcessing` / `scans.publishResult` | **internal mutations** | Update status, derived metrics and asset refs after authenticated server-to-server call |
| `http` ingest callback | authenticated HTTP action, if needed | Python service passes shared secret/signed identity; action invokes internal mutation |

**Security:** Prefer users authenticated through a Convex-compatible auth provider. For a fast demo with guest users, a well-designed bearer invite capability can work for de-identified demo cases only. Verify every client-callable query/mutation/action; never rely on hiding a function name. Use `internalQuery`/`internalMutation`/`internalAction` for private logic.

## 7. Shared view / gesture / voice event contract

Use a single conceptual command model across frontend gesture detection, voice input, and `/jarvis` chat. Keep it simple and typed:

```ts
type ViewerCommand =
  | { type: "setPlane"; plane: "axial" | "coronal" | "sagittal" }
  | { type: "setSlice"; index: number }
  | { type: "stepSlice"; delta: -1 | 1 }
  | { type: "setTumorVisible"; visible: boolean }
  | { type: "resetView" };
```

**Shared vs. local state:** The *selected plane, slice, and tumor visibility* are synchronized; camera tilt, pinch progress, pointer movement and webcam frames are local. A shared camera-pose feature can be added only after core state works, ideally throttled; do not write every frame to Convex.

Example phrases: `"Jarvis, show axial view"`, `"Jarvis, highlight the tumor"`, `"Jarvis, next slice"`, `/jarvis show coronal view`, `/jarvis summarize what we decided about the tumor`.

A recognized command from voice and chat must flow through the **same permission-checked session state mutation**. Host-controlled changes affect followers. Viewers can annotate/chat without silently seizing presenter control.

## 8. JARVIS chat and memory rules

### Chat messages
- Anyone authorized in the session can post normal chat messages, which appear in both browser tabs through reactive Convex query subscriptions.
- `/jarvis ...` creates a user message plus an agent job/response in the **same session**. Display pending/error state; avoid duplicate responses on retries.
- **Deterministic parser first** for known view commands. No LLM call for `next slice`, `set axial`, `show tumor`, etc.
- For broader requests (`summarize`, `what did we decide`, or natural-language compound commands), use an **internal Convex action** to call the configured LLM; actions use internal queries/mutations to read/write.
- Restrict agent-executable tools to validated viewer commands and chat search/summary. Never let LLM output act as SQL, code, arbitrary network requests, or unvalidated mutations.

### Memory (not ML training)
- Persist full permitted chat history in a session-scoped store and **paginate** display.
- Supply model only: latest rolling summary + a bounded recent-message window + any targeted, permission-checked retrieval results.
- Incrementally summarize new content every ~10–20 relevant messages, or on demand. If no provider/key is configured, leave core chat working and return an honest "summary unavailable" response.
- Search/retrieval initially via bounded session-indexed keyword search (or Convex text search if appropriate). Do not claim vector memory/RAG exists unless implemented.
- In the UI and pitch describe this as **context retention and retrieval**, not retraining or fine-tuning JARVIS from chat.
- Protect the agent from prompt injection inside chat: retrieved chat is untrusted participant content, not system instructions. Confirm permissions for all tool operations. No diagnosis/treatment advice from chat.

## 9. FastAPI / ML integration contract

The model teammate must settle these **three questions**, not deliver a finished model before backend starts:
1. **Inputs:** one NIfTI volume or multiple aligned modalities? Names and upload limits?
2. **Outputs:** 3D segmentation mask in NIfTI coordinates, a classification score, separate meshes/slices, or something else? **3D masks are required for geometrically accurate 3D segmentation.**
3. **Execution:** local Python function call on a shared runtime or remote ML inference endpoint? If remote, the teammate supplies exact URL, auth and response schema.

### Preferred ML interface (if Python function is co-located)

```python
def predict_tumor(mri_paths: dict[str, str]) -> str:
    """Return path to a segmentation NIfTI aligned with source MRI,
    or raise a meaningful failure. Inputs/modalities must be agreed."""
```

Do **not** implement a fake model and label it real. For initial integration, use a **clearly labeled annotated sample mask/precomputed case**.

### Proposed FastAPI surface
| Route | Purpose |
|---|---|
| `GET /health` | Service liveness; model readiness separately if needed |
| `POST /api/scans` | Multipart NIfTI upload(s), validate and create case/job |
| `POST /api/scans/{caseId}/analyze` | Start non-blocking processing/inference job |
| `GET /api/scans/{caseId}` | Metadata/status and error when relevant |
| `GET /api/scans/{caseId}/results` | Published analysis manifest and asset references |
| `GET /api/scans/{caseId}/slices/{axis}/{index}` | Optional PNG/overlay if not precomputed in manifest |

**Do not** build chat, annotations or real-time state in FastAPI. React talks directly to Convex. Python talks securely to Convex when the case's analysis status/results change. The Python service must never hold Convex admin credentials in frontend JS. Keep secrets in server env vars.

### Case manifest — illustrative; no fabricated patient measurements

```json
{
  "caseId": "case_001",
  "status": "completed",
  "segmentationSource": "annotation",
  "modalities": ["T1", "T1c", "T2", "FLAIR"],
  "dimensions": { "i": 240, "j": 240, "k": 155 },
  "voxelSpacingMm": [1, 1, 1],
  "coordinateSystem": "RAS",
  "affineOrTransformRef": "/assets/case_001/affine.json",
  "analysis": { "tumorVolumeMm3": null },
  "assets": {
    "brainMeshUrl": "/assets/case_001/brain.glb",
    "tumorMeshUrl": "/assets/case_001/tumor.glb",
    "sliceManifestUrl": "/assets/case_001/slices.json"
  }
}
```

> Illustrative only. The numbers above are common *example dimensions* and not assertions about the user's scan. Use actual metadata in production/demo output. Keep an affine/transformation so voxel coordinates align across 2D slice and 3D mesh. Mark whether segmentation is human annotation or model-derived.

**Processing behavior:** long jobs return quickly with a queued/processing status, rather than keeping an upload HTTP request open until inference is done. Cap file sizes, validate actual NIfTI content, isolate per-case files, reject path traversal, use permitted de-identified research data only. Do not make diagnostic claims.

## 10. Suggested repo organization

```text
repo/
├── convex/
│   ├── schema.ts
│   ├── sessions.ts
│   ├── sessionParticipants.ts
│   ├── annotations.ts
│   ├── messages.ts
│   ├── jarvis.ts
│   ├── scans.ts
│   ├── http.ts                 # only if Python -> Convex webhook needed
│   └── lib/                   # reusable auth/validation/commands
├── src/                       # React frontend, owned by teammates
├── python-api/
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/scans.py
│   │   ├── services/ingestion.py
│   │   ├── services/ml_adapter.py
│   │   └── services/convex_publisher.py
│   ├── requirements.txt
│   └── tests/
├── .env.example                # names only; no secrets
├── BACKEND_CONTEXT.md         # this file
└── README.md
```

Do not assume this layout exists. Adapt to an existing working Vite/React/Convex or Python repo. Do not recreate the UI, wipe teammate files or change agreed naming without coordination.

## 11. Build order (backend engineer's actual work plan)

### Phase 0 — Repo inspection and contracts (first)
- Inspect repo, package versions, existing Convex deployment/setup, auth strategy, existing frontend API expectations and ML endpoint/function shape.
- Ask team to confirm ML input/output contract and ownership of geometry/slices. You can proceed with mocks immediately.
- Create `schema.ts` and shared TypeScript types; provide frontend with stable function names.

### Phase 1 — Convex proof (do this *before* FastAPI)
- Create one session; join with second browser tab/device.
- Build `sessions.get`, `sessions.updateView`, and reactive subscription.
- Verify switching plane/slice/tumor visibility updates second client automatically.
- Add a **fixture scan** record with authentic allowed sample asset refs or placeholder demo assets clearly labeled fixtures.

**Accept:** two tabs viewing one session get identical meaningful shared state changes; no manual refresh.

### Phase 2 — Collaboration
- Build session-scoped `messages.send/list`; show real-time chat in both tabs.
- Build `annotations.create/list` with voxel-coordinate validation; confirm marker coordinate conversion with frontend.
- Add presenter/viewer permissions and basic session joining security.

**Accept:** chat and annotations persist through page refresh; view and annotation changes appear on both devices.

### Phase 3 — Presence and QR
- Implement presence component or heartbeat fallback; return/display who's online.
- Generate shareable invite URL and frontend QR code; test from phone.

**Accept:** judge can join with QR and show online status; membership and presence remain separate.

### Phase 4 — JARVIS command + memory
- Implement deterministic parser `/jarvis next slice`, `/jarvis show axial`, `/jarvis highlight tumor`.
- Wire voice recognizer frontend to identical typed command semantics.
- Add LLM-backed `/jarvis summarize chat` and `/jarvis what did we decide about X?` via internal action and stored summaries (provider configured by server env).
- Ensure tool whitelist, rate limit and failure states; keep chat usable without LLM.

**Accept:** voice and slash commands update same shared scene; summaries only reflect messages in the current session; no fake memory/training claims.

### Phase 5 — FastAPI + ML integration
- Add `GET /health`, NIfTI upload, job/status/results contract.
- Call ML teammate's agreed function/endpoint; until available, use clearly labeled sample segmentation fixture.
- Publish status and manifest securely to Convex; frontend sees analysis status update reactively.
- Add tests for invalid file, missing modality, model failure and coordinate/asset mismatch.

**Accept:** uploaded case → processing status → valid manifest (or clear failure), linked to Convex scan record; collaboration still functions if ML service unavailable.

### Phase 6 — Demo hardening
- Present on two physical devices, refresh both, test slow network, ensure one precomputed case always works.
- Test role restrictions, unauthorized session ID/invite attempts, excessive `/jarvis` calls, bad coordinates and upload errors.
- Confirm deployed frontend points to correct Convex environment and Python service; check env secrets and CORS where relevant.
- Create 45-second sponsor-specific script emphasizing Convex reactivity, transactional annotations, chat, presence, and agent context.

## 12. Implementation guardrails

1. **Keep Convex primary.** Native queries/mutations/actions are **TypeScript/JavaScript**, not Python. Python only calls them through a client/API.
2. **No custom WebSocket service** for chat/state. Convex clients handle subscriptions.
3. **No external `fetch` in Convex queries/mutations**; use actions. Mutations must be deterministic and are transactional.
4. **Use internal functions** for jobs/LLM and authenticated server-to-server writes.
5. **Validate and authorize every public function**. Session ID alone is not access control. Don't leak invite secrets in query results.
6. **Do not trust chat or agent output** to authorize an action. Only whitelisted typed viewer commands from authorized roles may change shared state.
7. **Do not stream camera/gesture samples to Convex**. Sync semantically meaningful changes, rate-limit/throttle view updates.
8. **No unbounded `.collect()` for chat**; use pagination and indexes.
9. **Bound agent context, costs and rate.** Stored messages are not training data; don't imply otherwise.
10. **Keep spatial transforms explicit** and check voxel validity. Coordinate mismatch is a correctness bug, not a cosmetic bug.
11. **Medical safety:** use de-identified research cases with proper licensing; describe as research/educational prototype; no clinical diagnosis.
12. **Don't promise what isn't built.** Distinguish precomputed annotation, real model inference, and placeholders in UI and pitch.
13. **Use docs for exact SDK APIs**—versions can change; never invent imports or signatures.
14. **Prefer incremental changes and working demos** over clean-slate rewrites of teammate work.

## 13. Testing / definition of done

| Test | Expected result |
|---|---|
| Create + join session from separate browsers | Same scan/session and permitted roles |
| Change plane/slice as presenter | Both subscribed clients update |
| Guest attempts presenter-only mutation | Rejected server-side |
| Send messages from both participants | Both see messages, ordered and persistent |
| Add voxel annotation at `(i,j,k)` | Appears anatomically at corresponding point on 2D and 3D view |
| Refresh clients | Chats, annotations, shared state persist |
| Online participant disconnects | Presence eventually expires accurately |
| QR join | New browser/phone joins correct session |
| `/jarvis next slice` | Typed, bounded state mutation; two screens agree |
| Voice "Jarvis, highlight tumor" | Same shared command semantics as chat |
| `/jarvis summarize this session` | Grounded in session messages only, no cross-room leakage |
| LLM disabled/fails | Normal chat + deterministic commands still work |
| Upload invalid MRI | Clear validation error, no fake analysis |
| ML service unavailable | Processing fails safely; precomputed case still demos |
| MRI asset manifest | Slice/mask/mesh share coordinate transform |

## 14. Codex execution instructions (copyable)

> Read `BACKEND_CONTEXT.md` as the source of truth for NeuroLens's backend and Convex layers. First inspect the actual repository, package versions, existing schema, generated Convex APIs, frontend integrations, and any current FastAPI/ML code. **Do not rewrite working teammate code.** Give me a brief implementation plan and any contract mismatches, then implement **only Phase 1**: Convex session schema, create/join/get/updateView functions, a seeded demo scan record, and minimal tests. Use native Convex TypeScript, validators, transactional mutations, indexed queries, and server-side permission checks. Keep functions/types easy for the React team to consume. Run the available build/typecheck/test commands, report exact results, and tell me the next integration step. Do not implement FastAPI, ML inference, auth provider migrations, or the LLM agent yet unless required for Phase 1.

After Phase 1 succeeds, use the same process for Phase 2 onward, one milestone at a time. Keep the project demonstrable after each phase.

## 15. Official documentation to check when coding

- Convex function types, native TS/JS: https://docs.convex.dev/functions/overview
- Queries and reactive subscription: https://docs.convex.dev/functions/query-functions
- Mutations and transactions: https://docs.convex.dev/functions/mutation-functions
- Actions and external APIs: https://docs.convex.dev/functions/actions
- Internal function security: https://docs.convex.dev/functions/internal-functions
- Auth/authorization: https://docs.convex.dev/auth/overview
- Convex Agent component and context: https://docs.convex.dev/agents/overview and https://docs.convex.dev/agents/context
- Convex storage: https://docs.convex.dev/file-storage/upload-files
- Python client: https://docs.convex.dev/quickstart/python
- Real-time chat tutorial: https://docs.convex.dev/tutorial/overview

---

**Single most important engineering objective:** Show two connected devices reviewing the same MRI case where an authorized view change, a chat message, and a voxel-anchored annotation synchronize immediately because of **Convex**. Everything else—including live ML inference—is downstream of that proof.
