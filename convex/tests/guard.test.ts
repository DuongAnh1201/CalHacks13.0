import { describe, expect, it } from "vitest";
import {
  GENERAL_INFO_LABEL,
  MAX_RUNS_PER_MINUTE,
  MEDICAL_REFUSAL,
  NO_KEY,
  NO_REPORT,
  OFF_TOPIC_REDIRECT,
  allowedTools,
  canStartRun,
  checkReply,
  classifyHint,
  offTopicReply,
  type ToolRegistry,
} from "../agent/guard";

describe("fixed texts (plan §6.1)", () => {
  it("match the plan wording exactly", () => {
    expect(MEDICAL_REFUSAL).toBe("I can't diagnose or predict outcomes. This is an educational view, not clinically validated. Please ask a doctor.");
    expect(OFF_TOPIC_REDIRECT).toBe("I help with the brain viewer.");
    expect(NO_REPORT).toBe("There is no patient report on this page (template atlas).");
    expect(NO_KEY).toBe("Assistant unavailable for open questions. Commands still work.");
    expect(GENERAL_INFO_LABEL).toBe("General information, not from this scan");
  });

  it("builds the kind-5 line with this page's chips", () => {
    expect(offTopicReply(["rotate left", "hide the cortex"])).toBe("I help with the brain viewer. Try: rotate left, hide the cortex.");
    expect(offTopicReply([])).toBe(OFF_TOPIC_REDIRECT);
  });

  it("the Guard's own fixed texts pass the Guard", () => {
    // MEDICAL_REFUSAL says "diagnose", which the Guard bans in agent replies; the
    // caller sends it verbatim after a swap, so it is exempt by construction.
    for (const text of [OFF_TOPIC_REDIRECT, NO_REPORT, NO_KEY, GENERAL_INFO_LABEL]) expect(checkReply(text).ok).toBe(true);
  });
});

describe("checkReply", () => {
  it.each([
    ["The diagnosis is clear.", "diagnosis"],
    ["We can diagnose this.", "diagnose"],
    ["It was diagnosed early.", "diagnosed"],
    ["A diagnostic finding.", "diagnostic"],
    ["The prognosis is good.", "prognosis"],
    ["Prognostic markers are absent.", "prognostic"],
    ["Median survival is long.", "survival"],
    ["This looks malignant.", "malignant"],
    ["This looks benign.", "benign"],
    ["The rest of the brain is healthy.", "healthy"],
  ])("flags %j", (text, word) => {
    expect(checkReply(text)).toEqual({ ok: false, violations: [word] });
  });

  it("is case-insensitive and lists each word once", () => {
    expect(checkReply("HEALTHY tissue, Benign, healthy again")).toEqual({ ok: false, violations: ["healthy", "benign"] });
  });

  it.each([
    "The health of the cortex is shown in grey.",
    "Healthcare teams review scans.",
    "The tumor is on the right side; whole volume 136.28 cm³.",
    "The hippocampus sits in the medial temporal lobe.",
    "Certainty of the outline, not a result.",
    "Unhealthy",                       // word boundary: only the whole word is banned
    "Survivalist gear",                // not "survival"
    "Benignant", "Malignancy",         // different words
    "",
  ])("passes %j", (text) => {
    expect(checkReply(text).ok).toBe(true);
  });
});

describe("classifyHint", () => {
  const medical = [
    "Is it cancer?",
    "How long will he live?",
    "Should he have surgery?",
    "Is the scan healthy?",
    "Is this tumor malignant or benign?",
    "What is her life expectancy?",
    "Does my dad have cancer?",
    "Is the tumor dangerous?",
    "What stage is this glioma?",
    "What are his chances of survival?",
    "Should she start chemo?",
    "Can you diagnose this scan?",
  ];
  const offtopic = [
    "What's the weather in Berkeley?",
    "Tell me a joke",
    "Give me a pizza recipe",
    "What is the price of bitcoin?",
    "Who won the NBA game last night?",
    "What is the capital of France?",
    "Recommend a movie on Netflix",
    "What time is it?",
    "Book a flight to Tokyo",
    "Write me an essay about dogs",
  ];
  const routerDecides = [
    // kind 1: this scan
    "How big is the tumor?",
    "Where is the hippocampus?",
    "Is the tumor on the left or the right?",
    // kind 2: general education
    "What is a glioblastoma?",
    "What does edema mean?",
    "What does the hippocampus do?",
    // kind 4: the app
    "What can you do?",
    "How do I explode the brain?",
    "Is it ok to hide the cortex?",
    // commands
    "Spin to the right side and fade the cortex",
  ];

  it.each(medical)("medical: %j", (q) => expect(classifyHint(q)).toBe("medical"));
  it.each(offtopic)("offtopic: %j", (q) => expect(classifyHint(q)).toBe("offtopic"));
  it.each(routerDecides)("null (Router decides): %j", (q) => expect(classifyHint(q)).toBeNull());

  it("medical wins over off-topic", () => {
    expect(classifyHint("Tell me a joke, then tell me if it is cancer")).toBe("medical");
  });

  it("handles curly apostrophes", () => {
    expect(classifyHint("What’s the weather?")).toBe("offtopic");
  });
});

describe("canStartRun", () => {
  it("allows the first run", () => {
    expect(canStartRun(0, 0)).toEqual({ ok: true, retryAfterSec: 0 });
  });

  it("allows the 10th run in a minute, blocks the 11th", () => {
    expect(canStartRun(0, MAX_RUNS_PER_MINUTE - 1).ok).toBe(true);
    expect(canStartRun(0, MAX_RUNS_PER_MINUTE)).toEqual({ ok: false, retryAfterSec: 60 });
  });

  it("uses the oldest run's age for the retry", () => {
    expect(canStartRun(0, 10, 45)).toEqual({ ok: false, retryAfterSec: 15 });
    expect(canStartRun(0, 10, 59.5)).toEqual({ ok: false, retryAfterSec: 1 });
    expect(canStartRun(0, 10, 90)).toEqual({ ok: false, retryAfterSec: 1 });
    expect(canStartRun(0, 10, -5)).toEqual({ ok: false, retryAfterSec: 60 });
  });

  it("blocks a second active run per client", () => {
    expect(canStartRun(1, 0)).toEqual({ ok: false, retryAfterSec: 1 });
    expect(canStartRun(2, 3).ok).toBe(false);
  });

  it("reports the minute window when both limits are hit", () => {
    expect(canStartRun(1, 10, 30)).toEqual({ ok: false, retryAfterSec: 30 });
  });
});

describe("allowedTools", () => {
  const registry: ToolRegistry = {
    rotate_view: { pages: ["mri", "3d"] },
    set_opacity: { pages: ["mri"] },
    explain_structure: { pages: ["mri"] },
    get_tumor_metrics: { pages: ["3d"] },
    search: { pages: ["mri", "3d"] },
  };

  it("keeps only tools the registry allows on the page", () => {
    const available = ["rotate_view", "set_opacity", "explain_structure", "get_tumor_metrics", "search"];
    expect(allowedTools("mri", available, registry)).toEqual(["rotate_view", "set_opacity", "explain_structure", "search"]);
    expect(allowedTools("3d", available, registry)).toEqual(["rotate_view", "get_tumor_metrics", "search"]);
  });

  it("never offers a tool the page did not send", () => {
    expect(allowedTools("3d", ["rotate_view"], registry)).toEqual(["rotate_view"]);
  });

  it("drops unknown names, prototype keys and duplicates", () => {
    expect(allowedTools("mri", ["rm_rf", "toString", "__proto__", "search", "search"], registry)).toEqual(["search"]);
  });

  it("handles empty input", () => {
    expect(allowedTools("mri", [], registry)).toEqual([]);
  });
});
