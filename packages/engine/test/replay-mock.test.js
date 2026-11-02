// Mock/replay mode (TINYFISH_MOCK=1): recorded runs, custom-task honesty, cancel, and queue priority with real run-site flow.
process.env.TINYFISH_MOCK = '1';
process.env.TINYFISH_MOCK_SPEED = '400';
process.env.TINYFISH_MAX_PARALLEL = '2';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const engine = await import('../src/index.js');
const mock = await import('../src/mock.js');
const { runSiteTest, cancelReport, REPLAY_CUSTOM_NOTE, getQueueState } = engine;
const tick = (ms) => new Promise((r) => setTimeout(r, ms));

test('replay: a full Nykaa test completes with a score and is not marked cancelled', async () => {
  const report = await runSiteTest({ url: 'https://www.nykaa.com', id: 'rep_replay_nykaa' });
  assert.equal(report.status, 'complete');
  assert.equal(report.tasks.length, 4);
  assert.ok(report.score > 0 && report.score <= 100);
  assert.equal(report.botWall, 'none');
});

test('replay: Myntra without a proxy is blocked, the India proxy gets through (recorded runs)', async () => {
  const report = await runSiteTest({ url: 'https://www.myntra.com', id: 'rep_replay_myntra', tasks: ['find_price'] });
  assert.equal(report.botWall, 'blocks-cloud-agents');
  assert.equal(report.tasks[0].attempts.length, 2);
});

test('replay: a custom task shows an honest note, never an unrelated recorded answer', async () => {
  const report = await runSiteTest({ url: 'https://www.nykaa.com', id: 'rep_replay_custom', tasks: ['find_price'], customText: 'Find the delivery charge for a ₹300 order' });
  const custom = report.tasks.find((t) => t.taskId === 'custom');
  assert.ok(custom);
  assert.equal(custom.replayNote, REPLAY_CUSTOM_NOTE);
  assert.match(custom.replayNote, /not your custom task/);
  assert.equal(custom.answer, null);
  assert.equal(custom.blocker, null);
  assert.equal(custom.goal.includes('delivery charge'), true, 'the lane still shows the user own words');
  assert.equal(report.tasks.find((t) => t.taskId === 'find_price').replayNote, undefined, 'recorded tasks are real recordings');
});

test('cancel in replay mode: no bot-wall retry, nothing queued starts, mock runs are cancelled', async () => {
  const before = mock.stats.started;
  const cancelledBefore = mock.stats.cancelled.length;
  const slow = process.env.TINYFISH_MOCK_SPEED;
  process.env.TINYFISH_MOCK_SPEED = '3'; // slow enough to stop mid-run
  try {
    const pending = runSiteTest({ url: 'https://www.myntra.com', id: 'rep_replay_cancel' });
    await tick(200);
    assert.equal(getQueueState().groups.rep_replay_cancel.running, 2);
    const res = await cancelReport('rep_replay_cancel');
    assert.deepEqual([res.found, res.cancelledRuns, res.droppedFromQueue], [true, 2, 2]);
    const report = await pending;
    assert.equal(report.status, 'cancelled');
    assert.equal(mock.stats.started - before, 2);
    assert.equal(mock.stats.cancelled.length - cancelledBefore, 2);
    await tick(300);
    assert.equal(mock.stats.started - before, 2, 'no retry or queued task started after the stop');
    for (const t of report.tasks) assert.equal(t.verdict, 'none');
  } finally { process.env.TINYFISH_MOCK_SPEED = slow; }
});

test('queue priority end to end: a user test starts before the rest of an older Watch check', async () => {
  const startedOrder = [];
  const track = (tag) => (e) => { if (e.kind === 'task-update' && e.task.status === 'running' && !startedOrder.includes(`${tag}:${e.task.taskId}`)) startedOrder.push(`${tag}:${e.task.taskId}`); }; // a running lane now updates twice (start, then runId)
  process.env.TINYFISH_MOCK_SPEED = '40';
  const watch = runSiteTest({ url: 'https://www.nykaa.com', id: 'rep_prio_watch', source: 'watch' }, track('watch'));
  await tick(5);
  const user = runSiteTest({ url: 'https://www.nykaa.com', id: 'rep_prio_user', source: 'web', tasks: ['find_price'] }, track('user'));
  await Promise.all([watch, user]);
  const userAt = startedOrder.indexOf('user:find_price');
  const lastWatchAt = startedOrder.lastIndexOf(startedOrder.filter((s) => s.startsWith('watch')).at(-1));
  assert.ok(userAt !== -1);
  assert.ok(userAt < lastWatchAt, `user task should jump ahead of waiting Watch tasks, order was ${startedOrder.join(', ')}`);
  assert.equal(startedOrder.filter((s) => s.startsWith('watch')).length, 4);
});
