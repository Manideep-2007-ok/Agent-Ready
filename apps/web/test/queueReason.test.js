import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queueReason } from '../src/queueReason.js';

const q = (groups, running = Object.values(groups).reduce((n, g) => n + g.running, 0)) => ({ maxParallel: 2, running, queued: 3, groups });

test('no reason while a slot is free or health has no queue', () => {
  assert.equal(queueReason(null, 'r'), '');
  assert.equal(queueReason(undefined, 'r'), '');
  assert.equal(queueReason(q({ other: { source: 'watch', running: 1, queued: 0 } }), 'r'), '');
});

test('a Watch check holds the agents', () => {
  assert.equal(queueReason(q({ w: { source: 'watch', running: 2, queued: 2 }, mine: { source: 'web', running: 0, queued: 4 } }), 'mine'),
    '2 agents busy: a Watch check is running');
  assert.equal(queueReason(q({ w: { source: 'watch', running: 1, queued: 0 }, t: { source: 'web', running: 1, queued: 0 }, mine: { source: 'web', running: 0, queued: 4 } }, 2), 'mine'),
    '2 agents busy: a Watch check is running', 'mixed: the Watch check is named');
});

test('another test holds the agents', () => {
  assert.equal(queueReason(q({ t: { source: 'web', running: 2, queued: 2 }, mine: { source: 'web', running: 0, queued: 4 } }), 'mine'), '2 agents busy: another test is running');
  assert.equal(queueReason(q({ t: { source: 'cli', running: 1, queued: 0 }, me: { source: 'web', running: 1, queued: 3 } }, 2), 'me'), '1 agent busy: another test is running');
});

test('this test fills every slot itself', () => {
  assert.match(queueReason(q({ mine: { source: 'web', running: 2, queued: 2 } }), 'mine'), /All 2 agents are busy with this test/);
});

test('a Watch check waiting behind a test says so', () => {
  assert.equal(queueReason(q({ t: { source: 'web', running: 2, queued: 0 }, chk: { source: 'watch', running: 0, queued: 4 } }), 'chk'), '2 agents busy: another test is running');
});
