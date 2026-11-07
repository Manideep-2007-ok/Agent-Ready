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

test('a stopped test costs what TinyFish billed (run record num_of_steps), not the live PROGRESS count', async () => {
  fake = installFakeTinyFish({ runSse: () => ({
    events: [{ type: 'STARTED' }, { type: 'PROGRESS', purpose: 'Open the page' }],
    end: 'hang', run: runRecord({ runId: 'x', status: 'CANCELLED', steps: 0, result: null }),
  }) });
  const pending = runSiteTest({ url: URL_, id: 'rep_cost_cancel', tasks: ['find_price'] });
  await until(() => fake.calls.sse.length === 1);
  await tick(60); // the live PROGRESS step has arrived
  await cancelReport('rep_cost_cancel', 'user');
  const report = await pending;
  assert.equal(report.status, 'cancelled');
  assert.equal(report.tasks[0].numSteps, 0, "TinyFish's count (0) replaces the live count (1)");
  assert.equal(report.tasks[0].attempts[0].numSteps, 0);
  assert.equal(report.costRupees, 0);
});

test('if the run record cannot be read after a stop, the live step count is kept', async () => {
  fake = installFakeTinyFish({ getRunStatuses: () => 500, runSse: () => ({ events: [{ type: 'STARTED' }, { type: 'PROGRESS', purpose: 'Open the page' }], end: 'hang' }) });
  const pending = runSiteTest({ url: URL_, id: 'rep_cost_fallback', tasks: ['find_price'] });
  await until(() => fake.calls.sse.length === 1);
  await tick(60);
  await cancelReport('rep_cost_fallback', 'user');
  const report = await pending;
  assert.equal(report.status, 'cancelled');
  assert.equal(report.tasks[0].numSteps, 1);
});

test('STARTED arriving after Stop: that run is still cancelled on TinyFish, the task ends cancelled, no retry', async () => {
  fake = installFakeTinyFish({ runSse: () => ({ events: [{ type: 'STARTED', delay: 150 }, { type: 'COMPLETE', status: 'COMPLETED', result: ok }] }) });
  const pending = runSiteTest({ url: URL_, id: 'rep_late_started', tasks: ['find_price'] });
  await until(() => fake.calls.sse.length === 1);
  const res = await cancelReport('rep_late_started', 'user'); // no run id is known yet
  assert.equal(res.cancelledRuns, 0);
  const report = await pending;
  await until(() => fake.calls.cancel.length === 1);
  assert.deepEqual(fake.calls.cancel, [fake.calls.sse[0].runId]);
  assert.equal(report.status, 'cancelled');
  assert.equal(report.tasks[0].status, 'cancelled');
  assert.equal(fake.calls.sse.length, 1, 'no retry');
});

test('after Stop the lane says cancelled at once and the agent slot is free while TinyFish is slow to give the step count', async () => {
  fake = installFakeTinyFish({
    getRunStatuses: (runId) => tick(600).then(() => runRecord({ runId, status: 'CANCELLED', steps: 0, result: null })),
    runSse: () => ({ events: [{ type: 'STARTED' }, { type: 'PROGRESS', purpose: 'Open the page' }], end: 'hang' }),
  });
  const updates = [];
  const pending = runSiteTest({ url: URL_, id: 'rep_cost_slow', tasks: ['find_price'] }, (e) => { if (e.kind === 'task-update') updates.push({ status: e.task.status, at: Date.now() }); });
  await until(() => fake.calls.sse.length === 1);
  await tick(60);
  const t0 = Date.now();
  await cancelReport('rep_cost_slow', 'user');
  await until(() => updates.some((u) => u.status === 'cancelled'), 300);
  assert.ok(updates.find((u) => u.status === 'cancelled').at - t0 < 300, 'lane shows cancelled before the record read finishes');
  await until(() => getQueueState().running === 0, 300); // the slot does not wait on the record read
  const report = await pending;
  assert.ok(Date.now() - t0 >= 500, 'the report waited for the record');
  assert.equal(report.tasks[0].numSteps, 0);
  assert.equal(report.costRupees, 0);
});

// P2-7 (live runs, 7 Nov): a site that refused cloud agents with "403 Forbidden" was not seen as a wall, and two tasks
// "passed" with answers the agent took from web search after the site refused it. Neither is a pass on the site.
const refused = (answer) => ({ success: true, answer, blocker: null, stuck_url: URL_ });

test('a "403 Forbidden" failure counts as a wall: the India-proxy attempt runs', async () => {
  let n = 0;
  fake = installFakeTinyFish({ runSse: () => (++n === 1 ? finished(wall('The site returned 403 Forbidden on every page'), 6) : finished(ok, 3)) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(fake.calls.sse.length, 2);
  assert.equal(fake.calls.sse[1].body.proxy_config.country_code, 'IN');
  assert.equal(r.status, 'passed');
  assert.equal(r.verdict, 'blocks-cloud-agents');
});

test('a "pass" whose answer says the site refused the agent is not a pass: retried, and the borrowed answer is dropped', async () => {
  let n = 0;
  fake = installFakeTinyFish({ runSse: () => (++n === 1
    ? finished(refused('The website returned a 403 Forbidden error. From search results: open 10am to 8pm.'), 11)
    : finished(ok, 4)) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(fake.calls.sse.length, 2, 'the India-proxy attempt ran');
  assert.equal(r.status, 'passed');
  assert.equal(r.verdict, 'blocks-cloud-agents');
  assert.equal(r.attempts[0].passed, false, 'the first attempt is recorded as refused, not passed');
  assert.match(r.attempts[0].blocker, /refused/i);
});

test('refused on every attempt: failed, verdict site-broken, no answer kept (D13), and D26 does not stop a 403 early', async () => {
  fake = installFakeTinyFish({ runSse: () => finished(refused('Access denied (403 Forbidden) on clinic pages; the hours below are from web search.'), 9) });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_hours' });
  assert.equal(fake.calls.sse.length, 3, 'all three attempts');
  assert.equal(r.status, 'failed');
  assert.equal(r.verdict, 'site-broken');
  assert.equal(r.answer, null);
  assert.match(r.blocker, /refused/i);
});

// P2-4: structured answers. Every run asks TinyFish for the answer shape GOAL_SUFFIX describes (output_schema), using
// only keywords TinyFish accepts. An account that refuses the field still gets its runs: the run is sent again
// without it, and later runs skip it. (Keep these two tests last: the refusal is remembered for the process.)
test('every run asks for the answer shape as output_schema (TinyFish-allowed keywords only)', async () => {
  fake = installFakeTinyFish({ runSse: () => finished(ok, 2) });
  await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  const schema = fake.calls.sse[0].body.output_schema;
  assert.deepEqual(Object.keys(schema.properties), ['success', 'answer', 'blocker', 'stuck_url']);
  assert.equal(schema.type, 'object');
  assert.equal(schema.properties.success.type, 'boolean');
  assert.deepEqual(schema.required, ['success']);
  for (const k of ['answer', 'blocker', 'stuck_url']) assert.deepEqual(schema.properties[k], { type: 'string', nullable: true });
  const allowed = new Set(['type', 'properties', 'required', 'propertyOrdering', 'nullable', 'items', 'enum', 'format', 'minimum', 'maximum', 'minItems', 'maxItems', 'anyOf']);
  const walk = (node) => { for (const [k, v] of Object.entries(node)) { if (k === 'properties') Object.values(v).forEach(walk); else assert.ok(allowed.has(k), `keyword ${k}`); } };
  walk(schema);
});

test('if TinyFish refuses output_schema, the run is sent again without it and later runs skip it', async () => {
  fake = installFakeTinyFish({
    runSse: ({ body }) => (body.output_schema
      ? { end: 'http', status: 400, body: { error: { code: 'INVALID_INPUT', message: 'output_schema is not enabled for this account' } } }
      : finished(ok, 2)),
  });
  const r = await runTaskWithBotWall({ url: URL_, taskId: 'find_price' });
  assert.equal(r.status, 'passed');
  assert.equal(fake.calls.sse.length, 2);
  assert.ok(fake.calls.sse[0].body.output_schema && !fake.calls.sse[1].body.output_schema);
  await runTaskWithBotWall({ url: URL_, taskId: 'find_contact' });
  assert.equal(fake.calls.sse.length, 3);
  assert.ok(!fake.calls.sse[2].body.output_schema, 'remembered: no second refusal');
});
