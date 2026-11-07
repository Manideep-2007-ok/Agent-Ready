// The top loading bar (design/progress.js) follows real work: every page change starts a short sweep, every server
// request keeps it going until the last one ends. A store with no DOM, so it is tested here directly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../src/design/progress.js';

test('busy while any request is open; done when the last one ends', () => {
  const p = createProgress();
  const seen = [];
  p.subscribe((busy) => seen.push(busy));
  const a = p.begin();
  const b = p.begin();
  assert.equal(p.busy(), true);
  a();
  assert.equal(p.busy(), true, 'one request still open');
  b();
  assert.equal(p.busy(), false);
  assert.deepEqual(seen, [true, false], 'listeners hear only real changes');
});

test('ending the same request twice does not end another one', () => {
  const p = createProgress();
  const a = p.begin();
  const b = p.begin();
  a(); a();
  assert.equal(p.busy(), true);
  b();
  assert.equal(p.busy(), false);
});

test('a page change is a short sweep that ends by itself', async () => {
  const p = createProgress({ sweepMs: 30 });
  p.sweep();
  assert.equal(p.busy(), true);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(p.busy(), false);
});

test('unsubscribe stops updates', () => {
  const p = createProgress();
  let n = 0;
  const off = p.subscribe(() => { n++; });
  off();
  p.begin()();
  assert.equal(n, 0);
});
