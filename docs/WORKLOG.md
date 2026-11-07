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

## 1 Nov 2026: dashboard, Watch page, CLI upload (Sai Shakti)

Built with Claude Code; every change reviewed and tested together by Sai Shakti before commit, one small PR per feature (#14 and #15 still open when this was written). All tests in mock mode (`TINYFISH_MOCK=1`) plus Manideep's real demo-store backups; no credits spent.

| Piece | Files | Proof it works | PR |
|---|---|---|---|
| Dashboard shell | `web/src/main.jsx`, `App.jsx`, `nav.js`, `api.js` | Tabs + hash routes (`#/test/<id>`, `#/test/<id>/<before>`); `useLiveEvents` follows a test over SSE and survives a refresh | #5 |
| Test page | `pages/TestPage.jsx`, `FindingCard.jsx`, `ShotViewer.jsx` | Live lanes (Akhil's `Lane`), Instant Scan card, finding cards answering the six questions, screenshots enlarge; Myntra's 4 identical bot-wall findings shown as one card, "Blocked all 4 tasks" | #5 |
| Instant Scan findings in reports (D25) | `engine/src/types.js`, `server/src/reportJob.js`, docs | `SiteReport.scanFindings`; Top 3 via `engine.rankFixes`. Mock Myntra Top 3 = bot wall, unlabelled buttons, no product schema | #5 |
| Score card + Top 3 | `ScoreCard.jsx`, `TopFixes.jsx` | Myntra: red bot-wall banner, 20/100 "Not ready", "0 of 4 tasks passed (4 more only with a workaround)", bot-wall fix "+80 points, 4 tasks"; clicking a fix jumps to its card | #9 |
| Demo store before/after | `DemoStoreCard.jsx` | "Try it on our demo store" + "Apply fixes and re-test" (`?flaws=on` -> `?flaws=off`). Real backups: **91 -> 97, 35 -> 19 steps, ₹49 -> ₹27**, add to cart 17 -> 7 steps; mock runs get a "Mock mode" note | #11, #14 |
| Watch page | `pages/WatchPage.jsx` | Create a watch, Run now with live lanes, Pause/Resume, history with report links, live alert banner | #12 |
| CLI upload + dashboard on :4000 | `server/src/routes/tests.js`, `index.js` | Real CLI (mock) uploaded to `POST /api/reports` and its printed `<server>/#/test/<id>` link opened from the API server alone; bad uploads 400, id clash 409, flag off 404 | #15 |

## Dashboard: failures and fixes

| # | What went wrong | Found by | Fix |
|---|---|---|---|
| W1 | Both PR #5 and Manideep's #6 added D25, so the docs conflicted | Rebase on main | One D25 row; server Top 3 now calls `engine.rankFixes` (severity, points, one per finding type) |
| W2 | Refreshing mid-test lost the steps; a finished task kept step labels without screenshots | Manual test | Steps saved as they arrive; once a task finishes, its own step list wins |
| W3 | Myntra showed the same bot-wall card four times | Manideep | Identical findings grouped into one card; points add up |
| W4 | "4 of 4 tasks passed" next to a red "Blocked" banner | Review of the score card | Passing only via proxy or stealth counts as "only with a workaround" |
| W5 | Clicking a Top 3 fix did not scroll (smooth scroll did not move in one browser) | Browser test | Instant jump instead |
| W6 | The demo-store link disappeared once the custom-task box was opened | Code review | Link moved out of that slot |
| W7 | Mock before/after showed 100 -> 100, "No change", which looked like a bug | Sai Shakti | Mock replays one recording for any address; the card now says so (run ids `mock-...`) |
| W8 | After a git rebase the dev dashboard kept serving old files | Labels did not change | Vite's watcher misses git rewrites on Windows: restart the dev server after a rebase or branch switch |
| W9 | Port 4000 would have served an old dashboard build (12:58) | CLI upload test | Rebuilt; `apps/web/dist` is gitignored, so rebuild on the demo machine after the last merge |
| W10 | `npm install` changed `package-lock.json` and the CLI file's line endings | `git status` | Left out of our commits; Manideep fixed the lockfile (#8) |
| W11 | PR #15 showed a red Vercel check | GitHub | Not a code error: the demo store's Vercel project refuses previews from authors outside its team; the check is optional and the PR is mergeable |

Open items (dashboard):
- The red Watch alert banner is untested: mock checks always pass. Needs one real failing check (Manideep's cart switch).
- A CLI run of only some tasks shows "50/100, Partly ready" next to "2 of 2 tasks passed" (score counts all four tasks).
- Not built: step replay, Race page, Leaderboard page (dropped for time, in the D24 / cut-line order).
- Before the demo: pull main, `npm install`, `npm run build -w @agentready/web`, restart the server.

## 1 Nov 2026: Watch alert live (Manideep)

- Slack webhook set (key session `.env`); test alert 14:15. Watch `w_ae7185a9` on the demo store (`add_to_cart`, 20 min): green 14:10, cart broken via `release.js`, **🔴 Slack alert 14:40** with the agent's words ("every Add to cart click showed Something went wrong"). Cart fixed after.
- Scores scale to 100 when fewer than 4 tasks run (PR #16); mock mode no longer shows dead live views.

| # | Failure | Found by | Fix |
|---|---|---|---|
| F22 | The broken cart's "Something went wrong" matched the bot-wall pattern: proxy + stealth retries (₹111 vs ₹10) and a wrong "blocked, allow-list agents" verdict | Key session, Watch demo | D26: stop after the India-proxy attempt if it took 5+ steps; verdict none, normal finding (cart-not-found) |
| F23 | Watch alert links pointed to `localhost:5173` (Vite) | Slack alert text | Default to the server (`localhost:$PORT`, 4000), which now serves the dashboard |
| F24 | A 2-task CLI run read "50/100, Partly ready" with both tasks passing | Sai, PR #15 | Total scaled to the tasks run |


## 2 Nov 2026: production hardening

Branch `manideep/engine`. Goal: make the hackathon build safe to run for real. Everything below was proven by running it: `npm test` (node:test: engine, server, CLI; replay mode, a temp data folder, no credits) and `npm run test:e2e` (real Chromium clicking through the built dashboard). **No real TinyFish call was made** (no key in this environment): failures such as cancelled runs, dropped streams, 5xx, hangs and bot walls were simulated by an in-process fake of the TinyFish API (`packages/engine/test/fake-tinyfish.js`, dummy key, refuses every other host) and by the recordings.

### Bugs found and fixed

| # | Symptom | Cause | Fix | Test that proves it |
|---|---|---|---|---|
| H1 | After a cancel, new proxy/stealth runs started and queued tasks kept starting (money) | A CANCELLED run has few steps, so `looksBlocked` said "blocked" and the cascade retried; there was no cancel path at all | D29: `cancelled` is a final status; `RunContext` aborts streams, drops queued tasks, cancels in-flight runs on TinyFish; `POST /api/tests/:id/cancel`; Stop test button; Watch pause cancels the check; CLI Ctrl+C/SIGTERM cancel first | `cascade.test.js` (CANCELLED is final, external cancel stops the test, cancelReport mid-run, stop during the retry pause, failing cancel call), `replay-mock.test.js`, `api.test.js` (Stop test, two tests, Watch pause), `cli.test.js` (SIGINT/SIGTERM), e2e "Stop test" and "Stop check" |
| H2 | A scheduled Watch check made the Test page wait for minutes on "Waiting for an agent" with no reason | One FIFO queue for tests and Watch checks | D30: priority queue (people before Watch, no pre-emption); `/api/health` shows who holds the slots; lanes say "2 agents busy: a Watch check is running" / "another test is running" | `queue.test.js`, `replay-mock.test.js` (priority end to end), `api.test.js`, `queueReason.test.js`, e2e "a waiting lane says a Watch check is using the agents" |
| H3 | `npm start` crashed when there was no `.env` | `node --env-file=../../.env` needs the file | D32: `env.js` loader (works on every Node 20+), `--env-file` removed | `lifecycle.test.js` (no .env, no key in live mode) |
| H4 | A failed port bind (port in use) left a server that did not listen but looked alive | The crash guard swallowed the `EADDRINUSE` error | `server.on('error')` prints "port N is already in use" and exits 1 | `lifecycle.test.js` |
| H5 | A report left `running` by a restart kept its lanes spinning forever | Nothing closed interrupted reports | On start, `running` reports become `cancelled` ("interrupted because the server restarted"); cancelling an orphan also closes it | `lifecycle.test.js`, exploratory pass (restart mid-run) |
| H6 | A half-written or hand-edited report file made `GET /api/tests` fail for everyone | `JSON.parse` error was rethrown | Unreadable files are skipped (logged) | `lifecycle.test.js` |
| H7 | A report id with odd characters gave a 500 | `store.assertId` threw a plain Error | Invalid ids are a plain 404 everywhere | `api.test.js` (404s), `validate.test.js` |
| H8 | The server kept running (and spending) runs when stopped with Ctrl+C | No shutdown handling | SIGINT/SIGTERM cancel in-flight runs, then exit | `lifecycle.test.js` |
| H9 | CLI "No fixes needed" for a page full of flaws | The CLI never ran the Instant Scan | Scan runs next to the agents (`--no-scan` skips); scan findings join the Top fixes | `cli.test.js` (flawed page shows popup/price-image fixes) |
| H10 | `--min-scor 80` (typo) was silently ignored, so a CI gate passed | Hand-rolled argument parsing ignored unknown options | Strict parsing: unknown option, missing value, bad score = exit 2 | `cli.test.js` (exit codes) |
| H11 | CLI upload failure printed only "fetch failed" / "server answered 404" | Generic error text | Names the address, the likely reason, and says where the saved report is | `cli.test.js` (upload failures) |
| H12 | An agent "passed" add-to-cart after adding 2 units (₹998) or reported "$499" for a ₹ price | Pass = the agent's own `success:true` | D28: `wrong-quantity` and `currency-mismatch` findings (never fail a task, never change points) | `scoring.test.js` |
| H13 | A custom task in replay mode showed an unrelated recorded answer as if it were real | The recording of a Nykaa task was replayed for it | D35: `replayNote` on the lane, no answer; the score card says "not run in replay mode" | `replay-mock.test.js`, `api.test.js`, e2e "custom task with emoji" |
| H14 | `evil-nykaa.com` / `nykaa.evil.example` got Nykaa's recording in replay mode | Substring match on the host name | Exact domain (and subdomain) match | `validate-replay.test.js` |
| H15 | Bad input got through: `ftp://`, `javascript:`, `https://user:pass@site`, 5000-character addresses, `localhost`/private addresses (live), `everyMinutes: 1` (about ₹3,000 a day), 21+ watches, bodies that were not JSON (parser internals echoed) | Only a minimal URL check existed | D31: shared validators, plain messages, limits | `validate.test.js`, `api.test.js` |
| H16 | Any website open in the browser could send a body-less POST (cancel, run-now) to `localhost:4000` and start a paid check | CORS only hides answers; the request is still sent | Foreign `Origin` on a state-changing request gets `403` | `api.test.js` (CSRF) |
| H17 | Nothing stopped a runaway script from starting dozens of tests | No limits | 10 starts per minute per client and endpoint (`429`, `Retry-After`), at most 6 tests running | `ratelimit.test.js` |
| H18 | A hung TinyFish connection could freeze a poll loop or a cancel | `fetch` without a time limit | 30 s on every non-streaming call, 60 s to open a stream | `cascade.test.js` (waitForRun limits) |
| H19 | `vite` 5/6 (esbuild dev-server advisory) and `node-cron` 3 (uuid advisory) | Old dependencies | vite 7, node-cron 4: `npm audit` reports 0 vulnerabilities; build and Tailwind plugin unchanged | `npm audit`, `npm run build -w @agentready/web` |
| H20 | "Apply fixes" before/after card linked to a report that "could not be found" | The link used the report's internal `id` field, which differs from the demo file name | Link uses the route id | e2e "Apply fixes and re-test" |
| H21 | Watch form turned `ftp://x.com` into `https://ftp://x.com` and showed a confusing message | Blind `https://` prefix | Only prefixes when no scheme was typed | e2e "Watch: bad address" |
| H22 | (found while building) Rate limit middleware made async route errors hang the request | The async-error wrapper only wrapped a route's first handler | Wrap every handler of a route | `api.test.js` (every validation case answers) |
| H23 | Watch router answered an HTML error page when mounted alone (smoke scripts) | Error handler lived only in `index.js` | One shared `errorHandler` (`errors.js`) also used by the Watch router | `watch-smoke.js` |

### Not done, and why

- **No real TinyFish run.** There is no key here and none was requested. The real HTTP shapes for cancel (`POST /v1/runs/{id}/cancel`) and `CANCELLED` events follow `docs/RESEARCH.md`; they are covered by the fake, not by the real API. The laptop checklist in the final report confirms them for under ₹20.
- **cloudflared tunnel** cannot be installed here; the tunnel address and path handling is unit-tested, the tunnel itself is not.
- **Instant Scan is not cancellable mid-flight**: a stopped test does not wait for it, but the browser session it opened lives until its own 40 s limit.
- **Rate limit key is the client address.** Behind a tunnel everything arrives from one address, so the limit is shared. No `trust proxy` setting yet.
- **No delete for a watch** (pause only), and the screenshot cache in `data/shots` is not size-limited.
- Not tested: Safari/Firefox, a screen reader, slow phones (only a 390 px Chromium viewport).
- `MongoDB`, the CI workflow (stretch in ARCHITECTURE section 16) and Race/Leaderboard pages are still not built (D24).

### Results (2 Nov 2026)

- `npm test`: **108 passed, 0 failed** (engine, server, CLI, web helper; about 1.5 min). `npm run test:e2e`: **30 passed, 0 failed** (real Chromium, 1280 px and 390 px; screenshots are written to `E2E_SHOTS`). `npm audit`: 0 vulnerabilities. All existing scripts pass (score-fixtures, smoke, instant-scan-smoke, fixes-demo, event-count, watch-smoke, watch-confirm-smoke, events-smoke, demo-store test-flaws) and the dashboard builds.
- **Exploratory pass** (Playwright, by hand, no assertions file): double-click and double Enter start exactly one test; refreshing mid-run resumes the lanes and finishes; going offline for 3 s mid-run and back finishes correctly; two tests in two tabs share the agents and each says "another test is running"; stopping one leaves the other running; killing the server mid-run and restarting turns the page into "Test stopped" (lanes Stopped, report `cancelled`); a 5000-character address, spaces, emoji address, upper case and a 1900-character query are handled with plain messages or start normally; a custom task with `<script>`, quotes and a right-to-left mark is shown as text (nothing executes); no console or page errors.
- The e2e suite itself caught three product/test bugs (H20, H21 and a test race) and the API tests caught H22.

### Review (Opus)

Independent review of `git diff origin/main...manideep/engine` (engine, server, web, CLI, docs), then everything re-run by hand. No real TinyFish call, no key.

**Checked:** cancel during queue wait, live stream, poll fallback after a dropped stream, bot-wall retry pause, double cancel, cancel after completion (engine code and tests); queue priority, slot release on throw/cancel, `/api/health` counts (also live in the browser with two tests); private-host blocking (decimal/hex IPs, IPv6, trailing dot, IPv4-mapped IPv6), that it stays off in replay mode and does not touch the CLI (the CLI calls the engine directly with the tunnel address); origin check with the same-origin dashboard, `localhost:5173`, no Origin (curl/CLI upload) and a foreign Origin (403); rate limit only on start-a-test POSTs (not SSE/GET); node-cron 4 `schedule`/`stop`/`destroy` (ran a real schedule, it fires and stops); `.env`-less start and the EADDRINUSE message; the answer checks against realistic answers.

**Found and fixed:**

| # | Severity | Symptom | Fix |
|---|---|---|---|
| R1 | Medium | `wrong-quantity` fired on ordinary answers and step labels: "2 items in stock", "Showing 48 products in Lipstick", "Set of 3 pieces", "Combo of 6 pcs", "Size 50 x 30 cm" (a false finding in the report) | Pack sizes, stock counts, listing pages and sizes are ignored; "items" only count with "added" / "in the cart"; tests for each case (`scoring.test.js`) |
| R2 | Medium | Stop clicked after the agents finished but while the Instant Scan was still closing: the route thought the test was orphaned, wrote `cancelled` and sent "Test stopped", then the real result overwrote it on disk (page and disk disagreed) | `reportJob.isJobActive(id)`; the cancel route answers `cancelled:false, status:'finishing'` and the Stop button resets |
| R3 | Low | A stopped test whose Instant Scan finished after the stop got Top fixes again (D29 says none) | The late scan does not rank fixes on a cancelled report |
| R4 | Low | The 6-test limit was checked before the report existed, so a burst of simultaneous starts could pass it | Starts in flight count toward the limit |
| R5 | Low | Restart recovery could close a test started in the first moments after boot | Recovery skips reports this process is running |
| R6 | Low | `localhost.` (trailing dot) and `[::ffff:127.0.0.1]` passed the private-address check in live mode | Both refused; tests added |
| R7 | Test gap | No test for Stop while polling after a dropped stream | `cascade.test.js`: polling stops, the run is cancelled on TinyFish, no retry |

**Click pass** (Playwright, built dashboard, replay mode, temp data, port 4317, default rate limit): home; demo store, then Apply fixes (91 -> 97, before link opens); Nykaa test with Stop mid-run ("Test stopped", lanes Stopped, report `cancelled`, no Top fixes, survives reload); a second test in another tab says "another test is running" and Stop while queued drops all 4 lanes (health shows 0 queued for it); custom task with HTML in it shows the replay note as text; Watch create, Run now, Pause while checking ("Check stopped", no history row); dark theme; 390 px has no sideways scroll. No page errors. The only console errors are `/api/shot` 404s on the recorded demo-store reports: their screenshots were never saved offline, so replay mode shows the "no screenshot" placeholder (live mode fetches them).

**Remaining risks:** a Stop while the start request is in flight (before TinyFish sends `STARTED`) cannot cancel that run (no run id yet); it ends at its time cap (about ₹20 at most). Watch checks can wait indefinitely behind a steady stream of user tests (by design, D30). Private-address blocking is by name only (a public DNS name pointing at 127.0.0.1 passes), which is fine because the agents and scans run in TinyFish's cloud, not on this server. Only Node 22 was available here; Node 20.19 and 26 were not run.

**Results after the fixes:** `npm test` 109 passed, 0 failed (one new test plus new assertions in existing ones); `npm run test:e2e` 30 passed, 0 failed; every script listed above passes; the dashboard builds.

## 2 Nov 2026: runId while running + .env-independent start test (Manideep)

A real-key test on 2 Nov exposed a gap. The polling script waited for each task's `runId` in `GET /api/tests/:id`, but it stayed `null` until the task finished, so Stop was never sent and the full test ran to the end (₹64.77).

| # | Symptom | Cause | Fix | Proof |
|---|---|---|---|---|
| H24 | A running task showed `runId: null` in the report and SSE until it finished | `onStarted` in `runner.js` set `task.runId` but emitted nothing | `onStarted` now emits a `task-update` (status `running`, with the runId); `reportJob.upsertTask` already copies the whole task, so it lands in the saved report; a bot-wall retry emits its own new runId the same way | `cascade.test.js` (attempt 1 and 2 runIds seen while running), `api.test.js` (running task has runId in `GET /api/tests/:id`) |
| H25 | `lifecycle.test.js` "no .env" test failed on any checkout with a `.env` | It asserted the repo had no `.env` | Server reads `AGENTREADY_ENV_FILE` instead of the repo `.env` when set; the test points it at a missing file, so it proves the same thing on every checkout | `lifecycle.test.js` |

`replay-mock.test.js` (queue priority) now counts each lane once, since a running lane updates twice. `npm test`: 111 passed, 0 failed. `npm run test:e2e`: 30 passed, 0 failed.

## 2 Nov 2026: cancel cost, late STARTED, CLI test isolation (Manideep)

| # | Symptom | Cause | Fix | Proof |
|---|---|---|---|---|
| H26 | A test stopped ~5 s in showed "Agent cost so far ≈ ₹1.41" (1 step) but TinyFish recorded `num_of_steps` 0 for the CANCELLED runs and billed nothing | The cost used our live PROGRESS count | After a stop, `runTask` sends the `cancelled` state first (Stop stays fast), then waits for the cancel calls (`ctx.cancelDone`, max 8 s), reads the run record and uses its `num_of_steps`; a second `task-update` carries the corrected count. Any failure keeps the live count. Not done in replay mode | `cascade.test.js` (cost 0 after stop; live count kept when the record is unreadable) |
| H27 | STARTED arriving just after Stop left that run going until its time cap | `trackRun` on an already cancelled context only added the id to a list nobody read again | `trackRun` on a cancelled context cancels the run on TinyFish at once (never throws); `runTask` also treats a stream that finishes after a stop as cancelled (no retry, no `running` update). Fake gained a per-event `delay` | `cascade.test.js` (late STARTED: POST /cancel for that run id, task `cancelled`, one run only) |
| H28 | CLI tests read the developer's repo `.env`; an `AGENTREADY_SERVER` there would receive test reports | The CLI always loaded the repo `.env` | CLI honours `AGENTREADY_ENV_FILE` (like the server); the test helper sets it to a missing file and blanks `AGENTREADY_SERVER` | `npm test` also run with a temporary root `.env` holding `AGENTREADY_SERVER=http://127.0.0.1:9`: 114 passed |

## 2 Nov 2026: Launch (Race and Leaderboard back in the dashboard)

The project owner asked for the Race and Leaderboard pages to return for the public launch (files owned by Sai Shakti per ARCHITECTURE section 3; changed on request). Replay mode only, no real TinyFish call.

| # | Symptom | Cause | Fix | Proof |
|---|---|---|---|---|
| H29 | No Race or Leaderboard tab; the pages did not exist in `apps/web` | Hidden on 1 Nov | `RacePage.jsx`, `LeaderboardPage.jsx`, tabs in `App.jsx` (hash routes), styles in `styles.css`; tab hidden when `/api/health` `features.RACE` / `LEADERBOARD` is false (`features` is new in health) | e2e: race of 3 recorded sites, leaderboard, flags off |
| H30 | `POST /api/race` in replay mode accepted any site and replayed an unrelated recording | The race route skipped `assertReplayable` | Race refuses sites with no recording (400, the same plain message as a test) | `api.test.js` |
| H31 | No way to stop a race | Only `/api/tests/:id/cancel` existed | `POST /api/race/:id/cancel` stops every lane through the shared `cancelRunningReport` (moved out of the tests route, same behaviour) | `api.test.js`, e2e "Stop race" |
| H32 | Race `rank` ordered by seconds only | Fewest steps is the agreed meaning of "easiest" | Rank by steps, then seconds | `api.test.js` |

Checked by hand (Playwright screenshots, light/dark, 1280 and 390 px, no sideways scroll): race form with chips, race running, race finished with winner, leaderboard. The winner is not highlighted while other sites still run.

## 2 Nov 2026: Launch (npm package, CI Action, badge) (Manideep)

Made the CLI installable by anyone and the CI check reusable for the LinkedIn launch. No real TinyFish call, no key; everything ran in replay mode or with a fake.

| # | Symptom | Cause | Fix | Proof |
|---|---|---|---|---|
| H33 | `@agentready/cli` could not be published: `apps/cli` is private and depends on the unpublished workspace `@agentready/engine` | Monorepo layout | `scripts/pack-cli.mjs` builds `dist/cli` (CLI + engine source copy, two imports rewritten, only `playwright-core` as dependency, README, no recordings). Source `apps/cli` stays private so nobody publishes it by mistake | `pack.test.js`; tarball installed into a temp folder outside the repo: `--version`, `--help`, bad option (2), no key (2), replay mode (2, clear message) |
| H34 | Outside the repo the CLI read a `.env` three folders above the package and `TINYFISH_MOCK=1` crashed (`fixtures` folder missing) | Repo-root paths | Repo-root `.env` only when run inside the repo; `.env` of the current folder always; `fixturesAvailable()` -> clear message, exit 2 | `pack.test.js` (copied out of the repo, no PATH tools) |
| H35 | No `--version`; no badge | Never built | `--version`; `badgeSvg` (engine, pure, escaped), `--badge FILE`, `GET /api/badge/:id.svg` (404 + grey badge for unknown ids, 5 min cache) | `badge.test.js`, `cli.test.js`, `api.test.js` |
| H36 | CI check was a stretch idea with nothing built | | Root `action.yml` (composite), `scripts/ci-report.mjs` (summary + PR comment markdown, escaped), label-gated `.github/workflows/agentready.yml` (preview of the commit else production demo store, skips green without the secret) | `ci-report.test.js`; the action's shell steps run locally against the replay recording (summary and comment produced, fail-below-minimum step exits 1); SIGTERM to the run step cancelled the CLI's run ("Stopped 1 agent run(s)"); both YAML files parse |

Not verifiable here: the workflow and action on a real GitHub runner (checkout, setup-node, github-script, upload-artifact tags; the Vercel deployment lookup; comment editing), `npm publish`, and the `@agentready` npm org. Steps in `docs/PUBLISHING.md`.

## 2 Nov 2026: Launch (README and demo GIF) (Manideep)

Public landing page for the LinkedIn launch. No real TinyFish call; the GIF was recorded in replay mode.

| # | Symptom | Cause | Fix | Proof |
|---|---|---|---|---|
| H37 | Root README was a short internal note; no picture, no per-surface quick start | Written for the hackathon | New README: pitch, three bullets, hero GIF, badge example, quick start (CLI, Action, dashboard, live demo), what it checks, docs, credits, "License: not yet chosen". The CLI line says publishing is in progress (remove it after `npm publish`). Cost line is derived from the demo store runs (₹27 to ₹49 for four tasks) | `docs/media/agentready-demo.gif` (4.7 MB, 880 px, 8 fps, about 25 s: Nykaa test with four lanes, score and top fixes, demo store 91 to 97), recorded with Playwright video + ffmpeg palette GIF against the built server in replay mode; the hero globe (WebGL is black in headless Chromium) and the custom cursor were hidden for the recording only; `docs/media/agentready-badge-example.svg` from `badgeSvg({score:97})` |

## 7 Nov 2026: Phase 2 and 3 of the build plan (Manideep)

Built in replay mode and against the in-process fake TinyFish. No real TinyFish call was made; the claim checks, cost limit and Scan v2 robots reading still need one live run each on the demo store.

| # | Symptom | Cause | Fix | Proof |
|---|---|---|---|---|
| H38 | Two CLI tests failed on a laptop where `node` and `cloudflared` share `/usr/bin` | The tests hid cloudflared with `PATH=<node's folder>` | `nodeOnlyPath()` (server test helpers): a temp folder holding only a `node` link | `npm test` 210/210 |
| H39 | One run decides a public score although agents vary | No repeat runs | Opt-in Confirm results (D41): second run, third on disagreement, majority, `flaky` + `inconsistent-results` | `packages/engine/test/trust.test.js`, `apps/server/test/trust-api.test.js` |
| H40 | Agent answers were never checked against the page (D13 unenforced) | Nothing re-read the named page | Claim checks with TinyFish Fetch (D42) | `trust.test.js` claim tests |
| H41 | No ceiling on what one test or one day can spend | No budget | Estimate endpoint, per-test limit (engine, live), per-day limit (server, 429) (D43) | `trust.test.js` budget stop, `trust-api.test.js` |
| H42 | Fix Report route had no button; no replay, history or PDF | Not built | ReportActions, StepTimeline, SiteHistory, print CSS | checked in the browser on a confirmed replay test; e2e suite |
| H43 | Phone e2e: "Test my site" under the sticky header after leaving a long report | A new hash kept the old scroll depth | `window.scrollTo(0, 0)` on every page change (App.jsx) | e2e phone step |

## 7 Nov 2026: Redesign (Manideep)

Spec `docs/superpowers/specs/2026-11-07-agentready-redesign-design.md`, plan `docs/superpowers/plans/2026-11-07-agentready-redesign.md`. Replay mode only; no TinyFish call.

| # | Symptom | Cause | Fix | Proof |
|---|---|---|---|---|
| H44 | Hackathon look (confetti, comic burst, cursor, globe); colours defined in several files | Built for a demo day | Design system in `apps/web/src/design` (D44), app/site/docs shells, hash routes with redirects | `npm test` 226/226, `npm run test:e2e` 44/44 |
| H45 | Spec accent `#D9480F` and faint grey failed WCAG AA (4.30:1, 3.49:1) | Picked by eye | `#C2410C`, `#6E6C75`/`#8B8C96`; light pass `#17773F`; accent tint 8 % | `apps/web/test/contrast.test.js` |
| H46 | `#/app` was 536 px wide on a 390 px phone | A grid's implicit column grew to its table's minimum width | `grid-template-columns: minmax(0, 1fr)` on single-column grids | e2e phone steps |
| H47 | Leaving the docs kept "… · AgentReady docs" as the tab title | The docs page set the title and never reset it | Reset on unmount | e2e docs step |
