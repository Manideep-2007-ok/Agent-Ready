# AgentReady CLI

**Can AI agents actually use your website?** Real cloud web agents (powered by [TinyFish](https://docs.tinyfish.ai)) try everyday tasks on your site. It works for online stores, SaaS sites, blogs and news sites, and local businesses: the CLI reads your site, picks the matching **task pack** and runs its four tasks. You get a score out of 100, the exact fixes that would help, and a detection of bot protection that blocks AI agents.

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
agentready https://example.com --pack saas                    # force a pack (default: auto-detect)
agentready https://example.com --tasks quick                  # the two key tasks of the pack (cheaper)
agentready https://example.com --tasks find_price,add_to_cart # only some tasks (ids from any pack)
agentready https://example.com --task "find the delivery fee for a 300 rupee order"  # add a task of your own
agentready https://example.com --tasks none --task "find the refund terms"           # only your own task
agentready https://example.com --json > report.json           # machine-readable (progress goes to stderr)
agentready https://example.com --min-score 80                 # exit code 1 below 80 (for CI)
agentready https://example.com --badge agentready-badge.svg   # write a score badge
```

| Flag | Meaning |
| --- | --- |
| `--pack P` | `auto` (default: the Instant Scan picks), `shop`, `saas`, `content` or `local`. With `--no-scan` and no `--pack`, `shop` is used |
| `--tasks a,b` | task ids from any pack (default: the four tasks of the pack), `quick` (the pack's two key tasks) or `none` (only `--task`) |
| `--task "text"` | a task of your own, up to 300 characters. Scored separately, not part of the 100 |
| `--json` | print the full report as JSON on stdout |
| `--min-score N` | exit with code 1 if the score is below N (0 to 100) |
| `--badge FILE` | write an Agent-Ready score badge (SVG) after the run |
| `--no-tunnel` | test the address as it is (no Cloudflare tunnel) |
| `--no-scan` | skip the Instant Scan (pop-ups, unlabelled buttons, prices in images) |
| `--version`, `--help` | version / usage |

**Packs and their tasks**

| Pack | For | Tasks |
| --- | --- | --- |
| `shop` | online stores | `find_price`, `add_to_cart`, `find_returns`, `find_contact` |
| `saas` | software and SaaS sites | `find_pricing_plans`, `reach_signup`, `find_docs`, `contact_sales` |
| `content` | blogs, news, documentation | `search_topic`, `read_article`, `find_newsletter`, `find_author_contact` |
| `local` | restaurants, clinics, salons, shops with a location | `find_hours`, `find_location`, `find_menu_or_services`, `reach_booking` |

Tasks that open a form (sign up, newsletter, contact sales, booking) only open it: the agents never submit anything, log in or pay. The SaaS, blog and local tasks are new and still being tuned on real sites.

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
    pack: auto          # or shop, saas, content, local
    tasks: quick        # or task ids; optional
    task: ''            # optional: a task of your own in plain words
```

Posts one pull request comment (edited on every run), a job summary, and uploads the report and badge. See the repository docs for details.

Source and docs: https://github.com/Manideep-2007-ok/Agent-Ready
