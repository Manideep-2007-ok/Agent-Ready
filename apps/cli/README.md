# AgentReady CLI

Test whether AI agents can use your site, including one running on your laptop.

```bash
node apps/cli/bin/agentready.js http://localhost:3000        # needs cloudflared (tunnel)
node apps/cli/bin/agentready.js https://example.com --tasks find_price,add_to_cart
node apps/cli/bin/agentready.js https://example.com --json > report.json
node apps/cli/bin/agentready.js https://example.com --min-score 80   # exit 1 if lower (CI)
```

Flags: `--tasks` (find_price, add_to_cart, find_returns, find_contact), `--json`, `--min-score N`, `--no-tunnel`.
Needs `TINYFISH_API_KEY` in `.env` (or `TINYFISH_MOCK=1` to replay recorded runs for free).
Set `AGENTREADY_SERVER=http://localhost:4000` to also upload the report to the dashboard.
Exit codes: 0 ok, 1 score below `--min-score` or test failed, 2 usage error / cloudflared missing.
