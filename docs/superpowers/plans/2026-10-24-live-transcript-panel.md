# Live Transcript Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a frosted-glass "Listening" panel in the top-right of the case viewer with the last 4 live transcript lines, labelled by speaker name.

**Architecture:** One new presentational component `LiveTranscript` in `frontend/src/agent/MeetingNotes.tsx`, fed by the existing `NoteTakerState` (no backend change). `MeetingOverlay` renders it in place of the old centered `FadingCaption`; `FadingCaption` and `CaptionLine` are deleted.

**Tech Stack:** React 19 + TypeScript, CSS modules, vitest + `react-dom/server` `renderToStaticMarkup`.

Spec: `docs/superpowers/specs/2026-10-24-live-transcript-panel-design.md`

## Global Constraints

- Branch: `feature/live-transcript-panel`. Do not commit to `main`.
- Touch only `frontend/src/agent/MeetingNotes.tsx`, `frontend/src/agent/MeetingNotes.module.css`, `frontend/src/agent/MeetingNotes.test.ts`.
- No changes to Convex, `useNoteTaker.ts`, routes, or `AgentPanel`.
- Speaker label = `speakerName` for everyone, including the local user. Never "You" in this panel. The Assistant Transcript tab keeps "You".
- Header text exactly `Listening`; muted header exactly `Listening · you're muted`; empty state exactly `Waiting for speech…`.
- Style A: `background: rgba(255,255,255,.55); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.8); border-radius: 14px; box-shadow: 0 6px 24px #0000001a;`
- Desktop position `top: 80px; right: 16px; width: 320px`; `≤760px` → `top: 128px; left: 16px; right: 16px`, last 2 lines only.
- `pointer-events: none` on the panel. Pulse off under `prefers-reduced-motion: reduce`.
- Repo rule (CLAUDE.md): run GitNexus `impact({target: "<symbol>", direction: "upstream"})` before editing a symbol, and `detect_changes()` before each commit. Report the results in your task report.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

All commands run from `frontend/`.

---

### Task 1: `LiveTranscript` component + styles

**Files:**
- Modify: `frontend/src/agent/MeetingNotes.tsx` (add component after `speaker` helper, ~line 14)
- Modify: `frontend/src/agent/MeetingNotes.module.css` (append)
- Test: `frontend/src/agent/MeetingNotes.test.ts` (append a `describe` block)

**Interfaces:**
- Consumes: `NoteTakerState`, `Segment` from `./useNoteTaker`; existing `speakerColour(id: string): string` in `MeetingNotes.tsx`.
- Produces: `export function LiveTranscript({ meeting }: { meeting: NoteTakerState }): JSX.Element` — Task 2 renders it.

- [ ] **Step 1: Run impact check**

GitNexus: `impact({target: "speakerColour", direction: "upstream"})`. Expected: only `MeetingNotes.tsx` callers. Note it for the report.

- [ ] **Step 2: Write the failing tests**

Add `LiveTranscript` to the existing import from `./MeetingNotes` at the top of `MeetingNotes.test.ts`, then append at the end of the file:

```ts
describe('live transcript panel', () => {
  const seg = (i: number) => ({ segmentId: `s${i}`, participantId: i % 2 ? 'guest' : 'me', speakerName: i % 2 ? 'Guest' : 'Host', text: `Line ${i}.`, final: true, startedAt: time + i * 1000, endedAt: time + i * 1000 + 500 });
  const live = (over: Partial<NoteTakerState> = {}) => renderToStaticMarkup(createElement(LiveTranscript, { meeting: { ...m, ...over } }));

  it('shows Listening, a live clock and real speaker names, never You', () => {
    const h = live();
    expect(h).toContain('Listening'); expect(h).toContain('aria-label="Live transcript"'); expect(h).toContain('· Live');
    expect(h.match(/>Host<\/p>/g)).toHaveLength(1); expect(h).toContain('>Guest</p>');
    expect(h).not.toContain('>You<');
  });
  it('keeps only the last 4 lines, oldest first', () => {
    const h = live({ segments: [5, 0, 1, 2, 3, 4].map(seg) });
    expect(h).not.toContain('Line 0.'); expect(h).not.toContain('Line 1.');
    expect(h.indexOf('Line 2.')).toBeLessThan(h.indexOf('Line 5.'));
  });
  it('marks interim text separately from final text', () => {
    const h = live();
    expect(h).toContain('data-final="false"'); expect(h).toContain('data-final="true"');
  });
  it('shows muted and empty states', () => {
    expect(live({ muted: true })).toContain('you&#x27;re muted');
    expect(live({ segments: [] })).toContain('Waiting for speech…');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/agent/MeetingNotes.test.ts`
Expected: FAIL — `LiveTranscript` is not exported.

- [ ] **Step 4: Implement the component**

In `MeetingNotes.tsx`, after the `speaker` const (line 13), add:

```tsx
const LIVE_LINES = 4;
const elapsed = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

/** Glass panel in the top-right: newest few transcript lines, labelled by real speaker name. */
export function LiveTranscript({ meeting: m }: { meeting: NoteTakerState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const since = Math.max(0, ...m.events.filter((e) => e.kind === 'on').map((e) => e.at));
  const lines = [...m.segments].sort((a, b) => a.startedAt - b.startedAt).slice(-LIVE_LINES);
  return <section className={css.live}>
    <header className={css.liveHead}>
      <span className={m.muted ? css.liveMuted : css.liveOn}><span className={css.pulse} />Listening{m.muted && " · you're muted"}</span>
      {since > 0 && <time>{elapsed(now - since)} · Live</time>}
    </header>
    <div role="log" aria-live="polite" aria-label="Live transcript">
      {!lines.length && <p className={css.liveEmpty}>Waiting for speech…</p>}
      {lines.map((s, i) => {
        const id = s.participantId ?? s.speakerName;
        const prev = lines[i - 1];
        return <div key={s.segmentId} className={css.liveLine}>
          {(!prev || (prev.participantId ?? prev.speakerName) !== id) && <p className={css.liveWho} style={{ color: speakerColour(id) }}>{s.speakerName}</p>}
          <p className={s.final === false ? css.interim : undefined} data-final={s.final !== false}>{s.text || '…'}</p>
        </div>;
      })}
    </div>
  </section>;
}
```

Append to `MeetingNotes.module.css`:

```css
.live { position: fixed; top: 80px; right: 16px; width: 320px; pointer-events: none; padding: 12px 14px; font-family: var(--nv-font); color: var(--nv-text); background: rgba(255, 255, 255, .55); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); border: 1px solid rgba(255, 255, 255, .8); border-radius: 14px; box-shadow: 0 6px 24px #0000001a; }
.liveHead { display: flex; align-items: center; justify-content: space-between; padding-bottom: 8px; margin-bottom: 6px; border-bottom: 1px solid #00000014; font-size: 12px; }
.liveHead time { font: 10px ui-monospace, monospace; color: var(--nv-text-3); }
.liveOn, .liveMuted { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; }
.liveOn { color: var(--nv-success-2); }
.liveMuted { color: var(--nv-text-3); }
.pulse { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.liveOn .pulse { animation: livePulse 1.6s ease-in-out infinite; }
@keyframes livePulse { 0%, 100% { box-shadow: 0 0 0 0 #3fa66d55; } 50% { box-shadow: 0 0 0 4px #3fa66d00; } }
.liveLine p { margin: 0; font-size: 13px; line-height: 1.4; overflow-wrap: anywhere; }
.liveWho { margin-top: 8px !important; font: 600 10px ui-monospace, monospace !important; }
.liveEmpty { margin: 6px 0 0; font-size: 12px; color: var(--nv-text-3); }
@media (prefers-reduced-motion: reduce) { .liveOn .pulse { animation: none; } }
/* shortcut: hiding by CSS can drop the speaker label of the 3rd-from-last line on phones; compute lines in JS if that matters. */
@media (max-width: 760px) { .live { top: 128px; left: 16px; right: 16px; width: auto; } .liveLine:nth-last-child(n+3) { display: none; } }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/agent/MeetingNotes.test.ts`
Expected: PASS (all, including the old tests).

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc -b && npx oxlint src/agent`
Expected: no errors.

- [ ] **Step 7: detect_changes, then commit**

GitNexus `detect_changes()` — expected: only `MeetingNotes.tsx` symbols. Then:

```bash
git add src/agent/MeetingNotes.tsx src/agent/MeetingNotes.module.css src/agent/MeetingNotes.test.ts
git commit -m "feat(agent): add LiveTranscript glass panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Show `LiveTranscript` in the overlay, delete the old caption

**Files:**
- Modify: `frontend/src/agent/MeetingNotes.tsx` (`CaptionLine` ~line 15-23, `MeetingOverlay` ~line 26-48, `FadingCaption` ~line 50-57)
- Modify: `frontend/src/agent/MeetingNotes.module.css` (`.caption` rule, `@keyframes captionLife`, `.caption` in the `.controls, .consent, .prompt, .caption` selector and in the `760px` media query)
- Test: `frontend/src/agent/MeetingNotes.test.ts`

**Interfaces:**
- Consumes: `LiveTranscript({ meeting })` from Task 1.
- Produces: nothing new. `CaptionLine` export is removed (only caller is the test).

- [ ] **Step 1: Run impact checks**

GitNexus: `impact({target: "MeetingOverlay", direction: "upstream"})`, `impact({target: "CaptionLine", direction: "upstream"})`, `impact({target: "FadingCaption", direction: "upstream"})`. Expected: `MeetingOverlay` ← `Brain3D.tsx`, `MriWorkspace.tsx` (LOW/MED); the caption pair ← only `MeetingNotes`/test. If HIGH or CRITICAL, stop and report to lead.

- [ ] **Step 2: Update tests (failing first)**

In `MeetingNotes.test.ts`:
1. Remove `CaptionLine` from the import.
2. Replace the whole test `it('distinguishes interim grey text and finalized text in the live caption bar', ...)` with:

```ts
  it('shows the Listening panel in the overlay only while AI notes are on', () => {
    expect(renderToStaticMarkup(createElement(MeetingOverlay, { binding: binding() }))).toContain('aria-label="Live transcript"');
    expect(renderToStaticMarkup(createElement(MeetingOverlay, { binding: binding({ enabled: false }) }))).not.toContain('Listening');
  });
```

Run: `npx vitest run src/agent/MeetingNotes.test.ts`
Expected: FAIL — overlay does not render the panel yet.

- [ ] **Step 3: Swap the overlay and delete old code**

In `MeetingOverlay`:
- Delete the line `const latest = Math.max(0, ...(m?.segments ?? []).map((s) => s.updatedAt ?? s.endedAt));`
- Replace `{m.enabled && captions && latest > 0 && <FadingCaption key={latest} meeting={m} latest={latest} />}` with `{m.enabled && captions && <LiveTranscript meeting={m} />}`

Delete the whole `CaptionLine` function and the whole `FadingCaption` function.

In `MeetingNotes.module.css`:
- Change selector `.controls, .consent, .prompt, .caption {` to `.controls, .consent, .prompt {`
- Delete the `.caption { ... }` rule and `@keyframes captionLife { ... }`.
- In the last `@media (max-width: 760px)` rule, delete `.caption { font-size: 14px; }`.

Keep `.dot` and `.interim` (still used by `TranscriptView` / `LiveTranscript`).

- [ ] **Step 4: Run tests, typecheck, lint**

Run: `npx vitest run src/agent && npx tsc -b && npx oxlint src/agent`
Expected: all PASS, no unused-symbol errors.

- [ ] **Step 5: Manual check in the browser**

Run `npm run dev`, open a case viewer in a live call with AI notes on and speak. Confirm: panel sits under the share bar at top-right, brain still rotates when dragging under it, names show (not "You"), grey interim text turns dark when final, Captions toggle hides/shows it. If you cannot start a live call, say so in the report — do not claim it was checked.

- [ ] **Step 6: detect_changes, then commit**

GitNexus `detect_changes()` — expected: `MeetingOverlay`, `LiveTranscript`, removed `CaptionLine`/`FadingCaption` only.

```bash
git add src/agent/MeetingNotes.tsx src/agent/MeetingNotes.module.css src/agent/MeetingNotes.test.ts
git commit -m "feat(agent): replace centered caption with top-right Listening panel

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
