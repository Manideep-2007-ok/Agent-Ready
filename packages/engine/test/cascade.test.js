// Bot-wall cascade, cancel flow and failure handling, against an in-process fake of the TinyFish API (fake-tinyfish.js).
// The key below is a dummy, and the fake replaces fetch and refuses every other host: nothing can reach the real API.
process.env.TINYFISH_MOCK = '0';
process.env.TINYFISH_API_KEY = 'test-key-not-real';
process.env.TINYFISH_MAX_PARALLEL = '2';
process.env.TINYFISH_POLL_INTERVAL_MS = '20';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeTinyFish, runRecord } from './fake-tinyfish.js';

const { runTaskWithBotWall } = await import('../src/botwall.js');
const { runSiteTest } = await import('../src/runner.js');
const { createRunContext, cancelReport, activeReportIds } = await import('../src/runContext.js');
const { getQueueState } = await import('../src/queue.js');
const tf = await import('../src/tinyfish.js');

const URL_ = 'https://shop.example.test';
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out waiting for condition'); await tick(10); } };

const ok = { success: true, answer: 'Lipstick ₹467', blocker: null, stuck_url: null };
const wall = (blocker = 'Access Denied: error page') => ({ success: false, answer: null, blocker, stuck_url: URL_ });
/** A finished stream: STARTED, n PROGRESS steps, COMPLETE with this result. */
const finished = (result, steps = 1, status = 'COMPLETED') => ({
  events: [{ type: 'STARTED' }, ...Array.from({ length: steps }, (_, i) => ({ type: 'PROGRESS', purpose: `Step ${i + 1}` })), { type: 'COMPLETE', status, result }],
});

let fake;
afterEach(() => { fake?.restore(); fake = null; });

test('passes on the first try: no bot wall, one run', async () => {
  fake = installFakeTinyFish({ runSse: () => finished(ok, 3) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(r.status, 'passed');
  assert.equal(r.verdict, 'none');
  assert.equal(fake.calls.sse.length, 1);
  assert.equal(fake.calls.sse[0].body.proxy_config.enabled, false);
  assert.ok(fake.calls.sse[0].body.agent_config.max_duration_seconds > 0, 'every run has a time cap');
  assert.deepEqual(fake.calls.blocked, []);
});

test('blocked without a proxy, passes through the India proxy: blocks-cloud-agents', async () => {
  fake = installFakeTinyFish({ runSse: ({ index }) => (index === 0 ? finished(wall(), 1) : finished(ok, 5)) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(r.status, 'passed');
  assert.equal(r.verdict, 'blocks-cloud-agents');
  assert.equal(r.attempts.length, 2);
  assert.equal(fake.calls.sse[1].body.proxy_config.country_code, 'IN');
  assert.equal(fake.calls.sse[1].body.browser_profile, 'lite');
});

test('D26: after the India-proxy attempt took 5+ steps, "Something went wrong" is the site failing, not a bot wall', async () => {
  fake = installFakeTinyFish({ runSse: ({ index }) => (index === 0 ? finished(wall('Something went wrong'), 1) : finished(wall('Something went wrong on the cart page'), 6)) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'add_to_cart' });
  assert.equal(fake.calls.sse.length, 2, 'no stealth attempt');
  assert.equal(r.verdict, 'none');
  assert.notEqual(r.status, 'passed');
});

test('blocked on every attempt: stealth is tried last and the verdict is site-broken', async () => {
  fake = installFakeTinyFish({ runSse: () => finished(wall(), 1) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(fake.calls.sse.length, 3);
  assert.equal(fake.calls.sse[2].body.browser_profile, 'stealth');
  assert.equal(r.verdict, 'site-broken');
  assert.equal(r.status, 'blocked');
});

test('passes only in stealth mode: blocks-automation', async () => {
  fake = installFakeTinyFish({ runSse: ({ index }) => (index < 2 ? finished(wall(), 1) : finished(ok, 4)) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(r.verdict, 'blocks-automation');
  assert.equal(r.status, 'passed');
});

test('an ordinary failure (could not find the policy) is not retried', async () => {
  fake = installFakeTinyFish({ runSse: () => finished({ success: false, answer: null, blocker: 'No return policy link found in the footer', stuck_url: URL_ }, 7) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_returns' });
  assert.equal(fake.calls.sse.length, 1);
  assert.equal(r.status, 'failed');
  assert.equal(r.verdict, 'none');
});

test('CANCELLED is final: a cancelled run with few steps is NOT treated as blocked and starts nothing new', async () => {
  fake = installFakeTinyFish({ runSse: () => finished(null, 1, 'CANCELLED') });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(r.status, 'cancelled');
  assert.equal(r.verdict, 'none');
  assert.equal(fake.calls.sse.length, 1, 'no proxy or stealth retry');
  assert.equal(r.attempts.length, 1);
});

test('a run cancelled on TinyFish stops the whole test: queued tasks never start', async () => {
  fake = installFakeTinyFish({ runSse: () => finished(null, 1, 'CANCELLED') });
  const report = await runSiteTest({ url: URL_, id: 'rep_ext_cancel' });
  assert.equal(report.status, 'cancelled');
  assert.equal(report.score, 0);
  assert.deepEqual(report.topFixes, []);
  assert.equal(fake.calls.sse.length, 2, 'only the 2 tasks that held a slot started');
  assert.ok(report.tasks.every((t) => t.status === 'cancelled'));
  assert.ok(fake.calls.cancel.length <= 1, 'runs TinyFish already cancelled are not cancelled again (only the other in-flight one is)');
  assert.equal(getQueueState().running + getQueueState().queued, 0);
  assert.deepEqual(activeReportIds(), []);
});

test('cancelReport mid-run: streams abort, in-flight runs are cancelled on TinyFish, queued tasks are dropped', async () => {
  fake = installFakeTinyFish({ runSse: () => ({ events: [{ type: 'STARTED' }, { type: 'PROGRESS', purpose: 'Looking around' }], end: 'hang' }) });
  const seen = [];
  const pending = runSiteTest({ url: URL_, id: 'rep_stop_me' }, (e) => seen.push(e));
  await until(() => fake.calls.sse.length === 2 && seen.filter((e) => e.kind === 'step').length >= 2);
  assert.deepEqual(activeReportIds(), ['rep_stop_me']);
  const res = await cancelReport('rep_stop_me', 'user');
  assert.equal(res.found, true);
  assert.equal(res.cancelledRuns, 2);
  assert.equal(res.droppedFromQueue, 2);
  const report = await pending;
  assert.equal(report.status, 'cancelled');
  assert.deepEqual([...fake.calls.cancel].sort(), fake.calls.sse.map((c) => c.runId).sort(), 'every started run was cancelled on TinyFish');
  await tick(150);
  assert.equal(fake.calls.sse.length, 2, 'nothing started after the cancel');
  assert.ok(report.tasks.every((t) => t.status === 'cancelled'));
  const started = report.tasks.filter((t) => t.runId);
  assert.equal(started.length, 2);
  assert.ok(started.every((t) => t.steps.length === 1), 'steps taken before the stop are kept');
  assert.deepEqual(getQueueState().groups, {});
  assert.deepEqual(activeReportIds(), []);
  assert.equal((await cancelReport('rep_stop_me')).found, false, 'cancelling twice is harmless');
});

test('stopping during the pause before a bot-wall retry starts no retry', async () => {
  fake = installFakeTinyFish({ runSse: () => finished(wall(), 1) });
  const ctx = createRunContext({ id: 'rep_pause_cancel' });
  const pending = runTaskWithBotWall({ url: URL_, taskId: 'find_price' }, () => {}, ctx);
  await until(() => fake.calls.sse.length === 1);
  await tick(100); // inside the 1.5 s pause before attempt 2
  await ctx.cancel('user');
  const r = await pending;
  ctx.release();
  assert.equal(r.status, 'cancelled');
  assert.equal(fake.calls.sse.length, 1);
});

test('a failing cancel call on TinyFish does not break the cancel', async () => {
  fake = installFakeTinyFish({ cancelStatus: 500, runSse: () => ({ events: [{ type: 'STARTED' }], end: 'hang' }) });
  const pending = runSiteTest({ url: URL_, id: 'rep_cancel_500', tasks: ['find_price'] });
  await until(() => fake.calls.sse.length === 1);
  await tick(30);
  const res = await cancelReport('rep_cancel_500');
  assert.equal(res.found, true);
  assert.equal((await pending).status, 'cancelled');
  assert.equal(fake.calls.cancel.length, 1);
});

test('stream dropped before COMPLETE: poll the run until it finishes (and survive a 5xx while polling)', async () => {
  fake = installFakeTinyFish({
    runSse: () => ({ events: [{ type: 'STARTED' }, { type: 'PROGRESS', purpose: 'One' }], end: 'drop', run: runRecord({ runId: 'x', steps: 3, result: ok }) }),
    getRunStatuses: (runId, n) => (n === 0 ? 503 : n === 1 ? runRecord({ runId, status: 'RUNNING', steps: 2 }) : undefined),
  });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(r.status, 'passed');
  assert.ok(fake.calls.getRun.length >= 3, 'polled until COMPLETED');
  assert.equal(fake.calls.sse.length, 1);
});

test('stop while polling after a dropped stream: polling ends, the run is cancelled on TinyFish, no retry', async () => {
  fake = installFakeTinyFish({
    runSse: () => ({ events: [{ type: 'STARTED' }, { type: 'PROGRESS', purpose: 'One' }], end: 'drop' }),
    getRunStatuses: (runId) => runRecord({ runId, status: 'RUNNING', steps: 1 }), // never finishes on its own
  });
  const ctx = createRunContext({ id: 'rep_poll_cancel' });
  const pending = runTaskWithBotWall({ url: URL_, taskId: 'find_price' }, () => {}, ctx);
  await until(() => fake.calls.getRun.length >= 2); // polling now
  await ctx.cancel('user');
  const r = await pending;
  ctx.release();
  assert.equal(r.status, 'cancelled');
  assert.equal(r.verdict, 'none');
  assert.deepEqual(fake.calls.cancel, [fake.calls.sse[0].runId], 'the polled run is cancelled on TinyFish');
  const polls = fake.calls.getRun.length;
  await tick(100);
  assert.equal(fake.calls.getRun.length, polls, 'polling stopped');
  assert.equal(fake.calls.sse.length, 1, 'no bot-wall retry');
});

test('TinyFish answers 503 on start: a plain failure, no retry, key never shown', async () => {
  fake = installFakeTinyFish({ runSse: () => ({ end: 'http', status: 503 }) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(r.status, 'failed');
  assert.match(r.blocker, /Could not run the agent/);
  assert.match(r.blocker, /503/);
  assert.ok(!JSON.stringify(r).includes('test-key-not-real'));
  assert.equal(fake.calls.sse.length, 1, 'a server error is not a bot wall');
});

test('agent answers with no structured result: failed with a plain reason', async () => {
  fake = installFakeTinyFish({ runSse: () => ({ ...finished('I could not parse this', 4), run: runRecord({ runId: 'x', steps: 4, result: 'garbage text' }) }) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.notEqual(r.status, 'passed');
  assert.match(r.blocker, /no structured answer/);
});

test('COMPLETED is not success: success:false fails the task', async () => {
  fake = installFakeTinyFish({ runSse: () => finished({ success: false, answer: null, blocker: 'No price visible', stuck_url: null }, 6) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(r.status, 'failed');
});

test('waitForRun gives up after its time limit and stops at an abort', async () => {
  fake = installFakeTinyFish({ getRunStatuses: (runId) => runRecord({ runId, status: 'RUNNING' }) });
  await assert.rejects(tf.waitForRun('r1', { intervalMs: 10, timeoutMs: 80 }), /Timed out/);
  const ctl = new AbortController();
  const p = tf.waitForRun('r2', { intervalMs: 10, timeoutMs: 5000, signal: ctl.signal });
  setTimeout(() => ctl.abort(), 40);
  await assert.rejects(p, (e) => e.name === 'AbortError');
});

test('waitForRun does not retry a 404 (the run does not exist)', async () => {
  fake = installFakeTinyFish({ getRunStatuses: () => 404 });
  await assert.rejects(tf.waitForRun('nope', { intervalMs: 10, timeoutMs: 1000 }), (e) => e.status === 404);
});

test('a running task publishes its runId at once, and a bot-wall retry publishes the new one', async () => {
  fake = installFakeTinyFish({
    runSse: ({ index }) => (index === 0
      ? { events: [{ type: 'STARTED' }, { type: 'PROGRESS', purpose: 'Open' }, { type: 'COMPLETE', status: 'COMPLETED', result: wall() }] }
      : finished(ok, 3)),
  });
  const runningIds = [];
  await runSiteTest({ url: URL_, tasks: ['find_price'] }, (e) => {
    if (e.kind === 'task-update' && e.task.status === 'running' && e.task.runId) runningIds.push(e.task.runId);
  });
  assert.equal(fake.calls.sse.length, 2);
  assert.ok(runningIds.includes(fake.calls.sse[0].runId), 'attempt 1 runId visible while running');
  assert.ok(runningIds.includes(fake.calls.sse[1].runId), 'attempt 2 runId visible while running');
});
