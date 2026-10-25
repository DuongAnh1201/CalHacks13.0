/**
 * convex database schema
 *
 * what this means in java terms:
 * ----------------------------------------
 * this is the equivalent of JPA '@Entity' classes plus Flyway/Liquibase
 * migration that creates the tables and indexes, just all of it in one file.
 *
 *   Java / Spring                         Convex
 *   -----------------------------------   ------------------------------------
 *   @Entity class Session { ... }         defineTable({ ... })
 *   @Column(nullable = false) String x    x: v.string()
 *   @Column(nullable = true)  String x    x: v.optional(v.string())
 *   enum Plane { AXIAL, CORONAL }         v.union(v.literal("axial"), ...)
 *   @Id Long id                           _id: Id<"sessions">  (added for free)
 *   @Index(columnList = "sessionId")      .index("by_session", ["sessionId"])
 *   CREATE TABLE ... (migration)          `npx convex dev` applies this file
 *
 * note:
 * 'v.*' validators are enforced at runtime on every write, not just by the
 * compiler. a bad write is rejected by the database.
 * tsx types for `ctx.db` are derived from this file automatically,
 * so the schema is the single source of truth (no DTO duplication).
 *
 * Phase 1: scans, sessions, sessionParticipants.
 * Shared human/agent records (#56): annotations, messages, sessionSummaries, exports.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { vScene } from "./lib/viewCommands";
import { vAuthor } from "./lib/author";
import { vAgentStep, vHistory } from "./agent/validators";

// ---------------------------------------------------------------------------
// Reusable validators
// ---------------------------------------------------------------------------

export const vVec3 = v.array(v.number());
export const vMat4RowMajor = v.array(v.number());

/** which anatomical plane the shared slice cursor is currently sliced along */
export const vPlane = v.union(
  v.literal("axial"), // perpendicular to RAS +z (inferior -> superior)
  v.literal("coronal"), // perpendicular to RAS +y (posterior -> anterior)
  v.literal("sagittal"), // perpendicular to RAS +x (left -> right)
);

// job lifecycle
export const vScanStatus = v.union(
  v.literal("uploaded"),
  v.literal("processing"),
  v.literal("completed"),
  v.literal("failed"),
);

// where the segmentation came from 
export const vSegmentationSource = v.union(
  v.literal("model"), // SegResNet output
  v.literal("expert"), // dataset expert label (the hour-8 fallback, D4)
  v.literal("none"), // not segmented (yet)
);

/** Point anchors are RAS millimetres; structure anchors store resolved ids. */
export const vAnnotationAnchor = v.union(
  v.object({ kind: v.literal("point"), ras_mm: vVec3 }),
  v.object({ kind: v.literal("structure"), id: v.string() }),
  v.object({ kind: v.literal("tumor") }),
);

/** Same compact step fields as the agentRuns plan; args are tool-specific data. */
export const vToolStep = v.object({
  id: v.string(),
  tool: v.string(),
  args: v.any(),
  ok: v.boolean(),
  message: v.string(),
  ms: v.number(),
});

export default defineSchema({

  scans: defineTable({
    jobId: v.string(),

    // e.g. "sample case 001"
    displayName: v.string(),

    status: vScanStatus,
    segmentationSource: vSegmentationSource,
    isFixture: v.boolean(),

    // sequence names, in the order they were supplied: ["t1c","t1","t2","flair"]
    modalityNames: v.array(v.string()),

    // Voxel grid size. BACKEND_CONTRACT.md §2.2 calls this `input.shape`.
    dimensions: v.object({ i: v.number(), j: v.number(), k: v.number() }),

    // `input.spacingMm` — millimetres per voxel along i, j, k. Length 3.
    voxelSpacingMm: vVec3,

    coordinateSystem: v.literal("RAS"),

    affineRowMajor: vMat4RowMajor,

    volumeExtentMm: v.object({ min: vVec3, max: vVec3 }),

    brain: v.optional(
      v.object({
        centroidMm: vVec3,
        bboxMinMm: vVec3,
        bboxMaxMm: vVec3,
      }),
    ),

    /**
     * Tumor findings from `report`. `detected: false` means the model ran and
     * found nothing ("No tumor detected", never "healthy" — BACKEND_CONTRACT §5).
     * The whole object is absent when no segmentation has been produced at all,
     * which is a different statement from "detected: false".
     */
    tumor: v.optional(
      v.object({
        detected: v.boolean(),
        centroidMm: v.optional(vVec3),
        volumesCm3: v.optional(
          v.object({
            whole: v.number(),
            core: v.number(),
            enhancing: v.number(),
          }),
        ),
      }),
    ),

    /**
     * Paths (NOT absolute URLs) to the heavy assets, relative to the imaging
     * service root, e.g. "/jobs/sample/model.glb".
     *
     * The frontend prefixes `VITE_API_URL` itself (SPEC §6: "The client calls
     * VITE_API_URL directly"). Storing relative paths keeps the dev/demo/laptop
     * base URL out of the database, so the same Convex deployment works against
     * localhost and against a tunnelled backend.
     */
    assets: v.object({
      modelGlbPath: v.optional(v.string()),
      segNiftiPath: v.optional(v.string()),
      flairNiftiPath: v.optional(v.string()),
      reportPath: v.optional(v.string()),
    }),

    createdAt: v.number(),
    /** Safe, user-facing message when `status === "failed"`. Never a stack trace or secret. */
    errorMessage: v.optional(v.string()),
  })
    // Look a case up by the id the imaging service and the URL both use.
    // Uniqueness is enforced in code (`scans.register`), not by the index:
    // Convex indexes are not UNIQUE constraints.
    .index("by_jobId", ["jobId"]),

  // -------------------------------------------------------------------------
  // sessions — one row per NeuroVision Live Review room.
  //
  // This row holds the SHARED view state: the small set of semantic values that
  // every participant must agree on. It does NOT hold the camera pose, hand
  // landmarks, or pinch progress — those are local to each browser and would be
  // thousands of writes per minute (guardrail 7).
  // -------------------------------------------------------------------------
  sessions: defineTable({
    /** The case everyone in this room is looking at. */
    scanId: v.id("scans"),

    /**
     * The participant row of the presenter.
     *
     * Optional purely for a chicken-and-egg reason: `sessions.create` inserts
     * the session, then inserts the host participant (which needs `sessionId`),
     * then patches this field. All three happen inside ONE transaction, so no
     * reader ever observes the intermediate state. Think of it as a deferred
     * foreign key inside a single `@Transactional` method.
     */
    hostParticipantId: v.optional(v.id("sessionParticipants")),

    /**
     * Unguessable capability token that grants the right to JOIN this session.
     *
     * Security notes (BACKEND_CONTEXT §6, guardrail 5):
     *  - The session `_id` alone is NOT authorization. You need this code.
     *  - It is never returned by any query. Only `sessions.create` (to the host)
     *    and `sessions.join` (which consumes it) ever see it.
     *  - Stored in plaintext. That is acceptable for a hackathon demo over
     *    de-identified public research data; a production build should store a
     *    hash and compare digests. Called out in docs/CONVEX_BACKEND.md.
     */
    inviteCode: v.string(),

    // --- shared view state (the thing Phase 1 exists to prove) ---

    /** Which plane the 2D panel is slicing along, and which axis `stepSlice` moves. */
    plane: vPlane,

    /**
     * THE single shared position, in RAS+ millimetres. Length 3.
     *
     * SPEC §5.2 is explicit: "The physical cursor is stored in RAS mm and is the
     * single shared position. Slice indices are derived from the cursor, never
     * stored." So we store millimetres and DERIVE the integer slice index for
     * each plane on read (`sessions.get` returns both).
     *
     * This is a deliberate adaptation of BACKEND_CONTEXT §5, which proposed
     * `sliceIndex: number`. Storing both would be two sources of truth for one
     * value — the classic way to get a 2 mm misalignment nobody can explain.
     * The API still speaks `sliceIndex` (see `setSlice`/`stepSlice` commands);
     * only the storage is millimetre-based.
     */
    cursorRasMm: vVec3,

    /**
     * Whether the tumor meshes/overlay are revealed to everyone.
     * SPEC §7.2 calls the frontend's equivalent flag `tumorRevealed`.
     */
    tumorVisible: v.boolean(),
    /** W2 Phase B: the /3d page state guests mirror. Optional so rows created before it read as DEFAULT_SCENE. */
    scene: v.optional(vScene),

    /**
     * Monotonically increasing counter, bumped on every accepted view write.
     *
     * Two uses: (a) the frontend can drop a stale optimistic update, and
     * (b) a test can assert "exactly one write happened". It is NOT used for
     * locking — Convex mutations are serializable transactions, so there is no
     * lost-update race to defend against here.
     */
    viewVersion: v.number(),

    status: v.union(v.literal("active"), v.literal("ended")),
    createdAt: v.number(),
    /** Last time the shared view changed. Used for "stale room" cleanup later. */
    updatedAt: v.number(),
  })
    // Join flow: resolve an invite code to a session in one indexed lookup.
    .index("by_inviteCode", ["inviteCode"])
    // "Which rooms are reviewing this case?" — used by the dashboard later.
    .index("by_scan", ["scanId"]),

  // -------------------------------------------------------------------------
  // sessionParticipants — DURABLE MEMBERSHIP, not online status.
  //
  // BACKEND_CONTEXT §5 is emphatic about this: "Never conflate historical
  // membership with active presence." A row here means "this person is a member
  // of this room and holds these permissions", and it survives a page refresh,
  // a closed laptop, and the whole demo. Whether they are online RIGHT NOW is
  // Phase 3 (presence), and `lastSeenAt` below is only the seed of that.
  // -------------------------------------------------------------------------
  sessionParticipants: defineTable({
    sessionId: v.id("sessions"),

    /**
     * Per-participant bearer secret, returned once at create/join time and sent
     * back by the client on every call. This IS the identity for Phase 1.
     *
     * Why not a real auth provider? None is chosen yet (BACKEND_CONTEXT §3:
     * "Not yet locked"). A bearer capability is the documented fast path for a
     * de-identified demo (§6, "Security"). The swap to Clerk/Convex Auth later
     * only replaces `convex/lib/auth.ts` — every function already goes through
     * `requireParticipant`, so no call site changes shape.
     *
     * Never returned by any query.
     */
    token: v.string(),

    /**
     * Display name as typed by the user.
     *
     * UNTRUSTED. BACKEND_CONTEXT §5: "Do not use a client-supplied display name
     * as trusted identity." It is a label for the participant list, never a
     * permission check input — authorization reads `role` and `token` only.
     */
    displayName: v.string(),

    /**
     * "host" = the presenter, the only role allowed to change the shared view in
     * Phase 1. "viewer" = can read, and (Phase 2) chat and annotate.
     */
    role: v.union(v.literal("host"), v.literal("viewer")),

    /**
     * Per-participant follow preference.
     *
     * BACKEND_CONTEXT §5 said "choose explicitly" between a session-wide flag
     * and a per-participant one. CHOSEN: per-participant. The shared view on the
     * session row is always authoritative and always written; this flag only
     * tells each client whether to APPLY it or hold its own local view. That
     * keeps the server simple (one shared value, no per-viewer state machine)
     * and lets one judge wander off-plane without desyncing the room.
     */
    following: v.boolean(),

    joinedAt: v.number(),

    /**
     * Heartbeat timestamp — presence FALLBACK only, and unused in Phase 1.
     * Phase 3 either adopts the official Convex Presence component or expires
     * rows whose `lastSeenAt` is older than a grace period.
     */
    lastSeenAt: v.number(),
  })
    // Identity lookup on every single authorized call, so it must be indexed.
    .index("by_token", ["token"])
    // Participant list for a room.
    .index("by_session", ["sessionId"]),

  // Shared human/agent records. Writers stamp attribution on the server.
  // Text lengths, anchor bounds and D10 transitions belong to shared mutations.
  annotations: defineTable({
    ...vAuthor.fields,
    jobId: v.string(),
    sessionId: v.optional(v.id("sessions")),
    text: v.string(), // Shared mutation enforces <= 280 characters.
    anchor: vAnnotationAnchor,
    // Server-resolved writer for human rows, so "only the author or host may
    // remove" can be enforced; authorName is a label, not identity. Absent on
    // agent rows and on rows with no session.
    authorParticipantId: v.optional(v.id("sessionParticipants")),
    status: v.union(v.literal("accepted"), v.literal("suggested"), v.literal("dismissed")),
  })
    .index("by_job", ["jobId"])
    .index("by_session", ["sessionId"]),

  messages: defineTable({
    ...vAuthor.fields,
    jobId: v.string(),
    sessionId: v.optional(v.id("sessions")),
    clientId: v.optional(v.string()),
    role: v.union(v.literal("user"), v.literal("assistant")),
    text: v.string(), // Shared mutation enforces <= 2000 characters.
    runId: v.optional(v.id("agentRuns")), // agentRuns arrives with P3 (#67).
    toolSteps: v.optional(v.array(vToolStep)),
  })
    .index("by_job_time", ["jobId", "createdAt"])
    .index("by_session_time", ["sessionId", "createdAt"])
    .index("by_client_time", ["clientId", "createdAt"])
    .searchIndex("search_text", {
      searchField: "text",
      filterFields: ["jobId", "sessionId", "clientId"],
    }),

  sessionSummaries: defineTable({
    ...vAuthor.fields,
    jobId: v.string(),
    sessionId: v.optional(v.id("sessions")),
    clientId: v.optional(v.string()),
    text: v.string(),
    coversUpTo: v.number(),
    version: v.number(),
    final: v.optional(v.boolean()), // #60: the end-of-meeting summary, set once by notes.finalizeSession
  })
    .index("by_session", ["sessionId"])
    .index("by_client", ["clientId"]),

  exports: defineTable({
    ...vAuthor.fields,
    jobId: v.string(),
    sessionId: v.optional(v.id("sessions")),
    format: v.union(v.literal("md"), v.literal("pdf")),
    trigger: v.union(v.literal("manual"), v.literal("auto")),
    reason: v.optional(v.union(v.literal("job_done"), v.literal("left_explore"), v.literal("checkpoint"))),
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
    fileId: v.optional(v.id("_storage")),
    error: v.optional(v.string()),
    version: v.number(),
    sections: v.array(v.string()),
  })
    .index("by_job", ["jobId"])
    .index("by_session", ["sessionId"]),
  // Personal Desktop credentials: raw tokens are returned once by the issue action.
  mcpTokens: defineTable({
    tokenHash: v.string(),
    label: v.string(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    lastUsedAt: v.number(), // 0 until first successful authentication.
  }).index("by_hash", ["tokenHash"]),

  // MCP fixed-window counters. Only SHA-256 token hashes are stored.
  mcpRateLimits: defineTable({
    tokenHash: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_token_hash", ["tokenHash"]),

  agentRuns: defineTable({
    clientId: v.string(),
    sessionId: v.optional(v.id("sessions")),
    jobId: v.optional(v.string()),
    text: v.string(),
    source: v.union(v.literal("chat"), v.literal("voice"), v.literal("text")),
    page: v.union(v.literal("learn"), v.literal("mri"), v.literal("3d")),
    status: v.union(v.literal("queued"), v.literal("running"), v.literal("done"), v.literal("failed"), v.literal("cancelled")),
    steps: v.array(vAgentStep),
    reply: v.string(),
    agent: v.string(),
    error: v.union(v.string(), v.null()),
    createdAt: v.number(),
    // Internal request context and conservative daily reservation marker.
    spendDay: v.optional(v.string()),
    availableTools: v.array(v.string()),
    snapshot: v.optional(v.any()),
    history: v.optional(vHistory),
    // True only when ask() received a participantToken matching a member of sessionId.
    sessionVerified: v.optional(v.boolean()),
    sessionParticipantId: v.optional(v.id("sessionParticipants")),
  })
    .index("by_client", ["clientId"])
    .index("by_session", ["sessionId"]),

  // Scribe note-taker debounce (#60): one row per note scope.
  scribeNotesState: defineTable({
    scopeKey: v.string(), // "client:<clientId>:<jobId>" or "session:<sessionId>:<jobId>"
    lastRunAt: v.number(), // when the latest update was (or will be) allowed to run
    pending: v.boolean(), // an update is already scheduled
  }).index("by_scope", ["scopeKey"]),

  // Conservative daily reservations, shared across clients; no key means no spend.
  agentDailyUsage: defineTable({
    day: v.string(),
    count: v.number(),
  }).index("by_day", ["day"]),

});
