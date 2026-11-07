// Task packs through the API (D40): validation, replay refusal for non-shop tasks, and live mode (no key, so nothing real runs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, call, waitFor, openSse } from './helpers.js';

let replay; // replay mode (the public demo copy)
let live;   // live mode with no TinyFish key: tests fail fast with a plain message and nothing reaches the network
before(async () => {
  [replay, live] = await Promise.all([
    startServer({ port: 4233 }),
    startServer({ port: 4234, env: { TINYFISH_MOCK: '0', TINYFISH_API_KEY: '' } }),
  ]);
});
after(async () => { await Promise.all([replay?.stop(), live?.stop()]); });

const post = (s, p, body) => call(s.base, p, { method: 'POST', body });
const finished = (s, id) => waitFor(async () => { const r = (await call(s.base, `/api/tests/${id}`)).json; return r && r.status !== 'running' ? r : null; }, { timeout: 25000, what: `report ${id}` });

test('pack is validated: unknown packs and non-text values are plain 400s', async () => {
  for (const pack of ['blog', 'SHOP', 'shopping', 5, ['saas'], {}]) {
    const r = await post(live, '/api/tests', { url: 'https://shop.example.net', pack });
    assert.equal(r.status, 400, JSON.stringify(pack));
    assert.match(r.json.error, /pack must be one of: auto, shop, saas, content, local/);
  }
});

test('tasks from any pack are valid ids; unknown ids are still refused', async () => {
  const bad = await post(live, '/api/tests', { url: 'https://shop.example.net', tasks: ['find_docs', 'hack'] });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /tasks must be a list of task ids from any pack/);
  assert.equal((await post(live, '/api/tests', { url: 'https://shop.example.net', tasks: ['custom'] })).status, 400, 'custom has its own field');
});

test('replay mode refuses SaaS, blog and local tasks (only shop tasks have recordings), by pack or by task id', async () => {
  for (const body of [{ pack: 'saas' }, { pack: 'content' }, { pack: 'local' }, { tasks: ['find_hours'] }, { tasks: ['find_price', 'reach_signup'] }]) {
    const r = await post(replay, '/api/tests', { url: 'https://www.nykaa.com', ...body });
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.json.error, /only recorded the online-store tasks/);
  }
  const race = await post(replay, '/api/race', { taskId: 'find_docs', urls: ['https://www.nykaa.com', 'https://www.myntra.com'] });
  assert.equal(race.status, 400);
  assert.match(race.json.error, /only recorded the online-store tasks/);
  const watch = await post(replay, '/api/watch', { url: 'https://www.nykaa.com', pack: 'local' });
  assert.equal(watch.status, 400);
  assert.match(watch.json.error, /only recorded the online-store tasks/);
});

test('replay mode: pack shop and pack auto run the four shop tasks and store the pack', async () => {
  for (const pack of ['shop', 'auto', undefined]) {
    const r = await post(replay, '/api/tests', { url: 'https://www.nykaa.com', tasks: undefined, pack });
    assert.equal(r.status, 202, String(pack));
    const rep = await finished(replay, r.json.reportId);
    assert.equal(rep.pack, 'shop', `pack ${pack}`);
    assert.deepEqual(rep.tasks.map((t) => t.taskId).sort(), ['add_to_cart', 'find_contact', 'find_price', 'find_returns']);
    assert.equal(rep.detectingPack, undefined);
  }
});

test('replay mode: a custom task alone with a shop task still works (no pack task, no refusal)', async () => {
  const r = await post(replay, '/api/tests', { url: 'https://www.nykaa.com', tasks: ['find_price'], customTask: 'Find the delivery fee' });
  assert.equal(r.status, 202);
  const rep = await finished(replay, r.json.reportId);
  assert.equal(rep.customText, 'Find the delivery fee');
  assert.deepEqual(rep.tasks.map((t) => t.taskId).sort(), ['custom', 'find_price']);
});

test('live mode: pack saas starts the four SaaS tasks, with a custom task appended', async () => {
  const r = await post(live, '/api/tests', { url: 'https://shop.example.net', pack: 'saas', customTask: 'Find the refund terms' });
  assert.equal(r.status, 202);
  const rep = await finished(live, r.json.reportId);
  assert.equal(rep.pack, 'saas');
  assert.deepEqual(rep.tasks.map((t) => t.taskId).sort(), ['contact_sales', 'custom', 'find_docs', 'find_pricing_plans', 'reach_signup']);
  assert.ok(rep.tasks.every((t) => t.status === 'failed' && /TINYFISH_API_KEY is not set/.test(t.blocker)));
});

test('live mode: explicit tasks from another pack name the pack; mixed lists use the first pack task', async () => {
  const a = await post(live, '/api/tests', { url: 'https://shop.example.net', tasks: ['find_hours', 'reach_booking'] });
  assert.equal((await finished(live, a.json.reportId)).pack, 'local');
  const b = await post(live, '/api/tests', { url: 'https://shop.example.net', tasks: ['find_docs', 'find_price'] });
  const rep = await finished(live, b.json.reportId);
  assert.equal(rep.pack, 'saas');
  assert.equal(rep.tasks.length, 2);
  const c = await post(live, '/api/tests', { url: 'https://shop.example.net', pack: 'content', tasks: ['read_article'] });
  const cr = await finished(live, c.json.reportId);
  assert.equal(cr.pack, 'content');
  assert.deepEqual(cr.tasks.map((t) => t.taskId), ['read_article']);
});

test('live mode: pack auto waits for the Instant Scan, announces the pack, then runs that pack (scan unreadable -> shop)', async () => {
  const r = await post(live, '/api/tests', { url: 'https://shop.example.net', pack: 'auto' });
  assert.equal(r.status, 202);
  const first = (await call(live.base, `/api/tests/${r.json.reportId}`)).json;
  assert.ok(first.status === 'running' || first.status === 'complete');
  const rep = await finished(live, r.json.reportId);
  assert.equal(rep.pack, 'shop', 'no key: the scan reads nothing, so shop');
  assert.equal(rep.packDetected, false);
  assert.equal(rep.detectingPack, undefined);
  assert.equal(rep.tasks.length, 4);
});

test('live mode: Stop while a pack is being detected ends the test with nothing run', async () => {
  // A slow scan is not available without a key, so race the stop against the (fast) detection: either outcome must be clean.
  const r = await post(live, '/api/tests', { url: 'https://shop.example.net', pack: 'auto' });
  const stop = await post(live, `/api/tests/${r.json.reportId}/cancel`);
  assert.equal(stop.status, 200);
  const rep = await finished(live, r.json.reportId);
  assert.ok(['complete', 'cancelled'].includes(rep.status));
  if (rep.status === 'cancelled') { assert.equal(rep.score, 0); assert.deepEqual(rep.topFixes, []); }
});

test('Watch: pack picks the default tasks, tasks from any pack are stored, auto is refused', async () => {
  const bad = await post(live, '/api/watch', { url: 'https://shop.example.net', pack: 'auto' });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /pack must be one of: shop, saas, content, local/);
  const saas = await post(live, '/api/watch', { url: 'https://shop.example.net', everyMinutes: 60, pack: 'saas' });
  assert.equal(saas.status, 201);
  assert.equal(saas.json.pack, 'saas');
  assert.deepEqual(saas.json.tasks, ['find_pricing_plans', 'reach_signup', 'contact_sales', 'find_docs']);
  const some = await post(live, '/api/watch', { url: 'https://shop.example.net', everyMinutes: 60, tasks: ['find_hours'] });
  assert.equal(some.json.pack, 'local');
  const def = await post(live, '/api/watch', { url: 'https://shop.example.net', everyMinutes: 60 });
  assert.equal(def.json.pack, 'shop');
  assert.equal(def.json.tasks.length, 4);
});

test('Race: any pack task id is a valid race task in live mode', async () => {
  const r = await post(live, '/api/race', { taskId: 'find_hours', urls: ['https://shop.example.net', 'https://shop.example.org'] });
  assert.equal(r.status, 202);
  const race = (await call(live.base, `/api/race/${r.json.raceId}`)).json;
  assert.equal(race.taskId, 'find_hours');
  const rep = await finished(live, race.lanes[0].reportId);
  assert.equal(rep.pack, 'local');
  assert.deepEqual(rep.tasks.map((t) => t.taskId), ['find_hours']);
});

test('CLI upload keeps the pack; an older report with pack "shopping" is stored as shop; bad packs are refused', async () => {
  const base = { id: 'cli_pack_1', url: 'https://example.com', score: 70, tasks: [{ taskId: 'find_docs', status: 'passed', steps: [] }], testedAt: new Date().toISOString() };
  assert.equal((await post(replay, '/api/reports', { ...base, pack: 'saas' })).status, 201);
  assert.equal((await call(replay.base, '/api/tests/cli_pack_1')).json.pack, 'saas');
  assert.equal((await post(replay, '/api/reports', { ...base, id: 'cli_pack_2', pack: 'shopping', tasks: [{ taskId: 'find_price', status: 'passed', steps: [] }] })).status, 201);
  assert.equal((await call(replay.base, '/api/tests/cli_pack_2')).json.pack, 'shop');
  assert.equal((await post(replay, '/api/reports', { ...base, id: 'cli_pack_3' })).status, 201);
  assert.equal((await call(replay.base, '/api/tests/cli_pack_3')).json.pack, 'shop', 'no pack: shop');
  const bad = await post(replay, '/api/reports', { ...base, id: 'cli_pack_4', pack: 'banking' });
  assert.equal(bad.status, 400);
  assert.match(bad.json.error, /pack must be shop, saas, content or local/);
});
