# AgentReady: Architecture and Decisions

This is the single source of truth for Team Mavericks (Manideep Thumu, Sai Shakti Nayak, Akhil Daitha) and for every coding agent working in this repo. Read it fully before writing code. If you change a decision, update this file in the same commit.

Hackathon: Swim with TinyFish, Scaler School of Technology, 1 Nov 2026. Submission deadline: **16:30**. Feature freeze: **15:30**.

---

## 1. What we are building

AgentReady tests whether AI agents can actually use a website. Real TinyFish web agents try everyday tasks on a site in parallel, live on screen. We score each task, show the exact step and screenshot where the agent got stuck, explain why, and say how to fix it. Agent-Ready Watch then re-tests the live site on a schedule and alerts the team when agents can no longer buy.

Pitch line: "Existing tools read the menu. We order the food."

Three layers, one engine:

| Layer | When | Surface | Status today |
|---|---|---|---|
| Build | Developer's laptop | CLI: `npx agentready http://localhost:3000` (Cloudflare quick tunnel) | Build |
| Release | Every pull request | CI check (GitHub Action) | Stretch goal |
| Live | After launch, on a schedule | Agent-Ready Watch + Discord/Slack alerts | Small version |

---

## 2. Key decisions (do not change without telling the team)

| # | Decision | Why |
|---|---|---|
| D1 | **TypeScript everywhere**, Node 20+, npm workspaces monorepo | Shared types = one contract between 3 people and 3 coding agents |
| D2 | **Call TinyFish over plain HTTPS (`fetch`)**, not an SDK | Tested yesterday with raw HTTP; no package-version risk |
| D3 | **Express** server, **React + Vite** dashboard | Team knows MERN |
| D4 | **No database.** Reports and Watch history are JSON files in `data/` | Zero setup; doubles as our demo cache |
| D5 | **Server → dashboard live updates via SSE** (`text/event-stream`) | One-way is all we need; simplest |
| D6 | **All TinyFish calls go through `packages/engine`**. Server, CLI and CI import it | One place to fix bugs; CLI works without our server |
| D7 | **API key only on the server / CLI** (from `.env`). Never sent to the browser | Screenshots are proxied by our server |
| D8 | **Scoring is plain code.** AI is only used to write fix explanations | Reliable, explainable, cheap |
| D9 | **Max parallel agent runs is a setting** (`TINYFISH_MAX_PARALLEL`, default 2) with a queue in the engine | Account limit seen as 2 to 3; 4th run queued ~70 s |
| D10 | **Every run has a time cap** (`agent_config.max_duration_seconds`, default 150) | Cost and demo time |
| D11 | **If the SSE stream drops, fall back to polling** `GET /v1/runs/{id}` every 3 s | Tested: stream dropped, run kept going |
| D12 | **Demo store is a static site on Vercel** with flaws toggled by query string / localStorage | TinyFish cloud browsers cannot reach a laptop |
| D13 | **Alerts via Discord or Slack incoming webhook** (`ALERT_WEBHOOK_URL`) | One POST, no SDK |
| D14 | **Feature flags** in `apps/server/src/config.ts` for every Tier 2+ feature | Hide a broken feature without touching others |

---

## 3. Repo layout and ownership

```
agentready/
  docs/ARCHITECTURE.md        <- this file
  AGENTS.md / CLAUDE.md       <- rules for coding agents
  packages/engine/            <- TinyFish client, task runner, bot-wall, scoring, instant scan   (Manideep + Sai Shakti)
    src/types.ts              <- THE CONTRACT (shared types). Change only with team agreement
    src/tinyfish.ts           <- HTTP calls: run-sse, run-async, getRun, screenshot, fetch, search, browser session
    src/goals.ts              <- task goal templates (tested wording)
    src/runner.ts             <- runTask, runSiteTest, queue, SSE->poll fallback      (Manideep)
    src/botwall.ts            <- lite -> IN proxy -> stealth cascade                   (Manideep)
    src/scoring.ts            <- points, findings, cost meter                         (Manideep)
    src/report.ts             <- assemble SiteReport from runs, verify stores, cache   (Sai Shakti)
    src/instantScan.ts        <- Fetch + Browser API page audit                       (Akhil)
    src/fixes.ts              <- Detailed Fix Report: evidence, framework, AI write-up, templates (Manideep)
  apps/server/                <- Express API, SSE, screenshot proxy, Watch scheduler, alerts
    src/routes/*.ts           <- tests, race, watch, leaderboard, webhooks             (Sai Shakti routes; Manideep watch)
    src/watch.ts              <- node-cron scheduler, compare with last good, alerts   (Manideep)
  apps/web/                   <- React dashboard                                       (Sai Shakti; Akhil: live lanes)
  apps/cli/                   <- `agentready` CLI with cloudflared tunnel                (Akhil)
  apps/demo-store/            <- static shop with switchable flaws                      (Akhil)
  data/                       <- reports/*.json, watch/*.json (gitignored except data/cached-demo/)
```

Rule: **edit only folders you own**. Need a change in someone else's folder or in `types.ts`? Tell them first.

---

## 4. TinyFish facts we tested on 31 Oct (rely on these)

Base: `https://agent.tinyfish.ai`, header `X-API-Key: <key>`. Price: **$0.016 per agent step**. Wallet ~ $14.

| Need | Call | Notes |
|---|---|---|
| Run with live events | `POST /v1/automation/run-sse` body `{url, goal, browser_profile?, proxy_config?, agent_config:{max_duration_seconds}}` | Events: `STARTED`, `STREAMING_URL`, `PROGRESS {purpose}`, `HEARTBEAT`, `COMPLETE {status, result, error}` |
| Background run | `POST /v1/automation/run-async` + `webhook_url` | Webhook receives `{event:"run.completed", run_id, status, data:{...result, num_of_steps}}`. Tested OK |
| Run record | `GET /v1/runs/{id}` | `status` PENDING/RUNNING/COMPLETED/FAILED/CANCELLED, `num_of_steps`, `result`, `steps[] {id, action, screenshot, duration}`, `streaming_url`, `browser_config` |
| Step screenshot | `GET /v1/runs/{id}/steps/{stepId}/screenshot` with API key | JPEG. The `screenshot` URL inside steps needs browser login: **use this API path instead** |
| Cancel | `POST /v1/runs/{id}/cancel` | |
| Fetch (free) | `POST https://api.fetch.tinyfish.ai` body `{urls:[...]}` | Returns `results[].text` (markdown) |
| Search (free) | `GET https://api.search.tinyfish.ai?query=...` | `results[] {position, site_name, title, url, snippet}` |
| Browser API | `POST https://api.browser.tinyfish.ai` body `{url?, timeout_seconds, proxy_config:{country_code}}` -> `{session_id, cdp_url}`; connect Playwright `chromium.connectOverCDP(cdp_url)`; `DELETE https://api.browser.tinyfish.ai/{session_id}` | ~10 s per page, $0.002/min. Uses residential proxy by default |
| Wallet | `GET /v1/wallet` | |

Behaviour we observed:
- `COMPLETED` only means infrastructure worked. Read **our own** `result.success`.
- Steps that used web search carry `"tinyfish_api":"search"` in the PROGRESS event -> finding `needed-web-search`.
- Default run = `lite`, **no proxy** (`proxy_enabled:false`) = how cloud AI agents arrive. Myntra blocks this; passes with `proxy_config {enabled:true,type:"tinyfish",country_code:"IN"}`.
- Agents sometimes invent facts (named a store it never visited). Only trust claims backed by steps.
- `max_steps`, `capture_config` are account-gated (403). `video_url` was empty. Do not use them.
- Live view: `streaming_url` redirects to a DevTools viewer; works in a real browser; put it in an `<iframe>`; fallback = step replay.
- Big stores: 1 to 4.5 min per task. Small sites (demo store): ~30 s.

---

## 5. Task goals (tested wording, keep the ending identical)

Every goal ends with `GOAL_SUFFIX`:

```
Do NOT log in, sign up or pay. If anything blocks you (login wall, popup, captcha, error page, access denied), stop and describe exactly what blocked you and at which step. Return JSON: {"success": true/false, "answer": string or null, "blocker": string or null, "stuck_url": string or null}
```

| taskId | Goal (before the suffix) |
|---|---|
| `find_price` | Find any product on this site and report its exact name and price. |
| `add_to_cart` | Find any product, open its product page and add it to the cart. Then open the cart and report the cart total. |
| `find_returns` | Find this site's return or refund policy. Report how many days customers have to return a product and the URL of the policy page. |
| `find_contact` | Find a way to contact this company's customer support (phone, email, chat or contact form) and report it with the page URL where you found it. |
| `custom` | User's text, then the suffix. |

Start `find_returns` first (slowest).

---

## 6. Data contract

Defined in `packages/engine/src/types.ts`. Summary:

- `TaskResult`: one task run (`taskId, mode, proxy, runId, status, answer, blocker, stuckUrl, steps[], numSteps, seconds, points, findings[], streamingUrl`)
- `SiteReport`: one site test (`id, url, source, testedAt, pack, score, botWall, costRupees, framework, instantScan, tasks[]`)
- `Finding`: `type, severity, text, likelyCause, fix, pointsIfFixed, verified, screenshotUrl, element?`
- `LiveEvent`: what the server streams to the dashboard (`task-update`, `step`, `instant-scan`, `report-complete`, `watch-alert`)

---

## 7. Scoring (plain code, `scoring.ts`)

Each task max 25, total 100.

| Rule | Points |
|---|---|
| Task passed | +15 |
| Steps <=5 / 6-10 / >10 | +6 / +3 / 0 |
| Time <90 s / <180 s / longer | +4 / +2 / 0 |
| Used web search | -5 |
| Passed only with proxy or stealth | task capped at 5, `botWall` set |

Finding types: `blocks-cloud-agents`, `blocks-automation`, `site-broken`, `needed-web-search`, `cart-not-found`, `price-not-found`, `returns-not-found`, `contact-not-found`, `too-many-steps`, `slow`, `popup-blocking`, `unlabelled-buttons`, `price-in-image`, `no-product-schema`.

Cost meter: `costRupees = totalSteps * 0.016 * USD_INR` (`USD_INR` constant = 88).

---

## 8. Bot-wall cascade (`botwall.ts`)

1. Run task: `lite`, proxy off.
2. If failed AND (blocker text matches /access denied|error|blocked|captcha|something went wrong|blank|empty|could not load/i OR 0 useful steps): re-run `lite` + IN proxy.
3. Still failed same way: re-run `stealth` + IN proxy.
4. Verdict: proxy-only pass -> `blocks-cloud-agents`; stealth-only pass -> `blocks-automation`; never -> `site-broken`; first pass -> `none`.

---

## 9. Server API (`apps/server`, port 4000)

| Method + path | Body / query | Returns |
|---|---|---|
| `POST /api/tests` | `{url, tasks?: TaskId[], customTask?: string}` | `{reportId}` and starts the test |
| `GET /api/tests/:id` | | `SiteReport` |
| `GET /api/tests/:id/events` | | SSE stream of `LiveEvent` |
| `POST /api/instant-scan` | `{url}` | `InstantScan` |
| `GET /api/shot/:runId/:stepId` | | JPEG proxied from TinyFish |
| `POST /api/race` | `{taskId, urls: string[]}` (max 3) | `{raceId}`; events on `/api/race/:id/events` |
| `POST /api/reports/:id/fixes` | | Detailed Fix Report (adds AI write-ups) |
| `GET /api/watch` / `POST /api/watch` | `{url, everyMinutes, tasks}` | watch list / created watch |
| `POST /api/watch/:id/run-now` | | triggers a check |
| `GET /api/watch/:id/history` | | `SiteReport[]` |
| `POST /api/webhooks/tinyfish` | TinyFish webhook body | 200 |
| `GET /api/leaderboard` | | cached reports ranked |
| `GET /api/health` | | `{ok:true}` |

Dashboard runs on Vite (5173) and proxies `/api` to 4000.

---

## 10. Agent-Ready Watch (`watch.ts`)

- `node-cron` job per watch (`*/20 * * * *` for the demo).
- Runs tasks via engine (async + webhook if `PUBLIC_BASE_URL` is reachable, else polling).
- Compare with last report where tasks passed: pass->fail, step band worse, new blocker type, botWall changed.
- On failure: re-run once immediately; alert only if it fails twice.
- Alert: POST to `ALERT_WEBHOOK_URL` (Discord: `{content}`, Slack: `{text}`), plus `watch-alert` LiveEvent. Send "Recovered" when it passes again.
- History saved to `data/watch/<watchId>.json`.

---

## 11. Detailed Fix Report (`fixes.ts`)

1. Evidence: steps + screenshot + `stuck_url`; open `stuck_url` via Browser API; record element HTML snippet, CSS selector, bounding box, text, aria-label.
2. Framework: `__NEXT_DATA__` or `self.__next_f` -> Next.js; `window.Shopify` -> Shopify; else `unknown`.
3. One AI call per finding (provider set by `LLM_PROVIDER`), JSON out: `{rootCause, standard, fixRule, frameworkExample, passCheck}`; validate fields; fallback to `FIX_TEMPLATES[type]`.
4. Rank by impact (tasks broken, points) and effort; Top 3 card = top 3 by `pointsIfFixed`.
5. Standards to cite: WCAG 4.1.2 Name, Role, Value; WCAG 1.1.1 Non-text Content; schema.org Product.
6. Always label inferred causes "likely cause".

---

## 12. Instant Scan (`instantScan.ts`)

In parallel, target 15 to 30 s:
- Fetch: page text, `/robots.txt`, `/sitemap.xml` (and MCP discovery files if time).
- Browser API + Playwright: count unlabelled buttons/links (no text, no aria-label, no title, no img alt inside), images without alt, price-as-text (`/₹\s?\d|Rs\.?\s?\d/`), visible fixed overlays covering >30% of viewport, `application/ld+json` with Product/Offer, page text length.

---

## 13. Demo store (`apps/demo-store`)

Static HTML/CSS/JS on Vercel. Pages: home, product, cart, returns, contact. Flaws toggled by `?flaws=on` (stored in localStorage) or individually `?popup=1&priceImg=1&iconCart=1&hiddenReturns=1`:
- popup covering the page with no close button,
- price only inside an image,
- icon-only Add to cart button (no text, no aria-label),
- returns policy 4 clicks deep, no footer link.
`?flaws=off` fixes all. "Apply fixes" in the dashboard switches the watched URL to `?flaws=off` and re-runs.

---

## 14. CLI (`apps/cli`)

`npx agentready <localhost-url> [--tasks find_price,add_to_cart]`
1. Spawn `cloudflared tunnel --url <localhost-url>`; parse `https://*.trycloudflare.com` from output.
2. Run engine `runSiteTest` directly with `TINYFISH_API_KEY` from env.
3. Print score, task table, top findings; save report JSON; optionally POST to our server if `AGENTREADY_SERVER` set.
4. Kill tunnel on exit.

---

## 15. Environment variables (`.env`, never committed)

```
TINYFISH_API_KEY=
TINYFISH_MAX_PARALLEL=2
TINYFISH_MAX_DURATION_SECONDS=150
PUBLIC_BASE_URL=            # public URL of our server for TinyFish webhooks (cloudflared tunnel to :4000)
ALERT_WEBHOOK_URL=          # Discord or Slack incoming webhook
LLM_PROVIDER=gemini         # gemini | anthropic | openai
LLM_API_KEY=
DEMO_STORE_URL=
PORT=4000
```

---

## 16. Timeline and cut-line

| Time | Goal |
|---|---|
| 11:30-12:30 | One task end to end (engine -> server -> dashboard). Demo store v1 online. |
| 12:30-13:30 | 4 tasks, live lanes, scoring, screenshots, bot-wall, Instant Scan |
| 13:30 | Checkpoint: full Nykaa test works. Merge to main. |
| 13:30-15:00 | Watch (on for demo store by 14:00), Fix Report + Top 3, one-click fix, CLI, Race, Cost Meter, custom task, step replay |
| 15:00-15:30 | Pre-run India snapshot + races, cache; CI only if solid |
| 15:30 | Feature freeze |
| 15:30-16:30 | Bug fixes, backup video, rehearse, **submit by 16:30** |

Must ship: core test, live lanes, scoring, bot-wall, Instant Scan, demo store + Watch alert.
Drop order if late: CI -> Race -> custom task -> India snapshot -> step replay -> AI write-up (keep templates) -> live CLI run.

---

## 17. Git workflow

- `main` is always demo-able. Work on branches: `manideep/<thing>`, `shakti/<thing>`, `akhil/<thing>`.
- Small PRs, merge often (at least every hour). Rebase on main before merging.
- Never commit `.env`, API keys or `data/` (except `data/cached-demo/`).
