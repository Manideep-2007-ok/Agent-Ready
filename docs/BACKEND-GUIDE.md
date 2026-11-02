# AgentReady backend guide (for a student teammate)

This explains, in plain language, what happens from the moment someone clicks **Test my site** until the lanes and the score appear on screen. Read it once from top to bottom, then keep it open next to the code. File names are relative to the repo root. Nothing here needs a TinyFish key: run everything with `TINYFISH_MOCK=1` (it replays real recordings).

---

## 1. The big picture in one minute

```
 Browser (React dashboard)                 Express server (apps/server)                 Engine (packages/engine)            TinyFish
 ────────────────────────                  ───────────────────────────                  ─────────────────────────           ────────
 1. click "Test my site"
    POST /api/tests {url}  ───────────►  2. check the input, save a "running" report,
                                            send back {reportId} at once  ◄─────────
 3. open  GET /api/tests/<id>/events
    (a live SSE stream stays open) ◄───  4. in the background start the test ───────►  5. runSiteTest: one task per lane
                                                                                          each task waits in the QUEUE
                                                                                          (only 2 agents at a time)
                                                                                       6. runTask ──── POST run-sse ──────────►  a cloud agent browses the site
                                                                                          ◄──── live events: STARTED, PROGRESS
 7. lane shows each new step  ◄──────  events.publish(...) turns every engine       ◄── onEvent(step / task-update)
                                         event into a message for the browser
                                                                                       8. bot wall? retry with a proxy, then stealth
                                                                                       9. scoring: points + findings + top fixes
10. score card, findings  ◄──────────  save the final report, publish "report-complete"
```

Three ideas carry the whole design:

1. **The server answers fast and works in the background.** `POST /api/tests` returns a `reportId` in milliseconds. The test itself takes minutes, so progress travels over a second connection (SSE, see section 5).
2. **The engine is the only place that talks to TinyFish** (`packages/engine/src/tinyfish.js`). The server and the CLI both call the same engine.
3. **Scoring is plain code, not AI.** The same run always gives the same score (`packages/engine/src/scoring.js`).

---

## 2. Folder map (what lives where)

| Folder | What it is | Start reading at |
|---|---|---|
| `packages/engine/src` | Everything about running agent tasks, retries, scoring | `runner.js` |
| `apps/server/src` | Express API, storage, live events, Watch scheduler | `index.js`, `routes/tests.js`, `reportJob.js` |
| `apps/web/src` | The React dashboard | `api.js`, `pages/TestPage.jsx` |
| `apps/cli/bin/agentready.js` | `npx agentready <url>`: same engine, no server needed | the file itself |
| `apps/demo-store` | A tiny shop with switchable flaws, used for demos | `flaws.js` |
| `data/cached-demo` | Recorded real runs (the "replay" mode uses them) | `fixtures/` |
| `docs/` | Architecture, decisions, research, this guide | `ARCHITECTURE.md` |

---

## 3. The journey, file by file

### Step 1: the click (browser)
`apps/web/src/pages/TestPage.jsx` calls `startTest(url)` from `apps/web/src/api.js`, which does `fetch('/api/tests', {method:'POST', body:{url}})`. When the answer `{reportId}` arrives, `navigate('test', id)` changes the address bar to `#/test/<id>`. The page lives in the URL, so a refresh or a shared link opens the same test.

### Step 2: checking the input (server)
`apps/server/src/index.js` builds the Express app. A request passes through, in order:
1. CORS and the **origin check** (a request from another website is refused),
2. `express.json` (reads the body, 1 MB limit),
3. the **rate limit** (`rateLimit.js`, 10 starts per minute),
4. the route handler in `routes/tests.js`.

The handler calls `parseSiteUrl`, `parseTasks`, `parseCustomTask` from `validate.js`. They throw a small error with a status (`httpError(400, "plain message")`); the one error handler in `errors.js` turns that into `{error: "plain message"}`. That is why the dashboard can show the message as it is.

### Step 3: creating the report (server)
`startReport()` in `reportJob.js` makes a `SiteReport` object with `status: 'running'`, saves it with `store.saveReport` (a JSON file in `data/reports/`), starts the work **without waiting for it**, and returns the id.

### Step 4: the live stream (server)
The dashboard opens `GET /api/tests/:id/events`. `events.js` keeps a map "report id → open browser connections". `subscribe()` registers a connection, `publish(event)` writes `data: {...}\n\n` to every connection of that report. On connect the route first **replays** what already happened (saved tasks, scan, final report), so a refreshed page catches up.

### Step 5: the background job (server)
`runInBackground()` in `reportJob.js` does two things at once:
* starts the **Instant Scan** (`engine.instantScan`), a quick page audit,
* calls `engine.runSiteTest(...)` with an `onEvent` callback. Every engine event (`task-update`, `step`, `streaming-url`) is saved into the report and sent out with `events.publish`.

When `runSiteTest` finishes it saves the final report and publishes `report-complete`.

### Step 6: one test = one task per lane (engine)
`runSiteTest()` in `runner.js` makes a **RunContext** (the cancel switch, section 6), shows every lane as "queued", then starts all tasks together with `Promise.all`. Each task goes through `runTaskWithBotWall` and finally `scoreReport` turns the results into a score.

### Step 7: waiting for a free agent (engine)
`enqueue()` in `queue.js`. The TinyFish account allows 2 agents at once, so tasks wait their turn. Waiting tasks are ordered by **priority** (a person's test first, a Watch check second), then first come first served. This is what the lane means by "Waiting for an agent". `getQueueState()` reports who holds the slots; `GET /api/health` publishes it, and the dashboard turns it into "2 agents busy: a Watch check is running".

### Step 8: one agent run (engine)
`runTask()` in `runner.js` builds the goal text (`goals.js`: the task plus a fixed answer-format suffix that must not change), calls `startRunSSE()` in `tinyfish.js`, and reads the events:
* `STARTED` gives the run id, `STREAMING_URL` the live browser view,
* every `PROGRESS` is one step (a short label like "Click the cart icon"),
* `COMPLETE` carries the agent's JSON answer.

If the stream breaks before `COMPLETE`, the code polls `GET /v1/runs/{id}` every 3 seconds instead (`waitForRun`). The run kept going on TinyFish's side, so this recovers the result.
**`COMPLETED` is not success.** The task passes only if the agent's own JSON says `success: true`.

### Step 9: bot walls (engine)
`runTaskWithBotWall()` in `botwall.js`. Attempt 1 arrives like a cloud AI agent (no proxy). If it failed **and looks blocked** (words like "access denied", or under 2 steps), attempt 2 uses an Indian home-network proxy, attempt 3 adds stealth mode. Which attempt finally passes decides the verdict: `none`, `blocks-cloud-agents`, `blocks-automation`, `site-broken`. Two exceptions you must know:
* **A cancelled run is never "blocked"** (it also has few steps!). No retry, nothing new starts.
* If the India-proxy attempt got 5 or more steps and still failed, it is the site's own error, not a wall (decision D26).

### Step 10: scoring (engine)
`scoreTask()` in `scoring.js` gives up to 25 points (passed 15, few steps, fast, no web search) and creates **findings**: plain-language problems, each with a site cause, a fix and a "how do we know it's fixed" check. `rankFixes()` picks the Top 3. `scoreReport()` adds the tasks up to 100, works out the cost (`steps × $0.016 × 88`) and the worst bot-wall verdict. Answer checks (`wrong-quantity`, `currency-mismatch`) only add findings; they never fail a task.

### Step 11: the dashboard follows along
`useLiveEvents(reportId)` in `apps/web/src/api.js` opens the `EventSource` and feeds every message to a **reducer** that keeps `{tasks, scan, report, connection}`. `Lane.jsx` draws one task from that state. When `report-complete` arrives the reducer stores the final report and `ScoreCard.jsx` / `FindingCard.jsx` appear.

---

## 4. The 10 most important functions

| # | Function (file) | What it does, in one breath |
|---|---|---|
| 1 | `startReport` (`apps/server/src/reportJob.js`) | Creates and saves the "running" report, starts the background job, returns the id immediately. Also refuses a flood (max 6 tests at once). |
| 2 | `runInBackground` (same file) | Runs the Instant Scan and the engine test side by side, saves every update, publishes live events, merges the final result, never lets one failure crash the server. |
| 3 | `runSiteTest` (`packages/engine/src/runner.js`) | The heart of a test: makes the cancel switch, starts every task, waits for all, scores the report, marks it `cancelled` if it was stopped. |
| 4 | `runTask` (same file) | One agent attempt: goes through the queue, streams steps, falls back to polling, turns the agent's answer into a `TaskResult` (`passed` / `failed` / `blocked` / `cancelled`). Never throws. |
| 5 | `enqueue` (`packages/engine/src/queue.js`) | The 2-slot waiting line with priorities (people before Watch) and `cancelGroup` to drop a test's waiting tasks. |
| 6 | `startRunSSE` + `parseSSE` (`packages/engine/src/tinyfish.js`) | The only code that starts a TinyFish run. Reads the live event stream, handles chunks split in the middle of a message, throws `STREAM_DROPPED` if the connection breaks. |
| 7 | `runTaskWithBotWall` (`packages/engine/src/botwall.js`) | The three-attempt cascade (no proxy, India proxy, stealth) and the verdict. Stops at once when cancelled. |
| 8 | `scoreTask` / `scoreReport` / `rankFixes` (`packages/engine/src/scoring.js`) | Points, findings, Top 3, cost. Pure functions: easy to test, same answer every time. |
| 9 | `RunContext.cancel` / `cancelReport` (`packages/engine/src/runContext.js`) | The Stop button's engine side: aborts live streams, drops queued tasks, and tells TinyFish to cancel the runs that are already going so they stop costing money. |
| 10 | `publish` / `subscribe` (`apps/server/src/events.js`) | The live-update hub: browsers subscribe under a report id, the server publishes events to it. Writes never throw, even if a browser disappeared. |

Honourable mentions: `runCheck` in `apps/server/src/watch.js` (one Watch check: run, compare with the last good report, alert only after a confirming re-run), `parseSiteUrl` in `validate.js` (all the address rules), `buildFixReport` in `fixes.js` (turns findings into the detailed fix write-up).

---

## 5. SSE in two minutes

SSE ("server-sent events") is a normal HTTP request that the server never finishes. It keeps writing lines like

```
data: {"type":"step","reportId":"rep_...","taskId":"find_price","step":{...}}

```

(a blank line ends a message). The browser's `EventSource` reads them and calls `onmessage`. It is one-way (server to browser), which is all we need, and `EventSource` reconnects by itself if the line drops. The server also writes `: ping` every 15 seconds so proxies do not close an idle line.

---

## 6. How "Stop" works (cancel flow)

* The button calls `POST /api/tests/:id/cancel`. The route calls `engine.cancelReport(id)`.
* Every test owns one **RunContext** (`runContext.js`): an `AbortController`, the set of TinyFish run ids in flight, a `cancelled` flag.
* `ctx.cancel()` does three things, in this order:
  1. sets `cancelled`, so nothing new can start,
  2. `cancelGroup(id)` removes the test's tasks from the queue,
  3. aborts the controller (live streams and polling stop) and calls TinyFish `POST /v1/runs/{id}/cancel` for each run still going.
* `runTask` sees the abort and returns a task with status `cancelled`. `runTaskWithBotWall` sees `cancelled` and does **not** retry. `runSiteTest` marks the report `cancelled` (score 0, no findings, cost kept).
* If TinyFish itself ends a run with `CANCELLED` (someone clicked cancel on their side), the same rule applies: it is final, the rest of the test stops.
* The CLI uses the same engine function on Ctrl+C. The server does the same on shutdown. Pausing a Watch cancels its running check.

---

## 7. Where each kind of data lives

| Data | Where | Written by |
|---|---|---|
| Reports | `data/reports/<id>.json` | `store.js` (atomic: write a temp file, then rename) |
| Watches and their history | `data/watch/` | `store.js` |
| Screenshots | `data/shots/` (cached copies) | `GET /api/shot/:runId/:stepId` |
| Recordings used by replay mode | `data/cached-demo/fixtures/` | committed to git |
| Demo reports | `data/cached-demo/reports/` | committed to git |

`data/` (except `cached-demo`) is not committed. Tests use a temporary folder through `AGENTREADY_DATA_DIR`.

---

## 8. Try it yourself (no key, no cost)

```bash
npm install
TINYFISH_MOCK=1 npm start            # server on :4000 (serves the built dashboard; run `npm run build` once first)
# in another terminal
curl -s -X POST localhost:4000/api/tests -H 'content-type: application/json' -d '{"url":"nykaa.com"}'
curl -s localhost:4000/api/health                      # watch "queue" fill up while the test runs
curl -N localhost:4000/api/tests/<reportId>/events     # the live stream, raw
curl -s -X POST localhost:4000/api/tests/<reportId>/cancel
```

Read the logs: one JSON line per event (`test.start`, `test.finish`, `test.cancel`, `watch.start` ...). Run `npm test` (about two minutes) to see every behaviour proven, and `npm run test:e2e` to watch the browser tests click through the dashboard.

---

## 9. Exercises (good ways to learn the code)

1. In `scoring.js` add a finding for a task that passed but took more than 8 steps. Add a test in `packages/engine/test/scoring.test.js`.
2. Add `GET /api/tests/:id/summary` returning only `{id, url, score, status}`. Put the id check in with `assertSafeId` and add a case to `apps/server/test/api.test.js`.
3. Follow one `PROGRESS` event with `console.log` from `tinyfish.js` to the lane on screen and write down every function it passes through.
4. Break something on purpose: make `runTaskWithBotWall` ignore `cancelled`, run `npm test`, and read which tests fail and why. Put it back.
