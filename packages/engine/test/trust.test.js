// Results you can trust (Phase 2): repeat runs with a majority (D41), claim checks against page text (D42), the new
// answer-based findings, the cost estimate and the per-test cost limit (D43), and the Instant Scan v2 robots reading.
// Live runs go to the in-process fake (fake-tinyfish.js): a dummy key, and every other host is refused.
process.env.TINYFISH_MOCK = '0';
process.env.TINYFISH_API_KEY = 'test-key-not-real';
process.env.TINYFISH_MAX_PARALLEL = '2';
process.env.TINYFISH_POLL_INTERVAL_MS = '20';
process.env.BUDGET_PER_TEST_RUPEES = '0';
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeTinyFish } from './fake-tinyfish.js';

const { runSiteTest } = await import('../src/runner.js');
const { decideMajority, canConfirm } = await import('../src/confirm.js');
const { planClaimCheck, claimFacts, extractUrls, checkClaims } = await import('../src/claims.js');
const { scoreTask, scoreReport, estimateCost, countAddToCartPresses, taskSteps, RUPEES_PER_STEP } = await import('../src/scoring.js');
const { aiAgentsBlockedByRobots, instantScanFindings } = await import('../src/instantScan.js');
const { FINDING_TYPES } = await import('../src/types.js');
const { FIX_TEMPLATES } = await import('../src/fixes.js');

const URL_ = 'https://shop.example.test';
const ok = (answer = 'Lipstick ₹467') => ({ success: true, answer, blocker: null, stuck_url: null });
const nope = { success: false, answer: null, blocker: 'Could not find the return policy', stuck_url: null };
const finished = (result, steps = 3) => ({
  events: [{ type: 'STARTED' }, ...Array.from({ length: steps }, (_, i) => ({ type: 'PROGRESS', purpose: `Step ${i + 1}` })), { type: 'COMPLETE', status: 'COMPLETED', result }],
});
const task = (over = {}) => ({ taskId: 'find_price', status: 'passed', runId: 'r1', mode: 'lite', proxy: 'off', numSteps: 4, seconds: 40,
  steps: [{ id: 's0', label: 'Open the home page', seconds: 2, screenshotUrl: '/api/shot/r1/s0', usedWebSearch: false }], answer: 'Lipstick ₹467',
  blocker: null, findings: [], points: 0, attempts: [{ mode: 'lite', proxy: 'off', runId: 'r1', passed: true, numSteps: 4 }], verdict: 'none', ...over });

let fake;
afterEach(() => { fake?.restore(); fake = null; });

// ---- repeat runs (D41) ----
test('majority: two passes out of three pass; the shown run agrees with the majority and keeps the wall evidence', () => {
  const first = task({ status: 'failed', runId: 'a', attempts: [{ mode: 'lite', proxy: 'off', runId: 'a', passed: false, numSteps: 2 }], verdict: 'none' });
  const r2 = task({ runId: 'b', numSteps: 5, attempts: undefined });
  const r3 = task({ runId: 'c', numSteps: 7, attempts: undefined });
  const d = decideMajority(first, [r2, r3]);
  assert.equal(d.status, 'passed');
  assert.equal(d.runId, 'b', 'first repeat that agrees with the majority');
  assert.equal(d.flaky, true);
  assert.deepEqual(d.runs.map((r) => r.passed), [false, true, true]);
  assert.equal(d.attempts[0].runId, 'a', 'the cascade evidence stays');
  const agree = decideMajority(task(), [task({ runId: 'b' })]);
  assert.equal(agree.flaky, false);
  assert.equal(agree.runId, 'r1');
});

test('nothing worth confirming: stopped, never started, replay placeholder, or a bot wall on every attempt', () => {
  assert.equal(canConfirm(task()), true);
  assert.equal(canConfirm(task({ status: 'failed' })), true);
  for (const over of [{ status: 'cancelled' }, { runId: null }, { replayNote: 'x' }, { status: 'blocked' }]) assert.equal(canConfirm(task(over)), false);
});

test('confirm: runs agree after two runs, no third run; the repeat uses the same mode and proxy', async () => {
  fake = installFakeTinyFish({ runSse: () => finished(ok()) });
  const r = await runSiteTest({ url: URL_, id: 'rep_conf_agree', tasks: ['find_price'], confirm: true });
  assert.equal(fake.calls.sse.length, 2);
  const t = r.tasks[0];
  assert.equal(t.status, 'passed');
  assert.equal(t.flaky, false);
  assert.equal(t.runs.length, 2);
  assert.equal(r.confirm, true);
  assert.deepEqual(fake.calls.sse.map((c) => [c.body.browser_profile, c.body.proxy_config?.enabled]), [['lite', false], ['lite', false]]);
  assert.equal(r.costRupees, Math.round(6 * RUPEES_PER_STEP * 100) / 100, 'both runs are paid for');
});

test('confirm: a disagreement starts a tiebreak; the majority decides and the task is flagged flaky', async () => {
  fake = installFakeTinyFish({ runSse: ({ index }) => finished(index === 1 ? nope : ok(), 3) });
  const events = [];
  const r = await runSiteTest({ url: URL_, id: 'rep_conf_flaky', tasks: ['find_price'], confirm: true }, (e) => events.push(e));
  assert.equal(fake.calls.sse.length, 3);
  const t = r.tasks[0];
  assert.equal(t.status, 'passed');
  assert.equal(t.flaky, true);
  assert.ok(t.findings.some((f) => f.type === 'inconsistent-results' && f.pointsIfFixed === 0 && /passed 2 of 3/.test(f.text)));
  assert.ok(events.some((e) => e.kind === 'task-update' && e.task.confirming?.run === 3), 'the lane is told a tiebreak is running');
});

test('without confirm a test runs each task once (the default)', async () => {
  fake = installFakeTinyFish({ runSse: () => finished(ok()) });
  const r = await runSiteTest({ url: URL_, id: 'rep_conf_off', tasks: ['find_price'] });
  assert.equal(fake.calls.sse.length, 1);
  assert.equal(r.tasks[0].runs, undefined);
  assert.equal(r.confirm, undefined);
});

test('cost counts every repeat run, plus every bot-wall attempt', () => {
  const t = task({ attempts: [{ numSteps: 2 }, { numSteps: 6 }], runs: [{ numSteps: 6 }, { numSteps: 5 }, { numSteps: 4, stopped: true }] });
  assert.equal(taskSteps(t), 2 + 6 + 5 + 4);
});

// ---- cost limit (D43) ----
test('a test stops at its cost limit: the report says so and keeps the cost of the steps taken', async () => {
  fake = installFakeTinyFish({ runSse: () => ({ ...finished(ok(), 12), end: 'hang' }) });
  const budgetRupees = 5 * RUPEES_PER_STEP; // 5 steps
  const r = await runSiteTest({ url: URL_, id: 'rep_budget', tasks: ['find_price', 'find_returns'], budgetRupees });
  assert.equal(r.status, 'cancelled');
  assert.equal(r.stopReason, 'budget');
  assert.equal(r.score, 0);
  assert.ok(r.tasks.every((t) => t.status === 'cancelled'));
  assert.ok(r.tasks.some((t) => /cost limit/.test(t.blocker || '')));
  assert.ok(fake.calls.cancel.length >= 1, 'the runs are cancelled on TinyFish');
});

test('estimate: confirming doubles the typical range; the worst case covers the bot-wall cascade', () => {
  const one = estimateCost({ tasks: 4 });
  const two = estimateCost({ tasks: 4, confirm: true });
  assert.ok(one.lowRupees > 0 && one.highRupees > one.lowRupees);
  assert.ok(Math.abs(two.lowRupees - 2 * one.lowRupees) <= 1);
  assert.ok(one.worstRupees >= one.highRupees * 3 - 1);
  assert.equal(estimateCost({ tasks: 0 }).highRupees, 0);
});

// ---- claim checks (D42) ----
test('claim facts: return days, prices as digits, emails and phone numbers', () => {
  const days = claimFacts('find_returns', 'You have 30 days to return items: https://shop.example.test/returns');
  assert.equal(days[0].label, '30 days');
  assert.equal(days[0].test('Returns are accepted within 30 days of delivery.'), true);
  assert.equal(days[0].test('Returns are accepted within 15 days.'), false);
  const price = claimFacts('find_price', 'Masala Chai, ₹1,299');
  assert.equal(price[0].test('Price: Rs. 1299'), true);
  assert.equal(price[0].test('Price: Rs. 1399'), false);
  const contact = claimFacts('find_contact', 'Email care@shop.example.test or call +91 98765 43210');
  assert.equal(contact.length, 2);
  assert.equal(contact[1].test('Phone: 098765-43210'), true);
  assert.deepEqual(extractUrls('see https://a.test/x, and http://b.test/y.'), ['https://a.test/x', 'http://b.test/y']);
});

test('claim plan: only passed tasks, only pages on this site; another site is "off-site"', () => {
  assert.equal(planClaimCheck(task({ status: 'failed' }), URL_), null);
  assert.equal(planClaimCheck(task({ answer: 'Lipstick ₹467' }), URL_), null, 'no page named: nothing to check');
  const p = planClaimCheck(task({ taskId: 'find_returns', answer: '15 days, https://www.shop.example.test/help/returns' }), URL_);
  assert.equal(p.offSite, false);
  assert.equal(p.url, 'https://www.shop.example.test/help/returns');
  assert.equal(planClaimCheck(task({ taskId: 'find_returns', answer: '15 days, https://other.test/policy' }), URL_).offSite, true);
});

test('claim check: confirmed, not on the page, off-site, and an unreadable page stays unchecked', async () => {
  fake = installFakeTinyFish({ pages: {
    'https://shop.example.test/returns': 'Returns: within 10 days of delivery.',
    'https://shop.example.test/p/1': 'Masala Chai Blend ₹299',
  } });
  const tasks = [
    task({ taskId: 'find_returns', answer: '10 days, policy at https://shop.example.test/returns' }),
    task({ taskId: 'find_price', answer: 'Masala Chai ₹349 at https://shop.example.test/p/1' }),
    task({ taskId: 'find_contact', answer: 'Email care@x.test, found at https://elsewhere.test/contact' }),
    task({ taskId: 'add_to_cart', answer: 'Cart total ₹299 at https://shop.example.test/cart' }),
  ];
  await checkClaims(tasks, URL_);
  assert.equal(tasks[0].claim.status, 'confirmed');
  assert.equal(tasks[1].claim.status, 'not-found');
  assert.deepEqual(tasks[1].claim.facts, [{ label: 'price 349', found: false }]);
  assert.equal(tasks[2].claim.status, 'off-site');
  assert.equal(tasks[3].claim, undefined, 'a 404 page proves nothing either way');
  const f = scoreTask(tasks[1]).findings.find((x) => x.type === 'unconfirmed-claim');
  assert.ok(f && f.pointsIfFixed === 0 && f.severity === 'low');
  assert.equal(scoreTask(tasks[1]).points, scoreTask({ ...tasks[1], claim: undefined }).points, 'a claim check never changes points');
});

// ---- new answer-based findings ----
test('no Add to cart feedback: two presses in the agent\'s own steps; checking the cart does not count', () => {
  const steps = (labels) => labels.map((label, i) => ({ id: `s${i}`, label, seconds: 1, screenshotUrl: '', usedWebSearch: false }));
  assert.equal(countAddToCartPresses(steps(["Click 'Add to cart'", 'Click Add to Cart again', 'Verify the item was added to cart'])), 2);
  assert.equal(countAddToCartPresses(steps(['Add Masala Chai Blend to cart', 'Open the cart page'])), 1);
  const t = task({ taskId: 'add_to_cart', answer: 'Total ₹299', steps: steps(['Click Add to cart', 'Click Add to cart again']) });
  assert.ok(scoreTask(t).findings.some((f) => f.type === 'no-cart-feedback'));
});

test('price read from a picture: the agent says so, so the price is probably not text', () => {
  const t = task({ taskId: 'add_to_cart', answer: 'Total ₹299', steps: [{ id: 's0', label: 'Read cart total price from image', seconds: 1, screenshotUrl: '', usedWebSearch: false }] });
  assert.ok(scoreTask(t).findings.some((f) => f.type === 'price-in-image' && f.pointsIfFixed === 0));
  assert.ok(!scoreTask(task()).findings.some((f) => f.type === 'price-in-image'));
});

test('every new finding type is in the contract and has a fix template', () => {
  for (const t of ['no-cart-feedback', 'inconsistent-results', 'unconfirmed-claim', 'robots-blocks-ai-agents', 'no-cart-link']) {
    assert.ok(FINDING_TYPES.includes(t), t);
    assert.ok(FIX_TEMPLATES[t]?.fix, t);
  }
});

// ---- Instant Scan v2 ----
test('robots.txt: AI agents kept out of the whole site, by name or through *; a named Allow wins', () => {
  assert.deepEqual(aiAgentsBlockedByRobots('User-agent: *\nDisallow: /cart\n\nUser-agent: GPTBot\nUser-agent: ChatGPT-User\nDisallow: /'), ['ChatGPT-User', 'GPTBot']);
  const all = aiAgentsBlockedByRobots('User-agent: *\nDisallow: /\n\nUser-agent: ChatGPT-User\nAllow: /');
  assert.ok(!all.includes('ChatGPT-User') && all.includes('GPTBot'));
  assert.deepEqual(aiAgentsBlockedByRobots('User-agent: *\nAllow: /\n# Disallow: /'), []);
  assert.deepEqual(aiAgentsBlockedByRobots(''), []);
});

test('scan findings: robots block (high when an assistant visiting for a person is blocked) and no cart link (shops only)', () => {
  const scan = { totalButtonsAndLinks: 10, totalImages: 2, priceAsText: true, productSchema: true, overlayCoveringPage: false, unlabelledButtons: 0,
    aiBlockedAgents: ['ChatGPT-User', 'GPTBot'], cartLink: false };
  const shop = instantScanFindings(scan, 'shop');
  assert.equal(shop.find((f) => f.type === 'robots-blocks-ai-agents').severity, 'high');
  assert.ok(shop.some((f) => f.type === 'no-cart-link'));
  assert.ok(!instantScanFindings(scan, 'saas').some((f) => f.type === 'no-cart-link'));
  assert.equal(instantScanFindings({ ...scan, aiBlockedAgents: ['GPTBot'] }, 'saas').find((f) => f.type === 'robots-blocks-ai-agents').severity, 'medium');
  assert.ok(!instantScanFindings({ ...scan, cartLink: undefined }, 'shop').some((f) => f.type === 'no-cart-link'), 'older scans have no cart reading');
  // The robots finding needs only Fetch, so it shows even when the browser part could not run.
  assert.ok(instantScanFindings({ aiBlockedAgents: ['GPTBot'] }, 'shop').some((f) => f.type === 'robots-blocks-ai-agents'));
});

test('scoreReport with confirm keeps the score from the majority runs', () => {
  const report = { tasks: [task({ flaky: true, runs: [{ passed: true, numSteps: 4 }, { passed: false, numSteps: 3 }, { passed: true, numSteps: 4 }] })], instantScan: null };
  const s = scoreReport(report);
  assert.equal(s.score, 100);
  assert.ok(report.tasks[0].findings.some((f) => f.type === 'inconsistent-results'));
});
