# W1 · MRI Workspace — design

Date: 2026-10-24 · Status: approved by user, awaiting spec review · Milestone: **W1 · MRI workspace**

Part 1 of 3. W2 (shared Convex workspaces: dashboard home, share link, presence, live cursors) and W3 (chat, `/agent`, owner's personal agent, annotation requests that need owner approval) get their own spec after a sync with Tom and Sage, because they touch #53–#74.

## Goal

After an upload, the user lands in an **MRI workspace** that copies Figma frame 03 "MRI Workspace + Agent" (`docs/figma/03-workspace.png`, node 43:767): MRI slice preview in the center, the Neuro Agent panel on the left, the analysis card on the right. **Place Tumor in 3D Interactive Brain** opens a separate 3D page that copies frame 04 "Tumor Placed in 3D" (`docs/figma/04-explore.png`, node 43:1149) and renders the job's `model.glb`. The Explore tab is removed.

## Non-goals (W1)

- Shared workspaces, share links, live cursors, a server-side workspace list (W2). W1 keeps a per-browser list (section 8).
- Chat between people, `/agent` in chat, annotation approval (W3 UI, designed in Figma first).
- Any agent behaviour: parser, dispatch from text, LLM, voice. Tom owns it (#64, #65, #67, #19).
- Push-to-talk and full voice (#19), gestures and webcam (#18), Cutaway mode (#16).
- The Figma "Help" tab.

## Copy rule

Copy the Figma layout and visuals. **Never copy its placeholder data.** Every number and label comes from `report.json` or the NIfTI header. No diagnosis wording ("Glioblastoma", "Grade IV"), no invented confidence, no patient name, no "3.0 Tesla". "Tumor detected" / "No tumor detected" only, never "healthy" (SPEC §3). Figma text that names a keyboard key ("Hold Space to talk · Esc to stop") becomes a pointer instruction ("Click the mic to talk"): the UI has no keyboard shortcuts.

## 1. Navigation and routes

| Route | Page | Replaces |
|---|---|---|
| `/` | Workspace dashboard (section 8) | Upload |
| `/upload` | Upload (unchanged page) | `/` |
| `/jobs/:id/processing` | Processing; on done → `/jobs/:id/mri` | |
| `/jobs/:id/mri` | MRI workspace (frame 03) | `/jobs/:id/results` |
| `/jobs/:id/3d` | 3D page (frame 04) | `/jobs/:id/explore` |
| `/learn`, `/learn/:wsId` | Learning Mode (unchanged page; `wsId` unused in W1) | |

- `/jobs/:id/results` and `/jobs/:id/explore` stay as `<Navigate replace>` redirects to `/mri` and `/3d`, so old links work.
- Top nav tabs: **MRI Workspace**, **Learning Mode**. The Explore tab is deleted. MRI Workspace links to the job in the URL when there is one, else `/upload`.
- `/3d` has no tab. It is reached from **Place in 3D** (CTA, agent confirm bubble, `place in 3d` command) and links back with **Analyze Cross-Sections**.
- W2 later adds `/jobs/:id/3d/:sessionId`; W1 does not reserve or stub it.
- SPEC §3 route table and the Decision Log get updated in the same change.

## 2. MRI workspace — `/jobs/:id/mri` (frame 03)

Header and footer: existing `TopNavBar` and `Footer`. Three columns, 3 / 6 / 3 like the frame.

**Left column**
- **Patient Dataset card:** subject = job id ("Sample case" for `sample`), modality "FLAIR", matrix `i × j × k` and voxel spacing from `report.input` (same values as the header; keeps the card out of the NiiVue load path), badge "Verified NIfTI".
- **Neuro Agent panel** (section 4).

**Center column**
- **MPR header:** title "Synchronized Multi-Planar Reconstruction", window presets **Brain / Bone / Subdural / Perfusion** as NiiVue window/level presets.
- **Axial view** large; **sagittal** and **coronal** side by side below. Each: FLAIR + 3-colour seg overlay, view label chip, slice `n / N`, slice slider, crosshair. One shared cursor across the three views (#11).
- **Tool strip:** Electronic Caliper (NiiVue measurement), Contrast / Gamma, Mask Overlay % (overlay opacity), "3-Axis Triangulation Locked" status.
- Each view shows its own inline error + Retry when the NIfTI fails to load; the other columns keep working.

**Right column**
- The existing Results analysis card (headline, volumes in cm³, side, lesion count, legend, source badge, Dice on sample cases, limitations), restyled to the frame.
- **Place Tumor in 3D Interactive Brain** → `/jobs/:id/3d`.
- **Export NIfTI Mask** → download link to `GET /jobs/{id}/seg.nii.gz`.
- **Adjust Threshold** shown disabled with the title "Not available: the model has no threshold setting".

## 3. 3D page — `/jobs/:id/3d` (frame 04)

- **Left:** pathology card from the report (volume, side, regions); **spatial toggles** wired to existing store actions: Brain Opacity (`setOpacity`, #12), Slices Intersect shown disabled with the title "Needs Cutaway (#16)" (no slice-plane layer exists yet), **Hide Brain** (`setHemisphereVisible` both false; Figma says "Hide Healthy", renamed because `copy.test.ts` bans the word), Focus Tumor (`focusTumor`); **Analyze Cross-Sections** → `/jobs/:id/mri`.
- **Center:** `CaseCanvas`; status pill ("Brain exploded · 75%" etc.); toast "Tumor placed on the 3D brain · <side> · <volume> cm³" with **Undo** (`resetView`); **Dispersion / explode slider** (`setExplosion`, #15); **structures bar** of layer chips (`setLayerVisible`).
- **Right:** gesture telemetry card in a fixed "Webcam off" state that names #18; the **Neuro Agent panel** (section 4).
- No-tumor case: tumor toggles disabled with the reason shown (SPEC §4).
- Load failure keeps the current Explore error state (message + Retry + Use sample case).

## 4. Neuro Agent panel — `components/agent/`

One component, used on both pages (left on `/mri`, right on `/3d`).

- **Header:** avatar, "Neuro Agent", subtitle, status pill (Ready / Listening).
- **Agent chips:** Orchestrator, Vision, Spatial UI, Clinical. Display only in W1.
- **Tabs:** Voice / Script.
- **Conversation log:** renders `messages` (below). Tool Call rows use Figma symbol 45:30 (✓ / ✗, call text, latency in ms).
- **Confirm bubble:** e.g. "Place the <volume> cm³ tumor on the 3D brain?" with **Place in 3D** / **Not now**.
- **Script block:** an editable list of commands with **Run**.
- **Input:** a text box and, on the Voice tab, a mic button. No keyboard-shortcut copy.

**UI only.** The panel has no parser, no dispatch and no network. Agent behaviour (parser, Router, LLM, voice) is Tom's (#64, #65, #67, #19); he plugs it in through these props:

```ts
export type ToolCallRow = { call: string; ms: number; ok: boolean; message?: string };
export type AgentMessage =
  | { kind: 'system'; agent: string; text: string }
  | { kind: 'user'; text: string; via: 'text' | 'voice'; at: string }
  | { kind: 'agent'; agent: string; text: string; at: string; calls?: ToolCallRow[] }
  | { kind: 'confirm'; agent: string; text: string; confirmLabel: string; dismissLabel: string };

export interface AgentPanelProps {
  messages: AgentMessage[];
  status: 'ready' | 'listening' | 'offline';
  script?: string[];
  onSend?: (text: string) => void;      // absent → input disabled, placeholder "Agent not connected yet"
  onRun?: (lines: string[]) => void;    // absent → Run disabled
  onMic?: () => void;                   // absent → mic disabled
  onConfirm?: () => void;
  onDismiss?: () => void;
}
```

Until Tom's agents land, each page passes demo content built from the report: a `system` message ("Vision agent · Segmentation done: <volume> cm³, <side>" or "No tumor detected"), and on `/mri` a `confirm` message whose `onConfirm` navigates to `/jobs/:id/3d` (plain navigation, not agent logic). `status` is `offline`.

## 5. Dependencies

- Add `@niivue/niivue` (SPEC §3 already names NiiVue). No other new dependency.
- Backend unchanged: `flair.nii.gz`, `seg.nii.gz`, `model.glb`, `report.json` already exist per job.

## 6. Testing

- vitest: `AgentPanel` renders each message kind and disables input / Run / mic when their handler is absent; route redirects (`/results` → `/mri`, `/explore` → `/3d`); report-built first message (tumor / no tumor).
- Existing tests stay green; `tsc -b` and `npm run build` pass.
- qa browser pass on the sample job and one real upload: layout vs `docs/figma/03-workspace.png` and `04-explore.png`, slice click moves the crosshair in all three views, each toggle changes the 3D scene, the agent panel matches the frames with demo content, NIfTI and GLB failure paths, no placeholder data on screen.

## 7. Issues

New milestone **W1 · MRI workspace**:

| Issue | Scope | Depends on |
|---|---|---|
| #88 W1-1 Nav + routes + SPEC | section 1 | — |
| #85 W1-2 MRI workspace shell (frame 03) | section 2 minus the slice views | W1-1 |
| #11 NiiVue slice panel (rescoped) | section 2 center views + tool strip | W1-1 |
| #86 W1-3 Neuro Agent panel (UI only) | section 4 | — |
| #87 W1-4 3D page (frame 04) | section 3 | W1-1, #12, #15 |
| #12 X-Ray, #15 Exploded | moved into W1 | |

Done 2026-10-24: milestone #9 created; #11, #12, #15 moved in; #11 rescoped; #22 wording fixed (#13 had none); comments on #19, #65, #71 (#71 not retitled: AG epic, owned by Tom). Later the same day #86 became UI only; the parser stays with Tom (#64/#65), corrected on #19 and #65. Issues #53–#74 are not edited in W1.

## 8. Home dashboard — `/` (added 2026-10-24)

User request, with the Figma file browser (Drafts grid + **New** menu) as the reference. No Figma frame for it yet; the screenshots stand in.

- **Sidebar:** **New workspace** button opening a menu with two kinds:
  - **MRI Workspace** → `/upload` (first-time upload flow). The workspace is recorded when the job is created (name = FLAIR file stem) or a sample is picked (name = sample title).
  - **Learning Mode** → creates a learn workspace (`id` = 8 chars of a UUID) and opens `/learn/:wsId`.
- Filters: All / MRI / Learning.
- **Main:** "Workspaces" grid of cards (thumbnail tint per kind, name, "<kind> · opened <relative time>"), newest first; opening a card bumps it. Empty state: "Upload your first MRI" + "Open Learning Mode".
- Storage: `localStorage` key `nv.workspaces`, invalid rows dropped, blocked storage = empty list. W2 replaces it with Convex.
- Issue: #88 (W1-1), plan Task 8.
