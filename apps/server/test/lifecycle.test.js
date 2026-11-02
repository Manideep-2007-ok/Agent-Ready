// Start-up and shutdown behaviour: no .env needed, restart recovery, SIGTERM cancels in-flight runs, port in use.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, call, waitFor, sleep } from './helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('npm start style launch works with no .env file (and still prints the mock banner)', async () => {
  assert.equal(fs.existsSync(path.join(root, '.env')), false, 'this test assumes the repo has no .env');
  const srv = await startServer({ port: 4213 });
  try {
    assert.equal((await call(srv.base, '/api/health')).status, 200);
    assert.match(srv.logs(), /AgentReady server on/);
  } finally { await srv.stop(); }
});

test('a missing key in live mode does not crash the server: tests fail with a plain message', async () => {
  const srv = await startServer({ port: 4214, env: { TINYFISH_MOCK: '0', TINYFISH_API_KEY: '' } });
  try {
    assert.match(srv.logs(), /TINYFISH_API_KEY is not set/);
    const { json } = await call(srv.base, '/api/tests', { method: 'POST', body: { url: 'https://shop.example.net', tasks: ['find_price'], } });
    const report = await waitFor(async () => { const r = (await call(srv.base, `/api/tests/${json.reportId}`)).json; return r.status !== 'running' ? r : null; }, { timeout: 20000 });
    assert.equal(report.tasks[0].status, 'failed');
    assert.match(report.tasks[0].blocker, /TINYFISH_API_KEY is not set/);
    assert.equal((await call(srv.base, '/api/health')).status, 200, 'still serving');
  } finally { await srv.stop(); }
});

test('server restart mid-run: the half-finished report is closed as stopped, not left spinning', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-restart-'));
  const first = await startServer({ port: 4215, dataDir, env: { TINYFISH_MOCK_SPEED: '2' } });
  const { json } = await call(first.base, '/api/tests', { method: 'POST', body: { url: 'https://www.myntra.com' } });
  await waitFor(async () => (await call(first.base, '/api/health')).json.queue.running === 2);
  assert.equal((await call(first.base, `/api/tests/${json.reportId}`)).json.status, 'running');
  await first.kill(); // crash, no graceful shutdown

  const second = await startServer({ port: 4215, dataDir, env: { TINYFISH_MOCK_SPEED: '2' } });
  try {
    const report = await waitFor(async () => { const r = (await call(second.base, `/api/tests/${json.reportId}`)).json; return r.status !== 'running' ? r : null; }, { timeout: 5000 });
    assert.equal(report.status, 'cancelled');
    assert.ok(report.tasks.every((t) => t.status !== 'running' && t.status !== 'queued'));
    assert.match(report.tasks[0].blocker, /interrupted because the server restarted/);
    assert.equal((await call(second.base, '/api/health')).json.queue.running, 0);
    // stopping an orphaned running report on disk also works (cancel finds nothing active)
    const stuck = { ...report, id: 'rep_orphan_1', status: 'running', tasks: report.tasks.map((t) => ({ ...t, status: 'running' })) };
    fs.writeFileSync(path.join(dataDir, 'reports', 'rep_orphan_1.json'), JSON.stringify(stuck));
    const c = await call(second.base, '/api/tests/rep_orphan_1/cancel', { method: 'POST' });
    assert.equal(c.json.cancelled, true);
    assert.equal((await call(second.base, '/api/tests/rep_orphan_1')).json.status, 'cancelled');
  } finally { await second.stop(); }
});

test('a corrupt file in data/reports does not break the report list', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-corrupt-'));
  fs.mkdirSync(path.join(dataDir, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'reports', 'rep_broken.json'), '{"id": "rep_broken", "tasks": [');
  const srv = await startServer({ port: 4216, dataDir });
  try {
    const list = await call(srv.base, '/api/tests');
    assert.equal(list.status, 200);
    assert.deepEqual(list.json, []);
    assert.equal((await call(srv.base, '/api/tests/rep_broken')).status, 404);
  } finally { await srv.stop(); }
});

test('port already in use: a clear message and exit code 1 (no half-running server)', async () => {
  const a = await startServer({ port: 4217 });
  try {
    const child = spawn(process.execPath, [path.join(root, 'apps/server/src/index.js')], {
      env: { ...process.env, PORT: '4217', AGENTREADY_DATA_DIR: a.dataDir, TINYFISH_MOCK: '1', LOG_LEVEL: 'silent' }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    child.stderr.on('data', (d) => { out += d; });
    const code = await new Promise((r) => child.on('exit', r));
    assert.equal(code, 1);
    assert.match(out, /port 4217 is already in use/);
  } finally { await a.stop(); }
});

test('Ctrl+C / SIGTERM on the server cancels the in-flight agent runs first', async () => {
  const srv = await startServer({ port: 4218, env: { TINYFISH_MOCK_SPEED: '2', LOG_LEVEL: '' } });
  const { json } = await call(srv.base, '/api/tests', { method: 'POST', body: { url: 'https://www.nykaa.com' } });
  await waitFor(async () => (await call(srv.base, '/api/health')).json.queue.running === 2);
  await srv.stop();
  await sleep(200);
  assert.match(srv.logs(), /\[mock\] cancel mock-nykaa/, 'in-flight runs were cancelled before exit');
  assert.ok(json.reportId);
});
