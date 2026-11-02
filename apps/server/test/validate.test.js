// Input validation and replay guards (pure functions, live mode: private addresses are refused).
process.env.TINYFISH_MOCK = '0';
process.env.DEMO_STORE_URL = 'https://agent-ready-demo.vercel.app';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const v = await import('../src/validate.js');

const rejects = (fn, re, status = 400) => assert.throws(fn, (e) => e.status === status && re.test(e.message), String(fn));

test('parseSiteUrl accepts normal addresses and adds https://', () => {
  assert.equal(v.parseSiteUrl('nykaa.com'), 'https://nykaa.com/');
  assert.equal(v.parseSiteUrl('  https://www.nykaa.com/p/1?x=2  '), 'https://www.nykaa.com/p/1?x=2');
  assert.equal(v.parseSiteUrl('http://shop.example.in:8080/a'), 'http://shop.example.in:8080/a');
  assert.equal(v.parseSiteUrl('HTTPS://Shop.Example.IN'), 'https://shop.example.in/');
  assert.equal(v.parseSiteUrl('https://xn--bcher-kva.example/'), 'https://xn--bcher-kva.example/');
});

test('parseSiteUrl refuses non-http schemes, credentials, spaces and long addresses', () => {
  for (const bad of ['ftp://a.com', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,hi', 'mailto:a@b.com', 'vbscript:x', 'blob:https://a.com/x']) rejects(() => v.parseSiteUrl(bad), /http:\/\/ or https:\/\//);
  rejects(() => v.parseSiteUrl('https://me:secret@nykaa.com'), /user name and password/);
  rejects(() => v.parseSiteUrl('https://me@nykaa.com'), /user name and password/);
  rejects(() => v.parseSiteUrl('https://nykaa.com/ a'), /spaces/);
  rejects(() => v.parseSiteUrl('https://nykaa.com/\u0007'), /spaces or hidden/);
  rejects(() => v.parseSiteUrl(`https://a.com/${'x'.repeat(v.MAX_URL_LENGTH)}`), /too long/);
  rejects(() => v.parseSiteUrl(''), /enter a website address/);
  rejects(() => v.parseSiteUrl(undefined), /enter a website address/);
  rejects(() => v.parseSiteUrl(null), /enter a website address/);
  rejects(() => v.parseSiteUrl({ toString: () => 'x' }), /valid website address/);
  rejects(() => v.parseSiteUrl('not-a-host'), /valid website address/);
  rejects(() => v.parseSiteUrl('https://'), /valid website address/);
});

test('parseSiteUrl refuses addresses a cloud browser cannot reach (live mode)', () => {
  for (const host of ['localhost', 'localhost:3000', '127.0.0.1', '127.1.2.3', '10.0.0.5', '192.168.1.20', '172.16.0.1', '172.31.255.255', '169.254.169.254',
    '0.0.0.0', '[::1]', 'shop.local', 'db.internal', 'x.localhost', '100.64.0.1', '[fd00::1]', '[fe80::1]']) {
    rejects(() => v.parseSiteUrl(host), /cannot reach localhost or private addresses/);
  }
  assert.doesNotThrow(() => v.parseSiteUrl('172.32.0.1'), 'outside the private range');
  assert.doesNotThrow(() => v.parseSiteUrl('8.8.8.8'));
});

test('parseTasks', () => {
  assert.equal(v.parseTasks(undefined), undefined);
  assert.deepEqual(v.parseTasks(['find_price', 'find_price', 'add_to_cart']), ['find_price', 'add_to_cart']);
  for (const bad of [[], 'find_price', ['custom'], ['nope'], [1], {}]) rejects(() => v.parseTasks(bad), /tasks must be a list/);
  rejects(() => v.parseTasks(undefined, { required: true }), /tasks must be a list/);
});

test('parseCustomTask: trims, strips control characters, keeps emoji, caps length', () => {
  assert.equal(v.parseCustomTask(undefined), undefined);
  assert.equal(v.parseCustomTask('   '), undefined);
  assert.equal(v.parseCustomTask('  find the cart 🛒 total\u0000 '), 'find the cart 🛒 total');
  assert.equal(v.parseCustomTask('🛒'.repeat(300)).length, 600, '300 emoji are within the limit (counted as characters, not UTF-16 units)');
  rejects(() => v.parseCustomTask('x'.repeat(301)), /under 300 characters/);
  rejects(() => v.parseCustomTask('🛒'.repeat(301)), /under 300 characters/);
  rejects(() => v.parseCustomTask(5), /must be text/);
  rejects(() => v.parseCustomTask({}), /must be text/);
});

test('parseEveryMinutes: 5 to 1440, whole numbers', () => {
  assert.equal(v.parseEveryMinutes(undefined), 20);
  assert.equal(v.parseEveryMinutes('60'), 60);
  assert.equal(v.parseEveryMinutes(5), 5);
  assert.equal(v.parseEveryMinutes(1440), 1440);
  for (const bad of [4, 0, -5, 1441, 'abc', 10.5, NaN, Infinity]) rejects(() => v.parseEveryMinutes(bad), /between 5 and 1440/);
});

test('ids', () => {
  assert.equal(v.isSafeId('rep_20261101_1210_nykaa-2'), true);
  assert.equal(v.isSafeId('mock-nykaa_find_price-l39yqq'), true);
  for (const bad of ['', '../x', 'a b', 'a/b', 'x'.repeat(81), null, undefined, 5, 'a.b']) assert.equal(v.isSafeId(bad), false);
  rejects(() => v.assertSafeId('../x'), /could not find that report/, 404);
});

test('replay guards (live mode: no restriction)', async () => {
  const replay = await import('../src/replay.js');
  assert.doesNotThrow(() => replay.assertReplayable('https://anything.example.net'), 'live tests are unrestricted');
  assert.equal(replay.recordedDemoReport('https://agent-ready-demo.vercel.app/?flaws=on'), null, 'only replay mode opens the recorded demo report');
  assert.equal(replay.hasRecording('https://www.nykaa.com'), true);
  assert.equal(replay.hasRecording('https://agent-ready-demo.vercel.app'), true);
  assert.equal(replay.hasRecording('https://www.flipkart.com'), false);
  assert.equal(replay.hasRecording('not a url'), false);
});
