// Phase 2/3 through the API: confirm option (D41), cost estimate and daily budget (D43), per-site history (P3-4).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startServer, call, waitFor } from './helpers.js';

let replay; // replay mode
let live;   // live mode, no key, a ₹10 daily limit that is already used up
const day = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })();
before(async () => {
  replay = await startServer({ port: 4241 });
  live = await startServer({ port: 4242, env: { TINYFISH_MOCK: '0', TINYFISH_API_KEY: '', BUDGET_PER_DAY_RUPEES: '10', BUDGET_PER_TEST_RUPEES: '120' } });
  fs.mkdirSync(path.join(live.dataDir, 'budget'), { recursive: true });
  fs.writeFileSync(path.join(live.dataDir, 'budget', `${day}.json`), JSON.stringify({ spentRupees: 12.5, tests: 1 }));
});
after(async () => { await Promise.all([replay?.stop(), live?.stop()]); });

const post = (s, p, body) => call(s.base, p, { method: 'POST', body });
const finished = (s, id) => waitFor(async () => { const r = (await call(s.base, `/api/tests/${id}`)).json; return r && r.status !== 'running' ? r : null; }, { timeout: 30000, what: `report ${id}` });

test('estimate: a range in rupees before the test starts; confirming costs about twice as much; bad input is a 400', async () => {
  const one = await call(replay.base, '/api/estimate?tasks=4');
  assert.equal(one.status, 200);
  assert.ok(one.json.lowRupees > 0 && one.json.highRupees > one.json.lowRupees && one.json.worstRupees >= one.json.highRupees);
  const two = await call(replay.base, '/api/estimate?tasks=4&confirm=1');
  assert.equal(two.json.confirm, true);
  assert.ok(two.json.highRupees > one.json.highRupees);
  assert.equal(one.json.budget.perTestRupees, 300, 'default per-test limit');
  for (const q of ['tasks=0', 'tasks=9', 'tasks=abc', 'tasks=2.5']) assert.equal((await call(replay.base, `/api/estimate?${q}`)).status, 400, q);
});

test('health shows the limits and what was spent today', async () => {
  const h = (await call(live.base, '/api/health')).json;
  assert.deepEqual(
    { perTest: h.budget.perTestRupees, perDay: h.budget.perDayRupees, spent: h.budget.spentTodayRupees, left: h.budget.leftTodayRupees },
    { perTest: 120, perDay: 10, spent: 12.5, left: 0 });
});

test('a used-up daily budget refuses new tests with a plain 429; replay mode spends nothing and is never refused', async () => {
  const r = await post(live, '/api/tests', { url: 'https://shop.example.net' });
  assert.equal(r.status, 429);
  assert.match(r.json.error, /Today's testing budget \(₹10\) is used up/);
  assert.equal((await post(replay, '/api/tests', { url: 'https://www.nykaa.com' })).status, 202);
});

test('confirm must be true or false', async () => {
  for (const confirm of ['yes', 1, {}, []]) {
    const r = await post(replay, '/api/tests', { url: 'https://www.nykaa.com', confirm });
    assert.equal(r.status, 400, JSON.stringify(confirm));
    assert.match(r.json.error, /confirm must be true or false/);
  }
});

test('a confirmed test runs each task again and keeps every run; the report says it was confirmed', async () => {
  const start = await post(replay, '/api/tests', { url: 'https://www.nykaa.com', tasks: ['find_price'], confirm: true });
  assert.equal(start.status, 202);
  const running = (await call(replay.base, `/api/tests/${start.json.reportId}`)).json;
  assert.equal(running.confirm, true, 'known from the start, so the page can say so');
  const report = await finished(replay, start.json.reportId);
  assert.equal(report.status, 'complete');
  assert.equal(report.confirm, true);
  const t = report.tasks.find((x) => x.taskId === 'find_price');
  assert.ok(t.runs.length >= 2);
  assert.equal(t.flaky, false, 'the same recording twice agrees');
});

test('site history: every finished test of one site, oldest first, www. ignored; a bad address is a 400', async () => {
  const h = await call(replay.base, '/api/sites/history?url=' + encodeURIComponent('https://agent-ready-demo.vercel.app/'));
  assert.equal(h.status, 200);
  assert.ok(h.json.length >= 3);
  assert.deepEqual(h.json.map((r) => r.testedAt), [...h.json.map((r) => r.testedAt)].sort());
  assert.ok(h.json.every((r) => Array.isArray(r.tasks) && Array.isArray(r.findingTypes) && typeof r.score === 'number'));
  const www = await call(replay.base, '/api/sites/history?url=' + encodeURIComponent('https://nykaa.com'));
  assert.ok(www.json.some((r) => r.url === 'https://www.nykaa.com'));
  for (const q of ['', '?url=nope', '?url=' + encodeURIComponent('ftp://x.test')]) assert.equal((await call(replay.base, '/api/sites/history' + q)).status, 400, q);
});
