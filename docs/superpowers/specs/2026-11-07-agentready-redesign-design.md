# AgentReady redesign: design system, app, landing, pricing, docs

Date: 7 Nov 2026 · Owner: Manideep · Branch: `manideep/redesign` (on top of PR #33) · Status: approved in conversation, awaiting spec review

## 1. Intent

**Goal.** Turn the hackathon dashboard into a professional product site: a public landing page, pricing, a docs site and the
product app, all on one design system so colours, type and components are the same everywhere.

**Who it is for.** Indian D2C and Shopify store owners first (they read the report and the fixes); developers second (CLI,
GitHub Action, API docs).

**Done when.**
- Every page (landing, pricing, docs, app) uses only the shared tokens and components; no page has its own colours.
- A store owner can land on `#/`, start a test, read the report, share it, and find the docs without help.
- Light and dark themes, phone width (390 px) and keyboard use all work; contrast meets WCAG 2.1 AA.
- `npm test` and `npm run test:e2e` pass.

**References.**
- Postman: a dark workbench for people who run tests; dense request/response panels; one warm accent for the main action;
  method chips as colour-coded hierarchy; Inter; 4-6 px corners.
- Vouch (github.com/AkashaPrasad/vouch, vouch.spacesdrive.cc): paper and ink surfaces, JetBrains Mono uppercase labels
  and IDs, evidence ledgers with numbered rows, 4 px corners, hairlines, no shadows; a landing hero with copy on the left
  and a live product panel on the right; every feature shown as a real product panel.
- AgentReady takes Vouch's structure and Postman's app shell, with its **own accent (ember orange)** so it does not look
  like a copy of either. Vouch is also built on TinyFish; we do not reuse its teal or its check-in-a-square mark.

## 2. Decisions made in the brainstorm

| Topic | Decision |
|---|---|
| Scope | Everything: design system, app screens, landing, pricing, docs |
| Order | System → App → Landing → Docs (pricing ships with the landing) |
| Direction | Vouch ledger + paper/ink + mono labels, Postman workbench sidebar, own orange accent; light default, dark option |
| Logo | Step path mark: dots on a path ending in a check, white on an orange rounded square; simplified below 20 px |
| Report | Workbench page with tabs: Overview, Findings, Steps, History, Scan |
| Pricing | No invented prices: free in beta; Free / Watch / Team described by what they include |
| Effects | All Magic UI decorative pieces removed |

## 3. Design system

All files under `apps/web/src/design/`. Every page imports from here only.

### 3.1 Tokens (`tokens.css`)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#F6F5F1` | `#0E0F12` | page (paper) |
| `--surface` | `#FFFFFF` | `#15161A` | panels, tables, inputs |
| `--surface-2` | `#EFEDE7` | `#1C1D22` | sidebar, table heads, hover |
| `--border` | `#E2E0D9` | `#2A2B32` | hairlines |
| `--border-strong` | `#C9C7BF` | `#3C3D46` | inputs, emphasis |
| `--text` | `#16161A` | `#F2F1EE` | ink |
| `--text-muted` | `#5B5A63` | `#A3A4AD` | supporting copy |
| `--text-faint` | `#6E6C75` | `#8B8C96` | labels, IDs, metadata (on `--bg`/`--surface` only; on `--surface-2` use `--text-muted`) |
| `--accent` | `#C2410C` | `#FF7A3D` | primary action, logo, running state |
| `--accent-ink` | `#FFFFFF` | `#1A0B03` | text on accent |
| `--accent-soft` | accent at 10% | accent at 14% | selected nav, focus wash |
| `--pass` / `--pass-soft` | `#1A7F4B` / 10% | `#4ADE80` / 14% | passed |
| `--warn` / `--warn-soft` | `#9A520F` / 12% | `#F5B341` / 14% | partly ready, slow, medium |
| `--fail` / `--fail-soft` | `#B23324` / 10% | `#F3716A` / 14% | failed, blocked, critical/high |
| `--wait` / `--wait-soft` | `#5B5A63` / 8% | `#A3A4AD` / 10% | waiting, stopped |
| `--radius` | `4px` | | controls, panels |
| `--radius-lg` | `8px` | | landing product panels only |
| `--shadow-pop` | small two-layer | darker | menus and the drawer only |

Measured contrast (AA needs 4.5:1 for normal text): white on accent 5.18, accent on paper 4.75, faint on white 5.17,
faint on paper 4.74, dark faint on page 5.74, dark accent-ink on accent 7.41. A unit test keeps every pair at AA.

Status always pairs colour with a text label (PASSED, FAILED, BLOCKED, WAITING, STOPPED). Dark mode is `data-theme="dark"`
on `<html>` (the current toggle keeps working; the default follows `prefers-color-scheme` until the user picks one).

### 3.2 Type

- **Inter** 400/500/600 for everything readable. Display sizes: 56/40/28 px, tracking -0.04em to -0.02em, weight 600.
  Body 15 px app / 17 px landing, line-height 1.55.
- **JetBrains Mono** 400/500 for uppercase labels (11-12 px, tracking 0.06em), IDs (T1-T4, F1...), step numbers, costs,
  scores in ledgers and code.
- Both self-hosted as woff2 under `apps/web/public/fonts/` (no runtime CDN); `font-display: swap`.

### 3.3 Space, shape, motion

- 4 px spacing grid; app tables use a compact row height (36 px), landing uses generous spacing.
- Corners 4 px; hairlines 1 px.
- No gradients, no glow, no decorative shadows. Shadow only on popovers and the phone drawer.
- Motion: 120-200 ms ease-out for hover, tab switch and drawer; the landing hero ledger fills row by row. Everything is
  off under `prefers-reduced-motion`.

### 3.4 Logo

- Mark: orange rounded square (radius 7 of 32) with two white dots on a dashed path ending in a white check.
- Below 20 px (favicon, sidebar collapsed): two dots and the check, no dashed path.
- Wordmark: `agentready` in Inter 600, tracking -0.03em, lowercase, ink colour.
- Files: `design/Logo.jsx` (mark + wordmark, `size` prop), `public/favicon.svg`, `docs/media/agentready-logo.svg`.
  The badge (`badge.js`) keeps its current flat style.

### 3.5 Components (plain JSX, no TypeScript)

| Component | Purpose |
|---|---|
| `Button` | `primary` (accent, at most one per view), `secondary`, `ghost`; sizes sm/md; loading state |
| `Badge` | status chips in mono uppercase: pass, fail, warn, wait, accent, neutral |
| `Panel` | bordered surface with optional mono header label and actions |
| `Ledger` | table of numbered rows (`id`, main cell, metric cells, badge), compact; collapses columns on phones |
| `Stat` | big number + mono label (score, cost, steps) |
| `AppShell` | sidebar (workspace nav, docs link, theme toggle), page header, replay strip, phone drawer |
| `SiteShell` | marketing/docs top bar and footer |
| `Tabs` | report tabs, keyboard accessible (roving tabindex), hash-synced |
| `Field` | label + input/select/checkbox + help + error |
| `Toast` | short confirmations (link copied) |
| `EmptyState` | headline, one line, one action |
| `Skeleton` | loading rows |
| `CodeBlock` | mono block with copy button (CLI, Action, API) |
| `Logo` | mark + wordmark |

Lucide icons stay (already a dependency), 16 px in the app, 20 px on the landing.

### 3.6 Removed

`components/ui/*.tsx` (theme toggler, smooth cursor, line-shadow text, globe, bento grid, icon cloud, confetti, comic
text, button), `PointerCursor.jsx`, and the dependencies only they use: `cobe`, `canvas-confetti`, `motion`,
`@radix-ui/react-icons`, `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, and Tailwind
(`tailwindcss`, `@tailwindcss/vite`) once no component needs it. This settles build plan item P1-4 (JS vs TS): the web
app is plain JS again (D1). A new decision D44 replaces D27.

### 3.7 Voice

Sentence case, plain words, no exclamation marks, no "successfully". Findings always name a site cause (D22). Public
pages never name a third-party company; only our demo store and unnamed, dated observations.

## 4. Information architecture

Hash routes (no router dependency). `apps/web/src/routes.js` parses the hash into `{area, page, id, extra}`.

| Route | Area | Page |
|---|---|---|
| `#/` | site | Landing |
| `#/pricing` | site | Pricing |
| `#/docs` and `#/docs/<slug>` | docs | Docs page (default `getting-started`) |
| `#/app` | app | Tests home: new-test panel + recent tests ledger |
| `#/app/test/<id>[/<beforeId>]` | app | Report (before/after kept) |
| `#/app/watch` | app | Watch |
| `#/app/race[/<raceId>]` | app | Race (flag RACE) |
| `#/app/leaderboard` | app | Leaderboard (flag LEADERBOARD) |

**Redirects (old links in CLI output, Watch alerts, README, CI comments):** `#/test` → `#/app`, `#/test/<id>[/<b>]` →
`#/app/test/<id>[/<b>]`, `#/watch`, `#/race[/<id>]`, `#/leaderboard` → their `#/app/...` routes. Redirects use
`location.replace` so Back does not loop. A page whose flag is off lands on `#/app`.

## 5. Screens

### 5.1 App shell

Sidebar 232 px: logo; WORKSPACE (Tests, Watch, Race, Leaderboard); RESOURCES (Docs, Pricing, GitHub); footer with
theme toggle and version. Page header: title, breadcrumbs for reports, page actions on the right. A thin replay-mode
strip ("Replay mode: recorded runs, no agent cost") under the header when `/api/health` says `mock`. Under 900 px the
sidebar becomes a top bar with the logo and a menu button opening a drawer.

### 5.2 Tests home (`#/app`)

- New test panel: URL field, pack select (Auto, Shop, SaaS, Content, Local), "Add your own task", Confirm results
  checkbox, cost line from `/api/estimate`, primary "Run test", secondary "Try the demo store".
- Recent tests ledger: site, pack, score, status badge, cost, date; rows open the report. Empty state: "Run your first
  test".

### 5.3 Report (`#/app/test/<id>`)

Header: site (mono host), pack, tested date, source; `Stat` score with band badge (Ready / Partly ready / Not ready),
cost, steps; actions: Re-run (primary), Share (copy link), Save as PDF, Stop (while running).

Tabs:
- **Overview**: bot-wall banner (if any); Top 3 fixes as a numbered ledger linking to Findings; task ledger T1-T4 (task,
  steps, time, confirm runs, claim check, result badge); while running, live lanes (live view or latest screenshot,
  timer, latest step, queue reason, retry and confirm notes) and a Stop button; demo-store before/after card when it
  applies; custom task row with its replay note.
- **Findings**: grouped findings ledger F1...; each expands to the six questions (what happened, where, why, how bad,
  how to fix, how we know), screenshot, element snippet, framework example; "Get detailed fix report" button at the top.
- **Steps**: the step timeline with replay (per task), stuck step highlighted.
- **History**: score line for the site and the "since the test before" changes list.
- **Scan**: Instant Scan rows as a ledger (value + badge), including Scan v2 rows.

States: running (Overview first, other tabs show what exists so far), complete, stopped (Stopped / Cost limit panel, no
score), not found (EmptyState with a link to `#/app`). Save as PDF prints header + every tab in order, no nav, no live
views.

### 5.4 Watch, Race, Leaderboard

Same behaviour and API calls as today, rebuilt on Panel, Ledger, Field, Badge and Button. Watch: create form panel,
watches ledger (site, tasks, every, status, last result, actions Run now / Pause / Stop check), history ledger per watch.
Race: setup panel (task + up to 3 sites, replay chips), lanes, winner panel only when all finished. Leaderboard: ranked
ledger (rank, site, score, band, bot wall, date).

### 5.5 Landing (`#/`)

1. Top bar: logo, Product, Pricing, Docs, GitHub, "Open app" (secondary) and "Run a free test" (primary).
2. Hero, two columns: mono eyebrow "FOR ONLINE STORES AND THE TEAMS WHO BUILD THEM"; headline "Can AI agents actually use
   your website?"; one-line sub; URL field + Run test (starts a real test, opens the report); three ticks (real agents,
   live; score with fixes; works on localhost and in CI). Right: product panel with the T1-T4 ledger filling row by row
   and a score settling (recorded demo data, no network).
3. Strip: "Agents arrive as" cloud · India home address · stealth browser.
4. Three feature rows (copy left, real panel right, alternating): Test and score; Fix report with evidence; Watch and
   alerts.
5. Developers: CLI command and GitHub Action YAML in CodeBlocks, the README badge.
6. Results: demo store with flaws vs fixed (steps 35 → 19, cost ₹49 → ₹27, score 91 → 97), dated, our store only.
7. FAQ (from RESEARCH Q&A, rewritten for store owners), final call to action, footer (product, docs, GitHub, license,
   responsible testing).

### 5.6 Pricing (`#/pricing`)

Three columns, no prices: **Free** (Instant Scan and a full four-task test, CLI), **Watch** (scheduled re-tests, Slack
or Discord alerts, history; early access), **Team** (CI check, API, several sites; talk to us). Below: "What a test
costs" in plain words (agent steps, typical ₹ range from `estimateCost`, the per-test limit), and a short FAQ.

### 5.7 Docs (`#/docs/<slug>`)

SiteShell with a docs sidebar and an "On this page" list on wide screens. Pages:

| Slug | Source |
|---|---|
| `getting-started` | README quick start |
| `scoring` | ARCHITECTURE sections 6-7 |
| `findings` | generated from `FINDING_TYPES` + `FIX_TEMPLATES` |
| `task-packs` | generated from `PACKS`, `TASK_LABELS`, `TASK_GOALS` |
| `cli` | `apps/cli/README.md` |
| `github-action` | ARCHITECTURE section 16, `action.yml` inputs |
| `api` | ARCHITECTURE section 10 |
| `watch` | ARCHITECTURE section 12 |
| `self-hosting` | ARCHITECTURE sections 18-19 (env vars) |
| `responsible-testing` | RESEARCH Q&A (no logins, no orders, owner consent) |

Docs are JSX modules in `apps/web/src/docs/` with a small shared layout; code samples use CodeBlock.

## 6. Quality

- Contrast: a unit test computes WCAG contrast for every text/background token pair in both themes (AA: 4.5:1 body,
  3:1 large text and badges' borders).
- Keyboard: sidebar, drawer (Escape closes, focus returns), tabs (arrow keys), replay controls, copy buttons.
- Phone: no horizontal scroll at 390 px on every route; ledgers hide secondary columns; lanes stack.
- Print: report prints cleanly in light colours.

## 7. Testing

- Unit (`node:test`): route parsing and redirects, docs data covers every finding type and pack, contrast of token
  pairs.
- E2E (`apps/web/e2e/run.mjs`): updated to the new routes and labels; new steps for landing → run test, pricing, docs
  navigation, old-link redirects, theme on site + app, phone width on all areas.
- After each step: `npm test`, `npm run test:e2e`, and a browser check in light, dark and phone width.

## 8. Rollout

Branch `manideep/redesign` on top of PR #33, commits in this order: tokens + fonts + Logo + kit → app shell + routes +
redirects → Tests home + report → Watch, Race, Leaderboard → landing → pricing → docs → removals + dependency cleanup →
README screenshots, D44, CHANGELOG, WORKLOG. Each commit keeps the app running and the tests green.

## 9. Out of scope

Accounts and sign-in, billing, a separate docs generator, translating the UI, and any server or engine behaviour change
(the redesign is web-only).
