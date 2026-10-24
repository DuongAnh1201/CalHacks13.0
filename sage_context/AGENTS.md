# Codex instructions for NeuroLens

Read `BACKEND_CONTEXT.md` before making backend or Convex changes. It is the agreed project architecture and ownership contract, **not** evidence that described features already exist.

## Scope
- Prioritize the **Convex TypeScript collaborative backend**: sessions, reactive shared view, chat, voxel annotations, presence, QR invite backend, JARVIS commands and chat summarization.
- **FastAPI/Python** is a separate MRI upload/results/ML-adapter service. Do not build chat or collaborative state in FastAPI.
- Leave React/Three.js/Mediapi/voice-recognition implementation and ML inference to teammates. Do not rewrite their work.
- Do not add Runpod, Apify, custom WebSockets, new hosting stacks, or other unsanctioned infrastructure.

## Workflow
1. Inspect existing repo and verify available SDK versions; prefer existing working patterns.
2. State the specific phase being implemented and any mismatches with `BACKEND_CONTEXT.md`.
3. Implement one testable increment at a time. Start with **Phase 1** unless told otherwise.
4. Use Convex TypeScript validators, indexes, reactive queries, transactional mutations, internal functions and proper authorization.
5. Avoid streaming every gesture frame through Convex. Keep a shared validated command contract for voice, chat, and gestures.
6. Keep LLM keys server-side; commands must be validated and authorization-checked. Chat context stays scoped to the current session.
7. Do not fake ML inference or derived medical measurements. Use appropriately labeled precomputed de-identified research data for the demo.
8. Run available type checks/tests and report precisely what passed/failed; never claim untested features work.
9. Coordinate changing the ML input/output contract or frontend function signatures with teammates.

## First task
After repo inspection, implement **Phase 1** in `BACKEND_CONTEXT.md`: session create/join/read/update, shared plane/slice/tumor visibility, a demo scan fixture, and minimal end-to-end tests using two subscribed clients. Do **not** build every phase at once.
