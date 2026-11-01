# AgentReady: Research and test evidence

Everything Team Mavericks learned before the build (29 to 31 Oct 2026). Coding agents: use these facts instead of guessing; humans: use them for the pitch and Q&A. Raw run data for mock mode is in `data/cached-demo/fixtures/`.

---

## 1. The event

- Swim with TinyFish, Scaler School of Technology, Bangalore, 1 Nov 2026. Organised by Ignite Room, presented by TinyFish. Prize pool ₹35,000 (₹15k / ₹10k / ₹5k, plus ₹2.5k each for best LinkedIn and X posts tagging TinyFish and Ignite Room with #SwimWithTinyFish).
- Open innovation. TinyFish must be central, not an add-on.
- **Judging:** use of TinyFish 35%, problem relevance and impact 25%, technical execution and working demo 25%, presentation 15%.
- Day: workshop 10:00-11:00, ideation 11:00-11:30, build 11:30-16:00, demos 16:00-17:00. Our submission deadline: 16:30.
- Source: https://thenymble.com/events/swim-with-tinyfish-scaler-school-of-technology

---

## 2. Why this idea

- AI agents (ChatGPT agent, Perplexity's Comet browser) are starting to shop and book for people. Websites were built for humans; agents get stuck on pop-ups, unlabelled buttons, hidden pages, or are blocked by bot protection. The business loses the sale and never sees it.
- **Aidō Lighthouse 2026 AI Commerce Readiness Index** (via Agile Brand Guide): of 345+ retailers, only **2%** scored "AI-ready" (80+); average "transactability" score **28.8/100**; 29% scored zero on transactability. https://agilebrandguide.com/aido-lighthouse-beyond-discovery-why-98-of-enterprise-e-commerce-sites-are-unready-for-ai-driven-purchasing/
- Single-person Chrome agents cannot do what we do: many isolated cloud browsers in parallel, different network identities (proxy, stealth), on a schedule, as an API for many users.

### Competitors and the gap

| Tool | What it does | Gap we fill |
|---|---|---|
| Cloudflare isitagentready.com (launched Apr 2026) | Static checks: robots.txt, sitemap, Markdown negotiation, AI bot rules, MCP/OAuth/API discovery, commerce protocols | Never tries a task. We ran it on Nykaa: **20/100, "Level 1: Basic Web Presence"** |
| Backlinko, Frase, ChatThing, SEOJuice "agent readiness" checkers | Markup/config audits | Static, no real agent |
| Aidō Lighthouse, agency audits (EPAM, Webtures) | Readiness scoring / consulting | Not real agent task runs |
| Writesonic agentic commerce tracking, Shopify "Agentic Shopper" app | Track whether AI answers mention/link a brand | Not whether an agent can buy on the site |
| Flowtest.ai | AI agent runs user flows on a schedule (for humans' journeys) | Not agent-readiness, no bot-wall detection |

Pitch line: **"They read the menu. We order the food."**

---

## 3. TinyFish platform facts (tested by us)

- Agent API base `https://agent.tinyfish.ai`, header `X-API-Key`. Endpoints: `/v1/automation/run`, `/run-async`, `/run-sse`; `GET /v1/runs/{id}`; `POST /v1/runs/{id}/cancel`; `GET /v1/runs/{id}/steps/{stepId}/screenshot`; `GET /v1/wallet`.
- Request: `{url, goal, browser_profile: 'lite'|'stealth', proxy_config: {enabled, type:'tinyfish', country_code}, agent_config: {max_duration_seconds}, webhook_url}`.
- SSE events: `STARTED`, `STREAMING_URL`, `PROGRESS {purpose, tinyfish_api?}`, `HEARTBEAT` (every 15 s), `COMPLETE {status, result, error}`.
- Run record fields: `run_id, status, goal, created_at, started_at, finished_at, num_of_steps, result, error, streaming_url, video_url, browser_config, steps[] {id, timestamp, status, action, screenshot, html, duration}`.
- Errors: `400 INVALID_INPUT`, `401`, `403 FORBIDDEN`, `429 RATE_LIMIT_EXCEEDED`, `500`; run-level `TASK_FAILED`, `SITE_BLOCKED`, `MAX_STEPS_EXCEEDED`, `TIMEOUT`, `BILLING_REJECTED`.
- **Prices (wallet meters):** Agent $0.016/step; Browser $0.002/min; Fetch free; Search free; Monitor $0.005/run; Research Deep $2, Max $3; Datasets free in beta (3 runs/24 h).
- Wallet: started $16.00, $14.24 after all 31 Oct tests (~$1.80 spent). Finalists get extra credits (event page).
- TinyFish connector says this account allows **2 concurrent** agent runs.
- Not available: `agent_config.max_steps` and `capture_config` (beta/account-gated, 403 per docs). `video_url` was empty for our runs.
- Docs: https://docs.tinyfish.ai/agent-api/reference.md, https://docs.tinyfish.ai/key-concepts/runs.md, https://docs.tinyfish.ai/live-preview.md, https://docs.tinyfish.ai/browser-api/reference.md, https://docs.tinyfish.ai/faq.md

---

## 4. Agent run results (31 Oct)

| Test | Steps | Time | Result | Lesson |
|---|---|---|---|---|
| Nykaa: find a lipstick + price (x2) | 3 | ~70 s | Passed both (Maybelline Serum Matte ₹467) | Simple tasks are consistent |
| Nykaa: add to cart, read total | 8 | 169 s | Passed (₹467), no login needed | Cart works without an account |
| Nykaa: find return policy | 13 | 261 s | Passed (15 days, /cancellation-policy/lp) after wandering the help centre and using web search | `needed-web-search` finding; screenshot 1 |
| Nykaa: find support contact | 5 | not recorded | Passed: chat button + help centre; no phone/email | `find_contact` works |
| Swiggy: set location, add item, read cart | 20 | ~135 s | Item added (₹100 wings), cart total never found | `cart-not-found` finding |
| Myntra: find t-shirt, no proxy | 12 | 64 s | Blocked: "Oops! Something went wrong / contact your administrator"; agent wrongly called it an outage | Bot wall |
| Myntra: same, lite + India proxy | 5 | 61 s | Passed (WROGN t-shirt ₹659) | **Blocks cloud-server addresses** |
| Myntra: same, stealth + India proxy | 7 | 130 s | Passed (Roadster ₹228) | Stealth not needed; proxy enough |
| Shopping agent: matte lipstick under ₹500 (from DuckDuckGo) | 8 | 239 s | Nykaa was #1 in TinyFish Search but served the agent a blank "(null)" page; bought on Flipkart (Maybelline Superstay ₹320) | Intermittent problems; screenshot 2 |
| Shopping agent: running shoes under ₹3,000 | 6 | 229 s | Rejected Amazon: "prices were not visible in search results", "too many sponsored results"; listed Myntra with no Myntra step | Useful reasons; agents can invent things |
| Localhost page via Cloudflare quick tunnel | 5 | 28 s | Passed: price ₹499, returns 10 days; no warning page | CLI works; small sites are fast |
| example.com: main heading (x2) | 2-5 | <30 s | One correct ("Example Domain"), one wrong ("no main heading") | Re-run on disagreement |

### Screenshots

1. Agent lost in Nykaa's help centre while looking for returns: `docs/proofs/nykaa-returns-lost.jpg`
2. Blank "(null)" page Nykaa served the shopping agent: `docs/proofs/nykaa-blank-page.jpg`
3. Live view of a TinyFish agent on Nykaa (Diwali sale banner + login pop-up): `docs/proofs/live-view.jpg`

---

## 5. Platform behaviour checks (31 Oct)

| Check | Result |
|---|---|
| Parallel | 3 runs started together; a 4th waited ~70 s (created 14:02:47, started 14:03:58) |
| Live steps | Every step arrives as `PROGRESS` with a readable `purpose` label |
| Step screenshots | `GET /v1/runs/{id}/steps/{stepId}/screenshot` + key -> JPEG ~45 KB. The `screenshot` URL inside steps needs a browser login (401 with key) |
| Live view | `streaming_url` -> 302 to `tetra-streaming.tinyfish.io/inspector.html?wss=...` (DevTools viewer). No X-Frame-Options header. Works in a real browser; link dies (404) after the run ends |
| Stream drop | curl error 56 mid-run; run stayed RUNNING and completed; recovered via `GET /v1/runs/{id}` |
| run-async + webhook_url | Works. Webhook body: `{event:"run.completed", run_id, status, data:{run_id, status, goal, created_at, started_at, finished_at, num_of_steps, result, ...}}` |
| Time cap | `max_duration_seconds: 120` -> agent says "Report findings before time runs out", completes ~130 s |
| Web search inside runs | PROGRESS has `"tinyfish_api":"search"` when the agent falls back to search |
| Fetch | Nykaa robots.txt read fine; returns `results[].text` markdown, `final_url`, `latency_ms` |
| Search | "nykaa return policy" -> Nykaa cancellation policy page #1 |
| Browser API + Playwright | ~10 s per page, < ₹1: Myntra 515 of 619 buttons/links without text/label (rough count), 0 of 9-13 images with alt; Nykaa homepage only 284 characters of text. Myntra loads fine via Browser API (residential proxy by default) |

---

## 6. How real teams test (where AgentReady fits)

| Stage | What it is | AgentReady |
|---|---|---|
| Localhost | Developer's laptop | CLI + tunnel (proven) |
| Pull request + CI | Code review with automated checks | CI check (stretch) |
| Preview / staging | Temporary/private copy of the site (Vercel/Netlify per PR) | Roadmap: often locked |
| Production | Live site, often with feature flags | Agent-Ready Watch |

- Locked previews: Vercel "Deployment Protection"; testing tools pass with "Protection Bypass for Automation" secret in request headers `x-vercel-protection-bypass` (+ `x-vercel-set-bypass-cookie: true` for browsers). TinyFish's agent API showed no custom-header field; the Browser API can set headers (our code drives it). Source: https://docs.qa.tech/configuration/vercel-preview-protection.md
- Why continuous monitoring matters even after fixes: weekly releases (banners, pop-ups, redesigns, A/B tests), bot-protection rule changes by security teams/vendors (no code change), third-party scripts, intermittent failures (Nykaa blank page once, fine other times). CLI/CI only catch the team's own code changes; Watch catches the rest.

---

## 7. Customer journeys

- **Small store owner (Shopify/D2C, no developer):** paste site -> Instant Scan (~30 s) -> full test (minutes) -> Top 3 fixes -> send Detailed Fix Report to developer/agency -> turn on Watch for checkout.
- **Developer (example: Priya):** builds "Quick buy" on localhost:3000 -> `npx agentready http://localhost:3000` -> "61/100, Add to cart failed: icon with no label" -> adds label -> 88/100 -> opens PR.
- **Release (example: Arjun):** PR changes checkout -> preview link -> CI check comments "88 -> 64, cart total unreadable" -> blocked until fixed (stretch).
- **Big e-commerce/QA team:** Watch every few hours -> Slack alert "AI shoppers can't add to cart since 22:00 ... Diwali pop-up covers the page" -> fix -> "Recovered 23:00". Bot-wall findings go to security; layout findings to developers.

---

## 8. Q&A preparation

| Question | Answer |
|---|---|
| Isn't this Cloudflare's tool? | It checks files (Nykaa 20/100). It never tries a task. We do both: Instant Scan covers files, agents test real tasks |
| Won't agents get smarter? | A smarter agent still can't pass a bot wall; access is a security-policy problem (Myntra). Sites also keep changing |
| Why not fix once? | Weekly releases and security rule changes; hence Watch |
| Isn't TinyFish's agent failing? | Every finding names a site cause with screenshots |
| Can agents be wrong? | Yes, we saw it. We re-run on disagreement and only count step-backed claims |
| Will your agents mess up my store? | No login/pay/order. "Add to cart" leaves an abandoned cart in the store's reports, so use a test product, test the cart less often, or at quiet hours |
| Data safety? | Public pages only; no logins, no customer data |
| Cost? | Idea: free first scan, monthly Watch. Our cost ~$15/month/site for a daily full check |

---

## 9. Ideas considered and dropped (for the roadmap slide)

AI Shopper Panel (do AI shoppers choose your store; tested twice, Flipkart won both, but it simulates TinyFish's agent not ChatGPT's and needs many runs), robots.txt watcher with TinyFish Monitor, Research industry brief, auto-competitors with Search, Datasets leaderboard, Agent-Ready badge, locked preview testing, logged-in journeys with Vault, Agent's-eye view, separate Visitor Matrix (merged into bot-wall cascade).

---

## 10. Open questions for mentors

1. Is code written before today allowed if declared?
2. Finalist credits amount; any AI model credits?
3. Exact parallel-run limit for our account?
4. Can we get `capture_config` / `max_steps`?
5. Can agent runs send custom headers or use Vault logins for locked previews?
