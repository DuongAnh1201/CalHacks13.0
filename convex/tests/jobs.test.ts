/**
 * jobs.registerScan: any finished upload can become a shareable scan.
 *
 * `fetch` is stubbed with the imaging service's real report shape (taken from
 * GET /jobs/sample-2/report), so these run without the RunPod backend.
 */

import { ConvexError } from "convex/values";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../_generated/api";
import type { AppErrorCode, AppErrorData } from "../lib/errors";
import schema from "../schema";

// The Convex tsconfig has no Node types; lib/env.ts reads the same object.
declare const process: { env: Record<string, string | undefined> };

const API = "https://imaging.example";

const REPORT = {
  jobId: "abc123",
  segmentationSource: "model",
  tumorDetected: true,
  centroidMm: [100.2, 69.7, 98.6],
  volumesCm3: { whole: 67.73, core: 9.65, enhancing: 7.55 },
  brain: { centroidMm: [120, 103.8, 74.5], bboxMm: { min: [50, 21, 0], max: [191, 195, 144] } },
  input: { shape: [240, 240, 155], spacingMm: [1, 1, 1], sequences: ["t1c", "t1", "t2", "flair"] },
};

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

function serve(status: number, body: unknown = REPORT) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  process.env.NEUROVISION_API_URL = `${API}/`;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEUROVISION_API_URL;
});

describe("jobs.registerScan", () => {
  it("registers an uploaded job from the service's report, and a session can start on it", async () => {
    const t = convexTest({ schema });
    const fetchMock = serve(200);

    const { scanId } = await t.action(api.jobs.registerScan, { jobId: "abc123" });

    expect(fetchMock).toHaveBeenCalledWith(`${API}/jobs/abc123/report`, expect.anything());
    const scan = (await t.query(api.scans.getByJobId, { jobId: "abc123" }))!;
    expect(scan.scanId).toBe(scanId);
    expect(scan).toMatchObject({
      isFixture: false,
      dimensions: { i: 240, j: 240, k: 155 },
      sliceCounts: { axial: 155, coronal: 240, sagittal: 240 },
      modalityNames: ["t1c", "t1", "t2", "flair"],
      tumor: { detected: true, volumesCm3: { whole: 67.73, core: 9.65, enhancing: 7.55 } },
      assets: { modelGlbPath: "/jobs/abc123/model.glb" },
    });

    // The point of registering: a host can now share this upload, and a guest
    // learns which case to open from join.
    const host = await t.mutation(api.sessions.create, { scanId, hostDisplayName: "Host" });
    const guest = await t.mutation(api.sessions.join, { email: "guest@example.com", inviteCode: host.inviteCode, displayName: "Judge" });
    expect(guest.jobId).toBe("abc123");
  });

  it("is idempotent: sharing the same job twice keeps one scan", async () => {
    const t = convexTest({ schema });
    serve(200);
    const first = await t.action(api.jobs.registerScan, { jobId: "abc123" });
    const second = await t.action(api.jobs.registerScan, { jobId: "abc123" });
    expect(second.scanId).toBe(first.scanId);
  });

  it("records 'no tumor detected' honestly", async () => {
    const t = convexTest({ schema });
    serve(200, { ...REPORT, tumorDetected: false, centroidMm: undefined, volumesCm3: undefined });
    await t.action(api.jobs.registerScan, { jobId: "abc123" });
    const scan = (await t.query(api.scans.getByJobId, { jobId: "abc123" }))!;
    expect(scan.tumor).toEqual({ detected: false });
  });

  it("maps the service's 404 and 409 to clear errors", async () => {
    const t = convexTest({ schema });
    serve(404, { detail: "unknown" });
    await expectAppError(t.action(api.jobs.registerScan, { jobId: "nope" }), "NOT_FOUND");
    serve(409, { detail: "processing" });
    const busy = await expectAppError(t.action(api.jobs.registerScan, { jobId: "abc123" }), "INVALID_ARGUMENT");
    expect(busy.message).toMatch(/still processing/);
  });

  it("rejects a malformed job id before any request is made", async () => {
    const t = convexTest({ schema });
    const fetchMock = serve(200);
    for (const jobId of ["", "../secrets", "a/b", "x".repeat(65)]) {
      await expectAppError(t.action(api.jobs.registerScan, { jobId }), "INVALID_ARGUMENT");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a report with unusable geometry", async () => {
    const t = convexTest({ schema });
    serve(200, { ...REPORT, input: { ...REPORT.input, shape: [240, 0, 155] } });
    await expectAppError(t.action(api.jobs.registerScan, { jobId: "abc123" }), "UNAVAILABLE");
    serve(200, { ...REPORT, input: { ...REPORT.input, spacingMm: [1, "x", 1] } });
    await expectAppError(t.action(api.jobs.registerScan, { jobId: "abc123" }), "UNAVAILABLE");
    expect(await t.query(api.scans.getByJobId, { jobId: "abc123" })).toBeNull();
  });

  it("says so when the deployment is not configured or the service is down", async () => {
    const t = convexTest({ schema });
    delete process.env.NEUROVISION_API_URL;
    await expectAppError(t.action(api.jobs.registerScan, { jobId: "abc123" }), "UNAVAILABLE");

    process.env.NEUROVISION_API_URL = API;
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    await expectAppError(t.action(api.jobs.registerScan, { jobId: "abc123" }), "UNAVAILABLE");
  });
});
