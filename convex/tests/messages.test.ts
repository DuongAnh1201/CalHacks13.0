/**
 * Phase 2 chat: two participants, one session, one shared chat history.
 *
 * Same shape as sessions.test.ts: one participant writes, the OTHER participant
 * reads back with their own token. In a browser that read is the automatic
 * re-run of `usePaginatedQuery`; here it is an explicit call. Re-querying is
 * also what a page refresh does, so these tests double as the "chat persists
 * through refresh" check at the data level.
 */

import type { PaginationResult } from "convex/server";
import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { authorFor } from "../lib/author";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import { MAX_MESSAGE_LENGTH, type PublicMessage } from "../messages";
import schema from "../schema";

// ---------------------------------------------------------------------------
// Helpers (same as sessions.test.ts)
// ---------------------------------------------------------------------------

async function expectAppError(promise: Promise<unknown>, code: AppErrorCode): Promise<AppErrorData> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError);
    const data = (error as ConvexError<AppErrorData>).data;
    expect(data.code).toBe(code);
    return data;
  }
  throw new Error(`expected a ConvexError with code ${code}, but the call succeeded`);
}

/** Seeded scan, a host who created a room, and a viewer who joined it. */
async function setUpRoom() {
  const t = convexTest({ schema });
  const scanId: Id<"scans"> = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, {
    inviteCode: host.inviteCode,
    displayName: "Judge",
  });
  return { t, scanId, host, viewer };
}

const firstPage = { numItems: 50, cursor: null };

// ---------------------------------------------------------------------------
// Two clients, one chat
// ---------------------------------------------------------------------------

describe("messages: two participants share one chat", () => {
  it("both participants read the same history, newest first", async () => {
    const { t, host, viewer } = await setUpRoom();

    await t.mutation(api.messages.send, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      text: "Look at the left temporal lobe",
    });
    await t.mutation(api.messages.send, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
      text: "I see it",
    });

    const asHost = await t.query(api.messages.list, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      paginationOpts: firstPage,
    });
    const asViewer = await t.query(api.messages.list, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
      paginationOpts: firstPage,
    });

    expect(asViewer.page).toEqual(asHost.page);
    expect(asHost.page.map((m) => [m.authorName, m.text])).toEqual([
      ["Judge", "I see it"],
      ["Presenter", "Look at the left temporal lobe"],
    ]);
    expect(asHost.isDone).toBe(true);
  });

  it("stamps author, job and session on the server, not from the request", async () => {
    const { t, host, viewer } = await setUpRoom();

    const { messageId } = await t.mutation(api.messages.send, {
      sessionId: viewer.sessionId,
      participantToken: viewer.participantToken,
      text: "  hello  ",
    });

    const row = await t.run((ctx) => ctx.db.get(messageId));
    expect(row).toMatchObject({
      author: "human",
      authorName: "Judge",
      source: "ui",
      role: "user",
      jobId: "sample",
      sessionId: host.sessionId,
      // Trimmed before storage.
      text: "hello",
    });
    expect(typeof row!.createdAt).toBe("number");
  });

  it("returns a projection without agent-internal fields", async () => {
    const { t, host } = await setUpRoom();

    // The agent side (#56/Tom) writes into the same table; its rows carry
    // toolSteps and clientId that must not leak through the human chat DTO.
    await t.run((ctx) =>
      ctx.db.insert("messages", {
        ...authorFor({ kind: "agent", name: "Navigator", source: "agent" }),
        jobId: "sample",
        sessionId: host.sessionId,
        clientId: "client-internal",
        role: "assistant",
        text: "Switched to axial.",
        toolSteps: [{ id: "s1", tool: "setPlane", args: { plane: "axial" }, ok: true, message: "ok", ms: 3 }],
      }),
    );

    const { page } = await t.query(api.messages.list, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      paginationOpts: firstPage,
    });

    expect(page).toHaveLength(1);
    expect(Object.keys(page[0]).sort()).toEqual(
      ["author", "authorName", "createdAt", "messageId", "role", "text"].sort(),
    );
    expect(page[0]).toMatchObject({ role: "assistant", author: "agent", authorName: "Navigator" });
  });

  it("pages walk back through history without gaps or repeats", async () => {
    const { t, host } = await setUpRoom();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken };

    for (let n = 1; n <= 5; n++) {
      await t.mutation(api.messages.send, { ...auth, text: `message ${n}` });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let isDone = false;
    while (!isDone) {
      const result: PaginationResult<PublicMessage> = await t.query(api.messages.list, {
        ...auth,
        paginationOpts: { numItems: 2, cursor },
      });
      seen.push(...result.page.map((m) => m.text));
      cursor = result.continueCursor;
      isDone = result.isDone;
    }

    expect(seen).toEqual(["message 5", "message 4", "message 3", "message 2", "message 1"]);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe("messages: validation", () => {
  it("rejects empty and whitespace-only messages", async () => {
    const { t, host } = await setUpRoom();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken };

    await expectAppError(t.mutation(api.messages.send, { ...auth, text: "" }), "INVALID_ARGUMENT");
    await expectAppError(t.mutation(api.messages.send, { ...auth, text: "   \n " }), "INVALID_ARGUMENT");
  });

  it(`accepts exactly ${MAX_MESSAGE_LENGTH} characters and rejects one more`, async () => {
    const { t, host } = await setUpRoom();
    const auth = { sessionId: host.sessionId, participantToken: host.participantToken };

    await t.mutation(api.messages.send, { ...auth, text: "a".repeat(MAX_MESSAGE_LENGTH) });
    await expectAppError(
      t.mutation(api.messages.send, { ...auth, text: "a".repeat(MAX_MESSAGE_LENGTH + 1) }),
      "INVALID_ARGUMENT",
    );
  });
});

// ---------------------------------------------------------------------------
// Authorization and session scoping
// ---------------------------------------------------------------------------

describe("messages: authorization", () => {
  it("rejects an unknown token on send and list", async () => {
    const { t, host } = await setUpRoom();
    const bad = { sessionId: host.sessionId, participantToken: "not-a-real-token" };

    await expectAppError(t.mutation(api.messages.send, { ...bad, text: "hi" }), "NOT_AUTHENTICATED");
    await expectAppError(
      t.query(api.messages.list, { ...bad, paginationOpts: firstPage }),
      "NOT_AUTHENTICATED",
    );
  });

  it("keeps two rooms' chats apart, even on the same scan", async () => {
    const { t, scanId, host } = await setUpRoom();
    const otherHost = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Other room" });

    await t.mutation(api.messages.send, {
      sessionId: otherHost.sessionId,
      participantToken: otherHost.participantToken,
      text: "private to the other room",
    });

    // A member of room B cannot read or post in room A by swapping the id.
    const crossed = { sessionId: host.sessionId, participantToken: otherHost.participantToken };
    await expectAppError(
      t.query(api.messages.list, { ...crossed, paginationOpts: firstPage }),
      "NOT_A_MEMBER",
    );
    await expectAppError(t.mutation(api.messages.send, { ...crossed, text: "hi" }), "NOT_A_MEMBER");

    // And room A's own history does not contain room B's message.
    const { page } = await t.query(api.messages.list, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
      paginationOpts: firstPage,
    });
    expect(page).toEqual([]);
  });

  it("rejects posting after the host ends the session", async () => {
    const { t, host, viewer } = await setUpRoom();
    await t.mutation(api.sessions.end, {
      sessionId: host.sessionId,
      participantToken: host.participantToken,
    });

    await expectAppError(
      t.mutation(api.messages.send, {
        sessionId: viewer.sessionId,
        participantToken: viewer.participantToken,
        text: "too late",
      }),
      "SESSION_ENDED",
    );
  });
});
