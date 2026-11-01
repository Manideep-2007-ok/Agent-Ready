# AgentReady: Decision log

Each decision: what we chose, why, and what we rejected. Change a decision only with the team; add a new row or mark the old one "Replaced by Dxx".

| # | Decision | Why | Rejected alternatives |
|---|---|---|---|
| D1 | **JavaScript (ES modules) + JSX**, no TypeScript | The team knows MERN; under deadline pressure, errors must be easy to read and fix. Shared shapes still exist as JSDoc in `types.js`, which editors and agents read | TypeScript: safer types but build steps and type errors cost time today |
| D2 | **Express + React (Vite) + Node 20**, npm workspaces monorepo | MERN skills; one repo, one `npm install`; engine shared by server, CLI and CI | Next.js (new to the team), separate repos (sync pain) |
| D3 | **No MongoDB today: JSON files behind `store.js`** | Zero setup, doubles as the demo cache, one module to swap for MongoDB later | MongoDB Atlas: ~15 min setup and one more thing that can fail on stage |
| D4 | **Call TinyFish with plain `fetch`** | Exactly what we tested on 31 Oct; no SDK version surprises | TinyFish SDK: fine, but untested by us |
| D5 | **All TinyFish calls only in `packages/engine/src/tinyfish.js`** | One place to fix bugs, add mock mode, and respect limits | Calls scattered across apps |
| D6 | **API key only on server and CLI** (`.env`); screenshots proxied via `/api/shot` | Keys must never reach the browser; step screenshot URLs need the key | Exposing screenshot URLs directly (they need a TinyFish login anyway) |
| D7 | **Server -> dashboard via SSE** | One-way live updates are all we need; simplest to build and debug | WebSockets (two-way, more code), polling (laggy lanes) |
| D8 | **Scoring is plain code; AI only writes fix explanations** | Reliable, explainable, cheap, same result every time | AI-judged scores (vary per run, hard to defend to judges) |
| D9 | **`TINYFISH_MAX_PARALLEL` setting (default 2) with a queue** | TinyFish connector says this account allows 2 concurrent; on 31 Oct 3 started and a 4th waited ~70 s | Firing everything at once (runs queue silently and lanes look frozen) |
| D10 | **Time cap on every run** (`max_duration_seconds`, default 150) | Keeps cost and demo time bounded; tested that the agent reports just after the cap | No cap (big stores took up to 261 s) |
| D11 | **SSE stream drop -> poll `GET /v1/runs/{id}` every 3 s** | Tested 31 Oct: stream dropped (curl error 56) but the run kept going and finished | Treating a drop as failure |
| D12 | **Bot-wall cascade: no proxy -> India proxy -> stealth** | Myntra blocked the no-proxy run, passed with India proxy alone; stealth only if still blocked | Always stealth (hides the real finding and costs more) |
| D13 | **Only trust agent claims backed by steps** | Shopping agent named Myntra without any Myntra step; one run gave a wrong answer on example.com | Taking agent JSON at face value |
| D14 | **Demo store: static site on Vercel with switchable flaws** | TinyFish's cloud browsers cannot reach a laptop; small sites run in ~30 s; before/after is guaranteed | Fixing a real site (impossible), localhost demo (needs a tunnel on stage) |
| D15 | **Watch with node-cron + async runs + webhook (polling fallback); alert only after 2 failures** | Webhook tested OK; agents vary so one failure is not enough | TinyFish Monitor (watches content changes, not agent tasks) |
| D16 | **Alerts via Discord/Slack incoming webhook** | One POST, no SDK, works on stage | Email (setup, spam folders) |
| D17 | **Detailed Fix Report instead of copy-paste code fixes** | Real sites use many frameworks; a generic snippet would often be wrong. We give evidence, cause, standard, framework-aware example, pass check | "Code fix generator" (only works for our demo store) |
| D18 | **Fix write-ups: one AI call per finding, JSON output, template fallback** | Makes the report read well; never blocks the demo if the AI call fails | No AI (flatter text), AI-only (fragile) |
| D19 | **Localhost CLI via Cloudflare quick tunnel** | Tested 31 Oct from Manideep's laptop: no account, no warning page, agent passed in 28 s | ngrok/localtunnel (show a "click to continue" page that blocks agents) |
| D20 | **Mock mode (`TINYFISH_MOCK=1`) replaying real 31 Oct runs** | Three people can build UI all day without spending credits | Building against live runs (costly, slow) |
| D21 | **Feature flags for every Tier 2+ feature** | Hide a broken feature during the demo without touching others | Removing code under pressure |
| D22 | **Never word a finding as "the agent got confused"; always a site cause** | TinyFish team judges; findings must help the site owner and not read as a TinyFish failure | Neutral agent logs only |
| D23 | **Race Mode uses 3 sites, not 4** | Parallel-run limit (D9) | 4 lanes with one stuck "waiting" |
| D24 | **Dropped from today's build:** AI Shopper Panel, Monitor-based watcher, Research brief, auto-competitors (Search), Datasets leaderboard, badge, locked previews, Vault logins, Agent's-eye view, separate Visitor Matrix | Untested, slow, or weak on stage; kept for the roadmap slide | |
| D25 | **Instant Scan findings live in `SiteReport.scanFindings`; shown in the findings list; can enter Top 3 but rank after point-scoring findings of the same severity** (Top 3 order: severity, then `pointsIfFixed`, one per finding type) | A pop-up covering the page is a real blocker even though it costs no points; without its own field it could only appear in Top 3. One bot-wall fix covers every task it blocked, so the same fix never fills all three slots. Agreed by Manideep (and for Akhil) on 1 Nov | Option B: scan findings only inside Top 3 (no contract change, but they vanish from the findings list) |
| D26 | **Bot-wall cascade stops after the India-proxy attempt if it failed after 5+ steps; verdict `none` (site failure, not a bot wall)** | Watch demo 1 Nov: a broken cart said "Something went wrong", which matched the block pattern, so the engine ran proxy + stealth (₹111 instead of ₹10) and reported "agents could not use this site" with an allow-list fix. An agent that moved around the site from a home address got past any wall. Myntra is unaffected (passes on attempt 2). Agreed by Manideep 1 Nov | Narrowing the block-words pattern (Myntra's real wall also says "Something went wrong"); always running stealth (cost, wrong label) |
