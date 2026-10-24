/**
 * The Guard (plan §6, §6.1)
 * =========================
 *
 * Code, not a prompt: the agent core (#67) calls these on every run and every
 * reply. Pure functions, no network, no LLM, no `ctx`.
 *
 * - `checkReply`: banned wording. On a violation the caller replaces the whole
 *   reply with `MEDICAL_REFUSAL` (kind 3).
 * - `classifyHint`: a cheap pre-check that refuses obvious medical-judgement
 *   questions and redirects obvious off-topic ones before any LLM call. `null`
 *   means "not obvious": the Router decides.
 * - `canStartRun`: 1 active run per client, 10 runs per minute.
 * - `allowedTools`: the agent only sees the tools this page supports (§3.3).
 */

/** Kind 3, fixed text (§6.1). */
export const MEDICAL_REFUSAL =
  "I can't diagnose or predict outcomes. This is an educational view, not clinically validated. Please ask a doctor.";
/** Kind 5, fixed text (§6.1). The caller appends this page's "Try saying" chips with `offTopicReply`. */
export const OFF_TOPIC_REDIRECT = "I help with the brain viewer.";
/** Kind 1 on a page with no patient report (§6.1). */
export const NO_REPORT = "There is no patient report on this page (template atlas).";
/** No LLM key or no network (§6.1). */
export const NO_KEY = "Assistant unavailable for open questions. Commands still work.";
/** Label on every kind-2 answer (§6.1, D9). */
export const GENERAL_INFO_LABEL = "General information, not from this scan";

export function offTopicReply(tryChips: readonly string[]) {
  return tryChips.length ? `${OFF_TOPIC_REDIRECT} Try: ${tryChips.join(", ")}.` : OFF_TOPIC_REDIRECT;
}

// ---------------------------------------------------------------------------
// Banned wording

const BANNED = /\b(?:diagnos\w*|prognos\w*|survival|malignant|benign|healthy)\b/gi;

export interface ReplyCheck {
  ok: boolean;
  /** Lower-cased matches, in order, duplicates removed. */
  violations: string[];
}

export function checkReply(text: string): ReplyCheck {
  const violations = [...new Set((text.match(BANNED) ?? []).map((w) => w.toLowerCase()))];
  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// Rule-based pre-check

export type Hint = "medical" | "offtopic" | null;

const MEDICAL: RegExp[] = [
  /\b(?:is|was|could|might)\b.*\b(?:cancer\w*|deadly|fatal|terminal|curable|treatable)\b/,
  /\b(?:is|are)\b.*\b(?:the (?:tumou?r|mass|lesion|scan|brain|patient)|he|she|my \w+)\b.*\b(?:serious|dangerous|normal|ok(?:ay)?|fine)\b/,
  /\b(?:do(?:es)?|ha(?:ve|s))\b.*\b(?:i|he|she|they|you|the patient|my \w+)\b.*\b(?:have|got)\b.*\b(?:cancer|glioma|glioblastoma|stroke|dementia|alzheimer\w*)\b/,
  /\bhow long\b.*\b(?:live|left|survive)\b/,
  /\b(?:life expectancy|survival|survive|chances? of (?:recovery|living|beating)|going to die|will \w+ die|die from|prognos\w*|diagnos\w*)\b/,
  /\bshould\b.*\b(?:surgery|operate|operation|chemo\w*|radiation|radiotherapy|treat\w*|biopsy|medication|worry|be worried)\b/,
  /\b(?:what|which)\b.*\b(?:treatment|medication|drug|dose)\b.*\b(?:should|need|best|recommend\w*)\b/,
  /\b(?:what stage|which stage|what grade|which grade|stage [1-4iv]+|grade [1-4iv]+)\b/,
  /\b(?:healthy|cancerous|malignant|benign)\b/,
];

const OFF_TOPIC: RegExp[] = [
  /\b(?:weather|forecast|temperature outside)\b/,
  /\b(?:joke|poem|song|story|riddle)\b/,
  /\b(?:recipe|cook|bake|restaurant|pizza|dinner)\b/,
  /\b(?:stock|bitcoin|crypto|price of|exchange rate)\b/,
  /\b(?:football|soccer|basketball|baseball|nba|nfl|world cup|score of the game)\b/,
  /\b(?:capital of|president of|prime minister|who won the election)\b/,
  /\b(?:movie|netflix|tv show|celebrity)\b/,
  /\b(?:what time is it|what's the time|what day is it)\b/,
  /\b(?:flight|hotel|vacation|travel to)\b/,
  /\b(?:write (?:me )?(?:an? )?(?:essay|email|code|program))\b/,
];

export function classifyHint(text: string): Hint {
  const t = text.toLowerCase().replace(/[’`]/g, "'");
  if (MEDICAL.some((re) => re.test(t))) return "medical";
  if (OFF_TOPIC.some((re) => re.test(t))) return "offtopic";
  return null;
}

// ---------------------------------------------------------------------------
// Rate limit

export const MAX_ACTIVE_RUNS = 1;
export const MAX_RUNS_PER_MINUTE = 10;

export interface RunCheck {
  ok: boolean;
  /** 0 when ok. Otherwise a hint for the client: a short retry for a busy run, up to a minute for the window. */
  retryAfterSec: number;
}

/**
 * `runsInLastMinute` counts runs started in the last 60 s, not including this one.
 * `oldestRunAgeSec` (optional) is the age of the oldest run in that window, so the
 * retry can say exactly when a slot frees up; without it the caller is told 60 s.
 */
export function canStartRun(activeRunsForClient: number, runsInLastMinute: number, oldestRunAgeSec?: number): RunCheck {
  if (runsInLastMinute >= MAX_RUNS_PER_MINUTE) {
    const age = oldestRunAgeSec === undefined ? 0 : Math.min(Math.max(oldestRunAgeSec, 0), 60);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(60 - age)) };
  }
  if (activeRunsForClient >= MAX_ACTIVE_RUNS) return { ok: false, retryAfterSec: 1 };
  return { ok: true, retryAfterSec: 0 };
}

// ---------------------------------------------------------------------------
// Per-page allow-list (§3.3)

export type Page = "learn" | "explore";

/** Tool name → the pages it works on. Tools missing from the registry are never offered. */
export type ToolRegistry = Readonly<Record<string, { readonly pages: readonly Page[] }>>;

/**
 * The tools the agent may offer: those the page says it has (`availableTools`,
 * sent with each request) AND the registry allows on that page. Keeps the
 * page's order and drops duplicates.
 */
export function allowedTools(page: Page, availableTools: readonly string[], registry: ToolRegistry): string[] {
  return [...new Set(availableTools)].filter((name) =>
    Object.prototype.hasOwnProperty.call(registry, name) && registry[name].pages.includes(page));
}
