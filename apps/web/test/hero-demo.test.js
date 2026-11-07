// The landing hero plays a recorded run as a pure function of time (heroFrame), so it is deterministic, testable and
// can jump straight to its last frame when the visitor prefers reduced motion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, TIMING, heroFrame, finalFrame } from '../src/pages/site/heroDemo.js';

test('both scenarios are our real demo-store runs: steps add up to the report, score and cost match', () => {
  const [on, off] = SCENARIOS;
  assert.equal(on.rows.reduce((a, r) => a + r.steps, 0), 35);
  assert.equal(off.rows.reduce((a, r) => a + r.steps, 0), 19);
  assert.deepEqual([on.score, on.cost, off.score, off.cost], [91, 49, 97, 27]);
});

test('at the start nothing has run: address empty, every task waiting, no score', () => {
  const f = heroFrame(0, 0);
  assert.equal(f.typed, 0);
  assert.ok(f.rows.every((r) => r.state === 'waiting' && r.steps === 0));
  assert.equal(f.score, null);
});

test('never more than two agents run at once (the account limit, D9)', () => {
  for (let t = 0; t <= TIMING.end; t += 50) {
    for (const idx of [0, 1]) assert.ok(heroFrame(idx, t).rows.filter((r) => r.state === 'running').length <= 2, `t=${t}`);
  }
});

test('step counts only go up and stop at the recorded value', () => {
  for (const idx of [0, 1]) {
    let prev = heroFrame(idx, 0).rows.map((r) => r.steps);
    for (let t = 50; t <= TIMING.end; t += 50) {
      const now = heroFrame(idx, t).rows.map((r) => r.steps);
      now.forEach((s, i) => { assert.ok(s >= prev[i], `t=${t} row ${i}`); assert.ok(s <= SCENARIOS[idx].rows[i].steps); });
      prev = now;
    }
  }
});

test('the score counts up after every task passed and lands on the recorded score', () => {
  const idx = 0;
  const done = heroFrame(idx, TIMING.scoreAt - 1);
  assert.ok(done.rows.every((r) => r.state === 'passed'), 'all passed before the score shows');
  assert.equal(done.score, null);
  const mid = heroFrame(idx, TIMING.scoreAt + TIMING.scoreDur / 2).score;
  assert.ok(mid > 0 && mid < 91, `counting (${mid})`);
  assert.equal(heroFrame(idx, TIMING.scoreAt + TIMING.scoreDur).score, 91);
});

test('the final frame (reduced motion) is the finished run', () => {
  assert.deepEqual(finalFrame(1), heroFrame(1, TIMING.end - 1));
  assert.equal(finalFrame(1).score, 97);
  assert.equal(finalFrame(1).typed, SCENARIOS[1].url.length);
});
