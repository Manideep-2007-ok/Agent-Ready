# AgentReady: Architecture

Single source of truth for Team Mavericks (Manideep Thumu, Sai Shakti Nayak, Akhil Daitha) and every coding agent in this repo.

- **Read with:** [`DECISIONS.md`](DECISIONS.md) (why we chose each thing). The team's research notes, work log, design specs and agent instructions live in a private repo (`Agent-Ready-internal`, linked into a checkout by its `link.sh`); references to `RESEARCH.md` below point there.
- **Origin:** started at Swim with TinyFish (Scaler School of Technology, 1 Nov 2026); now in active development.
- If you change anything here, update this file and `DECISIONS.md` in the same commit and tell the team.

---

## 1. Product in one paragraph

AgentReady tests whether AI agents can actually use a website. Real TinyFish web agents try four everyday tasks on a site in parallel, live on screen. We score each task, show the exact step and screenshot where an agent got stuck, explain why with a fix developers can act on, and detect when a site blocks AI agents entirely. Agent-Ready Watch then re-tests the live site on a schedule and posts an alert when agents can no longer buy. A CLI tests sites still on a developer's laptop. Pitch line: **"Existing tools read the menu. We order the food."**

| Layer | When | Surface | Status |
|---|---|---|---|
| Build | Developer's laptop | CLI `npx agentready http://localhost:3000` via Cloudflare quick tunnel | Built (not yet on npm) |
| Release | Every pull request | CI check (GitHub Action, section 16) | Built |
| Live | After launch | Agent-Ready Watch + Discord/Slack alert | Built |

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
| `apps/web` | `react`, `react-dom`, `vite`, `@vitejs/plugin-react`, `lucide-react` (D44: plain CSS design system, fonts self-hosted, no Tailwind or Magic UI) |
| `apps/cli` | `@agentready/engine`, `dotenv` (uses system `cloudflared`) |
| `apps/demo-store` | none (plain HTML/CSS/JS) |

Every `package.json` has `"type": "module"`.

---

## 3. Repo layout and ownership

```
agent-ready/
  docs/ARCHITECTURE.md          this file
  docs/DECISIONS.md             decision log
  docs/PACK-LIVE-TEST.md        how to try the pack goals on live agents, and the 7 Nov results
  (private, linked in)          AGENTS.md, CLAUDE.md, docs/RESEARCH.md, docs/WORKLOG.md, docs/superpowers/, docs/proofs/
  packages/engine/src/
    types.js                    THE CONTRACT (JSDoc). Team agreement to change
    goals.js                    task goal wording (tested)
    config.js                   reads env: key, max parallel, time cap, mock mode      (Manideep)
    tinyfish.js                 every TinyFish HTTP call                                 (Manideep)
    queue.js                    limits concurrent agent runs to TINYFISH_MAX_PARALLEL; user tests ahead of Watch (Manideep)
    runContext.js               cancel switch per test: abort streams, drop queued tasks, cancel runs on TinyFish (Manideep)
    env.js                      tiny .env loader (a missing .env is fine)               (Manideep)
    runner.js                   runTask, runSiteTest, SSE -> poll fallback, events     (Manideep)
    badge.js                    badgeSvg: flat Agent-Ready score badge (pure)           (Manideep)
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
    design/, shell/, routes.js  design system, app and site shells, hash routes (D44)  (Manideep)
    pages/app|site|docs/        app pages, landing and pricing, docs                    (Sai Shakti / Manideep)
    components/Lane.jsx         one task: status, steps, timer, live iframe           (Akhil)
    components/StepTimeline.jsx steps + screenshots + step replay                     (Sai Shakti)
    components/ScoreCard.jsx    score, bot-wall banner, cost                           (Sai Shakti)
    components/FindingCard.jsx  one finding: problem, fix, pass check; the rest under More (Sai Shakti)
    components/TopFixes.jsx     top 3 fixes                                            (Sai Shakti)
    components/InstantScanCard.jsx                                                      (Akhil)
  apps/cli/bin/agentready.js    CLI                                                     (Akhil)
  apps/demo-store/              index.html, product.html, cart.html, help/.../returns.html, contact.html, flaws.js, style.css, price.png (Akhil)
  action.yml                    reusable GitHub Action (section 16)                    (Manideep)
  .github/workflows/agentready.yml   label-gated PR check                           (Manideep)
  scripts/pack-cli.mjs, ci-report.mjs   npm package builder, report markdown        (Manideep)
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
// output_schema = ANSWER_SCHEMA (goals.js, P2-4): the result is always {success, answer, blocker, stuck_url}. An HTTP 400 naming
// output_schema sends the run again without it, and later runs skip it (D45).

// runner.js
runTask({ url, taskId, customText, mode, proxy }, onEvent, ctx?)   // -> TaskResult (single attempt)
runTaskWithBotWall({ url, taskId, customText }, onEvent, ctx?)     // -> TaskResult with attempts[] (botwall.js)
runSiteTest({ url, tasks?, pack?, customText, source, id, ctx? }, onEvent) // -> SiteReport (status 'cancelled' if stopped)
  // pack = 'shop'|'saas'|'content'|'local' (D40). tasks may come from any pack. No tasks -> the pack's four; no pack -> the pack of the tasks; neither -> shop.
  // The report stores `pack` (and `customText`). In replay mode a task from another pack is not run: replayNote, no points, no findings.

// runContext.js: stopping a test (D29)
cancelReport(reportId, reason)   // -> {found, cancelledRuns, droppedFromQueue}; aborts SSE/polling, drops queued tasks, POST /cancel for in-flight runs
cancelAll(reason)                // every running test (server or CLI shutting down)
createRunContext({id, source})   // the cancel switch itself; runSiteTest makes one per test, Watch shares one across a check + its confirming re-run
// queue.js
enqueue(fn, {priority, group, source}) ; getQueueState()  // -> {maxParallel, running, queued, bySource, groups}

// goals.js (pure): PACKS {shop,saas,content,local} -> {label, siteLabel, tasks (default order), quick (two key tasks)}
// TASK_GOALS / TASK_LABELS for all 16 task ids, buildGoal(taskId, customText), normalisePack('shopping' -> 'shop'),
// packOfTask(id), packForTasks(ids), defaultTasksFor(pack), packSiteLabel(pack)   (D40; shop ids and wording are unchanged)
// packs.js (pure): detectPack(instantScan, pageText?) -> PackId ; autoPack(scan) -> {pack, detected} (shop when the scan read nothing)

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

**Cancelling (D29):** `CANCELLED` is final. A TinyFish run that ends `CANCELLED` (or a Stop click, Ctrl+C, a Watch pause) never starts a bot-wall retry and nothing queued for that test ever starts; in-flight runs are cancelled on TinyFish so they stop costing money. After a stop the cost uses TinyFish's own `num_of_steps` from the run record (read right after the `cancelled` state is sent, best effort, falls back to the live count; H26). A run whose `STARTED` arrives after the stop is cancelled on TinyFish as soon as its id is known (H27). Task status `cancelled`; report status `cancelled` (score 0, no findings: half a test says nothing about the site; the cost of the steps taken still counts). Every non-streaming TinyFish call has a 30 s time limit; the start of a live stream 60 s.

---

## 6. Bot-wall cascade (`botwall.js`)

1. Attempt 1: `mode 'lite'`, `proxy 'off'` (how cloud AI agents arrive).
2. If not `success` AND looks blocked (blocker matches `/access denied|denied|error page|blocked|captcha|something went wrong|blank|empty page|could not load|not available|\(null\)|\b403\b|forbidden/i`, or fewer than 2 steps): attempt 2 `lite` + `IN`.
3. If attempt 2 still looks blocked: attempt 3 `stealth` + `IN`. **Except (D26):** if attempt 2 took 5+ steps, the agent clearly used the site from an Indian home address, so the "block" is the site's own error (e.g. a broken cart's "Something went wrong"): stop, verdict `none`, normal failure finding.
**Refusals (D47):** a `403`/`Forbidden` answer counts as blocked (step 2). A task that "passed" while its answer says the site refused it (`saysRefused`: `403`, forbidden, access denied) is treated as blocked, its borrowed answer is dropped, and the cascade goes on; such a refusal is never a site failure under D26.
4. Verdict per task: passed on 1 -> `none`; passed on 2 -> `blocks-cloud-agents`; passed on 3 -> `blocks-automation`; never -> `site-broken`. Site verdict = worst task verdict.
5. A task that failed for a non-blocking reason (could not find returns) does not re-run.
6. **A `cancelled` task is never "blocked" (D29):** no retry, verdict `none`.

---

## 7. Scoring (`scoring.js`)

Each task max 25, total 100 for any pack (custom task scored separately, not in the 100; a replay placeholder task, see section 17, is not counted either). When fewer than 4 tasks run (CLI `--tasks`, a 1-task Watch), the total is scaled to 100: `round(sum * 4 / tasksRun)`. The point rules are the same for every task in every pack. The 12 new fail findings (D40) use the same shape as the shop ones: a site cause, a fix, a standard and a pass check, never "the agent got confused" (D22). The `saas` and `content` wording passed on live agents (7 Nov, `docs/PACK-LIVE-TEST.md`); the `local` wording is still **untested on live agents** (its test site refused cloud agents). Step and time bands stay the same for every task after the 10-store calibration (D48).

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
| failed, task `find_pricing_plans` (saas) | `pricing-not-found` | high |
| failed, task `reach_signup` (saas) | `signup-not-found` | high |
| failed, task `find_docs` (saas) | `docs-not-found` | medium |
| failed, task `contact_sales` (saas) | `sales-contact-not-found` | medium |
| failed, task `search_topic` (content) | `search-not-found` | medium |
| failed, task `read_article` (content) | `article-not-readable` | high |
| failed, task `find_newsletter` (content) | `newsletter-not-found` | low |
| failed, task `find_author_contact` (content) | `author-contact-not-found` | low |
| failed, task `find_hours` (local) | `hours-not-found` | high |
| failed, task `find_location` (local) | `location-not-found` | high |
| failed, task `find_menu_or_services` (local) | `menu-not-found` | medium |
| failed, task `reach_booking` (local) | `booking-not-found` | high |
| used web search | `needed-web-search` | medium |
| >10 steps | `too-many-steps` | medium |
| >=180 s | `slow` | low |

Answer checks (D28, findings only: they never fail a task or change points; `pointsIfFixed: 0`; wording is "may", cause is a site cause):

| Condition (from the agent's own answer or step labels) | Finding type | Severity |
|---|---|---|
| `add_to_cart` passed and the answer or a step label states a quantity above 1 ("quantity: 2", "2 units", "x3") | `wrong-quantity` | medium |
| `find_price`/`add_to_cart` passed, answer quotes a dollar price with no rupee sign, and the site shows rupees (Instant Scan `priceAsText`, or the agent's own step labels contain ₹/Rs) | `currency-mismatch` | low |

The answer checks are shop-only (they look at `find_price` / `add_to_cart` answers). A `cancelled` task scores 0 points and has no findings.

More findings from the agent's own words and from re-reading the page (findings only, `pointsIfFixed: 0`):

| Condition | Finding type | Severity |
|---|---|---|
| `add_to_cart` passed and 2+ step labels press Add to cart (`countAddToCartPresses`) | `no-cart-feedback` | medium |
| `find_price`/`add_to_cart` passed and the answer or a step label says the price was read from an image/screenshot | `price-in-image` | high |
| confirmed test (D41): the runs disagreed (`task.flaky`) | `inconsistent-results` | medium |
| claim check (D42): the page the agent named does not show what it reported, or the answer names another website | `unconfirmed-claim` | low |

**Confirm results (D41, `confirm.js`, opt-in):** `runSiteTest({confirm:true})` runs each task again with the mode and proxy the bot-wall cascade ended on; if the two disagree, a third run decides. The majority sets the status; the task shown is the first run that agrees with the majority, keeping the cascade's `attempts`/`verdict`. `task.runs[]` lists every run (`runs[0]` = the cascade's), `task.flaky` = they disagreed, `task.confirming = {run, of}` is on live updates while a repeat runs. Not repeated: stopped tasks, replay placeholders, never-started runs, and `blocked` tasks (the cascade already proved the wall).

**Claim checks (D42, `claims.js`):** after the agents finish, every passed task whose answer names a page on this site (and states a checkable fact: return days, a price, an email, a phone number) gets that page read with TinyFish Fetch (free, 20 s cap). `task.claim = {status:'confirmed'|'not-found'|'off-site', url, facts:[{label, found}]}`. An unreadable page leaves no `claim` (unchecked, never a failure). Skipped in replay mode.

`pointsIfFixed` = points the task would gain if the finding disappeared (e.g. failed -> passed in 5 steps = up to +25).
`costRupees = totalSteps * 0.016 * 88` (all bot-wall attempts and all repeat runs included; `taskSteps(t)`).

**Cost estimate and limits (D43):** `estimateCost({tasks, confirm})` -> `{lowRupees, highRupees, worstRupees, rupeesPerStep}` from 4-15 typical steps per task (x2 when confirming; worst = the 3-run cascade, 5 runs when confirming). Each test runs under a cost limit (`BUDGET_PER_TEST_RUPEES`, default 300, 0 = off): the run context counts live steps and cancels the test with reason `budget` when they reach the limit; the report gets `status:'cancelled'`, `stopReason:'budget'`, `budgetRupees`. The server also keeps a daily total (`data/budget/<YYYY-MM-DD>.json`) and refuses new tests with `429` once `BUDGET_PER_DAY_RUPEES` is spent (replay mode is never counted or refused).

---

## 8. Instant Scan (`instantScan.js`), target 15-30 s

Run in parallel:
- **Fetch (free):** `fetchPages([url, origin+'/robots.txt', origin+'/sitemap.xml', origin+'/llms.txt'])` -> `pageTextChars`, `robotsTxt`, `sitemap`, `llmsTxt`, and `aiBlockedAgents` (Scan v2): the AI agents (`AI_AGENTS`: ChatGPT-User, OAI-SearchBot, GPTBot, Claude-User, ClaudeBot, PerplexityBot, Perplexity-User, Google-Extended, CCBot, Applebot-Extended) whose robots.txt group (their own, else `*`) has `Disallow: /` without `Allow: /` (`aiAgentsBlockedByRobots`, pure).
- **Browser API:** `createBrowserSession({url, countryCode:'IN'})` -> `chromium.connectOverCDP(cdpUrl)` -> wait `domcontentloaded` + 3 s -> `page.evaluate` to compute:
  - `unlabelledButtons`: `button, [role=button], a` with no innerText, no `aria-label`, no `title`, no `img[alt]` inside.
  - `imagesWithoutAlt`, `totalImages`.
  - `priceAsText`: `/₹\s?\d|Rs\.?\s?\d|INR\s?\d/` in `document.body.innerText`.
  - `overlayCoveringPage`: any visible element with `position: fixed|sticky` covering >30% of the viewport.
  - `productSchema`: any `script[type="application/ld+json"]` containing `Product` or `Offer`.
  - `framework`: `detectFramework(page)`.
  - `cartLink` (Scan v2): a visible link or button whose text, label, title or address says cart/bag/basket/trolley.
  - `schemaTypes` and `keywordHits` (D40): the schema.org `@type` names in the JSON-LD, and how often words for cart, pricing, sign-up, docs, article, newsletter, hours, booking and menu appear in the page text (each count capped at 20). Same page evaluate, no extra cost. `detectPack(scan)` (`packs.js`, pure) turns them into a pack: product schema, Add to cart or price text score for `shop`; software schema, pricing/sign-up/docs words for `saas`; article schema, blog/newsletter words for `content`; LocalBusiness schema, opening hours, reserve/appointment/menu words for `local`. Highest score wins; no signal or a tie goes to `content`, then `saas`, `local`, `shop` (shop wins only through product signals). A scan that read nothing means "auto" falls back to `shop`.
- Then open one same-origin product link from the home page (`/product`, `/products/`, `/p/`, `/dp/`, 12 s cap) and run the same audit there; counts add up, a problem on either page counts. Many flaws (icon-only Add to cart, price images) live on product pages.
- robots.txt / sitemap that Fetch could not read are reported as `missing`; `error` only when the whole Fetch call failed.
- **Search check (P2-5, D46):** after the page audit, TinyFish Search (free) restricted to the site's own domain looks for the two key pages of its pack (`SEARCH_TOPICS`: shop = return policy, contact page; saas = pricing, docs; content = newsletter, about/contact; local = opening hours, address). `instantScan(url, {pack})` uses the pack it is given, else `detectPack` on the scan. Result `searchFindable: [{topic, found, url}]`; a topic not found is one `not-in-search` finding (low). A failed search says nothing.
- Always `closeBrowserSession` in `finally`. Instant Scan findings: `popup-blocking`, `unlabelled-buttons`, `price-in-image` (no price text but price expected), `no-product-schema` (low severity), and from Scan v2 `robots-blocks-ai-agents` (high when an assistant that visits for a person, `*-User`, is blocked, else medium; needs only Fetch) and `no-cart-link` (medium, shop only; only when the scan measured `cartLink`). Price, product-data and cart findings are shop-only: `instantScanFindings(scan, pack)` never flags a blog, SaaS or local site for "no price" (D40).
- The server stores them as `SiteReport.scanFindings` (`instantScanFindings(scan, pack)`) as soon as the scan finishes. They are not part of the 100-point score (`pointsIfFixed: 0`), are shown in the findings list next to task findings, and can enter the Top 3 (D25).

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
| `GET /api/health` | | `{ok, version, mock, demoStoreUrl, features:{RACE,WATCH,FIXES_AI,CUSTOM_TASK,LEADERBOARD,CLI_UPLOAD}, queue:{maxParallel,running,queued,bySource,groups}, activeTests, budget:{perTestRupees, perDayRupees, spentTodayRupees, testsToday, leftTodayRupees}}` (`demoStoreUrl` is null when not set; the dashboard hides the Race and Leaderboard tabs when their flag is false) |
| `POST /api/tests` | `{url, pack?, tasks?, customTask?, confirm?}` | `{reportId}`; starts Instant Scan + test in background. `confirm: true` runs each task 2-3 times and keeps the majority (D41; anything but a boolean is a 400). Refused with `429` when today's budget is spent (D43). `pack` = `auto`, `shop`, `saas`, `content` or `local` (D40; omitted = shop). `tasks` may be ids from any pack and name the pack themselves. `auto` runs the Instant Scan first, picks the pack (SSE `pack-detected`, report `pack` + `packDetected`; `detectingPack: true` until then) and runs that pack's four tasks. In replay mode only shop tasks are accepted (400 otherwise); `auto` means shop there |
| `GET /api/tests/:id` | | `SiteReport` (includes `scanFindings` once the Instant Scan is done) |
| `GET /api/tests/:id/events` | | SSE `LiveEvent` stream; first message replays current report |
| `POST /api/tests/:id/cancel` | | `{ok, cancelled, status}`; stops a running test or Watch check (idempotent, 404 for unknown ids). Report ends with status `cancelled` |
| `GET /api/tests` | | recent reports (id, url, score, testedAt) |
| `POST /api/instant-scan` | `{url}` | `InstantScan` |
| `GET /api/shot/:runId/:stepId` | | JPEG (cached to `data/shots/`) |
| `POST /api/reports/:id/fixes` | | enriched `SiteReport` |
| `POST /api/reports` | `SiteReport` (from the CLI; `pack` is checked, older `'shopping'` is stored as `shop`) | `201 {reportId}`; keeps the CLI's id, `409` if a web/watch report uses it; flag `CLI_UPLOAD` |
| `POST /api/race` | `{taskId, urls}` (max 3) | `{raceId}`; `taskId` is one task id from any pack |
| `GET /api/race/:id` | | race state: `{id, taskId, lanes:[{url, reportId, report, task}], rank:[{reportId, place}]}`; `rank` = passed sites, fewest steps first, then fastest |
| `POST /api/race/:id/cancel` | | `{ok, cancelled}`; stops every site of the race (idempotent, 404 unknown id). In replay mode `POST /api/race` refuses sites with no recording (400, plain message) |
| `GET /api/watch` | | `Watch[]` |
| `POST /api/watch` | `{url, everyMinutes, pack?, tasks?}` | `Watch`. `pack` (not `auto`) picks the default tasks; `tasks` may come from any pack. The watch stores its `pack` |
| `POST /api/watch/:id/run-now` | | `{reportId}` (409 if a check is already running) |
| `POST /api/watch/:id/cancel` | | `{ok, cancelled}`; stop the running check (the watch stays scheduled) |
| `GET /api/watch/:id/history` | | `SiteReport[]` |
| `PATCH /api/watch/:id` | `{enabled?, everyMinutes?}` | `Watch`. `enabled:false` also cancels the check running right now |
| `POST /api/webhooks/tinyfish` | TinyFish webhook: a finished run, or a Page Monitor run (`fetch_monitor_id`) | `200` |
| `GET /api/estimate` | `?tasks=1-5&confirm=1` | `{tasks, confirm, lowRupees, highRupees, worstRupees, rupeesPerStep, mock, budget}` before a test starts (D43) |
| `GET /api/sites/history` | `?url=` | every finished report of that host (www. ignored, live + cached), oldest first: `{id, url, testedAt, score, botWall, costRupees, source, pack, confirm, tasks:[{taskId,status,numSteps,seconds,points,flaky}], findingTypes}` |
| `GET /api/badge/:id.svg` | | flat SVG badge with the report's score (`image/svg+xml`, `Cache-Control: max-age=300`); a missing or invalid id returns a grey "unknown" badge with status 404 |
| `GET /api/leaderboard` | | reports from `data/cached-demo/leaderboard/` ranked |
| `POST /api/demo-store/flaws` | `{on:boolean}` | used by "Apply fixes": returns the store URL with `?flaws=on|off` |

**Limits and checks (every endpoint):** web address = http/https only, at most 2048 characters, no spaces/control characters, no user name or password, no localhost/private addresses when live (replay mode allows localhost for tests); pack = `auto`/`shop`/`saas`/`content`/`local` (Watch: no `auto`); tasks = non-empty list of task ids from any pack (16 ids; `custom` has its own field); custom task <= 300 characters (emoji fine); Watch `everyMinutes` = whole number 5-1440 and at most 20 watches; ids = letters, digits, `_`, `-` (an invalid id is a plain 404). `POST /api/tests`, `/api/watch`, `/api/watch/:id/run-now`, `/api/instant-scan`, `/api/race`, `/api/reports/:id/fixes`: in-memory rate limit per client address and endpoint, 10 per minute (`RATE_LIMIT_PER_MIN`), then `429` with `Retry-After`; at most 6 tests running at once (`MAX_ACTIVE_TESTS`). Requests with a foreign `Origin` header (another website) are refused with `403`, CORS is local-only and the server listens on `127.0.0.1` unless `HOST` says otherwise. The server loads `.env` itself if it exists (`npm start` never needs one), recovers reports left `running` by a restart (they become `cancelled`), cancels in-flight runs on SIGINT/SIGTERM, and logs one JSON line per test/watch start, finish, cancel and error (`LOG_LEVEL=silent` turns them off).

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
| Agent spend per day | `data/budget/<YYYY-MM-DD>.json` (`{spentRupees, tests}`) |
| Demo backups (committed) | `data/cached-demo/reports/*.json`, `data/cached-demo/leaderboard/*.json` |
| Mock fixtures (committed) | `data/cached-demo/fixtures/*` (real 31 Oct runs) |

Store API: `saveReport(r)`, `getReport(id)`, `listReports()`, `siteHistory(url)`, `getSpend(day)`, `addSpend(day, rupees)`, `saveWatch(w)`, `listWatches()`, `appendWatchHistory(watchId, reportId)`, `getWatchHistory(watchId)`. Swap to MongoDB later by reimplementing these functions only.

---

## 12. Agent-Ready Watch (`watch.js`, `alerts.js`)

- On server start, load watches; schedule each enabled one with `node-cron` (`*/${everyMinutes} * * * *`).
- Check = `runSiteTest({url, tasks, pack, source:'watch'})` (a watch stores its `pack`; older watches have none and count as shop). Background mode: `startRunAsync` + `webhookUrl = PUBLIC_BASE_URL + '/api/webhooks/tinyfish'` if `PUBLIC_BASE_URL` set (expose :4000 with `cloudflared tunnel --url http://localhost:4000`), otherwise `waitForRun` polling.
- Compare with the last report where all watched tasks passed: alert-worthy if a task went pass -> fail, step band got worse, a new finding of severity high/critical appeared, or `botWall` changed.
- If alert-worthy: re-run the failing task once immediately; alert only if it fails again (agents vary).
- Alert text (Discord `{content}`, Slack `{text}`; detect by URL containing `discord.com`; "AI agents" instead of "AI shoppers" for a watch whose pack is not shop):
  `🔴 AgentReady: AI shoppers can't <task label> on <site> since <time>. Last good: <time> (<n> steps). Now: <blocker>. Report: <dashboard link>`
  Recovery: `🟢 AgentReady: <task label> on <site> works again (<time>).`
- Priority: a Watch check waits behind a person's test for a free agent slot (D30). Pausing a watch, or `POST /api/tests/:checkId/cancel`, cancels the running check (no history row, no alert; D29).
- Publish `watch-alert` / `watch-recovered` LiveEvents to dashboard subscribers of `watch:<id>`.
- **Page Monitor (P2-5, D46):** a watch that checks every 120 minutes or less often gets a TinyFish Page Monitor on its URL (hourly, $0.005 a run, `watch.monitorId`) when `PUBLIC_BASE_URL` is set (never in replay). The monitor's webhook (`POST /api/webhooks/tinyfish` with `fetch_monitor_id`) starts the check at once when `outcome` is `changed` and the purpose check does not say it is irrelevant, at most once an hour per watch. Pausing the watch pauses the monitor; a shorter interval deletes it.
- Demo: watch the demo store every 20 min from ~14:00.

---

## 13. Dashboard, site and docs (`apps/web`)

Redesign (D44; the spec is in the private repo): one design system for the app, the public site and the docs. Paper-and-ink surfaces, one ember accent for the main action, Inter + JetBrains Mono (self-hosted), 4 px corners, hairlines, ledgers with numbered rows. Light by default, dark with `data-theme="dark"`.

**Files:** `src/design/` (tokens.css is the only place colours are defined; the kit: Button, Badge, Panel, Ledger, Stat, Tabs, Field, Toast, EmptyState, Skeleton, CodeBlock, Logo, ThemeToggle; `status.js` maps task status and score to badge tone and words), `src/shell/` (AppShell: sidebar workbench; SiteShell: top bar and footer), `src/pages/app|site|docs/`, `src/routes.js`.

**Routes** (hash, no router library; `routes.js` `parseHash`, `redirectFor`, `href`):

| Route | Page |
|---|---|
| `#/` | Landing: URL box that starts a test, a looping replay of the demo store's real runs (`heroDemo.js`, pure, tested), features, CLI/Action, demo-store results, FAQ. Motion (`pages/site/motion.jsx`, no library) pauses off screen and settles under reduced motion |
| `#/pricing` | Free / Watch / Team, no invented prices; cost of a test from `/api/estimate` |
| `#/docs/<slug>` | Ten docs pages; findings (grouped by kind of site, one row each) and task packs come from `src/docs/generated.json` (`npm run docs:data`) |
| `#/app` | Tests home: new test (address, kind of site, own task, Confirm results, cost line), the last 8 tests (Show all for the rest) |
| `#/app/test/<id>[/<beforeId>]` | Report: header (score, band, cost, steps; Re-run, Copy link, Save as PDF, Stop while running), tabs Overview (bot wall, demo before/after, Top 3, task ledger; live lanes only while the test runs or after a stop), Findings (fix report button, cards: problem, fix, pass check, the rest under More), Steps (each task's answer and checks, timeline + replay), History, Scan |
| `#/app/watch`, `#/app/race[/<id>]`, `#/app/leaderboard` | Watch, Race (flag RACE), Leaderboard (flag LEADERBOARD) |
| anything else | 404 page in its area (site top bar, or the app sidebar for `#/app/...`); the address stays as typed. An unknown docs slug says so inside the docs layout |

Old links (`#/test/<id>`, `#/watch`, `#/race`, `#/leaderboard`) printed by the CLI, Watch alerts and READMEs redirect with `location.replace`.

Navigation: `design/progress.js` + `RouteProgress` (top bar: a sweep on every page change, kept going by any open `api()` request except quiet polls), `design/viewTransition.js` (View Transitions crossfade for page and theme changes; the sidebar and top bars keep their place), focus moves to `<main id="main">` after a page change, a title per page, and a Skip to content link that does not touch the hash.

UI rules: plain language, sentence case; a failed load says so (never an empty state that hides it); status always has a word, never colour alone; at most one primary button per view; every screenshot can be enlarged; WCAG AA contrast for every token pair (`apps/web/test/contrast.test.js`); no sideways scroll at 390 px; Save as PDF prints every report tab, each under its own heading.
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
**v2 flaws that change the outcome** (on with `?flaws=all` or one by one; `?flaws=on` still means the four above):
- **qtyTwo:** the product page has a quantity box that starts at 2, so one click puts two units in the cart and the total doubles (`wrong-quantity`).
- **slowCart:** Add to cart takes 4 s, shows no message and leaves the cart count alone until then, so the click looks like it did nothing (`no-cart-feedback`).
`node apps/demo-store/test-flaws.mjs` checks every flaw (`CHROMIUM_PATH=/usr/bin/chromium` to use a system Chromium).
`release.js` (`window.RELEASE = {cartBroken:false}`) simulates a bad deploy for the Watch demo: when `true`, Add to cart shows "Something went wrong" and adds nothing. Flip it, push to `main` (Vercel redeploys), run the watch, then revert. Expect ~30 s per task.

---

## 15. CLI (`apps/cli/bin/agentready.js`)

`npx @agentready/cli <url> [--pack auto|shop|saas|content|local] [--tasks ids|quick|none] [--task "text"] [--json] [--min-score N] [--badge file.svg] [--no-tunnel] [--no-scan] [--version]` (inside the repo: `node apps/cli/bin/agentready.js`)

**Packs and tasks (D40).** `--pack` (default `auto`) says what kind of site it is. `auto` runs the Instant Scan first and prints `Detected: SaaS site — using the saas pack (override with --pack)`; if the scan could not read the page it says so and uses shop; with `--no-scan` and no `--pack` it uses shop and says that too. `--tasks` takes task ids from any pack (default: the four tasks of the pack); explicit ids name the pack themselves, so nothing waits for the scan. `--tasks quick` = the pack's two key tasks (cheap CI runs); `--tasks none` = no pack tasks, only `--task`. `--task "text"` (up to 300 characters, plain text) adds a custom task: it is scored separately, is not part of the 100, and is printed under the table with its answer. `--tasks none` needs `--task` (and cannot be combined with `--min-score`: a custom task alone has no score). Unknown packs or ids, a missing or too long `--task` are usage errors (exit 2). The report stores `pack`, `packDetected` and `customText`; the terminal prints `Tested as: SaaS site (detected)`. In replay mode a pack other than shop is detected but its tasks are not run (see section 17).
1. Check `cloudflared --version`; if missing print install help (`sudo pacman -S cloudflared` / `brew install cloudflared` / Cloudflare docs).
2. Spawn `cloudflared tunnel --no-autoupdate --url <localhost-url>`; read stderr until a `https://*.trycloudflare.com` URL appears (timeout 30 s); wait 5 s for it to become reachable.
3. `runSiteTest({url: tunnelUrl, tasks, pack, customText, source:'cli'})` using `TINYFISH_API_KEY` from env or `.env`; at the same time the **Instant Scan** runs on the same address (skip with `--no-scan`) so pop-ups, unlabelled buttons and prices in images show up as fixes. Ctrl+C / SIGTERM / SIGHUP first cancel the in-flight agent runs (exit 130/143/129), then stop the tunnel; a second Ctrl+C leaves at once.
4. Print: score, a table (task, result, steps, seconds), top 3 fixes, path of saved report JSON. If `AGENTREADY_SERVER` is set, POST the report to it and print the dashboard link.
5. Kill the tunnel on exit (also on Ctrl+C). Exit code 0 ok, 1 if score < `--min-score` or the test could not finish, 2 for usage/setup problems (unknown option, bad address, no key, no cloudflared). An upload failure prints the reason (server down, 404, ...) and keeps the saved report.

---

## 16. CI check (`action.yml`, `.github/workflows/agentready.yml`) and the npm package

**Reusable composite action** (`action.yml` at the repo root, used as `Manideep-2007-ok/Agent-Ready@<ref>`; D37). Inputs: `url` (required), `tinyfish-api-key` (required), `pack` (default `auto`: `auto`, `shop`, `saas`, `content` or `local`), `tasks` (default `quick` = the two key tasks of the pack; or task ids from any pack, or `none`), `task` (a custom task in plain words, up to 300 characters, passed to the CLI as one argument, never through shell text), `min-score` (default `0` = report only), `comment` (default `true`), `github-token`, `cli-version` (empty = build the CLI from the action's own source with `scripts/pack-cli.mjs`; a version = install `@agentready/cli` from npm). Outputs `score`, `passed`. Steps: set up Node 20 -> install CLI -> run `agentready <url> --no-tunnel --json --pack ... --tasks ... [--task ...] --badge` (in the background with a signal trap, so a cancelled job sends the CLI SIGTERM and its TinyFish runs are cancelled) -> `scripts/ci-report.mjs` turns the JSON into markdown (a `Tested as: ...` line names the pack; the job summary + PR comment body starting with the hidden marker `<!-- agentready -->`; agent/site text is escaped) -> `actions/github-script` finds the comment with that marker and edits it, else creates one (a read-only fork token only warns) -> upload report JSON, badge SVG and comment as artifact `agentready-report` -> fail the job if the score is below `min-score` or the test could not finish. Action versions are pinned to exact tags.

**Our workflow** runs only when the PR has the label `agentready` (`labeled`, `synchronize`, `reopened`; a different label being added does not start it) and by `workflow_dispatch` with an optional `url`. Target: the Vercel preview of the PR head commit (GitHub deployments + statuses, waits up to ~5 min, must answer HTTP 200), else the production demo store `https://agent-ready-demo.vercel.app/?flaws=on`. Without the secret `TINYFISH_API_KEY` the job prints a notice and finishes green. Permissions: `contents: read`, `pull-requests: write`, `deployments: read`. Concurrency is per PR with cancel-in-progress. Locked previews (Vercel Deployment Protection) are out of scope: the workflow falls back to production.

**npm package** (D38): `npx @agentready/cli https://site.com --no-tunnel`. `apps/cli` stays `private`; `node scripts/pack-cli.mjs [--pack]` generates `dist/cli` (CLI + a copy of `packages/engine/src` with the imports rewritten; only dependency `playwright-core`). `.env` is read from the current folder (and the repo root only when run inside the repo); replay mode needs recordings that only exist in the repo, so outside it `TINYFISH_MOCK=1` exits 2 with an explanation. Publish steps: [`PUBLISHING.md`](PUBLISHING.md).

**Badge** (D39): `badgeSvg({score, label})` in `packages/engine/src/badge.js`; CLI `--badge file.svg`; server `GET /api/badge/:id.svg`. README snippet: `![Agent-Ready score](agentready-badge.svg)`.

---

## 17. Mock mode (develop without spending credits)

`TINYFISH_MOCK=1` makes `tinyfish.js` replay real recorded runs from `data/cached-demo/fixtures/` with realistic delays (steps every 2-5 s). The recordings cover the four shop tasks only (D40): a task from another pack is not run in replay mode (task `failed` with a `replayNote`, no steps, no points, no findings, left out of the 100; the server refuses such a test with a 400 before it starts). Use it for all UI work. Use real calls only against the demo store or `https://example.com`, and for the final pre-runs.

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
| `BUDGET_PER_TEST_RUPEES` | `300` | engine: a test stops when its agents have spent this much (0 = no limit; D43) |
| `BUDGET_PER_DAY_RUPEES` | `1000` | server: refuse new tests once today's agents spent this much (unset/0 = no limit; D43) |
| `AGENTREADY_ENV_FILE` | path to a file | server and CLI read this file instead of the repo `.env` (a missing file is fine; tests point it at one) |

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

## 20. Git, CI and releases

- `main` always runs. The maintainer may commit to it directly; everyone else works on a branch (`manideep/<x>`, `shakti/<x>`, `akhil/<x>`) and opens a pull request.
- Every push to `main` and every pull request runs `npm test` (`.github/workflows/test.yml`, replay mode, no credits). The paid AgentReady check (section 16) runs only on pull requests labelled `agentready`.
- Rebase on `main` before asking for review; keep pull requests small; never commit `.env` or keys.
- Contributor guide: [`CONTRIBUTING.md`](../CONTRIBUTING.md). Changes per version: [`CHANGELOG.md`](../CHANGELOG.md). Publishing the CLI and the Action: [`PUBLISHING.md`](PUBLISHING.md).
