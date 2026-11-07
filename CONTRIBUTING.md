# Contributing to AgentReady

Thanks for helping. This guide covers setup, how we work, and the few rules that keep results trustworthy.

## Set up

You need Node 20.19 or newer.

```bash
npm install
npm run build -w @agentready/web
TINYFISH_MOCK=1 npm start      # replay mode: real recorded runs, no API key, no credits
```

`npm run dev` runs the server on `:4000` and a live-reloading dashboard on `:5173`. Live agents need a TinyFish API key in `.env` (copy `.env.example`) and `TINYFISH_MOCK=0`. **Every live agent step costs money** (about $0.016), so build and test in replay mode.

## Before you open a pull request

```bash
npm test             # engine, server and CLI tests (replay mode, no credits)
npm run test:e2e     # click-through tests in a real browser, for dashboard changes
```

Both run in CI on every pull request. A few tests use Unix signals or symlinks and fail on plain Windows; CI on Linux is the reference.

## How we work

1. Branch from `main` (`yourname/short-topic`).
2. Keep the change small and focused; one topic per pull request.
3. Rebase on `main` before asking for review.
4. Fill in the pull request template: what changed, why, and how you tested it.
5. A maintainer reviews and merges.
6. `npm test` must pass on the pull request before it can merge into `main`.

Core team: agent instructions (`AGENTS.md`, `CLAUDE.md`), research notes, the work log and design plans live in the private
`Agent-Ready-internal` repo. Clone it beside this one and run its `link.sh`; this repo ignores those paths.

## Rules that keep results trustworthy

- **JavaScript (ES modules) and JSX.** No TypeScript; the design system is plain JSX in `apps/web/src/design`.
- **Every TinyFish call lives in `packages/engine/src/tinyfish.js`.** Nothing else talks to the API.
- **The shared data shapes are in `packages/engine/src/types.js`.** Changing them affects every part of the app: open an issue first.
- **Scoring is plain code.** AI may write fix explanations, never decide a score.
- **Only trust what the steps show.** An agent's claim counts only when its steps back it up.
- **Every finding names a site cause.** Never word one as "the agent got confused".
- **Plain language in the dashboard.** Store owners read it, not just developers.
- **Never commit `.env`, keys or webhook URLs.** The key stays on the server; the browser never sees it.

## Reporting bugs and ideas

Use the issue templates. For security problems, follow [`SECURITY.md`](SECURITY.md) instead of opening a public issue.
