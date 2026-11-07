// Hash routes for the site, docs and app areas, and redirects that keep every old link working (redesign spec 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, redirectFor, href, APP_PAGES } from '../src/routes.js';

test('site area: landing by default, pricing, an unknown address is a not-found page (the address stays)', () => {
  assert.deepEqual(parseHash(''), { area: 'site', page: 'landing', id: null, extra: null });
  assert.deepEqual(parseHash('#/'), { area: 'site', page: 'landing', id: null, extra: null });
  assert.deepEqual(parseHash('#'), { area: 'site', page: 'landing', id: null, extra: null });
  assert.equal(parseHash('#/pricing').page, 'pricing');
  assert.deepEqual(parseHash('#/foo'), { area: 'site', page: 'not-found', id: null, extra: null });
  assert.equal(parseHash('#/pricing/extra').page, 'not-found');
  assert.equal(parseHash('#/foo/bar').page, 'not-found');
});

test('docs area: getting-started by default; an unknown slug is kept so the page can say it does not exist', () => {
  assert.deepEqual(parseHash('#/docs'), { area: 'docs', page: 'getting-started', id: null, extra: null });
  assert.equal(parseHash('#/docs/cli').page, 'cli');
  assert.equal(parseHash('#/docs/nope').page, 'nope');
});

test('app area: tests home, reports with a before id (decoded), unknown pages are not found', () => {
  assert.deepEqual(parseHash('#/app'), { area: 'app', page: 'tests', id: null, extra: null });
  assert.deepEqual(parseHash('#/app/test/rep_a%2Db/rep_c'), { area: 'app', page: 'test', id: 'rep_a-b', extra: 'rep_c' });
  assert.deepEqual(parseHash('#/app/race/race_1'), { area: 'app', page: 'race', id: 'race_1', extra: null });
  assert.equal(parseHash('#/app/watch').page, 'watch');
  assert.equal(parseHash('#/app/leaderboard').page, 'leaderboard');
  assert.deepEqual(parseHash('#/app/nope'), { area: 'app', page: 'not-found', id: null, extra: null });
  assert.equal(parseHash('#/app/tests').page, 'not-found', 'the tests home is #/app, not #/app/tests');
  assert.equal(parseHash('#/app/test').page, 'tests', 'a report route with no id is the tests home');
});

test('old links redirect to the app, keeping the id and the before id as given', () => {
  assert.equal(redirectFor('#/test'), '#/app');
  assert.equal(redirectFor('#/test/rep_a%2Db/rep_c'), '#/app/test/rep_a%2Db/rep_c');
  assert.equal(redirectFor('#/test/rep_demo_flaws_on'), '#/app/test/rep_demo_flaws_on');
  assert.equal(redirectFor('#/watch'), '#/app/watch');
  assert.equal(redirectFor('#/race'), '#/app/race');
  assert.equal(redirectFor('#/race/race_1'), '#/app/race/race_1');
  assert.equal(redirectFor('#/leaderboard'), '#/app/leaderboard');
});

test('redirects cover exactly the app pages parseHash knows, from one list', () => {
  for (const p of APP_PAGES) assert.ok(redirectFor(`#/${p}/x`), p);
  assert.deepEqual([...APP_PAGES].sort(), ['leaderboard', 'race', 'test', 'watch']);
  for (const p of APP_PAGES) assert.notEqual(parseHash(`#/app/${p}/x`).page, 'not-found', p);
});

test('new links and other addresses never redirect', () => {
  for (const h of ['', '#/', '#/pricing', '#/docs/cli', '#/app', '#/app/watch', '#/app/test/x', '#/foo']) assert.equal(redirectFor(h), null, h);
});

test('href builds encoded hash links and skips empty parts', () => {
  assert.equal(href('app', 'test', 'rep 1', null), '#/app/test/rep%201');
  assert.equal(href('app', 'tests'), '#/app');
  assert.equal(href('site', 'landing'), '#/');
  assert.equal(href('site', 'pricing'), '#/pricing');
  assert.equal(href('docs', 'cli'), '#/docs/cli');
  assert.equal(href('app', 'test', 'rep_a', 'rep_b'), '#/app/test/rep_a/rep_b');
});
