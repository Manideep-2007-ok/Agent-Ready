# AgentReady: Architecture

Single source of truth for Team Mavericks (Manideep Thumu, Sai Shakti Nayak, Akhil Daitha) and every coding agent in this repo.

- **Read with:** [`DECISIONS.md`](DECISIONS.md) (why we chose each thing) and [`RESEARCH.md`](RESEARCH.md) (everything we tested and learned, with numbers and screenshots).
- **Deadline:** submit by **16:30**, feature freeze **15:30**, today 1 Nov 2026 (Swim with TinyFish, Scaler School of Technology).
- If you change anything here, update this file and `DECISIONS.md` in the same commit and tell the team.

---

## 1. Product in one paragraph

AgentReady tests whether AI agents can actually use a website. Real TinyFish web agents try four everyday tasks on a site in parallel, live on screen. We score each task, show the exact step and screenshot where an agent got stuck, explain why with a fix developers can act on, and detect when a site blocks AI agents entirely. Agent-Ready Watch then re-tests the live site on a schedule and posts an alert when agents can no longer buy. A CLI tests sites still on a developer's laptop. Pitch line: **"Existing tools read the menu. We order the food."**

| Layer | When | Surface | Today |
|---|---|---|---|
| Build | Developer's laptop | CLI `npx agentready http://localhost:3000` via Cloudflare quick tunnel | Build |
| Release | Every pull request | CI check (GitHub Action) | Stretch |
| Live | After launch | Agent-Ready Watch + Discord/Slack alert | Small version |

---

## 2. Stack (summary; reasons in DECISIONS.md)

- **JavaScript (ES modules) + JSX.** No TypeScript, no build step for Node code. Types live as JSDoc in `packages/engine/src/types.js`.
- **MERN without the M by default:** Node 20+, **Express** server, **React 18 + Vite** dashboard. Storage = JSON files through `apps/server/src/store.js` (one module, so MongoDB can be swapped in later).
- **npm workspaces** monorepo: `packages/engine`, `apps/server`, `apps/web`, `apps/cli`, `apps/demo-store`.
- TinyFish over plain `fetch` (Node 20 built-in). Browser API via **playwright-core** `chromium.connectOverCDP`.
- Live updates server -> dashboard with **SSE**. Scheduler **node-cron**. Alerts: **Discord/Slack incoming webhook**.

Dependencies (add only these unless the team agrees):

| Workspace | Dependencies |
|---|---|
| root | `concurrently` (dev) |
| `packages/engine` | `playwright-core` |
| `apps/server` | `express`, `cors`, `dotenv`, `node-cron`, `@agentready/engine` |
| `apps/web` | `react`, `react-dom`, `vite`, `@vitejs/plugin-react`; Magic UI / shadcn pieces (D27): `tailwindcss` + `@tailwindcss/vite`, `motion`, `cobe`, `canvas-confetti`, `lucide-react`, `@radix-ui/react-icons`, `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge` |
| `apps/cli` | `@agentready/engine`, `dotenv` (uses system `cloudflared`) |
| `apps/demo-store` | none (plain HTML/CSS/JS) |

Every `package.json` has `"type": "module"`.

---

## 3. Repo layout and ownership

```
agent-ready/
  AGENTS.md, CLAUDE.md          rules for coding agents
  docs/ARCHITECTURE.md          this file
  docs/DECISIONS.md             decision log
  docs/RESEARCH.md              all research + test evidence
  docs/proofs/*.jpg             screenshots from our 31 Oct tests
  packages/engine/src/
    types.js                    THE CONTRACT (JSDoc). Team agreement to change
    goals.js                    task goal wording (tested)
    config.js                   reads env: key, max parallel, time cap, mock mode      (Manideep)
    tinyfish.js                 every TinyFish HTTP call                                 (Manideep)
    queue.js                    limits concurrent agent runs to TINYFISH_MAX_PARALLEL; user tests ahead of Watch (Manideep)
    runContext.js               cancel switch per test: abort streams, drop queued tasks, cancel runs on TinyFish (Manideep)
    env.js                      tiny .env loader (a missing .env is fine)               (Manideep)
    runner.js                   runTask, runSiteTest, SSE -> poll fallback, events     (Manideep)
    botwall.js                  lite -> IN proxy -> stealth cascade                     (Manideep)
    scoring.js                  points, findings, cost meter                           (Manideep)
    report.js                   build SiteReport, verify claims, top fixes            (Sai Shakti)
    instantScan.js              Fetch + Browser API page audit                         (Akhil)
    fixes.js                    Detailed Fix Report: evidence, framework, AI, templates (Manideep)
    mock.js                     replays recorded runs from fixtures (no credits)        (Manideep)
    index.js                    re-exports the public API
  apps/server/src/
    index.js                    Express app, routes, static, port 4000                  (Sai Shakti)
    config.js                   feature flags                                          (Sai Shakti)
    store.js                    JSON file storage (reports, watches, races)            (Sai Shakti)
    validate.js                 input checks shared by every route (URLs, tasks, ids)  (Manideep)
    rateLimit.js, errors.js, log.js, env.js   rate limit, JSON error handler, one-line JSON logs, .env loader (Manideep)
    events.js                   SSE hub: subscribe(reportId, res), publish(event)      (Akhil)
    routes/tests.js             /api/tests*, /api/shot, /api/instant-scan             (Sai Shakti)
    routes/race.js              /api/race*                                             (Sai Shakti)
    routes/watch.js             /api/watch*                                            (Manideep)
    routes/webhooks.js          /api/webhooks/tinyfish                                 (Manideep)
    watch.js                    cron scheduler, compare, alerts                        (Manideep)
    alerts.js                   Discord/Slack POST                                     (Manideep)
  apps/web/src/
    main.jsx, App.jsx           routing between pages                                 (Sai Shakti)
    api.js                      fetch helpers + useLiveEvents(reportId) SSE hook       (Sai Shakti)
    pages/TestPage.jsx          URL box, Instant Scan, lanes, report                   (Sai Shakti)
    pages/WatchPage.jsx         watches, history, alerts                               (Sai Shakti)
    pages/RacePage.jsx          race lanes                                             (Sai Shakti)
    pages/LeaderboardPage.jsx   ranked cached reports                                  (Sai Shakti)
    components/Lane.jsx         one task: status, steps, timer, live iframe           (Akhil)
    components/StepTimeline.jsx steps + screenshots + step replay                     (Sai Shakti)
    components/ScoreCard.jsx    score, bot-wall banner, cost                           (Sai Shakti)
    components/FindingCard.jsx  one finding, six questions                              (Sai Shakti)
    components/TopFixes.jsx     top 3 fixes                                            (Sai Shakti)
    components/InstantScanCard.jsx                                                      (Akhil)
  apps/cli/bin/agentready.js    CLI                                                     (Akhil)
  apps/demo-store/              index.html, product.html, cart.html, help/.../returns.html, contact.html, flaws.js, style.css, price.png (Akhil)
  data/                         runtime JSON (gitignored) + data/cached-demo/ (committed fixtures and demo backups)
```

**Rule: edit only folders/files you own.** For someone else's file or `types.js`, ask first.

---

## 4. How a test flows (sequence)

```
Dashboard                      Server (Express)                       Engine                         TinyFish
   | POST /api/tests {url}  ->   | create SiteReport(status running)    |                               |
   |                             | store.save(report)                   |                               |
   | <- {reportId}               |                                       |                               |
   | GET /api/tests/:id/events   | events.subscribe(res)                |                               |
   |   (SSE open)                | instantScan(url) ------------------> | Fetch + Browser API --------> |
   | <- instant-scan            <| publish                               |                               |
   |                             | runSiteTest(url, tasks, onEvent) --> | queue -> runTask x4 --------> | run-sse
   | <- streaming-url / step    <| publish(onEvent)                     | <- STREAMING_URL, PROGRESS    |
   |                             |                                       | stream dropped? poll GET run |
   |                             |                                       | botwall re-runs if blocked   |
   | <- task-update             <| publish                               | getRun -> steps+screenshots  |
   |                             | report.build -> scoring -> topFixes  |                               |
   | <- report-complete         <| store.save(report)                   |                               |
   | GET /api/shot/:run/:step -> | engine.getScreenshot (with key) ---> | ----------------------------> | JPEG
```

---

## 5. Engine API (`packages/engine/src/index.js` exports)

All functions are `async` unless noted. `onEvent` receives engine events: `{kind:'streaming-url'|'step'|'task-update'|'attempt', taskId, ...}`.

```js
// tinyfish.js (raw calls; all read the key from config.js)
startRunSSE({ url, goal, mode='lite', proxy='off', maxSeconds }, { onStarted, onStreamingUrl, onProgress, onComplete, signal })
  // POST /v1/automation/run-sse; parses `data: {...}` lines; resolves {runId, status, result, error}
  // throws {code:'STREAM_DROPPED', runId} if the connection breaks before COMPLETE
startRunAsync({ url, goal, mode, proxy, maxSeconds, webhookUrl })   // -> {runId}
getRun(runId)                                                      // -> raw run record (GET /v1/runs/{id})
waitForRun(runId, { intervalMs=3000, timeoutMs })                  // polls getRun until COMPLETED/FAILED/CANCELLED
cancelRun(runId)
getStepScreenshot(runId, stepId)                                   // -> Buffer (image/jpeg)
fetchPages(urls)                                                   // TinyFish Fetch -> [{url, text, error}]
search(query)                                                      // TinyFish Search -> results[]
createBrowserSession({ url, countryCode='IN', timeoutSeconds=60 }) // -> {sessionId, cdpUrl}
closeBrowserSession(sessionId)
getWallet()

// proxy mapping used by startRun*: 'off' -> {enabled:false}; 'IN'|'US' -> {enabled:true,type:'tinyfish',country_code}
// mode mapping: browser_profile = mode ('lite'|'stealth'); agent_config = {max_duration_seconds: maxSeconds}

// runner.js
runTask({ url, taskId, customText, mode, proxy }, onEvent, ctx?)   // -> TaskResult (single attempt)
runTaskWithBotWall({ url, taskId, customText }, onEvent, ctx?)     // -> TaskResult with attempts[] (botwall.js)
runSiteTest({ url, tasks=DEFAULT_TASK_ORDER, customText, source, id, ctx? }, onEvent) // -> SiteReport (status 'cancelled' if stopped)

// runContext.js: stopping a test (D29)
cancelReport(reportId, reason)   // -> {found, cancelledRuns, droppedFromQueue}; aborts SSE/polling, drops queued tasks, POST /cancel for in-flight runs
cancelAll(reason)                // every running test (server or CLI shutting down)
createRunContext({id, source})   // the cancel switch itself; runSiteTest makes one per test, Watch shares one across a check + its confirming re-run
// queue.js
enqueue(fn, {priority, group, source}) ; getQueueState()  // -> {maxParallel, running, queued, bySource, groups}

// scoring.js (pure functions, no I/O)
scoreTask(taskResult)                       // -> {points, findings}
scoreReport(siteReport)                     // -> {score, botWall, costRupees, topFixes}
USD_INR = 88

// instantScan.js
instantScan(url)                            // -> InstantScan

// fixes.js
buildFixReport(siteReport)                  // -> SiteReport with findings enriched (evidence, framework, AI or template)
FIX_TEMPLATES                               // {findingType: {likelyCause, fix, standard, passCheck}}
detectFramework(page)                       // Playwright page -> 'nextjs'|'shopify'|'unknown'

// mock.js
// If TINYFISH_MOCK=1, tinyfish.js functions replay data/cached-demo/fixtures/*.json instead of calling the API.
```

**Parsing the agent answer:** `COMPLETE.result` is usually the JSON object we asked for. If it is under `result.result` or a string, try `JSON.parse`; if that fails, treat `success=false`, `blocker='Agent returned no structured answer'`.

**Turning a run record into `Step[]`:** for each `run.steps[i]` with an `action`, create `{id, label: action, seconds: parseFloat(duration), screenshotUrl: '/api/shot/'+runId+'/'+id, usedWebSearch}`; `usedWebSearch` comes from the matching PROGRESS event (`tinyfish_api === 'search'`), matched by order/label.

**Queue (`queue.js`):** a promise pool. `enqueue(fn)` runs at most `TINYFISH_MAX_PARALLEL` at once; the rest wait. Waiting runs start by **priority** (a person's test, CLI run or race = 0; a Watch check = 1), then first come first served (D30). Running runs are never pre-empted. `cancelGroup(reportId)` drops a test's waiting tasks. `GET /api/health` exposes `queue` (`running`, `queued`, `bySource`, `groups[reportId]`), and the dashboard turns it into the reason a lane waits ("2 agents busy: a Watch check is running" / "another test is running").

**Cancelling (D29):** `CANCELLED` is final. A TinyFish run that ends `CANCELLED` (or a Stop click, Ctrl+C, a Watch pause) never starts a bot-wall retry and nothing queued for that test ever starts; in-flight runs are cancelled on TinyFish so they stop costing money. Task status `cancelled`; report status `cancelled` (score 0, no findings: half a test says nothing about the site; the cost of the steps taken still counts). Every non-streaming TinyFish call has a 30 s time limit; the start of a live stream 60 s.

---

## 6. Bot-wall cascade (`botwall.js`)

1. Attempt 1: `mode 'lite'`, `proxy 'off'` (how cloud AI agents arrive).
2. If not `success` AND looks blocked (blocker matches `/access denied|denied|error page|blocked|captcha|something went wrong|blank|empty page|could not load|not available|\(null\)/i`, or fewer than 2 steps): attempt 2 `lite` + `IN`.
3. If attempt 2 still looks blocked: attempt 3 `stealth` + `IN`. **Except (D26):** if attempt 2 took 5+ steps, the agent clearly used the site from an Indian home address, so the "block" is the site's own error (e.g. a broken cart's "Something went wrong"): stop, verdict `none`, normal failure finding.
4. Verdict per task: passed on 1 -> `none`; passed on 2 -> `blocks-cloud-agents`; passed on 3 -> `blocks-automation`; never -> `site-broken`. Site verdict = worst task verdict.
5. A task that failed for a non-blocking reason (could not find returns) does not re-run.
6. **A `cancelled` task is never "blocked" (D29):** no retry, verdict `none`.

---

## 7. Scoring (`scoring.js`)

Each task max 25, total 100 (custom task scored separately, not in the 100). When fewer than 4 tasks run (CLI `--tasks`, a 1-task Watch), the total is scaled to 100: `round(sum * 4 / tasksRun)`.

| Rule | Points |
|---|---|
| Task passed | +15 |
| Steps <=5 / 6-10 / >10 | +6 / +3 / 0 |
| Time <90 s / <180 s / longer | +4 / +2 / 0 |
| Used web search | -5 (min 0) |
| Passed only via proxy or stealth | task capped at 5 |

Findings created by scoring (others come from Instant Scan):

| Condition | Finding type | Severity |
|---|---|---|
| verdict `blocks-cloud-agents` | `blocks-cloud-agents` | critical |
| verdict `blocks-automation` | `blocks-automation` | critical |
| verdict `site-broken` | `site-broken` | critical |
| failed, task `add_to_cart` | `cart-not-found` | high |
| failed, task `find_price` | `price-not-found` | high |
| failed, task `find_returns` | `returns-not-found` | medium |
| failed, task `find_contact` | `contact-not-found` | medium |
| used web search | `needed-web-search` | medium |
| >10 steps | `too-many-steps` | medium |
| >=180 s | `slow` | low |

Answer checks (D28, findings only: they never fail a task or change points; `pointsIfFixed: 0`; wording is "may", cause is a site cause):

| Condition (from the agent's own answer or step labels) | Finding type | Severity |
|---|---|---|
| `add_to_cart` passed and the answer or a step label states a quantity above 1 ("quantity: 2", "2 units", "x3") | `wrong-quantity` | medium |
| `find_price`/`add_to_cart` passed, answer quotes a dollar price with no rupee sign, and the site shows rupees (Instant Scan `priceAsText`, or the agent's own step labels contain ₹/Rs) | `currency-mismatch` | low |

A `cancelled` task scores 0 points and has no findings.

`pointsIfFixed` = points the task would gain if the finding disappeared (e.g. failed -> passed in 5 steps = up to +25).
`costRupees = totalSteps * 0.016 * 88` (all attempts included).

---

## 8. Instant Scan (`instantScan.js`), target 15-30 s

Run in parallel:
- **Fetch (free):** `fetchPages([url, origin+'/robots.txt', origin+'/sitemap.xml'])` -> `pageTextChars`, `robotsTxt`, `sitemap`.
- **Browser API:** `createBrowserSession({url, countryCode:'IN'})` -> `chromium.connectOverCDP(cdpUrl)` -> wait `domcontentloaded` + 3 s -> `page.evaluate` to compute:
  - `unlabelledButtons`: `button, [role=button], a` with no innerText, no `aria-label`, no `title`, no `img[alt]` inside.
  - `imagesWithoutAlt`, `totalImages`.
  - `priceAsText`: `/₹\s?\d|Rs\.?\s?\d|INR\s?\d/` in `document.body.innerText`.
  - `overlayCoveringPage`: any visible element with `position: fixed|sticky` covering >30% of the viewport.
  - `productSchema`: any `script[type="application/ld+json"]` containing `Product` or `Offer`.
  - `framework`: `detectFramework(page)`.
- Then open one same-origin product link from the home page (`/product`, `/products/`, `/p/`, `/dp/`, 12 s cap) and run the same audit there; counts add up, a problem on either page counts. Many flaws (icon-only Add to cart, price images) live on product pages.
- robots.txt / sitemap that Fetch could not read are reported as `missing`; `error` only when the whole Fetch call failed.
- Always `closeBrowserSession` in `finally`. Instant Scan findings: `popup-blocking`, `unlabelled-buttons`, `price-in-image` (no price text but price expected), `no-product-schema` (low severity).
- The server stores them as `SiteReport.scanFindings` (`instantScanFindings(scan)`) as soon as the scan finishes. They are not part of the 100-point score (`pointsIfFixed: 0`), are shown in the findings list next to task findings, and can enter the Top 3 (D25).

---

## 9. Detailed Fix Report (`fixes.js`)

For each finding:
1. **Evidence:** steps, stuck step screenshot, agent's `blocker` words, `stuckUrl`. If `stuckUrl`, open it with the Browser API and capture the most relevant element (button/link near the task keyword: "cart", "return", "contact", price): `selector`, `htmlSnippet` (first 400 chars of outerHTML), `text`, `ariaLabel`, `box`.
2. **Framework:** `__NEXT_DATA__` script or `self.__next_f` -> `nextjs`; `window.Shopify` -> `shopify`; else `unknown`.
3. **AI write-up** (`LLM_PROVIDER` = gemini | anthropic | openai, key `LLM_API_KEY`): one call per finding, prompt includes evidence + framework, asks for JSON `{rootCause, standard, fixRule, frameworkExample, passCheck}`. Validate all keys exist; on error or timeout (10 s) use `FIX_TEMPLATES[type]`.
4. **Wording rule:** inferred causes are shown as "Likely cause". Never blame the agent ("the agent got confused"); always name a site cause.
5. **Top 3 fixes** = task findings plus `scanFindings`, sorted by severity (critical first), then `pointsIfFixed` desc, one per finding type, so a scan finding ranks after point-scoring findings of the same severity (D25). The server recomputes this after scoring.
6. **Standards** to cite: WCAG 4.1.2 Name, Role, Value (unlabelled controls); WCAG 1.1.1 Non-text Content (images/prices in images); schema.org Product (product data); bot protection allowlisting for verified AI agents (bot-wall findings).

---

## 10. Server API (`apps/server`, port 4000)

| Method + path | Body / query | Returns |
|---|---|---|
| `GET /api/health` | | `{ok, version, mock, demoStoreUrl, queue:{maxParallel,running,queued,bySource,groups}, activeTests}` (`demoStoreUrl` is null when not set) |
| `POST /api/tests` | `{url, tasks?, customTask?}` | `{reportId}`; starts Instant Scan + test in background |
| `GET /api/tests/:id` | | `SiteReport` (includes `scanFindings` once the Instant Scan is done) |
| `GET /api/tests/:id/events` | | SSE `LiveEvent` stream; first message replays current report |
| `POST /api/tests/:id/cancel` | | `{ok, cancelled, status}`; stops a running test or Watch check (idempotent, 404 for unknown ids). Report ends with status `cancelled` |
| `GET /api/tests` | | recent reports (id, url, score, testedAt) |
| `POST /api/instant-scan` | `{url}` | `InstantScan` |
| `GET /api/shot/:runId/:stepId` | | JPEG (cached to `data/shots/`) |
| `POST /api/reports/:id/fixes` | | enriched `SiteReport` |
| `POST /api/reports` | `SiteReport` (from the CLI) | `201 {reportId}`; keeps the CLI's id, `409` if a web/watch report uses it; flag `CLI_UPLOAD` |
| `POST /api/race` | `{taskId, urls}` (max 3) | `{raceId}` |
| `GET /api/race/:id` / `.../events` | | race state / SSE |
| `GET /api/watch` | | `Watch[]` |
| `POST /api/watch` | `{url, everyMinutes, tasks}` | `Watch` |
| `POST /api/watch/:id/run-now` | | `{reportId}` (409 if a check is already running) |
| `POST /api/watch/:id/cancel` | | `{ok, cancelled}`; stop the running check (the watch stays scheduled) |
| `GET /api/watch/:id/history` | | `SiteReport[]` |
| `PATCH /api/watch/:id` | `{enabled?, everyMinutes?}` | `Watch`. `enabled:false` also cancels the check running right now |
| `POST /api/webhooks/tinyfish` | TinyFish webhook | `200` |
| `GET /api/leaderboard` | | reports from `data/cached-demo/leaderboard/` ranked |
| `POST /api/demo-store/flaws` | `{on:boolean}` | used by "Apply fixes": returns the store URL with `?flaws=on|off` |

**Limits and checks (every endpoint):** web address = http/https only, at most 2048 characters, no spaces/control characters, no user name or password, no localhost/private addresses when live (replay mode allows localhost for tests); tasks = non-empty list of the 4 task ids; custom task <= 300 characters (emoji fine); Watch `everyMinutes` = whole number 5-1440 and at most 20 watches; ids = letters, digits, `_`, `-` (an invalid id is a plain 404). `POST /api/tests`, `/api/watch`, `/api/watch/:id/run-now`, `/api/instant-scan`, `/api/race`, `/api/reports/:id/fixes`: in-memory rate limit per client address and endpoint, 10 per minute (`RATE_LIMIT_PER_MIN`), then `429` with `Retry-After`; at most 6 tests running at once (`MAX_ACTIVE_TESTS`). Requests with a foreign `Origin` header (another website) are refused with `403`, CORS is local-only and the server listens on `127.0.0.1` unless `HOST` says otherwise. The server loads `.env` itself if it exists (`npm start` never needs one), recovers reports left `running` by a restart (they become `cancelled`), cancels in-flight runs on SIGINT/SIGTERM, and logs one JSON line per test/watch start, finish, cancel and error (`LOG_LEVEL=silent` turns them off).

The server also serves the built dashboard (`apps/web/dist`, from `npm run build -w @agentready/web`) at `/`, so links like `http://localhost:4000/#/test/<id>` from the CLI and Watch alerts open without Vite.
SSE format: headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`; each message `data: ${JSON.stringify(event)}\n\n`; send `: ping\n\n` every 15 s.
Errors: JSON `{error: "plain message"}` with 4xx/5xx; never leak the API key in errors.
Feature flags (`apps/server/src/config.js`): `RACE, WATCH, FIXES_AI, CUSTOM_TASK, LEADERBOARD, CLI_UPLOAD` booleans from env `FEATURE_*` (default true).

---

## 11. Storage (`apps/server/src/store.js`)

JSON files, written atomically (write temp file, then rename):

| Data | Path |
|---|---|
| Reports | `data/reports/<reportId>.json` |
| Watches | `data/watch/watches.json` |
| Watch history | `data/watch/<watchId>.json` (array of reportIds) |
| Races | `data/races/<raceId>.json` |
| Screenshot cache | `data/shots/<runId>_<stepId>.jpg` |
| Demo backups (committed) | `data/cached-demo/reports/*.json`, `data/cached-demo/leaderboard/*.json` |
| Mock fixtures (committed) | `data/cached-demo/fixtures/*` (real 31 Oct runs) |

Store API: `saveReport(r)`, `getReport(id)`, `listReports()`, `saveWatch(w)`, `listWatches()`, `appendWatchHistory(watchId, reportId)`, `getWatchHistory(watchId)`. Swap to MongoDB later by reimplementing these functions only.

---

## 12. Agent-Ready Watch (`watch.js`, `alerts.js`)

- On server start, load watches; schedule each enabled one with `node-cron` (`*/${everyMinutes} * * * *`).
- Check = `runSiteTest({url, tasks, source:'watch'})`. Background mode: `startRunAsync` + `webhookUrl = PUBLIC_BASE_URL + '/api/webhooks/tinyfish'` if `PUBLIC_BASE_URL` set (expose :4000 with `cloudflared tunnel --url http://localhost:4000`), otherwise `waitForRun` polling.
- Compare with the last report where all watched tasks passed: alert-worthy if a task went pass -> fail, step band got worse, a new finding of severity high/critical appeared, or `botWall` changed.
- If alert-worthy: re-run the failing task once immediately; alert only if it fails again (agents vary).
- Alert text (Discord `{content}`, Slack `{text}`; detect by URL containing `discord.com`):
  `🔴 AgentReady: AI shoppers can't <task label> on <site> since <time>. Last good: <time> (<n> steps). Now: <blocker>. Report: <dashboard link>`
  Recovery: `🟢 AgentReady: <task label> on <site> works again (<time>).`
- Priority: a Watch check waits behind a person's test for a free agent slot (D30). Pausing a watch, or `POST /api/tests/:checkId/cancel`, cancels the running check (no history row, no alert; D29).
- Publish `watch-alert` / `watch-recovered` LiveEvents to dashboard subscribers of `watch:<id>`.
- Demo: watch the demo store every 20 min from ~14:00.

---

## 13. Dashboard (`apps/web`)

Pages (simple tab bar, no auth): **Test**, **Watch**, **Race**, **Leaderboard**.

Test page layout (top to bottom):
1. URL input + "Test my site" + optional custom task box.
2. Instant Scan card (appears in ~30 s).
3. Score card: score /100, bot-wall banner (red if blocked), cost in rupees, "Top 3 fixes".
4. Four lanes side by side (2x2 on small screens): task name, status chip (Waiting / Running / Passed / Failed / Blocked), timer, latest step label, live iframe (`streamingUrl`) with fallback to the latest screenshot.
5. Findings: one card per finding answering six questions (What happened? Where exactly? Why does it break agents? How bad? How to fix? How do we know it's fixed?).
6. Step timeline with screenshots and a "Replay" button (slideshow, 1.5 s per step).

UI rules: plain language, no jargon; colors red/amber/green plus text labels; every screenshot clickable to enlarge; buttons disabled while running.
`vite.config.js` proxies `/api` to `http://localhost:4000`.

---

## 14. Demo store (`apps/demo-store`)

Plain HTML/CSS/JS deployed on Vercel (static). Pages: `index.html` (products), `product.html`, `cart.html` (localStorage cart), `contact.html`, returns policy at `help/policies/shipping/more/returns.html`.
`flaws.js` reads `?flaws=on|off` (or individual `popup, priceImg, iconCart, hiddenReturns`), saves to localStorage, applies on every page:
- **popup:** full-screen fixed overlay, no close button.
- **priceImg:** price rendered only as `price.png` image, no text, no alt.
- **iconCart:** Add to cart is an icon-only `<button>` with no text and no `aria-label`; the header cart link is an icon with a number, no "Cart" text.
- **hiddenReturns:** no "Returns" link in the footer; reachable only via Help -> Policies -> Shipping -> More shipping information -> "Other information" -> "Read the full document" (vague labels, one page deeper than with flaws off).
With flaws off: normal text price, labelled button, footer Returns link, no popup.
`release.js` (`window.RELEASE = {cartBroken:false}`) simulates a bad deploy for the Watch demo: when `true`, Add to cart shows "Something went wrong" and adds nothing. Flip it, push to `main` (Vercel redeploys), run the watch, then revert. Expect ~30 s per task.

---

## 15. CLI (`apps/cli/bin/agentready.js`)

`npx agentready <localhost-url> [--tasks find_price,add_to_cart] [--json] [--min-score N] [--no-tunnel] [--no-scan]`
1. Check `cloudflared --version`; if missing print install help (`sudo pacman -S cloudflared` / `brew install cloudflared` / Cloudflare docs).
2. Spawn `cloudflared tunnel --no-autoupdate --url <localhost-url>`; read stderr until a `https://*.trycloudflare.com` URL appears (timeout 30 s); wait 5 s for it to become reachable.
3. `runSiteTest({url: tunnelUrl, tasks, source:'cli'})` using `TINYFISH_API_KEY` from env or `.env`; at the same time the **Instant Scan** runs on the same address (skip with `--no-scan`) so pop-ups, unlabelled buttons and prices in images show up as fixes. Ctrl+C / SIGTERM / SIGHUP first cancel the in-flight agent runs (exit 130/143/129), then stop the tunnel; a second Ctrl+C leaves at once.
4. Print: score, a table (task, result, steps, seconds), top 3 fixes, path of saved report JSON. If `AGENTREADY_SERVER` is set, POST the report to it and print the dashboard link.
5. Kill the tunnel on exit (also on Ctrl+C). Exit code 0 ok, 1 if score < `--min-score` or the test could not finish, 2 for usage/setup problems (unknown option, bad address, no key, no cloudflared). An upload failure prints the reason (server down, 404, ...) and keeps the saved report.

---

## 16. CI check (stretch, `.github/workflows/agentready.yml`)

On `pull_request`: wait for the preview URL (Vercel deployment status) -> run `node apps/cli/bin/agentready.js <previewUrl> --min-score 80 --json` without a tunnel (`--no-tunnel`) -> post a PR comment with the score. Needs repo secret `TINYFISH_API_KEY`. Locked previews (Vercel Deployment Protection) are out of scope today.

---

## 17. Mock mode (develop without spending credits)

`TINYFISH_MOCK=1` makes `tinyfish.js` replay real recorded runs from `data/cached-demo/fixtures/` with realistic delays (steps every 2-5 s). Use it for all UI work. Use real calls only against the demo store or `https://example.com`, and for the final pre-runs.

---

## 18. Environment variables (`.env` at repo root, never committed)

| Name | Example | Used by |
|---|---|---|
| `TINYFISH_API_KEY` | `sk-tinyfish-...` | engine |
| `TINYFISH_MAX_PARALLEL` | `2` | engine queue |
| `TINYFISH_MAX_DURATION_SECONDS` | `150` | engine |
| `TINYFISH_MOCK` | `1` while building UI | engine |
| `PUBLIC_BASE_URL` | `https://xyz.trycloudflare.com` | Watch webhooks |
| `ALERT_WEBHOOK_URL` | Discord/Slack webhook | alerts |
| `LLM_PROVIDER` / `LLM_API_KEY` | `gemini` / key | fixes |
| `DEMO_STORE_URL` | `https://agentready-demo.vercel.app` | server, dashboard |
| `PORT` | `4000` | server |
| `FEATURE_RACE` etc. | `true` | server flags |
| `HOST` | `127.0.0.1` | server listen address (local only by default) |
| `RATE_LIMIT_PER_MIN`, `MAX_ACTIVE_TESTS` | `10`, `6` | server limits |
| `LOG_LEVEL` | `silent` | turn the JSON log lines off |
| `AGENTREADY_DATA_DIR` | temp folder | where reports/watches are stored (tests use a temp folder) |
| `AGENTREADY_ENV_FILE` | path to a file | server reads this file instead of the repo `.env` (a missing file is fine; tests point it at one) |

---

## 19. Running locally

```bash
npm install
cp .env.example .env            # fill TINYFISH_API_KEY; TINYFISH_MOCK=1 for UI work
npm run dev                     # server :4000 + dashboard :5173 (concurrently)
npm start                       # server only (serves the built dashboard); works with no .env
npm test                        # unit + API + CLI tests (node:test, replay mode, no credits)
npm run test:e2e                # click tests in real Chromium (builds the dashboard first)
npm run dev -w @agentready/server
npm run dev -w @agentready/web
node apps/cli/bin/agentready.js http://localhost:5500   # CLI against a local site
npx serve apps/demo-store       # demo store locally (deploy to Vercel for agents)
```

---

## 20. Timeline, cut-line, git

| Time | Goal |
|---|---|
| 11:30-12:30 | One task end to end (engine -> server -> dashboard) in mock mode, then one real run on the demo store. Demo store v1 on Vercel. |
| 12:30-13:30 | 4 tasks, lanes, scoring, screenshots, bot-wall, Instant Scan |
| 13:30 | **Checkpoint:** full real test of Nykaa works. Merge to `main`. |
| 13:30-15:00 | Watch (demo store watched from ~14:00), Fix Report + Top 3, one-click fix, CLI, Race, Cost Meter, custom task, step replay |
| 15:00-15:30 | Pre-run India snapshot (6-8 stores) + 1 race, save to `data/cached-demo/`. CI only if solid. |
| 15:30 | **Feature freeze** |
| 15:30-16:30 | Bug fixes, backup video, rehearse twice, **submit by 16:30** |

Must ship: core test, lanes, scoring, bot-wall, Instant Scan, demo store + Watch alert.
Drop order if late: CI -> Race -> custom task -> India snapshot -> step replay -> AI write-up (keep templates) -> live CLI run.
Never drop: cached backup runs and the backup video.

Git: `main` always demo-able; branches `manideep/<x>`, `shakti/<x>`, `akhil/<x>`; small PRs; merge at least hourly; rebase on `main` first; never commit `.env` or keys.
