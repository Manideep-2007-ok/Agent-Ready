# AgentReady: Work log (team)

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
| F16 | Real test still blocked: `TINYFISH_API_KEY` saved in the environment settings is only visible to new sessions | Env check | **Fixed:** a new session sees the key; first real run done (below) |

## 1 Nov 2026: first real run

`cd packages/engine && TINYFISH_MOCK=0 node scripts/smoke.js https://example.com find_price`

| Field | Value |
|---|---|
| Run ID | `acc6892e-bb2f-4d34-af56-efb3631275fc` |
| Mode / proxy | `lite` / `off` (attempt 1 only) |
| Steps | 3: "Navigate to example.com to find product information" -> "Check for product and price information on the page" -> "Report that no product exists on example.com" |
| Time | 11 s agent time, 14 s wall clock |
| Result | `failed`, answer `null`, blocker: "No product or price information exists on this site. example.com is a placeholder domain ...", `stuckUrl` `https://example.com` |
| Bot-wall | Verdict `none`; no re-run (3 steps, blocker does not match the block pattern), as intended |
| Cost | 3 steps x $0.016 = $0.048 (about ₹4.2) |

What this proves: real `run-sse` works end to end (STARTED, STREAMING_URL, PROGRESS steps, COMPLETE), the JSON answer is parsed, the step screenshot URL is built (`/api/shot/<runId>/<stepId>`), the queue ran one at a time. The fail is the correct answer: example.com has no products.

Notes from the run:
- `points: 0` and `findings: []` on the TaskResult: the smoke script calls `runTaskWithBotWall` only; scoring and the `price-not-found` finding are applied in `runSiteTest`. Not a bug.
- Two `task-update failed` events at the end (one from `runner.js`, one final from `botwall.js`). Harmless (same state), could be de-duplicated.

## Open items

- **Next real run: the demo store** once it is on Vercel (expect ~30 s per task). Allowed: example.com or the demo store, max 3 runs without asking (1 used).
- **Sai Shakti: mount routes.** `apps/server/src/index.js` has to mount `/api/watch` and `/api/webhooks` and call `startWatches()` (lines in PR #1).
- **`store.js` / `events.js`.** Not on main yet. `watch.js` uses a TODO fallback until they land.
- **Team decision: extra fields.** `verdict` on TaskResult, and `numSteps`, `blocker` and `screenshotUrl` on Attempt, go beyond `types.js`.
- **Dashboard: dead live view in mock.** Mock streaming URLs are expired links, so `Lane.jsx` should fall back to screenshots.

## 1 Nov 2026: server (Sai Shakti)

Code on branch `shakti/core` (4 commits on top of `main` 8cb62e1). Built with Claude Code, reviewed and tested together by Sai Shakti before commit. All tests in mock mode (`TINYFISH_MOCK=1`); no credits spent.

| Piece | Files | Proof it works (mock) |
|---|---|---|
| Config + storage | `server/src/config.js`, `store.js` | Reports, races and screenshots saved to `data/`; survive a server restart; atomic writes queued per file |
| Test API + live events | `routes/tests.js`, `reportJob.js` | `POST /api/tests` returns an id at once; SSE streams queued -> steps (about 1 s apart) -> passed -> `report-complete`; a late or refreshed page gets a replay |
| Screenshots | `routes/tests.js` (`/api/shot`) | Real and mock run ids return JPEG (~130 KB), cached in `data/shots/`; `../` attempts rejected (400) |
| Race, leaderboard, demo-store switch | `routes/race.js`, `routes/extras.js` | Race of 2 sites ranked passed-then-fastest; bad input gives plain errors |
| App wiring | `server/src/index.js` | Real engine + Watch routes mounted, scheduler starts; Nykaa 2-task test = **46/100, ₹11.26**, `slow` finding, Fix Report text from templates |
| Dev stand-ins | `devEngine.js`, `devEvents.js`, `loaders.js` | Fill in only what is missing (today: `instantScan`, SSE hub); real files take over automatically |

## Server: failures and fixes

| # | What went wrong | Found by | Fix |
|---|---|---|---|
| S1 | Rupee sign showed as `â‚¹` in the live stream | Manual test in browser | SSE header now `text/event-stream; charset=utf-8` (Akhil: use the same in `events.js`) |
| S2 | Stand-in engine dropped the return-policy answer (`return_days`, `policy_url`) | Report check | Answer built from those fields |
| S3 | Mock screenshots returned 400: engine mock run ids are not UUIDs | Test with real engine | Id check relaxed to letters, digits, `_`, `-` |
| S4 | Watch routes would not mount: `routes/watch.js` exports the router, our loader called it as a function | Reading PR #2 | Mounted directly: `/api/watch`, `/api/webhooks`, `startWatches()`, `setPublisher(events.publish)` |
| S5 | `apps/server/package.json` and `package-lock.json` edited on two branches | Re-sync after history rewrite | Kept main's files, added only `cors` |
| S6 | `curl.exe -d "{...}"` in Windows PowerShell 5.1 sends broken JSON | Manual test | Use `Invoke-RestMethod` on Windows; the server answered with a plain 400, no crash |

Open items (server):
- `GET /api/race/:id/events` not built; the dashboard follows each lane through `/api/tests/:id/events`.
- Each task sends two identical final `task-update` events (engine; harmless).
- Watch not tested end to end through our server yet (no watch created, to avoid scheduled runs).
- Next: dashboard (`apps/web`), then `engine/src/report.js`.

## 1 Nov 2026: demo store live + real runs 2 and 3 (Manideep)

- Demo store deployed on Vercel: https://agent-ready-demo.vercel.app (root `apps/demo-store`, static). Checked in a browser: flaws on/off both behave, returns page says 10 days.
- Real runs 2 and 3 (key session, ~₹76 total): flaws on **91/100**, flaws off **97/100**. Agents got past every flaw, but needed 35 vs 19 steps (₹49 vs ₹27), added 2 units instead of 1, and gave the price as "$499" (read from the image).
- Lanes now show the bot-wall retry live (Blocked, 1.5 s, amber "Attempt 2 of 3: India proxy"); Watch/CLI links open `#/test/<id>` (PR #7).

| # | Failure | Found by | Fix |
|---|---|---|---|
| F17 | Demo before/after too small (91 vs 97): flaws were easy for vision agents; hidden returns took exactly 10 steps, one short of `too-many-steps` | Real runs 2-3 | Harsher, realistic flaws: returns one page deeper behind vague labels ("Other information" -> "Read the full document"); header cart link icon-only. Scoring rules unchanged on purpose |
| F18 | Instant Scan only audited the home page, so it never saw the icon-only Add to cart button | Real run 2 | Also audits one product page (12 s cap) and merges the counts |
| F19 | robots.txt / sitemap shown as "error" when the site just doesn't have them | Real run 2 | Shown as "missing"; "error" only if the Fetch call itself failed |
| F20 | Lane showed attempt 1's steps during attempt 2; retry pause could go negative | Opus review | Lane hides earlier attempts' steps; pause is a constant, sped up only in mock mode |
| F21 | Vercel connector got 403 for team `manideep-2007-oks-projects` | Deploy attempt | Deployed by hand at vercel.com/new |
