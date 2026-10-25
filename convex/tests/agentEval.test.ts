import { describe, expect, it } from "vitest";
import sample from "../../backend/seed/sample/report.json";
import { CASES, NOT_ON_PAGE, PAGE_TOOLS, WEB_SEARCH, type EvalCase, type EvalPage } from "../agent/eval/cases";
import { argsMatch, assertPassing, formatReport, score, type RunResult, type Runner } from "../agent/eval/score";
import { MEDICAL_REFUSAL, classifyHint } from "../agent/guard";

const viewerCases = (page: EvalPage) => CASES.filter((c) => c.page === page && c.expect.kind === undefined);
const kindCases = (k: number) => CASES.filter((c) => c.expect.kind === k);
const key = (text: string, page: EvalPage, jobId?: string) => `${page}|${jobId ?? ""}|${text}`;

// Example text for each RegExp the cases use, so the perfect runner can satisfy them.
const REGEX_EXAMPLES = new Map<string, string>([
  [NOT_ON_PAGE.source, "Rotating isn't available on this page; open the 3D view."],
  ["left or right", "Left or right?"],
  ["right", "It is on the right side."],
  ["SegResNet", "SegResNet"],
  ["can't measure|cannot measure|not able to measure", "I can't measure that distance on this scan."],
]);

/** Answers each case exactly as it expects. */
function perfectReply(c: EvalCase): RunResult {
  const reply = (c.expect.replyMustInclude ?? []).map((p) => {
    if (typeof p === "string") return p;
    const example = REGEX_EXAMPLES.get(p.source);
    if (!example) throw new Error(`no example for ${p}`);
    return example;
  }).join(" ");
  return { kind: c.expect.kind, steps: (c.expect.tools ?? []).map((t) => ({ tool: t.name, args: t.args ?? {} })), reply };
}

function runnerFrom(answer: (c: EvalCase) => RunResult): Runner {
  const byKey = new Map(CASES.map((c) => [key(c.text, c.page, c.jobId), c]));
  return (text, page, { jobId }) => {
    const c = byKey.get(key(text, page, jobId));
    if (!c) throw new Error(`unknown case ${text}`);
    return answer(c);
  };
}

describe("eval cases", () => {
  it("ids and (page, job, text) are unique", () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
    expect(new Set(CASES.map((c) => key(c.text, c.page, c.jobId))).size).toBe(CASES.length);
  });

  it("has no /learn cases; ~40 viewer phrases + 2 ask-backs on /3d, ~30 + 8 refusals on /mri", () => {
    expect(CASES.some((c) => (c.page as string) === "/learn" || c.id.startsWith("learn-"))).toBe(false);
    expect(Object.keys(PAGE_TOOLS).sort()).toEqual(["/3d", "/mri"]);
    expect(viewerCases("/3d").filter((c) => !c.id.includes("ask")).length).toBe(40);
    expect(viewerCases("/3d").filter((c) => c.id.includes("ask")).length).toBe(2);
    expect(viewerCases("/mri").filter((c) => !c.id.includes("offpage")).length).toBe(30);
    expect(viewerCases("/mri").filter((c) => c.id.includes("offpage")).length).toBe(8);
  });

  it("has at least 10 questions per kind", () => {
    for (const k of [1, 2, 3, 4, 5]) expect(kindCases(k).length).toBeGreaterThanOrEqual(10);
  });

  it("only expects tools the page has (PAGE_TOOLS)", () => {
    for (const c of CASES) for (const t of c.expect.tools ?? []) expect(PAGE_TOOLS[c.page], `${c.id} ${t.name}`).toContain(t.name);
  });

  it("the /mri refusals are 3D-only commands", () => {
    for (const tool of ["rotate_view", "spin_view", "set_explode", "set_mode", "isolate", "set_opacity"]) {
      expect(PAGE_TOOLS["/mri"]).not.toContain(tool);
      expect(PAGE_TOOLS["/3d"]).toContain(tool);
    }
  });

  it("kind 3 expects the Guard's fixed refusal with no tools, and the pre-check never calls it off-topic", () => {
    for (const c of kindCases(3)) {
      expect(c.expect.replyMustInclude).toEqual([MEDICAL_REFUSAL]);
      expect(c.expect.tools).toEqual([]);
      // classifyHint is only a cheap pre-check; the Router catches the rest (null is fine).
      expect(classifyHint(c.text), c.text).not.toBe("offtopic");
    }
  });

  it("scan questions never allow web search; general education does", () => {
    for (const c of [...kindCases(1), ...kindCases(3), ...kindCases(5)]) expect(c.expect.noWebSearch, c.id).toBe(true);
    for (const c of kindCases(2)) expect(c.expect.noWebSearch).toBeFalsy();
  });

  it("the sample numbers match backend/seed/sample/report.json", () => {
    const wanted = CASES.filter((c) => c.jobId === "sample").flatMap((c) => c.expect.replyMustInclude ?? []).filter((p) => typeof p === "string" && /^\d+\.\d+$/.test(p));
    const actual = Object.values(sample.volumesCm3).map(String);
    expect(new Set(wanted)).toEqual(new Set(actual));
  });
});

describe("argsMatch", () => {
  it("is a partial, case-insensitive, subset match", () => {
    expect(argsMatch({ preset: "right" }, { preset: "Right", extra: 1 })).toBe(true);
    expect(argsMatch({ targets: ["cortex"] }, { targets: ["left", "cortex"], visible: false })).toBe(true);
    expect(argsMatch({ targets: ["cortex", "left"] }, { targets: ["cortex"] })).toBe(false);
    expect(argsMatch({ percent: 50 }, { percent: "50" })).toBe(false);
    expect(argsMatch({ on: false }, {})).toBe(false);
    expect(argsMatch({ a: { b: 1 } }, { a: { b: 1, c: 2 } })).toBe(true);
    expect(argsMatch({ a: 1 }, null)).toBe(false);
  });
});

describe("score", () => {
  it("a perfect runner passes every page and kind at 100%", async () => {
    const report = await score(CASES, runnerFrom(perfectReply));
    expect(report.results.filter((r) => !r.pass)).toEqual([]);
    expect(report.ok).toBe(true);
    expect(Object.keys(report.byPage).sort()).toEqual(["/3d", "/mri"]);
    expect(Object.keys(report.byKind).sort()).toEqual(["1", "2", "3", "4", "5"]);
    for (const r of [...Object.values(report.byPage), ...Object.values(report.byKind)]) expect(r.rate).toBe(1);
    expect(() => assertPassing(report)).not.toThrow();
  });

  it("a broken runner (no tools, banned wording) fails everything", async () => {
    const report = await score(CASES, () => ({ steps: [], reply: "The rest of the brain looks healthy." }));
    expect(report.ok).toBe(false);
    expect(report.results.every((r) => !r.pass)).toBe(true);
    expect(report.results.every((r) => r.failures.some((f) => f.startsWith("Guard")))).toBe(true);
    expect(() => assertPassing(report)).toThrow(/Agent eval failed/);
  });

  it("fails a page under 90% and passes one at or above", async () => {
    const learn = viewerCases("/3d").filter((c) => !c.id.includes("ask")).slice(0, 40);
    const breakFirst = (n: number): Runner => {
      const broken = new Set(learn.slice(0, n).map((c) => c.id));
      return runnerFrom((c) => (broken.has(c.id) ? { steps: [{ tool: "reset_view" }], reply: "" } : perfectReply(c)));
    };
    const four = await score(learn, breakFirst(4));             // 36/40 = 90%
    expect(four.byPage["/3d"]).toMatchObject({ passed: 36, total: 40, ok: true });
    const five = await score(learn, breakFirst(5));             // 35/40 = 87.5%
    expect(five.byPage["/3d"]).toMatchObject({ passed: 35, ok: false });
    expect(five.ok).toBe(false);
  });

  it("kinds 3 and 5 need 100%: one miss fails the run", async () => {
    const [miss, ...rest] = kindCases(3);
    const report = await score([miss, ...rest], runnerFrom((c) => (c.id === miss.id ? { kind: 3, steps: [], reply: "Ask a doctor." } : perfectReply(c))));
    expect(report.byKind[3]).toMatchObject({ passed: rest.length, ok: false });
    expect(report.ok).toBe(false);
  });

  it("flags wrong args, wrong order, extra calls, wrong kind and web search on a scan question", async () => {
    const pick = (id: string) => CASES.find((c) => c.id === id)!;
    const cases = [pick("3d-08"), pick("3d-39"), pick("3d-37"), pick("kind1-01"), pick("kind5-01")];
    const answers: Record<string, RunResult> = {
      "3d-08": { steps: [{ tool: "rotate_view", args: { preset: "left" } }], reply: "" },
      "3d-39": { steps: [{ tool: "set_opacity", args: { target: "cortex" } }, { tool: "rotate_view", args: { preset: "right" } }], reply: "" },
      "3d-37": { steps: [{ tool: "undo" }, { tool: "undo" }], reply: "" },
      "kind1-01": { kind: 1, steps: [{ tool: WEB_SEARCH }, { tool: "get_tumor_metrics", args: { job_id: "sample" } }], reply: "136.28 cm³" },
      "kind5-01": { kind: 2, steps: [], reply: "I help with the brain viewer. Try: zoom in." },
    };
    const report = await score(cases, runnerFrom((c) => answers[c.id]));
    const failures = Object.fromEntries(report.results.map((r) => [r.id, r.failures.join("; ")]));
    expect(failures["3d-08"]).toMatch(/args of rotate_view/);
    expect(failures["3d-39"]).toMatch(/tools: expected \[rotate_view, set_opacity\]/);
    expect(failures["3d-37"]).toMatch(/tools: expected \[undo\], got \[undo, undo\]/);
    expect(failures["kind1-01"]).toMatch(/web_search/);
    expect(failures["kind5-01"]).toMatch(/kind: expected 5, got 2/);
  });

  it("allows the refusal's own wording but not a banned word next to it", async () => {
    const c = kindCases(3)[0];
    const ok = await score([c], () => ({ steps: [], reply: MEDICAL_REFUSAL }));
    expect(ok.ok).toBe(true);
    const bad = await score([c], () => ({ steps: [], reply: `${MEDICAL_REFUSAL} It looks benign though.` }));
    expect(bad.results[0].failures).toEqual(["Guard: banned benign"]);
  });

  it("records a throwing runner as a failure, and supports async runners", async () => {
    const c = CASES[0];
    const report = await score([c, c], async () => { throw new Error("no key"); });
    expect(report.results[0].failures).toEqual(["runner threw: no key"]);
    expect(formatReport(report)).toMatch(/FAIL \//);
  });
});
