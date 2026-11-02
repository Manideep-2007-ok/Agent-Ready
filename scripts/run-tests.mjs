// `npm test`: runs every *.test.js under packages/*/test, apps/*/test with node:test (no extra framework).
// Files are listed explicitly (works the same on Node 20, 22 and 26). Everything runs in mock mode with quiet logs.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const only = process.argv.slice(2); // optional name filters, e.g. `npm test -- queue`

function walk(dir, out = []) {
  let entries = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === 'node_modules') continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.test\.m?js$/.test(name)) out.push(full);
  }
  return out;
}

const files = ['packages', 'apps']
  .flatMap((top) => readdirSync(path.join(root, top)).map((w) => path.join(root, top, w, 'test')))
  .flatMap((dir) => walk(dir))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort();

if (!files.length) { console.error('No test files found.'); process.exit(1); }

const result = spawnSync(process.execPath, ['--test', '--test-concurrency=4', ...files], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, TINYFISH_MOCK: '1', TINYFISH_MOCK_SPEED: process.env.TINYFISH_MOCK_SPEED || '300', LOG_LEVEL: 'silent' },
});
process.exit(result.status ?? 1);
