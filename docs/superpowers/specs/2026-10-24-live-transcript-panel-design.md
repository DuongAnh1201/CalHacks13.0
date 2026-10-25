# Live transcript panel — design

Date: 2026-10-24
Status: approved

## Goal

During a live call with AI notes on, show a small frosted-glass panel in the
top-right of the case viewer that reads **"Listening"** and shows who is
talking and what they said, as it is transcribed.

## Scope

UI only. The transcript pipeline already exists: each member's browser
transcribes speech and writes segments to Convex (`convex/transcript.ts`);
`useNoteTaker` exposes them as `NoteTakerState.segments` with `speakerName`,
`participantId`, `final`, `startedAt`, `endedAt`.

Files touched:

- `frontend/src/agent/MeetingNotes.tsx`
- `frontend/src/agent/MeetingNotes.module.css`
- `frontend/src/agent/MeetingNotes.test.ts`

No changes to Convex, `useNoteTaker`, routes (`Brain3D.tsx`,
`MriWorkspace.tsx`) or the Assistant panel.

## Component

New `LiveTranscript({ meeting })` in `MeetingNotes.tsx`, rendered by the
existing `MeetingOverlay` in place of `FadingCaption`. `FadingCaption` and
`CaptionLine` are deleted (no other callers; their test is replaced).

### Content

- **Header:** pulsing green dot, text `Listening`, and right-aligned
  `mm:ss · Live` = time since the most recent `on` event in
  `meeting.events`. Ticks once per second. Omitted if there is no `on` event.
- **Muted:** when `meeting.muted`, header reads `Listening · you're muted`
  and the dot is grey, not pulsing.
- **Lines:** the last 4 segments by `startedAt` (oldest at top). Consecutive
  segments from the same speaker share one label. Label = `speakerName` for
  everyone, including the local user (no "You" here; the Assistant tab keeps
  "You"). Label colour = existing `speakerColour(participantId ?? speakerName)`.
  Interim segments (`final === false`) render grey with `data-final="false"`.
- **Empty:** `Waiting for speech…` when there are no segments.

### Visibility

Rendered only when `MeetingOverlay` already renders (not hidden, meeting
present, call active, not ended) **and** `meeting.enabled` **and** the
existing Captions toggle is on. The Captions toggle keeps its label and
`localStorage` key (`neuro-captions`) and now controls this panel. The panel
does not fade.

### Layout and style (option A, light frosted)

- Desktop: `position: fixed; top: 80px; right: 16px; width: 320px;`
  sits under the workspace share bar (`top: 16px; right: 16px`).
- `≤760px`: `top: 128px; left: 16px; right: 16px; width: auto;` and only the
  last 2 lines (CSS hides earlier ones).
- `background: rgba(255,255,255,.55); backdrop-filter: blur(14px);
  border: 1px solid rgba(255,255,255,.8); border-radius: 14px;
  box-shadow: 0 6px 24px #0000001a;` text `var(--nv-text)`, font
  `var(--nv-font)`, header in `var(--nv-success-2)`.
- `pointer-events: none` so the 3D canvas underneath stays draggable.
- Pulse animation disabled under `prefers-reduced-motion: reduce`.

### Accessibility

Lines container: `role="log" aria-live="polite" aria-label="Live transcript"`.

## Out of scope

Scrollback (full log stays in the Assistant Transcript tab), drag/resize,
dark theme, AI suggestion card, any backend change.

## Tests (`MeetingNotes.test.ts`, `renderToStaticMarkup`)

1. Overlay with notes on renders `Listening` and `aria-label="Live transcript"`.
2. Labels use `speakerName` (`Host`, `Guest`), never `You`.
3. With 6 segments, only the last 4 texts render.
4. Interim segment has `data-final="false"`, final has `data-final="true"`.
5. Notes off (`enabled: false`) → no `Listening`.
6. Muted → `you're muted`.
7. No segments → `Waiting for speech…`.
