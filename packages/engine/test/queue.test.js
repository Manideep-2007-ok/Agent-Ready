import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.TINYFISH_MAX_PARALLEL = '2';
const { enqueue, cancelGroup, getQueueState, QueueCancelled, PRIORITY, priorityForSource } = await import('../src/queue.js');

const gate = () => { let open; const p = new Promise((r) => { open = r; }); return { p, open }; };
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));

test('at most 2 run at once, the rest wait in order', async () => {
  const order = [];
  const gates = [gate(), gate(), gate(), gate()];
  const jobs = gates.map((g, i) => enqueue(async () => { order.push(`start${i}`); await g.p; order.push(`end${i}`); }, { group: 'g', source: 'web' }));
  await tick();
  assert.deepEqual(order, ['start0', 'start1']);
  assert.equal(getQueueState().running, 2);
  assert.equal(getQueueState().queued, 2);
  gates[0].open(); await tick();
  assert.ok(order.includes('start2') && !order.includes('start3'));
  gates.forEach((g) => g.open());
  await Promise.all(jobs);
  assert.deepEqual(getQueueState(), { maxParallel: 2, running: 0, queued: 0, bySource: {}, groups: {} });
});

test('a user test goes ahead of waiting Watch checks (priority), without pre-empting running ones', async () => {
  const started = [];
  const g = [gate(), gate()];
  const run = (name, opts) => enqueue(async () => { started.push(name); await (opts.hold ?? Promise.resolve()); }, opts);
  // two Watch runs hold both slots
  const w1 = run('watch1', { source: 'watch', priority: PRIORITY.background, group: 'w', hold: g[0].p });
  const w2 = run('watch2', { source: 'watch', priority: PRIORITY.background, group: 'w', hold: g[1].p });
  // another Watch run queues first, THEN a user test queues
  const w3 = run('watch3', { source: 'watch', priority: PRIORITY.background, group: 'w' });
  const hold = gate();
  const u1 = run('user1', { source: 'web', priority: PRIORITY.user, group: 'u', hold: hold.p });
  await tick();
  assert.deepEqual(started, ['watch1', 'watch2'], 'running Watch runs are not interrupted');
  const state = getQueueState();
  assert.equal(state.bySource.watch.running, 2);
  assert.equal(state.groups.u.queued, 1);
  g[0].open(); await tick();
  assert.deepEqual(started, ['watch1', 'watch2', 'user1'], 'the user test took the freed slot ahead of the older Watch run');
  g[1].open(); await tick();
  assert.deepEqual(started, ['watch1', 'watch2', 'user1', 'watch3'], 'the Watch run starts when a slot frees up again');
  hold.open();
  await Promise.all([w1, w2, w3, u1]);
  assert.deepEqual(started, ['watch1', 'watch2', 'user1', 'watch3']);
});

test('same priority stays first come first served', async () => {
  const started = [];
  const g = gate();
  const jobs = ['a', 'b', 'c', 'd', 'e'].map((n) => enqueue(async () => { started.push(n); await g.p; }));
  await tick();
  g.open();
  await Promise.all(jobs);
  assert.deepEqual(started, ['a', 'b', 'c', 'd', 'e']);
});

test('cancelGroup drops waiting entries only and rejects them with QueueCancelled', async () => {
  const g = gate();
  const ran = [];
  const running = [0, 1].map((i) => enqueue(async () => { ran.push(`run${i}`); await g.p; }, { group: 'keep' }));
  const waiting = [0, 1, 2].map((i) => enqueue(async () => { ran.push(`late${i}`); }, { group: 'drop' }));
  const results = waiting.map((p) => p.then(() => 'ran', (e) => (e instanceof QueueCancelled ? 'cancelled' : 'other')));
  await tick();
  assert.equal(cancelGroup('drop'), 3);
  assert.deepEqual(await Promise.all(results), ['cancelled', 'cancelled', 'cancelled']);
  assert.equal(cancelGroup('drop'), 0);
  g.open();
  await Promise.all(running);
  assert.deepEqual(ran, ['run0', 'run1'], 'dropped entries never started');
});

test('a throwing job frees its slot', async () => {
  await assert.rejects(enqueue(async () => { throw new Error('boom'); }), /boom/);
  await tick();
  assert.equal(getQueueState().running, 0);
  assert.equal(await enqueue(async () => 42), 42);
});

test('hooks that throw do not break the queue; priorityForSource', async () => {
  const g = gate();
  const a = [0, 1].map(() => enqueue(() => g.p));
  const b = enqueue(async () => 'ok', { onQueued: () => { throw new Error('x'); }, onStart: () => { throw new Error('y'); } });
  g.open();
  await Promise.all(a);
  assert.equal(await b, 'ok');
  assert.equal(priorityForSource('watch'), PRIORITY.background);
  assert.equal(priorityForSource('web'), PRIORITY.user);
  assert.equal(priorityForSource('cli'), PRIORITY.user);
});
