// Hash routes for the site, docs and app areas, and redirects that keep every old link working (redesign spec 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHash, redirectFor, href } from '../src/routes.js';

test('site area: landing by default, pricing, unknown pages land on the landing page', () => {
  assert.deepEqual(parseHash(''), { area: 'site', page: 'landing', id: null, extra: null });
  assert.deepEqual(parseHash('#/'), { area: 'site', page: 'landing', id: null, extra: null });
  assert.equal(parseHash('#/pricing').page, 'pricing');
  assert.deepEqual(parseHash('#/foo'), { area: 'site', page: 'landing', id: null, extra: null });
});

test('docs area: getting-started by default; an unknown slug is kept so the page can say it does not exist', () => {
  assert.deepEqual(parseHash('#/docs'), { area: 'docs', page: 'getting-started', id: null, extra: null });
  assert.equal(parseHash('#/docs/cli').page, 'cli');
  assert.equal(parseHash('#/docs/nope').page, 'nope');
});

test('app area: tests home, reports with a before id (decoded), unknown pages fall back to tests', () => {
  assert.deepEqual(parseHash('#/app'), { area: 'app', page: 'tests', id: null, extra: null });
  assert.deepEqual(parseHash('#/app/test/rep_a%2Db/rep_c'), { area: 'app', page: 'test', id: 'rep_a-b', extra: 'rep_c' });
  assert.deepEqual(parseHash('#/app/race/race_1'), { area: 'app', page: 'race', id: 'race_1', extra: null });
  assert.equal(parseHash('#/app/watch').page, 'watch');
  assert.equal(parseHash('#/app/leaderboard').page, 'leaderboard');
  assert.equal(parseHash('#/app/nope').page, 'tests');
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
