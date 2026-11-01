# Instructions for coding agents (Claude Code, Codex, others)

1. **Read `docs/ARCHITECTURE.md` fully before writing any code.** It holds every decision, the TinyFish facts we tested, the API, and who owns which folder.
2. **The contract is `packages/engine/src/types.ts`.** Use these types. Do not change them unless your human explicitly says the team agreed; if changed, update `docs/ARCHITECTURE.md` in the same commit.
3. **Only edit folders your human owns** (see the ownership list in ARCHITECTURE.md section 3). If something in another folder must change, stop and tell your human.
4. **All TinyFish calls live in `packages/engine/src/tinyfish.ts`.** Use plain `fetch`, header `X-API-Key`. Never put the API key in frontend code; read it from `process.env.TINYFISH_API_KEY`.
5. **Do not use** `max_steps`, `capture_config` or `video_url` (not available on our account). Screenshots: `GET https://agent.tinyfish.ai/v1/runs/{id}/steps/{stepId}/screenshot` with the API key.
6. **Every agent run** must set `agent_config.max_duration_seconds` and respect `TINYFISH_MAX_PARALLEL` (queue the rest).
7. **Handle stream drops:** if the run-sse stream errors, poll `GET /v1/runs/{id}` every 3 s until a terminal status.
8. **`COMPLETED` is not success.** Use the agent's `result.success` (goal suffix in ARCHITECTURE.md section 5).
9. **Each credit costs real money** ($0.016 per step). During development, test against the demo store or `https://example.com`, not big stores, and cache results in `data/`.
10. **Keep it demo-able.** Small commits on your own branch (`manideep/…`, `shakti/…`, `akhil/…`), merge to `main` often. Feature flags for anything risky.
11. **Plain-language UI text.** No jargon in the dashboard; the audience is judges and store owners.
12. **Deadline: submit by 16:30; feature freeze 15:30.** Prefer finishing the "must ship" list over starting new things.
