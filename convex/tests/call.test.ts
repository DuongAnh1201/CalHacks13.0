/**
 * Live call: Convex only authorizes and mints the LiveKit join token.
 * Runs in edge-runtime, which is also the proof that livekit-server-sdk
 * works in the default Convex runtime (no "use node").
 */

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import schema from "../schema";

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

async function setUp() {
  const t = convexTest({ schema });
  const scanId = await t.mutation(internal.seed.seedSampleScan, {});
  const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Presenter" });
  const viewer = await t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: host.inviteCode, displayName: "Judge" });
  return { t, scanId, host, viewer };
}

const auth = (w: { sessionId: string; participantToken: string }) =>
  ({ sessionId: w.sessionId, participantToken: w.participantToken }) as { sessionId: never; participantToken: string };

/** Payload of a JWT (base64url middle segment). */
function claims(jwt: string): Record<string, any> {
  const b = jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(b + "=".repeat((4 - (b.length % 4)) % 4)));
}

function configure() {
  vi.stubEnv("LIVEKIT_API_KEY", "test-key");
  vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-test-secret-test-secret-00");
  vi.stubEnv("LIVEKIT_URL", "wss://test.livekit.invalid");
}

afterEach(() => vi.unstubAllEnvs());

describe("call.member", () => {
  it("returns the caller's participant id and display name", async () => {
    const { t, viewer } = await setUp();
    expect(await t.query(internal.call.member, auth(viewer))).toEqual({ participantId: viewer.participantId, displayName: "Judge" });
  });

  it("refuses an unknown token", async () => {
    const { t, viewer } = await setUp();
    await expectAppError(t.query(internal.call.member, { ...auth(viewer), participantToken: "nope" }), "NOT_AUTHENTICATED");
  });

  it("refuses a member of another session", async () => {
    const { t, scanId, viewer } = await setUp();
    const other = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Other" });
    await expectAppError(t.query(internal.call.member, { ...auth(viewer), sessionId: other.sessionId as never }), "NOT_A_MEMBER");
  });

  it("refuses an ended session", async () => {
    const { t, host, viewer } = await setUp();
    await t.mutation(api.sessions.end, auth(host));
    await expectAppError(t.query(internal.call.member, auth(viewer)), "SESSION_ENDED");
  });
});

describe("call.token", () => {
  it("is UNAVAILABLE when LiveKit is not configured", async () => {
    vi.stubEnv("LIVEKIT_API_KEY", "");
    vi.stubEnv("LIVEKIT_API_SECRET", "");
    vi.stubEnv("LIVEKIT_URL", "");
    const { t, viewer } = await setUp();
    await expectAppError(t.action(api.call.token, auth(viewer)), "UNAVAILABLE");
  });

  it("refuses a non-member even when configured", async () => {
    configure();
    const { t, viewer } = await setUp();
    await expectAppError(t.action(api.call.token, { ...auth(viewer), participantToken: "nope" }), "NOT_AUTHENTICATED");
  });

  it("mints a mic-only, 15-minute join token for this session's room", async () => {
    configure();
    const { t, viewer } = await setUp();
    const r = await t.action(api.call.token, auth(viewer));
    expect(r.url).toBe("wss://test.livekit.invalid");
    const c = claims(r.token);
    expect(c.iss).toBe("test-key");
    expect(c.sub).toBe(viewer.participantId);
    expect(c.name).toBe("Judge");
    expect(c.video).toMatchObject({
      roomJoin: true,
      room: viewer.sessionId,
      canPublish: true,
      canPublishSources: ["microphone"],
      canSubscribe: true,
      canPublishData: false,
    });
    expect(c.video.roomAdmin).toBeUndefined();
    expect(c.exp - c.nbf).toBe(900);
    expect(JSON.stringify(r)).not.toContain("test-secret");
  });
});
