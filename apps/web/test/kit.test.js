// Design kit helpers: one mapping from task status and score to badge tone and words, used on every page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusBadge, scoreBand } from '../src/design/status.js';

test('statusBadge: every task status gets a tone and a word, a wall counts as blocked', () => {
  assert.deepEqual(statusBadge('passed'), { tone: 'pass', label: 'PASSED' });
  assert.deepEqual(statusBadge('failed'), { tone: 'fail', label: 'FAILED' });
  assert.deepEqual(statusBadge('blocked'), { tone: 'fail', label: 'BLOCKED' });
  assert.deepEqual(statusBadge('failed', 'blocks-cloud-agents'), { tone: 'fail', label: 'BLOCKED' });
  assert.deepEqual(statusBadge('running'), { tone: 'accent', label: 'RUNNING' });
  assert.deepEqual(statusBadge('queued'), { tone: 'wait', label: 'WAITING' });
  assert.deepEqual(statusBadge('cancelled'), { tone: 'wait', label: 'STOPPED' });
  assert.deepEqual(statusBadge(undefined), { tone: 'wait', label: 'WAITING' });
});

test('scoreBand: 80 and up ready, 50 to 79 partly, under 50 not ready', () => {
  assert.deepEqual(scoreBand(100), { tone: 'pass', label: 'Ready for AI agents' });
  assert.equal(scoreBand(80).tone, 'pass');
  assert.deepEqual(scoreBand(79), { tone: 'warn', label: 'Partly ready' });
  assert.equal(scoreBand(50).tone, 'warn');
  assert.deepEqual(scoreBand(49), { tone: 'fail', label: 'Not ready' });
});
