# Changelog

Notable changes to AgentReady. Dates are in 2026.

## Unreleased

- New README with screenshots of the dashboard and real results.
- MIT license, contributor guide, security policy, issue and pull request templates.
- `npm test` runs on every push and pull request (replay mode, no credits).
- `.gitattributes` keeps line endings consistent across Windows, macOS and Linux.
- **Task packs:** shop, SaaS, content and local sites, each with four tasks; the Instant Scan can pick the pack.
- **Confirm results:** an opt-in second run per task (a third when they disagree); the majority counts and a disagreement is flagged.
- **Claim checks:** the page an agent names is re-read to check the price, return days or contact details it reported.
- **New findings:** no feedback after Add to cart, price read from an image, inconsistent results, unconfirmed claims, robots.txt blocking AI agents, no cart link.
- **Spending limits:** a cost estimate before every test, a per-test limit (default ₹300) and an optional daily limit.
- **Instant Scan v2:** robots.txt rules for AI agents, llms.txt, a visible cart link.
- **Report page:** Detailed Fix Report button, copy link, Save as PDF, score history for the site with what changed, and a step-by-step timeline with replay.
- **Redesign:** one design system for the app, a new landing page, pricing and a ten-page docs site. Paper-and-ink look with one orange accent, Inter and JetBrains Mono, a sidebar workbench, a tabbed report, a step-path logo. Light and dark, phone width, keyboard and print checked by tests. Old links keep working.
- **Demo store v2:** two flaws that change the outcome (`qtyTwo`, `slowCart`, or `?flaws=all`).

## 0.2.0 (2 Nov)

- **Cancel anything:** Stop button, `POST /api/tests/:id/cancel`, Ctrl+C in the CLI, pausing a watch. Cancelled runs are stopped on TinyFish so they stop costing money, and a cancel never triggers a bot-wall retry.
- **Fair queue:** a person's test goes ahead of waiting Watch checks; lanes explain why they wait.
- **Safer server:** input checks on every endpoint, rate limits on endpoints that start agents, foreign-origin requests refused, at most 6 tests at once, recovery after a restart, clean shutdown.
- **Answer checks:** new findings for a wrong quantity in the cart and a price in the wrong currency, based on the agent's own answer.
- **Honest replay mode:** sites with no recording are refused, and a replayed custom task says it is a replay.
- **Race and Leaderboard** pages, shown when their feature flag is on.
- **GitHub Action** (`action.yml`) that tests a pull request's preview deployment and comments on the PR.
- **Publishable CLI** (`@agentready/cli`, built by `scripts/pack-cli.mjs`) with `--version` and `--badge`.
- **Score badge** for READMEs, from the CLI or `GET /api/badge/:id.svg`.
- Test suite with `node:test` and Playwright click tests; dependencies updated (vite 7, node-cron 4).

## 0.1.0 (1 Nov)

First version, built at Swim with TinyFish (Scaler School of Technology).

- Live test of four shopping tasks with real TinyFish agents, side by side.
- Bot-wall check: no proxy, then an Indian home address, then a stealth browser.
- Score out of 100, Top 3 fixes, findings that answer six questions, screenshot for every step.
- Instant Scan of the home page and a product page.
- Demo store with switchable flaws and a one-click before/after.
- Agent-Ready Watch with Slack and Discord alerts.
- CLI that tests a site on your laptop through a Cloudflare tunnel.
- Replay mode that plays back real recorded runs without credits.
