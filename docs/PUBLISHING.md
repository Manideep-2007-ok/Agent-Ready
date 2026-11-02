# Publishing

Nothing here has been published yet. These are the exact steps.

## 1. The npm package `@agentready/cli`

The package is **generated**, not published from `apps/cli` (that folder stays `private` because it depends on the unpublished workspace package `@agentready/engine`). `scripts/pack-cli.mjs` builds a self-contained folder in `dist/cli` (gitignored):

```
dist/cli/
  package.json     generated: name @agentready/cli, bin agentready, only dependency playwright-core, files whitelist
  bin/agentready.js, src/lib.js   the CLI with its imports rewritten to ../engine/
  engine/          copy of packages/engine/src (no tests, no recordings)
  README.md        apps/cli/README.md
```

### One-time setup

1. Create an npm account and the organisation **agentready** (npmjs.com > Add Organization, free plan for public packages). The scope `@agentready` only works if that org (or user) name is yours; if it is taken, change `name` in `apps/cli/package.json`, `README`s and `action.yml` together.
2. `npm login` (use a token with 2FA "authorization and publishing" if prompted).

### Each release

```bash
# 1. bump "version" in apps/cli/package.json (the generated package takes it from there)
npm test && npm run test:e2e                 # must be green
node scripts/pack-cli.mjs --pack             # builds dist/cli and a tarball; check the file list
# 2. try the tarball outside the repo
mkdir /tmp/try && cd /tmp/try && npm init -y && npm i /path/to/Agent-Ready/dist/cli/agentready-cli-<version>.tgz
npx agentready --version && npx agentready --help
# 3. publish (needs the org + login above)
cd /path/to/Agent-Ready
node scripts/pack-cli.mjs                    # rebuilds dist/cli without the tarball
cd dist/cli && npm publish --access public
```

Afterwards: `npx @agentready/cli https://example.com --no-tunnel` works for anyone, and `npm i -g @agentready/cli` gives the `agentready` command.

**License:** the repository has no `LICENSE` file, so the package is published without a license and without a `"license"` field (npm shows "none"). Decide on a license (MIT is the usual choice) and add `LICENSE` at the repo root before the public launch; `pack-cli.mjs` copies it into the package and lists it in `files` automatically, but you still need to add `"license": "MIT"` to the manifest object in `scripts/pack-cli.mjs`.

## 2. The GitHub Action

`action.yml` is at the repo root, so others use it as `Manideep-2007-ok/Agent-Ready@<ref>`.

1. Merge to `main`.
2. Tag a release: `git tag v1.0.0 && git push origin v1.0.0`, then move the major tag users reference: `git tag -f v1 && git push -f origin v1` (only this moving tag may be force-pushed, never branches).
3. Others write:

```yaml
name: AgentReady
on:
  pull_request:
    types: [labeled, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
jobs:
  agentready:
    if: contains(github.event.pull_request.labels.*.name, 'agentready')   # optional: only when labelled (saves credits)
    runs-on: ubuntu-latest
    concurrency: { group: agentready-${{ github.event.pull_request.number }}, cancel-in-progress: true }
    steps:
      - uses: Manideep-2007-ok/Agent-Ready@v1
        with:
          url: https://my-preview.example.com
          tinyfish-api-key: ${{ secrets.TINYFISH_API_KEY }}
          tasks: find_price,add_to_cart   # default
          min-score: 80                   # default 0 = report only
```

Inputs: `url` (required), `tinyfish-api-key` (required), `tasks`, `min-score`, `comment` (`true`), `github-token`, `cli-version` (empty = build the CLI from the action's own source; `latest` or `0.1.0` = install `@agentready/cli` from npm, only after step 1 above). Outputs: `score`, `passed`.

Until the package is on npm, leave `cli-version` empty.

## 3. This repo's own workflow

`.github/workflows/agentready.yml` runs only on pull requests that carry the label `agentready` (create the label once: Issues > Labels > New label), or by hand (Actions > AgentReady > Run workflow, optional URL). Add the repository secret `TINYFISH_API_KEY` under Settings > Secrets and variables > Actions. Without it the job ends green with a "skipped" notice.
