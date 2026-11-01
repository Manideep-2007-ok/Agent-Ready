# AgentReady

**Can AI agents actually use your website?** Real TinyFish web agents try everyday tasks (find a price, add to cart, find the return policy, contact support) on your site, live. We score each task, show the exact step and screenshot where an agent got stuck, explain why, and tell you how to fix it. Agent-Ready Watch keeps re-testing your live site and alerts you the day AI shoppers can no longer buy.

Built by Team Mavericks (Manideep Thumu, Sai Shakti Nayak, Akhil Daitha) at Swim with TinyFish, Scaler School of Technology, 1 Nov 2026.

- Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md)
- Research and test evidence: [`docs/RESEARCH.md`](docs/RESEARCH.md)
- Rules for coding agents: [`AGENTS.md`](AGENTS.md)

## Quick start

```bash
bash scripts/setup-demo.sh   # installs, asks for the key (hidden), builds, starts: open http://localhost:4000
```

Or by hand:

```bash
cp .env.example .env      # add your TINYFISH_API_KEY (TINYFISH_MOCK=1 replays real runs, no credits)
npm install
npm run build -w @agentready/web && npm start -w @agentready/server   # dashboard + API on http://localhost:4000
npm run dev               # development: server on :4000, live-reload dashboard on :5173
```

The server listens on this machine only (`127.0.0.1`); set `HOST=0.0.0.0` to share it on a network on purpose.
