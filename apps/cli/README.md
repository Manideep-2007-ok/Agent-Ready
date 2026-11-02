# AgentReady CLI

**Can AI agents actually use your website?** Real cloud web agents (powered by [TinyFish](https://docs.tinyfish.ai)) try everyday tasks on your site: find a product and its price, add it to the cart, find the return policy, find customer support. You get a score out of 100, the exact fixes that would help, and a detection of bot protection that blocks AI agents.

```bash
export TINYFISH_API_KEY=your-key            # or put it in a .env file in the folder you run from
npx @agentready/cli https://your-site.com --no-tunnel
```

Install once instead: `npm i -g @agentready/cli`, then run `agentready https://your-site.com`.

## What you need

- **Node 20 or newer.**
- **A TinyFish API key** in `TINYFISH_API_KEY` (environment variable, or a `.env` file in the current folder). The key is only used from your computer and never printed.
- **For a site on your own computer** (`localhost:3000`): [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (`brew install cloudflared`, or the Cloudflare downloads page). The agents run in the cloud and cannot reach your laptop, so the CLI opens a temporary public tunnel.
- **For a site that is already public**, add `--no-tunnel`. (Without it, public addresses are tested directly too; the tunnel is only opened for local addresses.)

## Usage

```bash
agentready http://localhost:3000                              # laptop site, via a Cloudflare tunnel
agentready https://example.com --no-tunnel                    # public site
agentready https://example.com --tasks find_price,add_to_cart # only some tasks
agentready https://example.com --json > report.json           # machine-readable (progress goes to stderr)
agentready https://example.com --min-score 80                 # exit code 1 below 80 (for CI)
agentready https://example.com --badge agentready-badge.svg   # write a score badge
```

| Flag | Meaning |
| --- | --- |
| `--tasks a,b` | `find_price`, `add_to_cart`, `find_returns`, `find_contact` (default: all four) |
| `--json` | print the full report as JSON on stdout |
| `--min-score N` | exit with code 1 if the score is below N (0 to 100) |
| `--badge FILE` | write an Agent-Ready score badge (SVG) after the run |
| `--no-tunnel` | test the address as it is (no Cloudflare tunnel) |
| `--no-scan` | skip the Instant Scan (pop-ups, unlabelled buttons, prices in images) |
| `--version`, `--help` | version / usage |

A report JSON is also saved as `agentready-report-<id>.json` in the current folder. Set `AGENTREADY_SERVER=http://localhost:4000` to upload it to a running AgentReady dashboard.

**Exit codes:** `0` done (and at or above `--min-score`), `1` score below `--min-score` or the test could not finish, `2` usage or setup problem (unknown option, bad address, no API key, `cloudflared` missing). Ctrl+C cancels the agent runs first so they stop costing credits (exit 130).

## Cost

Agents are billed by TinyFish at about **$0.016 per step**. A task is usually 3 to 15 steps, so a full four-task test of a small store costs roughly $0.30 to $1. The CLI prints the cost at the end. Each task is time-capped (150 s by default). Replay mode (`TINYFISH_MOCK=1`) only works inside the AgentReady repository.

## Badge

```markdown
![Agent-Ready score](agentready-badge.svg)
```

Commit the SVG that `--badge` writes (or let the GitHub Action upload it) and the README shows your latest score.

## GitHub Action

```yaml
- uses: Manideep-2007-ok/Agent-Ready@v1
  with:
    url: https://your-preview.example.com
    tinyfish-api-key: ${{ secrets.TINYFISH_API_KEY }}
    min-score: 80
```

Posts one pull request comment (edited on every run), a job summary, and uploads the report and badge. See the repository docs for details.

Source and docs: https://github.com/Manideep-2007-ok/Agent-Ready
