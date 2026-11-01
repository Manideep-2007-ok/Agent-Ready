# AgentReady: Work log (Manideep's engine work)

What was built, how it was built, and what went wrong. Code lives on branch `manideep/engine`, PR: https://github.com/Manideep-2007-ok/Agent-Ready/pull/1 (not merged; the team merges at checkpoints). Newest entries at the bottom.

## How the work is done

- **Builders:** two Claude Sonnet agents wrote code in parallel on separate files: engine core (Phases 1+2), and Watch + alerts + Fix Report (Phase 3).
- **Reviewers:** two Claude Opus agents reviewed each part, fixed bugs in place and ran the tests. Nothing was pushed before review.
- **Mock mode:** every test runs with `TINYFISH_MOCK=1`, which replays the real 31 Oct runs in `data/cached-demo/fixtures/`, so the tests cost no credits. No real TinyFish run has been made yet.
- **Commits:** small commits on `manideep/engine`, rebased on `origin/main` before each push.

## 1 Nov 2026: built

| Piece | Files | Proof it works (mock) |
|---|---|---|
| Config + run queue | `engine/src/config.js`, `queue.js` | At most 2 runs at once, FIFO, a slot is freed when a run throws |
| TinyFish client | `engine/src/tinyfish.js` | Synthetic SSE tests 19/19: chunk splits, CRLF, stream drop -> poll fallback, abort, key scrubbed from errors |
| Mock mode | `engine/src/mock.js` | Replays fixtures by site + task + proxy, serves fixture screenshots |
| Runner | `engine/src/runner.js` | `runTask`, `runSiteTest`; Nykaa full test = **76/100, ₹40.83** |
| Bot-wall cascade | `engine/src/botwall.js` | Myntra: no proxy blocked -> India proxy passed = `blocks-cloud-agents`, 2 attempts |
| Scoring | `engine/src/scoring.js` | Nykaa returns: `needed-web-search`, `too-many-steps`, `slow`; Swiggy: `cart-not-found`; Myntra capped at 5 |
| Detailed Fix Report | `engine/src/fixes.js` | Templates for all 14 finding types; AI write-up (Gemini/Anthropic/OpenAI) with 10 s timeout and template fallback |
| Alerts | `server/src/alerts.js` | Discord `{content}` / Slack `{text}`, never throws |
| Watch | `server/src/watch.js`, `routes/watch.js`, `routes/webhooks.js` | `watch-confirm-smoke.js`: 14 checks, ALL PASS (alerts only after 2 failures, no double alert, recovery message) |

## Failures and fixes

| # | What went wrong | Found by | Fix |
|---|---|---|---|
| F1 | The bot-wall finding showed the screenshot of the run that got through (no proof of the block) | Opus review | Findings now use attempt 1's blocker text and screenshot |
| F2 | Every task got a fake extra step from the "Task completed" marker, with a broken screenshot | Opus review | Marker steps filtered out |
| F3 | SSE parser broke on `\r\n` split across chunks and lost the last event without a blank line | Opus review | Parser rewritten as `parseSSE()` and tested |
| F4 | Cancelling a run counted as a stream drop, so the engine polled a cancelled run for 10 min | Opus review | Aborts are rethrown |
| F5 | One network blip during polling failed the whole task | Opus review | Polling retries until timeout (except 401/403/404) |
| F6 | Python-style answers (`{'success': True}`) were not parsed | Opus review | Small best-effort converter |
| F7 | Alert times were 12-hour ("10:00 pm") | Opus review | 24-hour ("22:00") |
| F8 | Score was not recomputed after Watch's confirming re-run | Opus review | `scoreReport` re-applied before saving |
| F9 | A bot-wall improvement counted as an alert; a worse wall never alerted | Opus review | Severity-ranked comparison |
| F10 | A watch that was already failing re-ran (and paid for) the task on every check | Opus review | Re-run skipped while already failing |
| F11 | The Gemini key was sent in the URL (could leak into logs) | Opus review | Sent in the `x-goog-api-key` header instead |
| F12 | An early smoke test saved a real enabled Nykaa watch in `data/`, which would have spent credits on server start | Opus review | Deleted; smoke tests now write to a temp folder (`AGENTREADY_DATA_DIR`) |
| F13 | The Browser API call put `country_code` at the top level; TinyFish docs say unknown fields return 400 | Checked against docs.tinyfish.ai | Moved into `proxy_config: {country_code}` |
| F14 | Fetch results were matched by position; failed URLs come back in `errors[]`, so positions shift | Checked against docs | Matched by URL / `final_url` |
| F15 | Real test blocked: the session's network policy refused `agent.tinyfish.ai` | First real-run attempt | Manideep opened network access (now reachable) |
| F16 | Real test still blocked: `TINYFISH_API_KEY` saved in the environment settings is only visible to new sessions | Env check | **Open:** start a new session on `manideep/engine`, then run `node scripts/smoke.js https://example.com find_price` with `TINYFISH_MOCK=0` (about 5 steps, roughly ₹7) |

## Open items

- **First real run.** None has been made yet (F16). Allowed: example.com or the demo store, max 3 runs without asking.
- **Sai Shakti: mount routes.** `apps/server/src/index.js` has to mount `/api/watch` and `/api/webhooks` and call `startWatches()` (lines in PR #1).
- **`store.js` / `events.js`.** Not on main yet. `watch.js` uses a TODO fallback until they land.
- **Team decision: extra fields.** `verdict` on TaskResult, and `numSteps`, `blocker` and `screenshotUrl` on Attempt, go beyond `types.js`.
- **Dashboard: dead live view in mock.** Mock streaming URLs are expired links, so `Lane.jsx` should fall back to screenshots.
