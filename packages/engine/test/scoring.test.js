import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreTask, scoreReport, rankFixes, siteVerdict, detectQuantity, detectCurrencyMismatch, USD_INR } from '../src/scoring.js';

const task = (over = {}) => ({ taskId: 'find_price', status: 'passed', numSteps: 4, seconds: 40, steps: [], findings: [], points: 0, ...over });
const steps = (...labels) => labels.map((label, i) => ({ id: `s${i}`, label, seconds: 1, screenshotUrl: `/api/shot/r/s${i}`, usedWebSearch: false }));

test('a quick, clean pass scores 25', () => {
  const { points, findings } = scoreTask(task());
  assert.equal(points, 25);
  assert.deepEqual(findings, []);
});

test('step and time bands', () => {
  assert.equal(scoreTask(task({ numSteps: 8, seconds: 100 })).points, 15 + 3 + 2);
  assert.equal(scoreTask(task({ numSteps: 12, seconds: 200 })).points, 15);
});

test('a failed task scores 0 and names a site cause', () => {
  const { points, findings } = scoreTask(task({ taskId: 'add_to_cart', status: 'failed', blocker: 'No cart total found', steps: steps('a', 'b') }));
  assert.equal(points, 0);
  assert.equal(findings[0].type, 'cart-not-found');
  assert.equal(findings[0].severity, 'high');
  assert.ok(findings[0].pointsIfFixed > 0);
  assert.ok(!/confus/i.test(findings[0].text + findings[0].likelyCause), 'never blame the agent (D22)');
});

test('web search costs 5 points and creates a finding', () => {
  const t = task({ steps: [{ id: 's', label: 'search', usedWebSearch: true, screenshotUrl: '' }] });
  const r = scoreTask(t);
  assert.equal(r.points, 20);
  assert.ok(r.findings.some((f) => f.type === 'needed-web-search'));
});

test('passing only through a proxy is capped at 5 and reports the bot wall', () => {
  const r = scoreTask(task({ verdict: 'blocks-cloud-agents', attempts: [{ blocker: 'Access Denied', screenshotUrl: '/x' }] }));
  assert.equal(r.points, 5);
  assert.equal(r.findings[0].type, 'blocks-cloud-agents');
  assert.equal(r.findings[0].severity, 'critical');
  assert.equal(r.findings[0].screenshotUrl, '/x', 'evidence is the blocked attempt');
});

test('too many steps and slow findings only for passed tasks', () => {
  const types = scoreTask(task({ numSteps: 13, seconds: 200 })).findings.map((f) => f.type);
  assert.deepEqual(types.sort(), ['slow', 'too-many-steps']);
  assert.deepEqual(scoreTask(task({ status: 'failed', taskId: 'find_contact', numSteps: 13, seconds: 200 })).findings.map((f) => f.type), ['contact-not-found']);
});

test('a cancelled task gets no points and no findings (a stopped test proves nothing)', () => {
  assert.deepEqual(scoreTask(task({ status: 'cancelled', taskId: 'add_to_cart', numSteps: 1 })), { points: 0, findings: [] });
});

test('detectQuantity is conservative', () => {
  assert.equal(detectQuantity('Cart total ₹998 for 2 units'), 2);
  assert.equal(detectQuantity('quantity: 3, total 1497'), 3);
  assert.equal(detectQuantity('Increase quantity to 2'), 2);
  assert.equal(detectQuantity('qty 1, total ₹499'), null);
  assert.equal(detectQuantity('Maybelline 2 in 1 lipstick, total ₹467'), null);
  assert.equal(detectQuantity('1 item in cart, total ₹499'), null);
  assert.equal(detectQuantity(''), null);
  assert.equal(detectQuantity(null), null);
});

test('wrong-quantity: finding only, the task still passes with full points', () => {
  const t = task({ taskId: 'add_to_cart', answer: 'Cart total ₹998 (quantity: 2)', steps: steps('Add to cart', 'Open cart') });
  const r = scoreTask(t);
  assert.equal(r.points, 25, 'a guess never fails a task');
  const f = r.findings.find((x) => x.type === 'wrong-quantity');
  assert.ok(f);
  assert.equal(f.severity, 'medium');
  assert.equal(f.pointsIfFixed, 0);
  assert.ok(/Likely|may/i.test(f.text + f.likelyCause));
});

test('wrong-quantity is not raised for other tasks or a quantity of 1', () => {
  assert.ok(!scoreTask(task({ taskId: 'find_price', answer: 'Lipstick 2 units pack ₹400' })).findings.some((f) => f.type === 'wrong-quantity'));
  assert.ok(!scoreTask(task({ taskId: 'add_to_cart', answer: 'quantity: 1 total ₹499' })).findings.some((f) => f.type === 'wrong-quantity'));
});

test('currency mismatch: dollar answer while the site shows rupees', () => {
  assert.equal(detectCurrencyMismatch('Price: $499', true), true);
  assert.equal(detectCurrencyMismatch('Price: $499', false), false, 'no evidence the site uses rupees: no finding');
  assert.equal(detectCurrencyMismatch('₹499 ($6)', true), false);
  assert.equal(detectCurrencyMismatch('Rs. 499', true), false);
  const r = scoreTask(task({ answer: 'Product X costs $499' }), { siteShowsRupees: true });
  assert.equal(r.points, 25);
  const f = r.findings.find((x) => x.type === 'currency-mismatch');
  assert.ok(f);
  assert.equal(f.severity, 'low');
  // the agent's own step labels can be the evidence
  const r2 = scoreTask(task({ answer: '$499', steps: steps('Read the price ₹499 on the page') }));
  assert.ok(r2.findings.some((x) => x.type === 'currency-mismatch'));
  assert.ok(!scoreTask(task({ answer: '$499' })).findings.some((x) => x.type === 'currency-mismatch'));
});

test('rankFixes: severity, then points, one per type, max 3', () => {
  const f = (type, severity, pointsIfFixed) => ({ type, severity, pointsIfFixed });
  const top = rankFixes([f('slow', 'low', 9), f('cart-not-found', 'high', 20), f('cart-not-found', 'high', 25), f('blocks-cloud-agents', 'critical', 5),
    f('returns-not-found', 'medium', 10), f('popup-blocking', 'high', 0)]);
  assert.deepEqual(top.map((x) => x.type), ['blocks-cloud-agents', 'cart-not-found', 'popup-blocking']);
  assert.equal(top[1].pointsIfFixed, 25, 'the better of two same-type findings');
  assert.deepEqual(rankFixes(null), []);
});

test('scoreReport: scales to 100, excludes custom task, cost counts every attempt', () => {
  const report = { tasks: [
    task({ taskId: 'find_price' }),
    task({ taskId: 'add_to_cart' }),
    task({ taskId: 'custom', status: 'failed' }),
  ] };
  const r = scoreReport(report);
  assert.equal(r.score, 100, '2 scored tasks of 25 each scale to 100');
  assert.equal(r.costRupees, Math.round(12 * 0.016 * USD_INR * 100) / 100, 'cost includes the custom task steps');
  const multi = scoreReport({ tasks: [task({ attempts: [{ numSteps: 10 }, { numSteps: 5 }], verdict: 'blocks-cloud-agents' })] });
  assert.equal(multi.costRupees, Math.round(15 * 0.016 * USD_INR * 100) / 100);
  assert.equal(multi.botWall, 'blocks-cloud-agents');
});

test('scoreReport uses the Instant Scan to check currency', () => {
  const report = { instantScan: { priceAsText: true }, tasks: [task({ answer: '$10' })] };
  scoreReport(report);
  assert.ok(report.tasks[0].findings.some((f) => f.type === 'currency-mismatch'));
});

test('siteVerdict takes the worst task', () => {
  assert.equal(siteVerdict([{ verdict: 'none' }, { verdict: 'blocks-automation' }, { verdict: 'blocks-cloud-agents' }]), 'blocks-automation');
  assert.equal(siteVerdict([]), 'none');
});
