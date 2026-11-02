// The npm package: scripts/pack-cli.mjs builds a self-contained folder; it must run with nothing else from the repo.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NO_ENV_FILE } from '../../server/test/helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const out = path.join(root, 'dist/cli-test'); // dist/ is gitignored; the script refuses folders outside the repo
const bin = path.join(out, 'bin/agentready.js');

before(() => {
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/pack-cli.mjs'), out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

const run = (args, env = {}) => spawnSync(process.execPath, [bin, ...args], {
  cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'ar-pack-')), encoding: 'utf8',
  env: { PATH: process.env.PATH, AGENTREADY_ENV_FILE: NO_ENV_FILE, ...env }, // nothing else leaks in (no key, no mock)
});

test('the package folder is self-contained: engine copied in, no workspace imports left, only playwright-core as dependency', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
  assert.equal(pkg.name, '@agentready/cli');
  assert.equal(pkg.private, undefined);
  assert.deepEqual(pkg.bin, { agentready: 'bin/agentready.js' });
  assert.deepEqual(Object.keys(pkg.dependencies), ['playwright-core']);
  assert.equal(pkg.type, 'module');
  for (const f of ['bin/agentready.js', 'src/lib.js', 'engine/index.js', 'engine/runner.js', 'README.md']) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.ok(!fs.existsSync(path.join(out, 'data')), 'no recordings or data are shipped');
  const code = fs.readFileSync(bin, 'utf8') + fs.readFileSync(path.join(out, 'src/lib.js'), 'utf8');
  assert.ok(!/from ['"]@agentready/.test(code) && !/import\(['"]@agentready/.test(code));
  assert.match(code, /\.\.\/engine\/index\.js/);
});

test('packed CLI: --version, --help, usage errors exit 2, no key exits 2 with a clear message', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(out, 'package.json'), 'utf8'));
  const v = run(['--version']);
  assert.equal(v.status, 0); assert.equal(v.stdout.trim(), pkg.version);
  const h = run(['--help']);
  assert.equal(h.status, 0); assert.match(h.stderr, /Usage: agentready/); assert.match(h.stderr, /TINYFISH_API_KEY/);
  assert.equal(run(['--bogus']).status, 2);
  assert.equal(run([]).status, 2);
  const nokey = run(['https://example.com', '--no-tunnel']);
  assert.equal(nokey.status, 2);
  assert.match(nokey.stderr, /TINYFISH_API_KEY is not set/);
});

test('packed CLI outside the repo: replay mode explains itself instead of crashing; a .env in the current folder is read', () => {
  // Copy the package out of the repo (so the recordings in data/ are really out of reach) and lend it playwright-core.
  const away = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-away-'));
  fs.cpSync(out, path.join(away, 'pkg'), { recursive: true });
  fs.mkdirSync(path.join(away, 'pkg/node_modules'));
  fs.symlinkSync(path.join(root, 'node_modules/playwright-core'), path.join(away, 'pkg/node_modules/playwright-core'), 'dir');
  const awayBin = path.join(away, 'pkg/bin/agentready.js');
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-pack-env-'));
  const go = (args, env = {}) => spawnSync(process.execPath, [awayBin, ...args], { cwd, encoding: 'utf8', env: { PATH: path.dirname(process.execPath), ...env } }); // PATH = node only: no cloudflared

  const mock = go(['https://example.com'], { TINYFISH_MOCK: '1' });
  assert.equal(mock.status, 2);
  assert.match(mock.stderr, /only exist in the AgentReady repository/);

  assert.match(go(['localhost:1']).stderr, /TINYFISH_API_KEY is not set/);
  fs.writeFileSync(path.join(cwd, '.env'), 'TINYFISH_API_KEY=dummy-not-a-key\n');
  const withKey = go(['localhost:1']); // the key from .env is found; it then stops because cloudflared is not installed
  assert.doesNotMatch(withKey.stderr, /TINYFISH_API_KEY is not set/);
  assert.equal(withKey.status, 2);
});
