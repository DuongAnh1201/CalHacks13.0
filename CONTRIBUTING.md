# How we work (36-hour rules)

**Source of truth:**
- [`docs/SPEC.md`](docs/SPEC.md): *what* we build.
- [GitHub Issues](https://github.com/DuongAnh1201/CalHacks13.0/issues): *who builds what, when*.

If it's not in an issue, nobody is working on it.

## Lanes

| Label | Owns |
|-------|------|
| `lane:ml-backend` | FastAPI, NIfTI validation, mesh/measurement pipeline, sample precompute, 2D classifier |
| `lane:viewer` | R3F scene, `transform.ts`, four modes, NiiVue slice panel, alignment check |
| `lane:app` | Routes/pages, action dispatcher + store, keyboard, gestures, Jarvis, error states, demo/pitch |

Each lane has one owner. Cross-lane work: the issue's lane owner decides.

## Labels

- **Priority:**
  - `P0` must ship for the demo
  - `P1` ship if P0 is green
  - `P2-stretch` only after the demo is stable
- **Type:** `type:task` · `type:spike` (time-boxed, outcome is a decision) · `type:bug` · `type:idea`
- **Status:**
  - `blocked`: add a comment saying what blocks it.
  - `needs-discussion`: raise it at the next checkpoint.

**Milestones** = Checkpoints A–H in [SPEC §12](docs/SPEC.md#12-timeline-elapsed-hours-from-kickoff). A milestone is done when its gate passes, not when its issues close.

## Picking up a ticket

1. Assign yourself. Move nothing else.
2. Branch: `<lane>/<short-desc>-<issue#>`, e.g. `viewer/cutaway-17`.
3. Build only what the acceptance criteria say. Anything extra becomes an **idea issue**.
4. Open a PR with `Closes #<n>`. `main` is protected: PR required, no force-push.
5. Done = every acceptance box ticked, the app still runs, and the PR is merged.

Stuck more than 30 minutes? Add `blocked`, ping the team, and pick another ticket.

## New idea mid-hackathon

1. Open an issue with the **Idea** template. It gets `type:idea` + `needs-discussion` automatically.
2. Don't build it yet.
3. At the next checkpoint sync (2 minutes per idea), decide one of three:
   - **Accept:** convert it to a `type:task` with lane, priority, milestone and acceptance criteria. If it changes behaviour in the spec, update the spec in the same PR.
   - **Park:** label `P2-stretch`.
   - **Close:** with a one-line reason.
4. **After hour 29: no new tasks.** Ideas get parked automatically.

## Changing the spec

- Any change to behaviour, contracts, or scope goes through a PR that edits `docs/SPEC.md` **and** appends a line to §14 Decision Log.
- Typos don't need a Decision Log line.
- Never change a contract in §7 silently. Tell the owners of the other lanes in the PR.

## Bugs

Use the **Bug** template. A bug on the demo path is `P0` and jumps the queue.

## Commits

Short imperative subject, e.g. `viewer: add cutaway clip plane`. Reference the issue (`#17`).
