// Every API endpoint against a real server process (replay mode, temp data folder).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, call, openSse, waitFor, sleep } from './helpers.js';

let srv; // normal speed: a full replay test takes about 2 s
let slow; // slow replay (speed 3): tests that need a run still going
before(async () => {
  [srv, slow] = await Promise.all([
    startServer({ port: 4210 }),
    startServer({ port: 4211, env: { TINYFISH_MOCK_SPEED: '3', LOG_LEVEL: '' } }),
  ]);
});
after(async () => { await Promise.all([srv?.stop(), slow?.stop()]); });

const post = (s, p, body, headers) => call(s.base, p, { method: 'POST', body, headers });
const finished = (s, id) => waitFor(async () => { const r = (await call(s.base, `/api/tests/${id}`)).json; return r && r.status !== 'running' ? r : null; }, { what: `report ${id} to finish` });

test('health: ok, version, replay flag, demo store, queue state', async () => {
  const r = await call(srv.base, '/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.equal(r.json.mock, true);
  assert.match(r.json.version, /^\d+\.\d+\.\d+/);
  assert.equal(r.json.demoStoreUrl, 'https://agent-ready-demo.vercel.app');
  assert.equal(r.json.queue.maxParallel, 2);
  assert.equal(r.json.queue.running, 0);
  assert.deepEqual(r.json.queue.bySource, {});
  assert.equal(r.json.activeTests, 0);
});

test('POST /api/tests rejects bad input with plain messages', async () => {
  const bad = async (body, re, status = 400) => {
    const r = await post(srv, '/api/tests', body);
    assert.equal(r.status, status, JSON.stringify(body).slice(0, 80));
    assert.match(r.json.error, re);
  };
  await bad({}, /enter a website address/);
  await bad({ url: '   ' }, /enter a website address/);
  await bad({ url: 'ftp://nykaa.com' }, /http:\/\/ or https:\/\//);
  await bad({ url: 'javascript:alert(1)' }, /http:\/\/ or https:\/\//);
  await bad({ url: 'file:///etc/passwd' }, /http:\/\/ or https:\/\//);
  await bad({ url: 'https://user:pass@nykaa.com' }, /user name and password/);
  await bad({ url: `https://nykaa.com/${'a'.repeat(2100)}` }, /too long/);
  await bad({ url: 'https://nyk aa.com' }, /spaces or hidden/);
  await bad({ url: 'https://shop.example.net' }, /replays real agent runs/); // replay mode: no recording for this site
  await bad({ url: 'nykaa.com', tasks: ['nope'] }, /tasks must be a list/);
  await bad({ url: 'nykaa.com', tasks: [] }, /tasks must be a list/);
  await bad({ url: 'nykaa.com', tasks: 'find_price' }, /tasks must be a list/);
  await bad({ url: 'nykaa.com', customTask: 'x'.repeat(301) }, /under 300 characters/);
  await bad({ url: 'nykaa.com', customTask: 42 }, /must be text/);
  const badJson = await call(srv.base, '/api/tests', { method: 'POST', body: '{"url": ', headers: { 'content-type': 'application/json' } });
  assert.equal(badJson.status, 400);
  assert.match(badJson.json.error, /not valid JSON/);
  assert.ok(!/Unexpected|position/.test(badJson.text), 'parser internals are not echoed');
  const huge = await call(srv.base, '/api/tests', { method: 'POST', body: JSON.stringify({ url: 'nykaa.com', customTask: 'x'.repeat(1_500_000) }) });
  assert.equal(huge.status, 413);
});

test('a full test: create, get, live SSE (replay then updates), list, finished report', async () => {
  const created = await post(srv, '/api/tests', { url: 'nykaa.com' });
  assert.equal(created.status, 202);
  const id = created.json.reportId;
  assert.match(id, /^rep_\d{8}_\d{4}_nykaa/);

  const sse = await openSse(`${srv.base}/api/tests/${id}/events`);
  assert.equal(sse.status, 200);
  assert.match(sse.headers.get('content-type'), /text\/event-stream/);
  assert.match(sse.headers.get('cache-control'), /no-cache/);
  const complete = await sse.until((e) => e.type === 'report-complete');
  await sse.close();
  const types = new Set(sse.events.map((e) => e.type));
  for (const t of ['task-update', 'step', 'instant-scan']) assert.ok(types.has(t), `saw ${t}`);
  assert.equal(complete.report.status, 'complete');

  const report = (await call(srv.base, `/api/tests/${id}`)).json;
  assert.equal(report.status, 'complete');
  assert.equal(report.tasks.length, 4);
  assert.ok(report.score > 0);
  assert.ok(Array.isArray(report.scanFindings));
  assert.ok(report.topFixes.length <= 3);
  assert.ok(report.tasks.every((t) => t.steps.length > 0 && t.steps[0].screenshotUrl.startsWith('/api/shot/')));

  // a finished test replays everything to a late subscriber (page refresh)
  const late = await openSse(`${srv.base}/api/tests/${id}/events`);
  await late.until((e) => e.type === 'report-complete');
  await late.close();
  assert.ok(late.events.some((e) => e.type === 'task-update'));

  const list = (await call(srv.base, '/api/tests')).json;
  const row = list.find((r) => r.id === id);
  assert.ok(row && row.status === 'complete' && typeof row.score === 'number');

  // screenshot proxy for a real step
  const shot = await call(srv.base, report.tasks[0].steps[0].screenshotUrl);
  assert.equal(shot.status, 200);
  assert.equal(shot.headers.get('content-type'), 'image/jpeg');
});

test('custom task in replay mode carries an honest note instead of an unrelated answer', async () => {
  const { json } = await post(srv, '/api/tests', { url: 'https://www.nykaa.com', tasks: ['find_price'], customTask: 'Find the delivery charge for a ₹300 order 🚚' });
  const report = await finished(srv, json.reportId);
  const custom = report.tasks.find((t) => t.taskId === 'custom');
  assert.ok(custom, 'custom lane exists');
  assert.match(custom.replayNote, /recorded run, not your custom task/);
  assert.equal(custom.answer, null);
  assert.ok(custom.goal.includes('🚚'), 'emoji survives');
});

test('replay mode: the demo store opens its real recorded reports', async () => {
  const on = await post(srv, '/api/tests', { url: 'https://agent-ready-demo.vercel.app/?flaws=on' });
  assert.equal(on.status, 202);
  assert.equal(on.json.reportId, 'rep_demo_flaws_on');
  const off = await post(srv, '/api/tests', { url: 'https://agent-ready-demo.vercel.app/?flaws=off' });
  assert.equal(off.json.reportId, 'rep_demo_flaws_off');
  const a = (await call(srv.base, '/api/tests/rep_demo_flaws_on')).json;
  const b = (await call(srv.base, '/api/tests/rep_demo_flaws_off')).json;
  assert.ok(a.score < b.score, 'flawed store scores below the fixed one');
});

test('unknown report, bad ids and unknown routes are plain 404s', async () => {
  for (const p of ['/api/tests/nope', '/api/tests/bad%20id', '/api/tests/..%2F..%2Fetc', '/api/tests/nope/events']) {
    const r = await call(srv.base, p);
    assert.equal(r.status, 404, p);
    assert.match(r.json.error, /could not find that report/);
  }
  assert.equal((await post(srv, '/api/tests/nope/cancel')).status, 404);
  assert.equal((await post(srv, '/api/reports/nope/fixes')).status, 404);
  const route = await call(srv.base, '/api/does-not-exist');
  assert.equal(route.status, 404);
  assert.equal(route.json.error, 'Unknown API route.');
  assert.equal((await call(srv.base, '/api/shot/bad id/x')).status, 400);
  assert.equal((await call(srv.base, '/api/shot/mock-nope-abcdef/s1')).status, 404);
});

test('instant scan endpoint', async () => {
  const r = await post(srv, '/api/instant-scan', { url: 'https://www.myntra.com' });
  assert.equal(r.status, 200);
  for (const k of ['pageTextChars', 'unlabelledButtons', 'priceAsText', 'overlayCoveringPage', 'productSchema', 'robotsTxt']) assert.ok(k in r.json, k);
  assert.equal((await post(srv, '/api/instant-scan', { url: 'ftp://x' })).status, 400);
});

test('fixes endpoint enriches findings and saves the report', async () => {
  const { json } = await post(srv, '/api/tests', { url: 'https://www.myntra.com', tasks: ['find_price'] });
  await finished(srv, json.reportId);
  const fx = await post(srv, `/api/reports/${json.reportId}/fixes`);
  assert.equal(fx.status, 200);
  const all = fx.json.tasks.flatMap((t) => t.findings);
  assert.ok(all.length > 0);
  assert.ok(all.every((f) => f.likelyCause && f.fix && f.passCheck), 'every finding has a cause, a fix and a pass check');
  assert.ok(all.every((f) => !/confus/i.test(f.likelyCause)), 'never blames the agent');
});

test('CLI upload: shape checks, replace, 409 on a web report id', async () => {
  const good = { id: 'cli_test_1', url: 'https://example.com', score: 80, tasks: [{ taskId: 'find_price', status: 'passed', steps: [] }], testedAt: new Date().toISOString() };
  assert.equal((await post(srv, '/api/reports', good)).status, 201);
  assert.equal((await post(srv, '/api/reports', { ...good, score: 90 })).status, 201, 'same CLI id replaces');
  const got = (await call(srv.base, '/api/tests/cli_test_1')).json;
  assert.equal(got.score, 90);
  assert.equal(got.source, 'cli');
  assert.equal(got.status, 'complete');
  const web = await post(srv, '/api/tests', { url: 'https://www.nykaa.com', tasks: ['find_price'] });
  assert.equal((await post(srv, '/api/reports', { ...good, id: web.json.reportId })).status, 409);
  assert.equal((await post(srv, '/api/reports', { ...good, id: 'rep_demo_flaws_on' })).status, 409, 'cannot overwrite a demo report');
  const bad = async (patch, re) => { const r = await post(srv, '/api/reports', { ...good, ...patch }); assert.equal(r.status, 400, JSON.stringify(patch)); assert.match(r.json.error, re); };
  await bad({ id: '../etc' }, /id must be/);
  await bad({ id: 'x'.repeat(81) }, /id must be/);
  await bad({ url: 'javascript:1' }, /url must start/);
  await bad({ url: 'not a url' }, /url is missing/);
  await bad({ score: 101 }, /score must be 0-100/);
  await bad({ score: 'high' }, /score must be 0-100/);
  await bad({ tasks: 'x' }, /tasks must be a list/);
  await bad({ tasks: [{ taskId: 'hack' }] }, /tasks must be a list/);
  assert.equal((await post(srv, '/api/reports', [])).status, 400);
  assert.equal((await post(srv, '/api/reports', 'nope')).status, 400);
});

test('demo-store flaws switch', async () => {
  const on = await post(srv, '/api/demo-store/flaws', { on: true });
  assert.equal(on.json.url, 'https://agent-ready-demo.vercel.app/?flaws=on');
  assert.equal((await post(srv, '/api/demo-store/flaws', { on: false })).json.url, 'https://agent-ready-demo.vercel.app/?flaws=off');
  assert.equal((await post(srv, '/api/demo-store/flaws', { on: 'yes' })).status, 400);
  assert.equal((await post(srv, '/api/demo-store/flaws', {})).status, 400);
});

test('leaderboard and race', async () => {
  const lb = await call(srv.base, '/api/leaderboard');
  assert.equal(lb.status, 200);
  assert.ok(Array.isArray(lb.json));
  const scores = lb.json.map((r) => r.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'ranked by score');

  assert.equal((await post(srv, '/api/race', { taskId: 'find_price', urls: ['https://www.nykaa.com'] })).status, 400);
  assert.equal((await post(srv, '/api/race', { taskId: 'custom', urls: ['nykaa.com', 'myntra.com'] })).status, 400);
  assert.equal((await post(srv, '/api/race', { taskId: 'find_price', urls: ['a.com', 'b.com', 'c.com', 'd.com'] })).status, 400);
  const race = await post(srv, '/api/race', { taskId: 'find_price', urls: ['https://www.nykaa.com', 'https://www.myntra.com'] });
  assert.equal(race.status, 202);
  const state = await waitFor(async () => { const r = (await call(srv.base, `/api/race/${race.json.raceId}`)).json; return r.lanes.every((l) => l.report?.status === 'complete') ? r : null; }, { what: 'race to finish' });
  assert.equal(state.lanes.length, 2);
  assert.ok(state.rank.length >= 1);
  assert.equal((await call(srv.base, '/api/race/nope')).status, 404);
});

test('webhook always answers 200 fast', async () => {
  const r = await post(srv, '/api/webhooks/tinyfish', { event: 'run.completed', run_id: 'unknown-run' });
  assert.equal(r.status, 200);
  assert.equal((await post(srv, '/api/webhooks/tinyfish', 'garbage', { 'content-type': 'text/plain' })).status, 200);
});

test('requests from another website are refused (CSRF); local pages and curl are fine', async () => {
  const evil = await post(srv, '/api/tests/nope/cancel', undefined, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  assert.match(evil.json.error, /another website/);
  assert.equal((await post(srv, '/api/watch', { url: 'nykaa.com' }, { origin: 'https://evil.example' })).status, 403);
  assert.notEqual((await post(srv, '/api/tests/nope/cancel', undefined, { origin: 'http://localhost:5173' })).status, 403);
  assert.notEqual((await post(srv, '/api/tests/nope/cancel', undefined, { origin: srv.base })).status, 403);
  const pre = await call(srv.base, '/api/tests', { method: 'OPTIONS', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
  assert.equal(pre.headers.get('access-control-allow-origin'), null);
  const get = await call(srv.base, '/api/health', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(get.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

// ---------------- cancel, queue state, structured logs (slow replay) ----------------

test('Stop test: lanes stop, queued tasks are dropped, nothing new starts, idempotent', async () => {
  const { json } = await post(slow, '/api/tests', { url: 'https://www.myntra.com' });
  const id = json.reportId;
  const busy = await waitFor(async () => { const h = (await call(slow.base, '/api/health')).json; return h.queue.running === 2 && h.queue.queued === 2 ? h : null; }, { what: 'queue to fill' });
  assert.equal(busy.queue.bySource.web.running, 2);
  assert.equal(busy.queue.groups[id].queued, 2);
  assert.equal(busy.activeTests, 1);

  const c = await post(slow, `/api/tests/${id}/cancel`);
  assert.equal(c.status, 200);
  assert.equal(c.json.cancelled, true);
  const report = await finished(slow, id);
  assert.equal(report.status, 'cancelled');
  assert.equal(report.score, 0);
  assert.deepEqual(report.topFixes, []);
  assert.ok(report.tasks.every((t) => t.status === 'cancelled'), JSON.stringify(report.tasks.map((t) => t.status)));
  assert.ok(report.tasks.every((t) => (t.verdict ?? 'none') === 'none'), 'no bot-wall verdict from a stopped test');

  await sleep(400);
  const h = (await call(slow.base, '/api/health')).json;
  assert.equal(h.queue.running + h.queue.queued, 0, 'no new runs started after the stop');
  assert.equal(h.activeTests, 0);

  const again = await post(slow, `/api/tests/${id}/cancel`);
  assert.equal(again.json.cancelled, false);
  assert.equal(again.json.status, 'cancelled');

  // the stopped report replays correctly to a page that is opened afterwards
  const late = await openSse(`${slow.base}/api/tests/${id}/events`);
  const done = await late.until((e) => e.type === 'report-complete');
  await late.close();
  assert.equal(done.report.status, 'cancelled');
  const list = (await call(slow.base, '/api/tests')).json;
  assert.equal(list.find((r) => r.id === id).status, 'cancelled');
});

test('two tests at once share the 2 slots and both can be stopped independently', async () => {
  const a = (await post(slow, '/api/tests', { url: 'https://www.nykaa.com' })).json.reportId;
  const b = (await post(slow, '/api/tests', { url: 'https://www.myntra.com' })).json.reportId;
  const h = await waitFor(async () => { const x = (await call(slow.base, '/api/health')).json; return x.activeTests === 2 && x.queue.running === 2 ? x : null; });
  assert.equal(h.queue.running, 2);
  assert.equal(h.queue.queued, 6);
  await post(slow, `/api/tests/${a}/cancel`);
  const ra = await finished(slow, a);
  assert.equal(ra.status, 'cancelled');
  // B is still going and now gets the freed slots
  const hb = await waitFor(async () => { const x = (await call(slow.base, '/api/health')).json; return x.queue.groups[b]?.running === 2 ? x : null; });
  assert.equal(hb.queue.groups[a], undefined);
  await post(slow, `/api/tests/${b}/cancel`);
  assert.equal((await finished(slow, b)).status, 'cancelled');
});

test('structured logs: one JSON line per start/cancel, no secrets', () => {
  const lines = slow.logs().split('\n').filter((l) => l.startsWith('{'));
  const events = lines.map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.event === 'server.start' && e.port === 4211));
  const start = events.find((e) => e.event === 'test.start');
  assert.ok(start && start.id && start.host.includes('myntra') && start.source === 'web');
  assert.ok(events.some((e) => e.event === 'test.cancel' && e.by === 'user'));
  assert.ok(events.some((e) => e.event === 'test.cancelled' && e.status === 'cancelled'));
  assert.ok(!/api[_-]?key|sk-tinyfish|authorization/i.test(lines.join('\n')));
});

// ---------------- Watch ----------------

test('Watch: validation, create (both scopes), list, patch', async () => {
  const bad = async (body, re) => { const r = await post(srv, '/api/watch', body); assert.equal(r.status, 400, JSON.stringify(body)); assert.match(r.json.error, re); };
  await bad({}, /enter a website address/);
  await bad({ url: 'ftp://x.com' }, /http:\/\/ or https:\/\//);
  await bad({ url: 'https://shop.example.net' }, /replays real agent runs/);
  await bad({ url: 'nykaa.com', everyMinutes: 1 }, /between 5 and 1440/);
  await bad({ url: 'nykaa.com', everyMinutes: 5000 }, /between 5 and 1440/);
  await bad({ url: 'nykaa.com', everyMinutes: 'abc' }, /between 5 and 1440/);
  await bad({ url: 'nykaa.com', everyMinutes: 10.5 }, /between 5 and 1440/);
  await bad({ url: 'nykaa.com', tasks: ['hack'] }, /tasks must be a list/);
  await bad({ url: 'nykaa.com', tasks: 'add_to_cart' }, /tasks must be a list/);

  const cart = await post(srv, '/api/watch', { url: 'https://agent-ready-demo.vercel.app/?flaws=off', everyMinutes: 20, tasks: ['add_to_cart'] });
  assert.equal(cart.status, 201);
  assert.match(cart.json.id, /^w_[0-9a-f]{8}$/);
  assert.deepEqual(cart.json.tasks, ['add_to_cart']);
  assert.equal(cart.json.enabled, true);
  const all = await post(srv, '/api/watch', { url: 'https://www.nykaa.com', everyMinutes: 60 });
  assert.equal(all.status, 201);
  assert.equal(all.json.tasks.length, 4, 'all 4 tasks by default');
  const list = (await call(srv.base, '/api/watch')).json;
  assert.equal(list.length >= 2, true);

  const p = await call(srv.base, `/api/watch/${cart.json.id}`, { method: 'PATCH', body: { enabled: false } });
  assert.equal(p.json.enabled, false);
  const r = await call(srv.base, `/api/watch/${cart.json.id}`, { method: 'PATCH', body: { enabled: true, everyMinutes: 30 } });
  assert.deepEqual([r.json.enabled, r.json.everyMinutes], [true, 30]);
  assert.equal((await call(srv.base, `/api/watch/${cart.json.id}`, { method: 'PATCH', body: { enabled: 'no' } })).status, 400);
  assert.equal((await call(srv.base, `/api/watch/${cart.json.id}`, { method: 'PATCH', body: { everyMinutes: 2 } })).status, 400);
  assert.equal((await call(srv.base, '/api/watch/w_nope', { method: 'PATCH', body: { enabled: false } })).status, 404);
});

test('Watch: run now, history, events, 404s', async () => {
  const w = (await post(srv, '/api/watch', { url: 'https://agent-ready-demo.vercel.app/?flaws=off', everyMinutes: 20, tasks: ['add_to_cart'] })).json;
  const sse = await openSse(`${srv.base}/api/watch/${w.id}/events`);
  assert.equal(sse.status, 200);
  const run = await post(srv, `/api/watch/${w.id}/run-now`);
  assert.equal(run.status, 200);
  assert.match(run.json.reportId, /^rep_\d+_w[0-9a-f]{4}$/);
  const again = await post(srv, `/api/watch/${w.id}/run-now`);
  assert.equal(again.status, 409, 'one check at a time');
  const report = await finished(srv, run.json.reportId);
  assert.equal(report.source, 'watch');
  assert.equal(report.status, 'complete');
  await waitFor(async () => (await call(srv.base, `/api/watch/${w.id}/history`)).json.length === 1, { what: 'history row' });
  const hist = (await call(srv.base, `/api/watch/${w.id}/history`)).json;
  assert.equal(hist[0].id, run.json.reportId);
  await sse.close();

  for (const p of ['/api/watch/w_nope/history', '/api/watch/w_nope/events', '/api/watch/bad id/history']) assert.equal((await call(srv.base, p)).status, 404, p);
  assert.equal((await post(srv, '/api/watch/w_nope/run-now')).status, 404);
  assert.equal((await post(srv, '/api/watch/w_nope/cancel')).status, 404);
});

test('Watch: pausing cancels the check that is running (no history row, no alert)', async () => {
  const w = (await post(slow, '/api/watch', { url: 'https://www.nykaa.com', everyMinutes: 60 })).json;
  const run = await post(slow, `/api/watch/${w.id}/run-now`);
  await waitFor(async () => (await call(slow.base, '/api/health')).json.queue.bySource.watch?.running === 2, { what: 'watch check to run' });
  const paused = await call(slow.base, `/api/watch/${w.id}`, { method: 'PATCH', body: { enabled: false } });
  assert.equal(paused.json.enabled, false);
  const report = await finished(slow, run.json.reportId);
  assert.equal(report.status, 'cancelled');
  assert.ok(report.tasks.every((t) => t.status === 'cancelled'));
  await sleep(300);
  const h = (await call(slow.base, '/api/health')).json;
  assert.equal(h.queue.running + h.queue.queued, 0);
  assert.deepEqual((await call(slow.base, `/api/watch/${w.id}/history`)).json, []);
  // the Stop button on a check uses the same cancel endpoint as a test
  const run2 = await post(slow, `/api/watch/${w.id}/run-now`);
  await waitFor(async () => (await call(slow.base, '/api/health')).json.queue.bySource.watch?.running === 2);
  assert.equal((await post(slow, `/api/tests/${run2.json.reportId}/cancel`)).json.cancelled, true);
  assert.equal((await finished(slow, run2.json.reportId)).status, 'cancelled');
});

test('a user test is ahead of a waiting Watch check, and /api/health says who holds the slots', async () => {
  const w = (await post(slow, '/api/watch', { url: 'https://www.nykaa.com', everyMinutes: 60 })).json;
  const run = await post(slow, `/api/watch/${w.id}/run-now`);
  await waitFor(async () => (await call(slow.base, '/api/health')).json.queue.bySource.watch?.running === 2);
  const user = (await post(slow, '/api/tests', { url: 'https://www.myntra.com', tasks: ['find_price'] })).json.reportId;
  const h = (await call(slow.base, '/api/health')).json;
  assert.equal(h.queue.groups[user].queued, 1);
  assert.equal(h.queue.groups[run.json.reportId].source, 'watch');
  await post(slow, `/api/tests/${run.json.reportId}/cancel`);
  // the freed slots go to the user test, not to a later Watch task
  await waitFor(async () => (await call(slow.base, '/api/health')).json.queue.groups[user]?.running === 1, { what: 'user test to get a slot' });
  await post(slow, `/api/tests/${user}/cancel`);
  await finished(slow, user);
});

test('a running task shows its runId in GET /api/tests/:id before it finishes', async () => {
  const { json } = await post(slow, '/api/tests', { url: 'https://www.nykaa.com', tasks: ['find_price'] });
  const seen = await waitFor(async () => {
    const r = (await call(slow.base, `/api/tests/${json.reportId}`)).json;
    const t = r.tasks?.find((x) => x.status === 'running' && x.runId);
    return t ? { report: r, task: t } : null;
  }, { what: 'a running task with a runId' });
  assert.equal(seen.report.status, 'running');
  assert.ok(seen.task.runId);
  await post(slow, `/api/tests/${json.reportId}/cancel`);
});

test('GET /api/badge/:id.svg: SVG with the score, cached 5 min; unknown or bad ids get a grey "unknown" badge', async () => {
  const created = await post(srv, '/api/tests', { url: 'nykaa.com' });
  const id = created.json.reportId;
  const report = await finished(srv, id);
  const ok = await call(srv.base, `/api/badge/${id}.svg`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /^image\/svg\+xml/);
  assert.equal(ok.headers.get('cache-control'), 'max-age=300');
  assert.ok(ok.text.includes(`${report.score}/100`), ok.text);
  for (const bad of ['rep_nope.svg', '..%2Fetc.svg', 'x'.repeat(200) + '.svg', `${id}`]) {
    const r = await call(srv.base, `/api/badge/${bad}`);
    assert.equal(r.status, 404, bad);
    assert.match(r.headers.get('content-type'), /^image\/svg\+xml/);
    assert.equal(r.headers.get('cache-control'), 'max-age=300');
    assert.match(r.text, /unknown/);
  }
});
