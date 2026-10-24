# W1 · MRI Workspace — design

Date: 2026-10-24 · Status: approved by user, awaiting spec review · Milestone: **W1 · MRI workspace**

Part 1 of 3. W2 (shared Convex workspaces: dashboard home, share link, presence, live cursors) and W3 (chat, `/agent`, owner's personal agent, annotation requests that need owner approval) get their own spec after a sync with Tom and Sage, because they touch #53–#74.

## Goal

After an upload, the user lands in an **MRI workspace** that copies Figma frame 03 "MRI Workspace + Agent" (`docs/figma/03-workspace.png`, node 43:767): MRI slice preview in the center, the Neuro Agent panel on the left, the analysis card on the right. **Place Tumor in 3D Interactive Brain** opens a separate 3D page that copies frame 04 "Tumor Placed in 3D" (`docs/figma/04-explore.png`, node 43:1149) and renders the job's `model.glb`. The Explore tab is removed.

## Non-goals (W1)

- Shared or saved workspaces, share links, live cursors, a workspace list (W2).
- Chat between people, `/agent` in chat, annotation approval, LLM agents (W3, #67).
- Push-to-talk and full voice (#19), gestures and webcam (#18), Cutaway mode (#16).
- The Figma "Help" tab.

## Copy rule

Copy the Figma layout and visuals. **Never copy its placeholder data.** Every number and label comes from `report.json` or the NIfTI header. No diagnosis wording ("Glioblastoma", "Grade IV"), no invented confidence, no patient name, no "3.0 Tesla". "Tumor detected" / "No tumor detected" only, never "healthy" (SPEC §3). Figma text that names a keyboard key ("Hold Space to talk · Esc to stop") becomes a pointer instruction ("Click the mic to talk"): the UI has no keyboard shortcuts.

## 1. Navigation and routes

| Route | Page | Replaces |
|---|---|---|
| `/` | Upload (unchanged) | |
| `/jobs/:id/processing` | Processing; on done → `/jobs/:id/mri` | |
| `/jobs/:id/mri` | MRI workspace (frame 03) | `/jobs/:id/results` |
| `/jobs/:id/3d` | 3D page (frame 04) | `/jobs/:id/explore` |
| `/learn` | Learning Mode (unchanged) | |

- `/jobs/:id/results` and `/jobs/:id/explore` stay as `<Navigate replace>` redirects to `/mri` and `/3d`, so old links work.
- Top nav tabs: **MRI Workspace**, **Learning Mode**. The Explore tab is deleted. MRI Workspace links to the job in the URL when there is one, else `sample`.
- `/3d` has no tab. It is reached from **Place in 3D** (CTA, agent confirm bubble, `place in 3d` command) and links back with **Analyze Cross-Sections**.
- W2 later adds `/jobs/:id/3d/:sessionId`; W1 does not reserve or stub it.
- SPEC §3 route table and the Decision Log get updated in the same change.

## 2. MRI workspace — `/jobs/:id/mri` (frame 03)

Header and footer: existing `TopNavBar` and `Footer`. Three columns, 3 / 6 / 3 like the frame.

**Left column**
- **Patient Dataset card:** subject = job id ("Sample case" for `sample`), modality "FLAIR", matrix `i × j × k` and voxel spacing from the NIfTI header (NiiVue exposes it), badge "Verified NIfTI".
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

- **Left:** pathology card from the report (volume, side, regions); **spatial toggles** wired to existing store actions: Brain Opacity (`setOpacity`, #12), Slices Intersect shown disabled with the title "Needs Cutaway (#16)" (no slice-plane layer exists yet), Hide Healthy (`setHemisphereVisible` both false), Focus Tumor (`focusTumor`); **Analyze Cross-Sections** → `/jobs/:id/mri`.
- **Center:** `CaseCanvas`; status pill ("Brain exploded · 75%" etc.); toast "Tumor placed on the 3D brain · <side> · <volume> cm³" with **Undo** (`resetView`); **Dispersion / explode slider** (`setExplosion`, #15); **structures bar** of layer chips (`setLayerVisible`).
- **Right:** gesture telemetry card in a fixed "Webcam off" state that names #18; the **Neuro Agent panel** (section 4).
- No-tumor case: tumor toggles disabled with the reason shown (SPEC §4).
- Load failure keeps the current Explore error state (message + Retry + Use sample case).

## 4. Neuro Agent panel — `components/agent/`

One component, used on both pages (left on `/mri`, right on `/3d`).

- **Header:** avatar, "Neuro Agent", subtitle, status pill (Ready / Listening).
- **Agent chips:** Orchestrator, Vision, Spatial UI, Clinical. Display only in W1.
- **Tabs:** Voice / Script.
- **Conversation log:** first message is built from the report ("Vision agent · Segmentation done: 14.8 cm³, right temporal lobe" or "No tumor detected"). User text appears as a user bubble; the agent reply lists one **Tool Call** row per dispatched action (Figma symbol 45:30: ✓, call text, latency in ms).
- **Confirm bubble:** "Place the <volume> cm³ tumor on the 3D brain?" with **Place in 3D** / **Not now**, shown on `/mri`.
- **Script block:** an editable list of commands with **Run**, which runs them in order through the same path as typed text.
- **Input:** a text box. The Voice tab's mic uses the Web Speech API when the browser has it and otherwise says "Voice unavailable, use the text box". Hold-to-talk is #19.

**`parseIntent(text: string, ctx): Action | Navigate | null`** — deterministic, no network. Covers at least:

| Phrase (examples) | Result |
|---|---|
| "show the tumor", "focus tumor" | `focusTumor` |
| "axial slice on the tumor", "sagittal through the tumor" | `setSlice` at that axis's `report.centroidMm` component |
| "opacity 40", "fade the brain" | `setOpacity` |
| "explode 75", "reassemble" | `setExplosion` |
| "hide edema", "show core" | `setLayerVisible` |
| "reset", "reset view" | `resetView` |
| "explain", "what did it find" | `explainFinding` |
| "place in 3d", "open 3d" | navigate to `/jobs/:id/3d` |
| anything else | `null` → reply "I can't do that yet" + the list of things it can do |

Actions go through the existing `dispatch(action, 'agent')`; the `DispatchResult` becomes the Tool Call row (`ok` → ✓, else ✗ + message). This is the deterministic half of #64/#65; the panel component is shared with them.

## 5. Dependencies

- Add `@niivue/niivue` (SPEC §3 already names NiiVue). No other new dependency.
- Backend unchanged: `flair.nii.gz`, `seg.nii.gz`, `model.glb`, `report.json` already exist per job.

## 6. Testing

- vitest: `parseIntent` phrase table (every row above + unknown → `null`); route redirects (`/results` → `/mri`, `/explore` → `/3d`); report-built first message (tumor / no tumor).
- Existing tests stay green; `tsc -b` and `npm run build` pass.
- qa browser pass on the sample job and one real upload: layout vs `docs/figma/03-workspace.png` and `04-explore.png`, slice click moves the crosshair in all three views, each toggle changes the 3D scene, every agent command in the table works, NIfTI and GLB failure paths, no placeholder data on screen.

## 7. Issues

New milestone **W1 · MRI workspace**:

| Issue | Scope | Depends on |
|---|---|---|
| W1-1 Nav + routes + SPEC | section 1 | — |
| W1-2 MRI workspace shell (frame 03) | section 2 minus the slice views | W1-1 |
| #11 NiiVue slice panel (rescoped) | section 2 center views + tool strip | W1-1 |
| W1-3 Neuro Agent panel + `parseIntent` | section 4 | — |
| W1-4 3D page (frame 04) | section 3 | W1-1, #12, #15 |
| #12 X-Ray, #15 Exploded | moved into W1 | |

Edits: #19 comment (parser moves to W1-3, #19 keeps push-to-talk); #71 retitled "3D page parity"; #13 and #22 "Explore" → "3D page"; #65 comment (panel component shared). Issues #53–#74 owned by Tom and Sage are not edited in W1.
