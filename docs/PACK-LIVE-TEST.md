# Trying the pack goals on live agents

The shop goals were tested on live TinyFish agents on 31 Oct 2026. The goal wording for the other three packs (`saas`,
`content`, `local`, D40) has only been unit-tested: it follows the same style, but no live agent has run it yet. This is the
procedure to run each of those 12 tasks once, judge the result, and tune the wording in `packages/engine/src/goals.js`.

## Cost

Each task is one agent run: about 4 to 15 steps at $0.016 a step (₹1.41), so ₹6 to ₹21 a task and roughly ₹70 to ₹250
for all twelve. A bot wall can add up to two more runs per task. `BUDGET_PER_TEST_RUPEES` (default ₹300) stops a test
that goes over. Check the estimate first:

```bash
curl -s 'localhost:4000/api/estimate?tasks=4'
```

## Pick the sites

One site per pack that you are allowed to test, ideally small (small sites finish in about 30 s):

| Pack | Tasks | A good test site has |
|---|---|---|
| `saas` | `find_pricing_plans`, `reach_signup`, `find_docs`, `contact_sales` | a public pricing page, a sign-up form, docs, a sales contact |
| `content` | `search_topic`, `read_article`, `find_newsletter`, `find_author_contact` | a search box, articles, a newsletter form, author pages |
| `local` | `find_hours`, `find_location`, `find_menu_or_services`, `reach_booking` | opening hours, an address or map, a menu or service list, booking |

Never submit a form: every goal says so, and the pass check is "reached the form", not "sent it".

## Run

With `TINYFISH_API_KEY` in `.env` and `TINYFISH_MOCK` unset or `0`:

```bash
node apps/cli/bin/agentready.js https://<saas-site> --pack saas --no-tunnel --json > pack-saas.json
node apps/cli/bin/agentready.js https://<content-site> --pack content --no-tunnel --json > pack-content.json
node apps/cli/bin/agentready.js https://<local-site> --pack local --no-tunnel --json > pack-local.json
```

Or start the server with the key and use the dashboard (Kind of site: SaaS, Content or Local business), which shows
each step and screenshot.

## Judge each task

For every task, compare the agent's answer with the page yourself:

| Check | If it fails |
|---|---|
| The answer is right (the plan names, the hours, the article title) | Make the goal say exactly what to report |
| It passed in 10 steps or fewer on a site where a person needs 3 | Make the goal say where people usually find it ("in the footer or the main menu") |
| It never submitted anything | Strengthen "do NOT submit" in that goal |
| A failure names a site cause | Nothing to change in the goal; the site has the problem |

Change wording only in `TASK_GOALS` in `goals.js` (never `GOAL_SUFFIX`), run `npm test`, run the task again, and once
a pack's four tasks pass the checks, remove that pack from the "untested" note in `goals.js` and in ARCHITECTURE section 7.
