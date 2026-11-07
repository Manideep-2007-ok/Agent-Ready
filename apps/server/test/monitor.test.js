// P2-5: a Watch that checks every 2 hours or less often also gets a TinyFish Page Monitor on its page (hourly, $0.005 a
// run). When a scheduled monitor run reports a relevant change, the Watch check runs at once instead of waiting.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, call, waitFor, sleep } from './helpers.js';
import { wantsMonitor, monitorTrigger, MONITOR_MIN_EVERY } from '../src/watch.js';

test('a monitor only for enabled watches of 2 hours or more, with a public webhook address, never in replay mode', () => {
  const env = { publicBaseUrl: 'https://abc.trycloudflare.com', mock: false };
  assert.equal(MONITOR_MIN_EVERY, 120);
  assert.equal(wantsMonitor({ enabled: true, everyMinutes: 120 }, env), true);
  assert.equal(wantsMonitor({ enabled: true, everyMinutes: 60 }, env), false, 'a frequent watch already notices changes');
  assert.equal(wantsMonitor({ enabled: false, everyMinutes: 240 }, env), false);
  assert.equal(wantsMonitor({ enabled: true, everyMinutes: 240 }, { ...env, publicBaseUrl: '' }), false, 'no webhook address');
  assert.equal(wantsMonitor({ enabled: true, everyMinutes: 240 }, { ...env, mock: true }), false);
});

test('a monitor run triggers a check only when the page changed in a way that matters, at most once an hour', () => {
  const w = { id: 'w_1', enabled: true, monitorId: 'mon-1' };
  const changed = { fetch_monitor_id: 'mon-1', outcome: 'changed', judgment: { is_relevant: true } };
  const now = Date.parse('2026-11-07T12:00:00Z');
  assert.equal(monitorTrigger(w, changed, { now, lastAt: 0 }), true);
  assert.equal(monitorTrigger(w, { ...changed, judgment: null }, { now, lastAt: 0 }), true, 'no purpose check: any change counts');
  assert.equal(monitorTrigger(w, { ...changed, judgment: { is_relevant: false } }, { now, lastAt: 0 }), false);
  assert.equal(monitorTrigger(w, { ...changed, outcome: 'unchanged' }, { now, lastAt: 0 }), false);
  assert.equal(monitorTrigger(w, { ...changed, outcome: 'baseline' }, { now, lastAt: 0 }), false);
  assert.equal(monitorTrigger({ ...w, enabled: false }, changed, { now, lastAt: 0 }), false);
  assert.equal(monitorTrigger(w, changed, { now, lastAt: now - 30 * 60_000 }), false, 'not twice within an hour');
  assert.equal(monitorTrigger(w, changed, { now, lastAt: now - 61 * 60_000 }), true);
});

let srv;
after(async () => { await srv?.stop(); });

test('POST /api/webhooks/tinyfish with a monitor change starts that watch\'s check; unknown or unchanged do nothing', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-monitor-'));
  fs.mkdirSync(path.join(dataDir, 'watch'), { recursive: true });
  const watch = { id: 'w_mon1', url: 'https://www.nykaa.com', tasks: ['find_price'], pack: 'shop', everyMinutes: 240, enabled: true,
    createdAt: new Date().toISOString(), lastGoodReportId: null, failing: false, monitorId: 'mon-abc' };
  fs.writeFileSync(path.join(dataDir, 'watch', 'watches.json'), JSON.stringify([watch]));
  srv = await startServer({ port: 4215, dataDir });
  const hook = (body) => call(srv.base, '/api/webhooks/tinyfish', { method: 'POST', body });
  const history = async () => (await call(srv.base, '/api/watch/w_mon1/history')).json;

  assert.equal((await hook({ fetch_monitor_id: 'mon-other', outcome: 'changed', judgment: { is_relevant: true } })).status, 200);
  assert.equal((await hook({ fetch_monitor_id: 'mon-abc', outcome: 'unchanged', judgment: null })).status, 200);
  await sleep(500);
  assert.equal((await history()).length, 0, 'unknown monitor and unchanged page start nothing');

  assert.equal((await hook({ fetch_monitor_id: 'mon-abc', outcome: 'changed', judgment: { is_relevant: true, summary: 'A pop-up was added' } })).status, 200);
  const rows = await waitFor(async () => { const h = await history(); return h.length ? h : null; }, { what: 'the triggered check' });
  assert.equal(rows.length, 1);
  await hook({ fetch_monitor_id: 'mon-abc', outcome: 'changed', judgment: { is_relevant: true } });
  await sleep(1500);
  assert.equal((await history()).length, 1, 'a second change within the hour does not start another paid check');
});
