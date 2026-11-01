# Instructions for coding agents (Claude Code, Codex, others)

Read these three files fully before writing any code:
1. `docs/ARCHITECTURE.md`: what to build, file layout and owners, engine API, server API, data flow.
2. `docs/DECISIONS.md`: why each choice was made. Do not undo a decision without your human's say-so.
3. `docs/RESEARCH.md`: every TinyFish fact and test result we measured (timings, costs, failure modes, screenshots in `docs/proofs/`). Use these facts; do not guess API behaviour.

Rules:
1. **JavaScript ES modules + JSX only** (no TypeScript). Every `package.json` has `"type": "module"`. Node 20+.
2. **The contract is `packages/engine/src/types.js`** (JSDoc typedefs). Follow these shapes exactly. Change only if your human says the team agreed; then update ARCHITECTURE.md and DECISIONS.md in the same commit.
3. **Only edit files your human owns** (ownership list in ARCHITECTURE.md section 3). If something elsewhere must change, stop and tell your human.
4. **All TinyFish calls live in `packages/engine/src/tinyfish.js`.** Plain `fetch`, header `X-API-Key`, key from `process.env.TINYFISH_API_KEY`. Never put the key in frontend code, logs, error messages or commits.
5. **Do not use** `max_steps`, `capture_config` or `video_url`. Screenshots: `GET https://agent.tinyfish.ai/v1/runs/{id}/steps/{stepId}/screenshot` with the key, served to the browser through our `/api/shot/:runId/:stepId`.
6. **Every agent run** sets `agent_config.max_duration_seconds` and goes through the queue (`TINYFISH_MAX_PARALLEL`, default 2).
7. **Stream drops:** if run-sse errors or closes before `COMPLETE`, poll `GET /v1/runs/{id}` every 3 s until COMPLETED/FAILED/CANCELLED.
8. **`COMPLETED` is not success.** Use the agent's `result.success` (goal wording in `packages/engine/src/goals.js`; do not change `GOAL_SUFFIX`).
9. **Trust only step-backed claims.** Agents sometimes invent facts.
10. **Save credits** ($0.016 per agent step). Build UI with `TINYFISH_MOCK=1` (replays real runs from `data/cached-demo/fixtures/`). Real runs only on the demo store or `https://example.com`, plus planned pre-runs.
11. **Findings always name a site cause**, never "the agent got confused". Dashboard text in plain language for judges and store owners.
12. **Git:** your own branch (`manideep/…`, `shakti/…`, `akhil/…`), small commits, merge to `main` at least hourly, `main` must always run. Never commit `.env`.
13. **Deadline:** feature freeze 15:30, submit 16:30. Finish the "must ship" list (ARCHITECTURE.md section 20) before anything else.
