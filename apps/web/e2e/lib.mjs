// Shared pieces for the click tests: start the built server in replay mode, launch Chromium, small test harness.
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const shotsDir = process.env.E2E_SHOTS || path.join(os.tmpdir(), 'agentready-e2e-shots');
fs.mkdirSync(shotsDir, { recursive: true });

/** playwright from NODE_PATH / global install, else playwright-core from the repo. */
export function loadPlaywright() {
  const require = createRequire(import.meta.url);
  for (const name of ['playwright', 'playwright-core']) {
    try { return require(name); } catch { /* try next */ }
  }
  throw new Error('Playwright is not installed. Run: npx playwright install chromium');
}

export function buildWeb() {
  if (process.env.E2E_SKIP_BUILD === '1' && fs.existsSync(path.join(root, 'apps/web/dist/index.html'))) return;
  const r = spawnSync('npm', ['run', 'build', '-w', '@agentready/web'], { cwd: root, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`web build failed:\n${r.stdout}\n${r.stderr}`);
}

/** Starts the real server (serving the built dashboard) as a child process on a temp data folder. */
export async function startServer({ port, speed = 30, env = {}, dataDir } = {}) {
  dataDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'ar-e2e-'));
  let logs = '';
  const child = spawn(process.execPath, [path.join(root, 'apps/server/src/index.js')], {
    cwd: root,
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', AGENTREADY_DATA_DIR: dataDir, TINYFISH_MOCK: '1', TINYFISH_MOCK_SPEED: String(speed),
      DEMO_STORE_URL: 'https://agent-ready-demo.vercel.app', RATE_LIMIT_PER_MIN: '1000', LOG_LEVEL: 'silent', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { logs += d; });
  child.stderr.on('data', (d) => { logs += d; });
  const exited = new Promise((r) => child.once('exit', r));
  const base = `http://127.0.0.1:${port}`;
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited early:\n${logs}`);
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 15000) { child.kill('SIGKILL'); throw new Error(`server did not start:\n${logs}`); }
    await new Promise((r) => setTimeout(r, 100));
  }
  return {
    base, dataDir, logs: () => logs, pid: child.pid,
    stop: async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await Promise.race([exited, new Promise((r) => setTimeout(r, 4000))]); if (child.exitCode === null) child.kill('SIGKILL'); } },
    kill: async () => { child.kill('SIGKILL'); await exited; },
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const api = async (base, p, { method = 'GET', body } = {}) => {
  const res = await fetch(base + p, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => null) };
};

/** Errors we expect and do not count: failed external icons (no internet in CI) and our own deliberate 4xx answers. */
const IGNORED_CONSOLE = [/simpleicons/i, /Failed to load resource: .*\b(400|403|404|409|413|429)\b/, /net::ERR_(INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|FAILED|ABORTED|CONNECTION)/, /WebGL|GPU stall|swiftshader/i];

/** Watches one page for uncaught errors and console errors. `drain()` returns (and clears) the problems seen so far. */
export function watchPage(page, label) {
  const problems = [];
  page.on('pageerror', (e) => problems.push(`[${label}] page error: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    problems.push(`[${label}] console.error: ${text}`);
  });
  page.on('requestfailed', (r) => {
    const f = r.failure()?.errorText || '';
    if (/simpleicons/.test(r.url()) || /ERR_ABORTED/.test(f)) return; // aborted = a stream/page that was closed on purpose
    problems.push(`[${label}] request failed: ${r.url()} ${f}`);
  });
  return { drain: () => problems.splice(0) };
}

/** Tiny test harness: named steps, failures keep going, screenshot on failure, summary + exit code at the end. */
export function harness() {
  const results = [];
  let current = null;
  return {
    results,
    async step(name, fn, { page } = {}) {
      current = name;
      const t0 = Date.now();
      try {
        await fn();
        results.push({ name, ok: true, ms: Date.now() - t0 });
        console.log(`  ok    ${name} (${Date.now() - t0} ms)`);
      } catch (err) {
        results.push({ name, ok: false, ms: Date.now() - t0, error: err.message });
        console.log(`  FAIL  ${name}\n        ${String(err.message).split('\n').join('\n        ')}`);
        if (page) {
          const where = await page.evaluate(() => `hash=${location.hash} error="${document.querySelector('.card.error')?.innerText ?? ''}"`).catch(() => '');
          console.log(`        (${where})`);
        }
        if (page) await page.screenshot({ path: path.join(shotsDir, `FAIL-${name.replace(/\W+/g, '_').slice(0, 60)}.png`) }).catch(() => {});
      }
    },
    summary() {
      const failed = results.filter((r) => !r.ok);
      console.log(`\n${results.length - failed.length} passed, ${failed.length} failed (${results.length} steps)`);
      console.log(`Screenshots: ${shotsDir}`);
      return failed.length ? 1 : 0;
    },
    get current() { return current; },
  };
}

export function expect(cond, message) { if (!cond) throw new Error(message); }
