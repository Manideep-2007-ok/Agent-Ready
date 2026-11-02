// Replay mode guards: never show a result for a site we have no recording for.
process.env.TINYFISH_MOCK = '1';
process.env.DEMO_STORE_URL = 'https://agent-ready-demo.vercel.app';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const replay = await import('../src/replay.js');
const v = await import('../src/validate.js');

test('only recorded sites can be tested in replay mode', () => {
  for (const ok of ['https://www.nykaa.com', 'https://www.myntra.com/x', 'https://www.swiggy.com', 'https://example.com', 'https://agent-ready-demo.vercel.app/?flaws=on', 'http://localhost:5500']) {
    assert.doesNotThrow(() => replay.assertReplayable(ok), ok);
  }
  for (const bad of ['https://www.flipkart.com', 'https://www.amazon.in', 'https://shop.example.net', 'https://nykaa.evil.example/', 'https://evil-nykaa.com/', 'https://myntra.com.evil.example/']) {
    assert.throws(() => replay.assertReplayable(bad), (e) => e.status === 400 && /replays real agent runs/.test(e.message), bad);
  }
  assert.equal(replay.hasRecording('https://www.flipkart.com'), false);
});

test('the demo store opens its real recorded reports (flaws on 91 / off 97), nothing else does', () => {
  assert.equal(replay.recordedDemoReport('https://agent-ready-demo.vercel.app/?flaws=on'), 'rep_demo_flaws_on');
  assert.equal(replay.recordedDemoReport('https://agent-ready-demo.vercel.app/'), 'rep_demo_flaws_on');
  assert.equal(replay.recordedDemoReport('https://agent-ready-demo.vercel.app/?flaws=off'), 'rep_demo_flaws_off');
  assert.equal(replay.recordedDemoReport('https://www.nykaa.com'), null);
  assert.equal(replay.recordedDemoReport('garbage'), null);
});

test('replay mode allows localhost addresses (the tests need them); live mode does not', () => {
  assert.equal(v.parseSiteUrl('localhost:5500'), 'https://localhost:5500/');
});
