// Starts the real server (apps/server/src/index.js) as a child process on a temp data folder, in replay mode.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// A file that never exists: test servers ignore the developer's own repo .env (FEATURE_*, MAX_ACTIVE_TESTS, ALERT_WEBHOOK_URL, ...),
// so a laptop with a .env runs the same tests as CI. A test can still pass its own AGENTREADY_ENV_FILE.
export const NO_ENV_FILE = path.join(os.tmpdir(), 'ar-no-such-env-file');

/** A PATH holding only `node`, so tools installed next to it (cloudflared in /usr/bin) stay out of reach. */
export function nodeOnlyPath() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-node-only-'));
  fs.symlinkSync(process.execPath, path.join(dir, 'node'));
  return dir;
}

/**
 * @param {{port:number, env?:Record<string,string>, dataDir?:string}} opts
 * @returns {Promise<{base:string, dataDir:string, stop:()=>Promise<void>, kill:()=>Promise<void>, pid:number, logs:()=>string}>}
 */
export async function startServer({ port, env = {}, dataDir } = {}) {
  dataDir ??= fs.mkdtempSync(path.join(os.tmpdir(), 'ar-server-'));
  let logs = '';
  const child = spawn(process.execPath, [path.join(root, 'apps/server/src/index.js')], {
    cwd: root,
    env: {
      ...process.env, AGENTREADY_ENV_FILE: NO_ENV_FILE,
      PORT: String(port), HOST: '127.0.0.1', AGENTREADY_DATA_DIR: dataDir,
      TINYFISH_MOCK: '1', TINYFISH_MOCK_SPEED: process.env.TINYFISH_MOCK_SPEED || '300',
      DEMO_STORE_URL: 'https://agent-ready-demo.vercel.app', RATE_LIMIT_PER_MIN: '1000', LOG_LEVEL: 'silent',
      FEATURE_WATCH: 'true', ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (d) => { logs += d; });
  child.stderr.on('data', (d) => { logs += d; });
  const base = `http://127.0.0.1:${port}`;
  const exited = new Promise((r) => child.once('exit', r));
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`server exited early: ${logs}`);
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 15000) { child.kill('SIGKILL'); throw new Error(`server did not start: ${logs}`); }
    await new Promise((r) => setTimeout(r, 50));
  }
  return {
    base, dataDir, pid: child.pid, logs: () => logs,
    stop: async () => { if (child.exitCode === null) { child.kill('SIGTERM'); await Promise.race([exited, new Promise((r) => setTimeout(r, 4000))]); if (child.exitCode === null) child.kill('SIGKILL'); } },
    kill: async () => { child.kill('SIGKILL'); await exited; },
  };
}

/** fetch + JSON. Never throws on HTTP errors. */
export async function call(base, pathname, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(base + pathname, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text, headers: res.headers };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function waitFor(fn, { timeout = 15000, every = 50, what = 'condition' } = {}) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}`);
    await sleep(every);
  }
}

/** Open an SSE stream; collects parsed events until `done(events)` is true or the timeout hits. Returns {events, close}. */
export async function openSse(url, { timeout = 15000 } = {}) {
  const ctl = new AbortController();
  const res = await fetch(url, { signal: ctl.signal });
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  const pump = (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const block = buf.slice(0, i); buf = buf.slice(i + 2);
          const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
          if (data) { try { events.push(JSON.parse(data)); } catch { /* ignore */ } }
        }
      }
    } catch { /* aborted */ }
  })();
  return {
    status: res.status, headers: res.headers, events,
    until: (pred, ms = timeout) => waitFor(() => events.find(pred), { timeout: ms, what: 'SSE event' }),
    close: async () => { ctl.abort(); await pump; },
  };
}
