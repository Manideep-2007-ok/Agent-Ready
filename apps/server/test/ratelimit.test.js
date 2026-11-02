import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, call, sleep } from './helpers.js';

const srv = await startServer({ port: 4212, env: { RATE_LIMIT_PER_MIN: '3', MAX_ACTIVE_TESTS: '2', TINYFISH_MOCK_SPEED: '2' } });
after(() => srv.stop());
const post = (p, body) => call(srv.base, p, { method: 'POST', body });

test('POST /api/tests: the 4th start in a minute gets a plain 429 with Retry-After', async () => {
  const first = await post('/api/tests', { url: 'bad url' });
  assert.equal(first.status, 400, 'rejected requests count too (they still cost server time)');
  assert.equal((await post('/api/tests', { url: 'bad url' })).status, 400);
  assert.equal((await post('/api/tests', { url: 'bad url' })).status, 400);
  const limited = await post('/api/tests', { url: 'https://www.nykaa.com' });
  assert.equal(limited.status, 429);
  assert.match(limited.json.error, /too fast .*3 per minute/);
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  // other endpoints have their own budget
  assert.equal((await call(srv.base, '/api/health')).status, 200);
  assert.equal((await post('/api/watch', { url: 'bad url' })).status, 400);
});

test('watch create, run-now and instant-scan are limited too', async () => {
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await post('/api/watch', { url: 'bad url' })).status);
  assert.deepEqual(codes.slice(0, 2), [400, 400], '3 allowed in total; one was used by the previous test');
  assert.ok(codes.includes(429));
  const scans = [];
  for (let i = 0; i < 4; i++) scans.push((await post('/api/instant-scan', { url: 'ftp://x' })).status);
  assert.deepEqual(scans, [400, 400, 400, 429]);
  const runs = [];
  for (let i = 0; i < 4; i++) runs.push((await post('/api/watch/w_nope/run-now')).status);
  assert.deepEqual(runs, [404, 404, 404, 429]);
});

test('the limit lifts after the window (unit-level check of the sliding window)', async () => {
  const { rateLimit, resetRateLimits } = await import('../src/rateLimit.js');
  resetRateLimits();
  const mw = rateLimit('unit', { max: 2, windowMs: 80 });
  const run = () => { let out = 'next'; mw({ ip: '1.2.3.4' }, { set() {}, status(c) { out = c; return { json() {} }; } }, () => {}); return out; };
  assert.deepEqual([run(), run(), run()], ['next', 'next', 429]);
  await sleep(100);
  assert.equal(run(), 'next');
  resetRateLimits();
});
