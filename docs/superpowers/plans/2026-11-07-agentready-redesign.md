# AgentReady Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the web app as a professional product site (design system, workbench app, landing, pricing, docs) with one set of tokens and components everywhere.

**Architecture:** A plain-JSX design kit (`apps/web/src/design/`) owns tokens, fonts, logo and components. A pure `routes.js` parses the hash into areas (`site`, `docs`, `app`) and redirects old links. Pages are split per area (`pages/site`, `pages/docs`, `pages/app`); the report becomes a tabbed workbench page reusing the existing data hooks in `api.js`. Docs data that lives in Node-only engine modules is generated to JSON by a script and checked by a test.

**Tech Stack:** React 18, Vite 7, plain JS + JSX (D1), CSS custom properties, lucide-react, node:test, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-11-07-agentready-redesign-design.md`

## Global Constraints

- JavaScript ES modules + JSX only; no TypeScript files remain in `apps/web/src` after Task 8.
- No new npm dependencies. Fonts are copied as woff2 files into `apps/web/public/fonts/` (not installed as packages).
- Colours come only from `apps/web/src/design/tokens.css`; no hex values in any other `.css`/`.jsx` file under `apps/web/src` (logo SVG uses `var(--accent)`; the only exception is `public/favicon.svg`).
- Token values exactly as spec section 3.1 (light accent `#C2410C`, dark accent `#FF7A3D`, faint `#6E6C75` / `#8B8C96`, etc.).
- Every text/background token pair used for text meets WCAG AA 4.5:1 (enforced by `apps/web/test/contrast.test.js`).
- Corners 4 px (`--radius`), 8 px (`--radius-lg`) only on landing product panels; no gradients; shadow only on popovers and the phone drawer.
- Sentence case, no exclamation marks, no "successfully"; findings name a site cause (D22); public pages name no third-party company.
- At most one primary button per view.
- `prefers-reduced-motion: reduce` turns all motion off.
- Old hash links keep working via `location.replace` redirects (spec section 4).
- `npm test` and `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` pass at the end of every task.
- Commits as `Manideep-2007-ok <manideepthumu3@gmail.com>` (`git -c user.name=... -c user.email=...`), message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Old links with an encoded id and a before id (`#/test/rep_x%2Dy/rep_z`) must land on the same report, not a 404 or a loop. → `routes.test.js` case in Task 3.
2. Unknown routes (`#/foo`, `#/app/nope`, `#/docs/nope`) must show a sensible page (landing, Tests home, docs "page not found" with the docs nav), never a blank screen. → `routes.test.js` cases in Task 3; docs not-found step in Task 7.
3. A report refreshed while running must still show live lanes on Overview and let Stop work after the tab move. → e2e step "refresh mid-run keeps lanes and Stop" in Task 4.
4. Theme with blocked storage (private window) and system dark must render dark without errors. → e2e step in Task 9 (context with `colorScheme: 'dark'` and `localStorage` throwing via init script).
5. Long host names and long agent answers must not cause sideways scroll at 390 px in ledgers and the report header. → e2e phone step in Task 9 opens a report whose URL host is 60+ characters (served in replay via `POST /api/reports` CLI upload).

---

## File map

| File | Responsibility |
|---|---|
| `apps/web/src/design/tokens.css` | all colour, radius, shadow, type tokens, light + dark |
| `apps/web/src/design/fonts.css` | `@font-face` for Inter 400/500/600 and JetBrains Mono 400/500 |
| `apps/web/src/design/base.css` | reset-lite, body, headings, links, focus ring, print base |
| `apps/web/src/design/kit.css` | styles for kit components (class prefix `ar-`) |
| `apps/web/src/design/*.jsx` | `Button`, `Badge`, `Panel`, `Ledger`, `Stat`, `Tabs`, `Field`, `Toast`, `EmptyState`, `Skeleton`, `CodeBlock`, `Logo`, `ThemeToggle` |
| `apps/web/src/design/index.js` | re-exports the kit |
| `apps/web/src/routes.js` | `parseHash`, `redirectFor`, `href` (pure) |
| `apps/web/src/shell/AppShell.jsx`, `SiteShell.jsx` | workbench sidebar shell; marketing/docs top bar + footer |
| `apps/web/src/pages/app/*` | `TestsHome`, `ReportPage` + `report/{Overview,Findings,Steps,History,Scan}Tab.jsx`, `WatchPage`, `RacePage`, `LeaderboardPage` |
| `apps/web/src/pages/site/*` | `Landing.jsx`, `Pricing.jsx`, `HeroLedger.jsx` |
| `apps/web/src/pages/docs/*` | `DocsPage.jsx` (layout + nav), one module per slug |
| `apps/web/src/docs/generated.json` | findings + packs data, generated |
| `scripts/gen-docs-data.mjs` | writes `generated.json` from the engine |
| `apps/web/test/*.test.js` | routes, contrast, docs data (picked up by `scripts/run-tests.mjs`) |

---

### Task 1: Tokens, fonts and the contrast test

**Files:**
- Create: `apps/web/src/design/tokens.css`, `apps/web/src/design/fonts.css`, `apps/web/src/design/base.css`, `apps/web/public/fonts/{inter-400,inter-500,inter-600,jetbrains-mono-400,jetbrains-mono-500}.woff2`, `apps/web/test/contrast.test.js`
- Modify: `apps/web/src/main.jsx` (import `./design/fonts.css`, `./design/tokens.css`, `./design/base.css` before `./tailwind.css`), `apps/web/index.html` (remove Google Fonts links incl. Bangers; keep the theme pre-paint script)

**Interfaces:**
- Produces: CSS custom properties named exactly as spec 3.1 (`--bg --surface --surface-2 --border --border-strong --text --text-muted --text-faint --accent --accent-ink --accent-soft --pass --pass-soft --warn --warn-soft --fail --fail-soft --wait --wait-soft --radius --radius-lg --shadow-pop`) plus `--font-sans: 'Inter', system-ui, sans-serif` and `--font-mono: 'JetBrains Mono', ui-monospace, monospace`. Light on `:root`, dark on `:root[data-theme='dark']`.
- During Tasks 1-7 the old `styles.css` stays and keeps working: in `tokens.css` also alias the old names it uses (`--card: var(--surface)`, `--muted: var(--text-muted)`, `--line: var(--border)`, `--soft: var(--surface-2)`, `--pass-bg: var(--pass-soft)`, `--warn-bg: var(--warn-soft)`, `--fail-bg: var(--fail-soft)`, `--wait-bg: var(--wait-soft)`, `--link: var(--accent)`) and remove the old definitions from `styles.css` lines 3-55.

- [ ] **Step 1: Write the failing test** `apps/web/test/contrast.test.js`

Parses `tokens.css` (regex over `--name: #hex;` inside the `:root {` and `:root[data-theme='dark'] {` blocks), computes WCAG contrast, and asserts, for both themes:

```js
const PAIRS = [ // [text, background]
  ['--text', '--bg'], ['--text', '--surface'], ['--text', '--surface-2'],
  ['--text-muted', '--bg'], ['--text-muted', '--surface'], ['--text-muted', '--surface-2'],
  ['--text-faint', '--bg'], ['--text-faint', '--surface'],
  ['--accent-ink', '--accent'], ['--accent', '--bg'], ['--accent', '--surface'],
  ['--pass', '--surface'], ['--warn', '--surface'], ['--fail', '--surface'], ['--wait', '--surface'],
];
test('every text token pair meets WCAG AA 4.5:1 in light and dark', ...) // assert ratio >= 4.5, message names the pair and theme
test('tokens.css defines every spec token in both themes', ...)        // the 17 colour names exist in both blocks
```

Soft tokens are `rgba`/`color-mix` and are not in PAIRS; badges put `--pass` text on `--pass-soft` over `--surface`, so also assert `--pass/--warn/--fail` vs the soft colour composited over `--surface` (alpha from the spec: 10/12/10 % light, 14 % dark) is ≥ 4.5.

- [ ] **Step 2: Run** `npm test -- contrast` — Expected: FAIL (`tokens.css` missing).
- [ ] **Step 3: Write `tokens.css`, `fonts.css`, `base.css`**; fetch the woff2 files without adding dependencies: `cd $(mktemp -d) && npm pack @fontsource/inter@5 @fontsource/jetbrains-mono@5 && tar xzf` each, copy `files/*-latin-{400,500,600}-normal.woff2` to `apps/web/public/fonts/` under the names above. `base.css` sets `body { font: 15px/1.55 var(--font-sans); background: var(--bg); color: var(--text); }`, `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }`, and `@media (prefers-reduced-motion: reduce) { *, *::before, *::after { transition: none !important; animation: none !important; } }`.
- [ ] **Step 4: Run** `npm test -- contrast` — Expected: PASS. Then `npm run build -w @agentready/web` — Expected: build succeeds; `dist/fonts/*.woff2` present.
- [ ] **Step 5: Run full** `npm test` and e2e — Expected: all pass (old pages now render with the new palette via aliases).
- [ ] **Step 6: Commit** `Web: design tokens (paper and ink, ember accent), self-hosted Inter and JetBrains Mono, contrast test`

---

### Task 2: Design kit and logo

**Files:**
- Create: `apps/web/src/design/{Button,Badge,Panel,Ledger,Stat,Tabs,Field,Toast,EmptyState,Skeleton,CodeBlock,Logo,ThemeToggle}.jsx`, `apps/web/src/design/kit.css`, `apps/web/src/design/index.js`, `apps/web/public/favicon.svg`, `docs/media/agentready-logo.svg`, `apps/web/test/kit.test.js`
- Modify: `apps/web/index.html` (icon → `/favicon.svg`), `apps/web/src/main.jsx` (import `./design/kit.css`)

**Interfaces (Produces, used by every later task):**
- `Button({variant='secondary'|'primary'|'ghost', size='md'|'sm', loading=false, as='button'|'a', ...rest})` → `<button class="ar-btn ar-btn--{variant} ar-btn--{size}">`; `loading` sets `aria-busy` and keeps the label.
- `Badge({tone='neutral'|'pass'|'fail'|'warn'|'wait'|'accent', children})` → mono uppercase chip.
- `statusBadge(status: TaskStatus, verdict?: BotWallVerdict) -> {tone, label}` (pure, in `Badge.jsx`): `passed→pass PASSED`, `failed→fail FAILED`, `blocked` or failed with a wall verdict `→fail BLOCKED`, `running→accent RUNNING`, `queued→wait WAITING`, `cancelled→wait STOPPED`.
- `scoreBand(score:number) -> {tone, label}`: ≥80 `pass "Ready for AI agents"`, ≥50 `warn "Partly ready"`, else `fail "Not ready"`.
- `Panel({label?, actions?, children, as='section'})`; `Ledger({columns:[{key,label,align?,hideOnPhone?,mono?}], rows:[{id, cells:{...}, href?, onClick?}], empty?})` renders a `<table>` with a mono `ID` column from `row.id`; rows with `href` render as links (whole row clickable, keyboard reachable).
- `Stat({value, unit?, label})`; `Tabs({tabs:[{id,label,count?}], current, onChange})` with roving tabindex + Arrow/Home/End; `Field({label, help?, error?, children})`; `Toast` via `useToast() -> show(text)`; `EmptyState({title, body, action?})`; `Skeleton({rows=3})`; `CodeBlock({code, language?})` with a Copy button (uses `navigator.clipboard`, falls back to selecting the text); `Logo({size=24, wordmark=true, compact?})` (compact = no dashed path, used automatically when `size < 20`); `ThemeToggle()` (reads/writes `data-theme` and `localStorage.agentready_theme`, both in try/catch; icon button with `aria-label` "Switch to dark theme"/"Switch to light theme").

- [ ] **Step 1: Write the failing test** `apps/web/test/kit.test.js` for the two pure helpers:

```js
assert.deepEqual(statusBadge('passed'), { tone: 'pass', label: 'PASSED' });
assert.deepEqual(statusBadge('failed', 'blocks-cloud-agents'), { tone: 'fail', label: 'BLOCKED' });
assert.deepEqual(statusBadge('cancelled'), { tone: 'wait', label: 'STOPPED' });
assert.deepEqual(statusBadge('queued'), { tone: 'wait', label: 'WAITING' });
assert.deepEqual(scoreBand(80).tone, 'pass'); assert.deepEqual(scoreBand(79).tone, 'warn'); assert.deepEqual(scoreBand(49).tone, 'fail');
```

Put `statusBadge` and `scoreBand` in `apps/web/src/design/status.js` (plain JS, no JSX) so node:test can import them; `Badge.jsx` imports from it.

- [ ] **Step 2: Run** `npm test -- kit` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `status.js`, the components and `kit.css`. Logo SVG (viewBox 0 0 32 32): `rect rx=7 fill=var(--accent)`; dots `circle cx=8 cy=22 r=2.2` and `cx=14 cy=15 r=2.2` fill `var(--accent-ink)`; dashed `path d="M8 22 L14 15 L18 18"` stroke-dasharray `2 2` width 1.6 (omitted when compact); check `path d="M17 18 L20.5 21.5 L26 11"` stroke width 2.6, round caps. `favicon.svg` is the compact mark with `#C2410C` and `#FFFFFF` literals.
- [ ] **Step 4: Run** `npm test -- kit` — Expected: PASS; `npm run build -w @agentready/web` succeeds.
- [ ] **Step 5: Commit** `Web: design kit (button, badge, panel, ledger, tabs, field, toast, code block) and step-path logo`

---

### Task 3: Routes, redirects and the two shells

**Files:**
- Create: `apps/web/src/routes.js`, `apps/web/test/routes.test.js`, `apps/web/src/shell/AppShell.jsx`, `apps/web/src/shell/SiteShell.jsx`, `apps/web/src/shell/shell.css`
- Modify: `apps/web/src/App.jsx` (rewrite: route by area; existing pages render inside `AppShell` for now; temporary landing = existing `TestPage` hero inside `SiteShell` until Task 6), `apps/web/src/nav.js` (`navigate(...)` now builds `#/app/...` via `href`), `apps/web/e2e/run.mjs` (tab links → sidebar links; `#/test/...` gotos may stay: they exercise redirects)

**Interfaces:**
- Produces in `routes.js` (pure):
  - `parseHash(hash:string) -> {area:'site'|'docs'|'app', page:string, id:string|null, extra:string|null}`; pages: site `landing|pricing`; docs `<slug>` (default `getting-started`, kept as given even if unknown); app `tests|test|watch|race|leaderboard` (unknown → `tests`).
  - `redirectFor(hash:string) -> string|null`: old `#/test`→`#/app`, `#/test/<id>[/<b>]`→`#/app/test/<id>[/<b>]` (segments kept encoded as given), `#/watch|#/race[/<id>]|#/leaderboard`→`#/app/...`; anything else `null`.
  - `href(area, page, ...parts) -> string` (encodes parts with `encodeURIComponent`).
- `AppShell({page, features, replay, title, crumbs?, actions?, children})`; `SiteShell({active:'product'|'pricing'|'docs', children})`.

- [ ] **Step 1: Write the failing tests** in `routes.test.js`:

```js
assert.deepEqual(parseHash(''), { area: 'site', page: 'landing', id: null, extra: null });
assert.deepEqual(parseHash('#/pricing').page, 'pricing');
assert.deepEqual(parseHash('#/docs'), { area: 'docs', page: 'getting-started', id: null, extra: null });
assert.equal(parseHash('#/docs/nope').page, 'nope');
assert.deepEqual(parseHash('#/app'), { area: 'app', page: 'tests', id: null, extra: null });
assert.deepEqual(parseHash('#/app/test/rep_a%2Db/rep_c'), { area: 'app', page: 'test', id: 'rep_a-b', extra: 'rep_c' });
assert.equal(parseHash('#/app/nope').page, 'tests');
assert.equal(parseHash('#/foo').page, 'landing');
assert.equal(redirectFor('#/test/rep_a%2Db/rep_c'), '#/app/test/rep_a%2Db/rep_c');
assert.equal(redirectFor('#/test'), '#/app');
assert.equal(redirectFor('#/race/race_1'), '#/app/race/race_1');
assert.equal(redirectFor('#/app/watch'), null);
assert.equal(href('app', 'test', 'rep 1', null), '#/app/test/rep%201');
```

- [ ] **Step 2: Run** `npm test -- routes` — Expected: FAIL.
- [ ] **Step 3: Implement** `routes.js`; in `App.jsx`, on load and on every `hashchange`: if `redirectFor(location.hash)` returns a target, `location.replace(target)` and stop; else set the route and `scrollTo(0,0)`. Flag-off app pages (`race`, `leaderboard`) render Tests home. Build `AppShell` per spec 5.1 (sidebar 232 px, WORKSPACE/RESOURCES groups, `aria-current="page"`, drawer under 900 px: menu button `aria-expanded`, Escape closes and returns focus to the button) and `SiteShell` per spec 5.5 item 1 + footer.
- [ ] **Step 4: Run** `npm test -- routes` — Expected: PASS. Update e2e navigation steps (tabs → `getByRole('navigation', {name: 'Workspace'}).getByRole('link', {name})`), then run e2e — Expected: 37/37.
- [ ] **Step 5: Commit** `Web: hash routes for site, docs and app with redirects for old links; workbench and site shells`

---

### Task 4: Tests home and the report workbench

**Files:**
- Create: `apps/web/src/pages/app/TestsHome.jsx`, `apps/web/src/pages/app/ReportPage.jsx`, `apps/web/src/pages/app/report/{ReportHeader,OverviewTab,FindingsTab,StepsTab,HistoryTab,ScanTab}.jsx`, `apps/web/src/pages/app/app.css`
- Modify: `Lane.jsx`, `FindingCard.jsx` (→ a ledger row that expands), `StepTimeline.jsx`, `SiteHistory.jsx`, `ReportActions.jsx` (→ header actions), `InstantScanCard.jsx` (→ `ScanTab` ledger), `DemoStoreCard.jsx`, `TopFixes.jsx`, `ShotViewer.jsx`, `Lane.css`, `InstantScanCard.css` to use kit components and tokens; `App.jsx` routes `tests` and `test`
- Delete: `apps/web/src/pages/TestPage.jsx`, `ScoreCard.jsx` (logic moves to `ReportHeader`/`OverviewTab`)
- Test: `apps/web/e2e/run.mjs`

**Interfaces:**
- Consumes: kit (Task 2), `href`/`navigate` (Task 3), `api.js` unchanged (`useLiveEvents`, `useQueueNote`, `startTest`, `getEstimate`, `getReport`, `listReports`, `cancelTest`, `buildFixes`, `setDemoFlaws`, `getSiteHistory`).
- Produces: `ReportPage({id, beforeId})`. The current tab is component state (default `overview`), not part of the hash, so shared links stay `#/app/test/<id>`.
- Accessible names kept for e2e: URL field label "Website to test", custom task label "Custom task"; primary button "Run test" (e2e `clickTest` regex updated to `/^Run test$/`), "Stop test", "Get detailed fix report", "Copy link", "Save as PDF".

- [ ] **Step 1: Update e2e first** (fail-first): change `clickTest`, wait on `.ar-report-header` instead of `.score-card`, open the Findings tab before "See details" jump step, Steps tab for the timeline, and add the Review Focus #3 step: start a slow replay test, `page.reload()` mid-run, expect `.ar-lane` visible on Overview, click "Stop test", expect the "Test stopped" panel.
- [ ] **Step 2: Run e2e** — Expected: FAIL on the changed selectors.
- [ ] **Step 3: Build `TestsHome`** per spec 5.2 (pack select values `auto|shop|saas|content|local` sent as `pack` in `startTest` — extend `startTest(url, customTask, {confirm, pack})` in `api.js`; recent tests `Ledger` with columns site/pack/score/status/cost/date) and **`ReportPage`** per spec 5.3 (header Stat + band from `scoreBand`, Overview with Top 3 ledger linking to Findings by switching tab and scrolling to `#finding-<n>`, task ledger T1-T4 with `statusBadge`, live lanes + Stop while running, demo before/after card; stopped and cost-limit panels; not-found `EmptyState` linking `#/app`). Print CSS in `app.css`: hide shell and tab bar, render all tab panels in order (each tab panel is always mounted with `hidden` toggled, `@media print { [role=tabpanel][hidden] { display: block } }`).
- [ ] **Step 4: Run e2e** — Expected: PASS; `npm test` PASS.
- [ ] **Step 5: Check in the browser** (replay server, `.claude/launch.json` `agentready-replay`): a confirmed test of `nykaa.com` in light and dark, every tab, phone width 390. Expected: no sideways scroll, badges readable.
- [ ] **Step 6: Commit** `Web: Tests home and tabbed report workbench (overview, findings, steps, history, scan)`

---

### Task 5: Watch, Race and Leaderboard on the kit

**Files:**
- Create: `apps/web/src/pages/app/{WatchPage,RacePage,LeaderboardPage}.jsx` (moved from `pages/`)
- Delete: `apps/web/src/pages/{WatchPage,RacePage,LeaderboardPage}.jsx`
- Modify: `App.jsx` imports; `apps/web/e2e/run.mjs` selectors (`.watch-card` → `.ar-panel`, etc.)

**Interfaces:**
- Consumes: kit, `Lane` (Task 4), api.js watch/race/leaderboard helpers unchanged. Behaviour and API calls identical to today (spec 5.4); accessible names of existing buttons kept ("Run now", "Pause", "Resume", "Stop check", "Stop race", "Start race").

- [ ] **Step 1: Run e2e** to record the current Watch/Race/Leaderboard steps passing.
- [ ] **Step 2: Rebuild the three pages** with Panel, Ledger, Field, Badge, Button per spec 5.4; update the e2e selectors that pointed at old classes.
- [ ] **Step 3: Run e2e** — Expected: all Watch, Race, Leaderboard and flags-off steps PASS.
- [ ] **Step 4: Commit** `Web: Watch, Race and Leaderboard on the design kit`

---

### Task 6: Landing and pricing

**Files:**
- Create: `apps/web/src/pages/site/{Landing,Pricing,HeroLedger,FeatureRow,Faq}.jsx`, `apps/web/src/pages/site/site.css`
- Modify: `App.jsx` (site area), `apps/web/e2e/run.mjs` (home steps)

**Interfaces:**
- Consumes: kit, `SiteShell`, `startTest` + `navigate(href('app','test',id))`, `getEstimate(4,false)` for the pricing cost line.
- `HeroLedger()` animates rows T1-T4 from a constant built from `data/cached-demo/reports/rep_demo_flaws_off.json` values typed inline (task label, steps, PASSED, score 97); one row per 600 ms, static under reduced motion. No network.

- [ ] **Step 1: Update e2e home steps first:** home shows `h1` "Can AI agents actually use your website?", the URL box runs a replay test and lands on `#/app/test/<id>`, "Open app" goes to `#/app`, "Pricing" shows three plans named Free, Watch, Team and no "₹" price per month, footer links work; remove fact-card and bento steps.
- [ ] **Step 2: Run e2e** — Expected: FAIL on the new home steps.
- [ ] **Step 3: Build** Landing (spec 5.5 items 1-7; copy from the spec; demo-store numbers 35 → 19 steps, ₹49 → ₹27, 91 → 97, dated 1 Nov 2026) and Pricing (spec 5.6; cost line "A full four-task test usually costs ₹{low} to ₹{high} in agent steps; every test stops at ₹{perTest}" from `/api/estimate`, with the replay wording when `mock`).
- [ ] **Step 4: Run e2e** — Expected: PASS. Browser check light/dark/phone.
- [ ] **Step 5: Commit** `Web: landing page and pricing`

---

### Task 7: Docs

**Files:**
- Create: `scripts/gen-docs-data.mjs`, `apps/web/src/docs/generated.json`, `apps/web/test/docs-data.test.js`, `apps/web/src/pages/docs/{DocsPage,nav}.jsx` and one module per slug in spec 5.7 (`GettingStarted.jsx`, `Scoring.jsx`, `Findings.jsx`, `TaskPacks.jsx`, `Cli.jsx`, `GithubAction.jsx`, `Api.jsx`, `Watch.jsx`, `SelfHosting.jsx`, `ResponsibleTesting.jsx`)
- Modify: `App.jsx` (docs area), root `package.json` script `"docs:data": "node scripts/gen-docs-data.mjs"`

**Interfaces:**
- `scripts/gen-docs-data.mjs` imports `FINDING_TYPES` (types.js), `FIX_TEMPLATES` (fixes.js), `PACKS`, `TASK_LABELS`, `TASK_GOALS` (goals.js) and writes `{findings:[{type, severity?, likelyCause, fix, standard, passCheck}], packs:[{id,label,blurb,tasks:[{id,label,goal}]}]}` with 2-space JSON and a trailing newline.
- `DocsPage({slug})`: left nav from `nav.jsx` (ordered as spec 5.7), "On this page" from the module's `h2` ids, unknown slug → "This page does not exist" + nav (Review Focus #2).

- [ ] **Step 1: Write the failing test** `docs-data.test.js`:

```js
const data = JSON.parse(fs.readFileSync('apps/web/src/docs/generated.json'));
assert.deepEqual(data.findings.map((f) => f.type).sort(), [...FINDING_TYPES].sort());
assert.deepEqual(data.packs.map((p) => p.id), PACK_ID_LIST);
assert.ok(data.findings.every((f) => f.fix && f.likelyCause));
// up to date: regenerating gives the same bytes
assert.equal(execFileSync('node', ['scripts/gen-docs-data.mjs', '--stdout']).toString(), fs.readFileSync('apps/web/src/docs/generated.json', 'utf8'));
```

- [ ] **Step 2: Run** `npm test -- docs-data` — Expected: FAIL.
- [ ] **Step 3: Implement** the script (`--stdout` prints instead of writing), generate the JSON, build DocsPage and the ten pages (content sources per spec 5.7 table; CLI/Action/API code samples in `CodeBlock`).
- [ ] **Step 4: Run** `npm test -- docs-data` — Expected: PASS. Add e2e steps: Docs nav opens each of the ten pages with an `h1`; `#/docs/nope` shows "This page does not exist" and the nav. Run e2e — PASS.
- [ ] **Step 5: Commit** `Docs site: ten pages, findings and task packs generated from the engine`

---

### Task 8: Remove the hackathon pieces and unused dependencies

**Files:**
- Delete: `apps/web/src/components/ui/` (all `.tsx`), `PointerCursor.jsx`, `apps/web/src/styles.css`, `apps/web/src/tailwind.css`, `apps/web/src/lib/` (if only `cn()` for ui), the old `Celebrate`/`Hero`/`Features`/`AgentCloud` code if any remains
- Modify: `apps/web/package.json` (remove `@radix-ui/react-icons`, `canvas-confetti`, `class-variance-authority`, `clsx`, `cobe`, `motion`, `radix-ui`, `tailwind-merge`, `tailwindcss`, `@tailwindcss/vite`), `apps/web/vite.config.js` (drop tailwind plugin and `@` alias), `jsconfig.json` (drop the `@/*` path if present), `apps/web/src/main.jsx` (no tailwind import), `package-lock.json` via `npm install`, ARCHITECTURE section 2 dependency table

- [ ] **Step 1: Check nothing still imports them:** `grep -rnE "components/ui|@/|tailwind|motion|cobe|confetti|clsx|radix" apps/web/src` — Expected after edits: no matches.
- [ ] **Step 2: Assert no TypeScript and no stray hex** with a test added to `kit.test.js`: walk `apps/web/src`, assert no `.ts`/`.tsx` files, and no `#[0-9a-fA-F]{3,8}\b` in `.css`/`.jsx` files other than `design/tokens.css`.
- [ ] **Step 3: Run** `npm install && npm test && npm run build -w @agentready/web && CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` — Expected: all pass, `npm audit` count not higher than before.
- [ ] **Step 4: Commit** `Web: remove Magic UI pieces, Tailwind and unused dependencies; plain JS again (P1-4)`

---

### Task 9: Accessibility, phone and theme pass

**Files:**
- Modify: whichever kit/page files the checks below expose; `apps/web/e2e/run.mjs`

- [ ] **Step 1: Add e2e steps:**
  - Phone 390 px, no sideways scroll on `#/`, `#/pricing`, `#/docs/cli`, `#/app`, a report (every tab), `#/app/watch`, `#/app/race`, `#/app/leaderboard`; the drawer opens with the menu button, closes with Escape and focus returns to the button.
  - Review Focus #5: upload a CLI report (`POST /api/reports`) whose url host is `https://a-very-long-store-name-for-testing-overflow-on-phones.example.co.in/` and a 500-character answer, open it at 390 px, assert no sideways scroll.
  - Review Focus #4: a browser context with `colorScheme: 'dark'` and an init script making `localStorage.getItem/setItem` throw; open `#/` and `#/app`; expect `data-theme="dark"` and no page errors; toggle theme works.
  - Keyboard: report tabs move with ArrowRight/ArrowLeft; "Copy link" and Replay reachable by Tab.
  - Light/dark on landing, docs and a report: no page errors.
- [ ] **Step 2: Run e2e** — fix every failure in the owning component.
- [ ] **Step 3: Print check:** in Chromium, `page.pdf()` of a report (light) writes a file whose text contains every tab heading; add as an e2e step.
- [ ] **Step 4: Commit** `Web: phone, keyboard, theme and print checks for every page`

---

### Task 10: Docs, README and decision record

**Files:**
- Modify: `docs/DECISIONS.md` (add D44: design system + removal of Magic UI pieces, replaces D27; mark D27 "Replaced by D44"), `docs/ARCHITECTURE.md` (sections 2 dependency table, 3 web file layout, 13 dashboard → routes and screens), `README.md` (new screenshots `docs/images/{landing,report,docs}.png` taken with Playwright in light theme at 1440×900 against the replay server; update the image references), `CHANGELOG.md`, `docs/WORKLOG.md` (H44+ rows)

- [ ] **Step 1: Take screenshots** with a short Node script in the scratchpad using `loadPlaywright()` from `apps/web/e2e/lib.mjs` and the e2e `startServer`.
- [ ] **Step 2: Write the docs changes** above.
- [ ] **Step 3: Run** `npm test` and e2e — Expected: PASS.
- [ ] **Step 4: Commit** `Docs: D44 design system, ARCHITECTURE routes and screens, README screenshots, changelog`
