import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
process.env.TINYFISH_MOCK = '1';
const { parseSSE } = await import('../src/tinyfish.js');
const { parseAgentAnswer, looksBlocked } = await import('../src/runner.js');
const { buildGoal, GOAL_SUFFIX } = await import('../src/goals.js');
const { loadDotEnv } = await import('../src/env.js');
const { isSiteFailure } = await import('../src/botwall.js');

async function collect(chunks) {
  const enc = new TextEncoder();
  const body = (async function* () { for (const c of chunks) yield enc.encode(c); })();
  const out = [];
  for await (const e of parseSSE(body)) out.push(e);
  return out;
}

test('parseSSE: events split across chunks, CRLF, and a last event without a blank line', async () => {
  const events = await collect(['data: {"type":"STA', 'RTED"}\r\n\r\ndata: {"type":"PROGRESS",', '"purpose":"x"}\n\n', 'data: {"type":"COMPLETE"}']);
  assert.deepEqual(events.map((e) => e.type), ['STARTED', 'PROGRESS', 'COMPLETE']);
});

test('parseSSE ignores comments, heartbeat noise and bad JSON', async () => {
  const events = await collect([': ping\n\n', 'data: not json\n\n', 'data: {"type":"HEARTBEAT"}\n\n']);
  assert.deepEqual(events.map((e) => e.type), ['HEARTBEAT']);
});

test('parseAgentAnswer handles objects, nested results, JSON text and Python-style text', () => {
  assert.equal(parseAgentAnswer({ success: true }).success, true);
  assert.equal(parseAgentAnswer({ result: { success: false } }).success, false);
  assert.equal(parseAgentAnswer('{"success": true, "answer": "x"}').answer, 'x');
  assert.equal(parseAgentAnswer("Here: {'success': True, 'answer': None, 'blocker': \"couldn't\"}").success, true);
  assert.equal(parseAgentAnswer('no json here'), null);
  assert.equal(parseAgentAnswer(null), null);
});

test('looksBlocked: cancelled and never-started runs are never "blocked"', () => {
  assert.equal(looksBlocked({ status: 'cancelled', runId: 'r', numSteps: 0, blocker: 'x' }), false);
  assert.equal(looksBlocked({ status: 'failed', runId: null, numSteps: 0 }), false);
  assert.equal(looksBlocked({ status: 'failed', runId: 'r', numSteps: 1, blocker: 'ok' }), true, 'under 2 steps counts as blocked');
  assert.equal(looksBlocked({ status: 'failed', runId: 'r', numSteps: 9, blocker: 'Access Denied' }), true);
  assert.equal(looksBlocked({ status: 'failed', runId: 'r', numSteps: 9, blocker: 'no returns link' }), false);
  assert.equal(looksBlocked({ status: 'passed', runId: 'r', numSteps: 0 }), false);
});

test('isSiteFailure (D26): only on the India-proxy attempt with 5+ steps', () => {
  const blocked = { status: 'blocked', runId: 'r', numSteps: 6, blocker: 'Something went wrong' };
  assert.equal(isSiteFailure(blocked, 1), true);
  assert.equal(isSiteFailure(blocked, 0), false);
  assert.equal(isSiteFailure(blocked, 2), false);
  assert.equal(isSiteFailure({ ...blocked, numSteps: 4 }, 1), false);
});

test('the answer-format suffix is unchanged (tested wording)', () => {
  assert.ok(buildGoal('find_price').endsWith(GOAL_SUFFIX));
  assert.ok(GOAL_SUFFIX.includes('Do NOT log in, sign up or pay.'));
  assert.equal(buildGoal('custom', '  hello  ').startsWith('hello '), true);
});

test('loadDotEnv: missing file is fine, real env wins, quotes and comments handled', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-env-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, '# comment\nAR_TEST_A=one\nAR_TEST_B="two words"\nAR_TEST_C=three # trailing\nexport AR_TEST_D=\'four\'\nAR_TEST_EXISTING=file\n\nbad line\n');
  process.env.AR_TEST_EXISTING = 'real';
  assert.deepEqual(loadDotEnv([path.join(dir, 'missing.env'), file]), [file]);
  assert.equal(process.env.AR_TEST_A, 'one');
  assert.equal(process.env.AR_TEST_B, 'two words');
  assert.equal(process.env.AR_TEST_C, 'three');
  assert.equal(process.env.AR_TEST_D, 'four');
  assert.equal(process.env.AR_TEST_EXISTING, 'real');
  assert.deepEqual(loadDotEnv([path.join(dir, 'nope')]), []);
});
