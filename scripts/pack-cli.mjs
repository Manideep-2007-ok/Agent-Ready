#!/usr/bin/env node
// Builds a self-contained, publishable copy of the CLI (no bundler, plain file copying).
//   node scripts/pack-cli.mjs [outDir]          default outDir: dist/cli
//   node scripts/pack-cli.mjs --pack            also runs `npm pack` there and prints the tarball path
// Layout of the output folder:
//   package.json   generated (name @agentready/cli, bin agentready, dependency playwright-core only)
//   bin/agentready.js, src/lib.js     the CLI, with its two `@agentready/engine` imports rewritten to ../engine/
//   engine/*.js    a copy of packages/engine/src (the engine is not published on its own)
//   README.md      apps/cli/README.md          (LICENSE is copied only if the repo has one)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const wantPack = args.includes('--pack');
const out = path.resolve(root, args.find((a) => !a.startsWith('--')) ?? 'dist/cli');
const read = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

const cli = read('apps/cli/package.json');
const engine = read('packages/engine/package.json');
const rootPkg = read('package.json');

if (out === root || !out.startsWith(root + path.sep)) throw new Error(`Refusing to write outside the repo: ${out}`);
rmSync(out, { recursive: true, force: true });
mkdirSync(path.join(out, 'bin'), { recursive: true });
mkdirSync(path.join(out, 'src'), { recursive: true });

// Engine source (tests, fixtures and data are not part of packages/engine/src).
cpSync(path.join(root, 'packages/engine/src'), path.join(out, 'engine'), { recursive: true });

// CLI source with the workspace imports pointed at the bundled engine copy.
const rewrite = (file) => {
  const text = readFileSync(path.join(root, file), 'utf8')
    .replace(/(['"])@agentready\/engine\/env\1/g, "'../engine/env.js'")
    .replace(/(['"])@agentready\/engine\/goals\1/g, "'../engine/goals.js'")
    .replace(/(['"])@agentready\/engine\1/g, "'../engine/index.js'");
  if (/@agentready\/engine/.test(text.replace(/\/\/.*$/gm, ''))) throw new Error(`${file}: an @agentready/engine import was not rewritten`);
  return text;
};
writeFileSync(path.join(out, 'bin/agentready.js'), rewrite('apps/cli/bin/agentready.js'), { mode: 0o755 });
writeFileSync(path.join(out, 'src/lib.js'), rewrite('apps/cli/src/lib.js'));

writeFileSync(path.join(out, 'README.md'), readFileSync(path.join(root, 'apps/cli/README.md')));
const hasLicense = existsSync(path.join(root, 'LICENSE'));
if (hasLicense) cpSync(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'));
else console.warn('Note: the repo has no LICENSE file, so the package is published without one (and without a "license" field).');

const manifest = {
  name: cli.name,
  version: cli.version,
  description: 'Test whether AI agents can really use your website (shop, SaaS, blog or local business): real cloud web agents try everyday tasks such as finding a price, signing up or booking, and score the result.',
  type: 'module',
  bin: { agentready: 'bin/agentready.js' },
  files: ['bin', 'src', 'engine', 'README.md', ...(hasLicense ? ['LICENSE'] : [])],
  engines: { node: '>=20' },
  dependencies: { 'playwright-core': engine.dependencies['playwright-core'] },
  keywords: ['ai-agents', 'agent-readiness', 'tinyfish', 'e-commerce', 'testing', 'cli', 'ci'],
  repository: { type: 'git', url: 'git+https://github.com/Manideep-2007-ok/Agent-Ready.git' },
  homepage: 'https://github.com/Manideep-2007-ok/Agent-Ready#readme',
  bugs: { url: 'https://github.com/Manideep-2007-ok/Agent-Ready/issues' },
  publishConfig: { access: 'public' },
};
if (rootPkg.engines?.node !== '>=20') throw new Error('root engines.node changed; update this script');
writeFileSync(path.join(out, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');

const count = (d) => readdirSync(d, { withFileTypes: true }).reduce((n, e) => n + (e.isDirectory() ? count(path.join(d, e.name)) : 1), 0);
console.log(`Built ${manifest.name}@${manifest.version} in ${path.relative(root, out)} (${count(out)} files)`);

if (wantPack) {
  const r = spawnSync('npm', ['pack', '--pack-destination', out, '--json'], { cwd: out, encoding: 'utf8' });
  if (r.status !== 0) { console.error(r.stderr); process.exit(1); }
  const info = JSON.parse(r.stdout)[0];
  console.log(`Tarball: ${path.join(out, info.filename)} (${statSync(path.join(out, info.filename)).size} bytes, ${info.files.length} files)`);
}
