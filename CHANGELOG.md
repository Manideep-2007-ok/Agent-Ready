# Changelog

Notable changes to AgentReady. Dates are in 2026.

## Unreleased

- New README with screenshots of the dashboard and real results.
- MIT license, contributor guide, security policy, issue and pull request templates.
- `npm test` runs on every push and pull request (replay mode, no credits).
- `.gitattributes` keeps line endings consistent across Windows, macOS and Linux.

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
