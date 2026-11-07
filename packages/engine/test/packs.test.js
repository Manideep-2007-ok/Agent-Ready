// Task packs (D40): goals, labels, orders, pack detection, scoring findings for every new task, scaling, replay honesty.
process.env.TINYFISH_MOCK = '1';
process.env.TINYFISH_MOCK_SPEED = '400';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GOAL_SUFFIX, TASK_GOALS, TASK_LABELS, PACKS, PACK_IDS, DEFAULT_TASK_ORDER, buildGoal, normalisePack, packOfTask, packForTasks,
  defaultTasksFor, packSiteLabel, SHOP_TASKS,
} from '../src/goals.js';
import { detectPack, autoPack, packScores, keywordHitsFromText, schemaTypesFromJsonLd } from '../src/packs.js';
import { scoreTask, scoreReport } from '../src/scoring.js';
import { FIX_TEMPLATES } from '../src/fixes.js';
import { instantScanFindings } from '../src/instantScan.js';
import { TASK_IDS, FINDING_TYPES } from '../src/types.js';
import { runSiteTest, REPLAY_PACK_NOTE } from '../src/index.js';

const NEW_TASKS = PACK_IDS.filter((p) => p !== 'shop').flatMap((p) => PACKS[p].tasks);
const taskOf = (taskId, over = {}) => ({ taskId, status: 'failed', numSteps: 6, seconds: 60, steps: [{ id: 's0', label: 'looked', seconds: 1, screenshotUrl: '/api/shot/r/s0', usedWebSearch: false }], findings: [], points: 0, blocker: 'Nothing like that on the pages visited', ...over });

// ---- goals ----
test('four packs, four tasks each, every task id unique and known to the contract', () => {
  assert.deepEqual(PACK_IDS, ['shop', 'saas', 'content', 'local']);
  const all = PACK_IDS.flatMap((p) => PACKS[p].tasks);
  assert.equal(all.length, 16);
  assert.equal(new Set(all).size, 16);
  for (const p of PACK_IDS) assert.equal(PACKS[p].tasks.length, 4);
  for (const id of all) { assert.ok(TASK_IDS.includes(id), id); assert.ok(TASK_LABELS[id], `label for ${id}`); assert.ok(TASK_GOALS[id], `goal for ${id}`); }
  assert.deepEqual(TASK_IDS.filter((t) => !all.includes(t)), ['custom']);
});

test('shop stays exactly as it was: same ids, same order, same wording', () => {
  assert.deepEqual(DEFAULT_TASK_ORDER, ['find_returns', 'add_to_cart', 'find_price', 'find_contact']);
  assert.deepEqual(SHOP_TASKS, DEFAULT_TASK_ORDER);
  assert.equal(TASK_GOALS.find_price, 'Find any product on this site and report its exact name and price.');
  assert.equal(TASK_LABELS.add_to_cart, 'Add to cart and read the total');
});

test('every goal ends with the unchanged GOAL_SUFFIX; form tasks say do NOT submit', () => {
  assert.match(GOAL_SUFFIX, /^Do NOT log in, sign up or pay\./);
  for (const id of TASK_IDS.filter((t) => t !== 'custom')) {
    const goal = buildGoal(id);
    assert.ok(goal.endsWith(GOAL_SUFFIX), id);
    assert.ok(goal.startsWith(TASK_GOALS[id]), id);
  }
  for (const id of ['reach_signup', 'contact_sales', 'find_newsletter', 'reach_booking']) assert.match(TASK_GOALS[id], /do NOT/i, id);
  assert.match(buildGoal('custom', '  find the fee '), /^find the fee Do NOT log in/);
});

test('pack helpers: normalisePack, packOfTask, packForTasks, defaultTasksFor, labels', () => {
  assert.equal(normalisePack('shopping'), 'shop');
  assert.equal(normalisePack('saas'), 'saas');
  assert.equal(normalisePack('auto'), null);
  assert.equal(normalisePack(undefined), null);
  assert.equal(packOfTask('reach_booking'), 'local');
  assert.equal(packOfTask('custom'), null);
  assert.equal(packForTasks(['custom', 'find_docs', 'find_price']), 'saas', 'a mixed list is labelled by its first pack task');
  assert.equal(packForTasks([]), 'shop');
  assert.deepEqual(defaultTasksFor('content'), PACKS.content.tasks);
  defaultTasksFor('content').pop(); // a copy
  assert.equal(PACKS.content.tasks.length, 4);
  assert.equal(packSiteLabel('saas'), 'SaaS site');
  assert.equal(packSiteLabel('shopping'), 'Online store');
});

// ---- detectPack ----
const scan = (over = {}) => ({ pageTextChars: 900, unlabelledButtons: 0, totalButtonsAndLinks: 20, imagesWithoutAlt: 0, totalImages: 3, priceAsText: false,
  overlayCoveringPage: false, productSchema: false, robotsTxt: 'found', sitemap: 'found', framework: 'unknown', seconds: 5, schemaTypes: [], keywordHits: {}, ...over });

test('detectPack: product schema or Add to cart means shop', () => {
  assert.equal(detectPack(scan({ productSchema: true })), 'shop');
  assert.equal(detectPack(scan({ keywordHits: { cart: 4 }, priceAsText: true })), 'shop');
  assert.equal(detectPack(scan({ schemaTypes: ['Product', 'Offer'] })), 'shop');
});

test('detectPack: pricing, sign-up and free trial words mean saas', () => {
  assert.equal(detectPack(scan({ keywordHits: { pricing: 5, signup: 4, docs: 3 } })), 'saas');
  assert.equal(detectPack(scan({ schemaTypes: ['SoftwareApplication'] })), 'saas');
  // a SaaS pricing page shows prices as text, which must not tip it to shop
  assert.equal(detectPack(scan({ priceAsText: true, keywordHits: { pricing: 6, signup: 3 } })), 'saas');
});

test('detectPack: article schema, blog and newsletter words mean content', () => {
  assert.equal(detectPack(scan({ schemaTypes: ['BlogPosting', 'WebSite'] })), 'content');
  assert.equal(detectPack(scan({ keywordHits: { article: 8, newsletter: 2 } })), 'content');
});

test('detectPack: opening hours, LocalBusiness schema, reserve or appointment words mean local', () => {
  assert.equal(detectPack(scan({ schemaTypes: ['Restaurant'] })), 'local');
  assert.equal(detectPack(scan({ keywordHits: { hours: 2, booking: 3, menu: 4 } })), 'local');
  assert.equal(detectPack(scan({ schemaTypes: ['Dentist'], keywordHits: { booking: 1 } })), 'local');
});

test('detectPack: no signals and ties go to content; shop never wins without product signals', () => {
  assert.equal(detectPack(scan()), 'content');
  assert.equal(detectPack(null), 'content');
  assert.equal(detectPack(undefined), 'content');
  assert.equal(detectPack(scan({ keywordHits: { pricing: 1, article: 1 } })), 'content', 'saas 2 vs content 2 -> content');
  assert.equal(detectPack(scan({ keywordHits: { pricing: 1, hours: 1 } })), 'saas', 'saas 2 vs local 2 -> saas before local');
  assert.equal(packScores(scan({ keywordHits: { pricing: 9, signup: 9 } })).shop, 0);
});

test('detectPack: extra page text counts, and the higher count per word wins over the scan', () => {
  assert.equal(detectPack(scan(), 'Free trial. Start free. Pricing plans per month. Sign up today'), 'saas');
  assert.equal(detectPack(scan({ keywordHits: { cart: 5 } }), 'Pricing'), 'shop');
});

test('keywordHitsFromText and schemaTypesFromJsonLd read plain text and JSON-LD', () => {
  const hits = keywordHitsFromText('Add to cart. ADD TO BAG. Our menu. Opening hours: Mon - Fri. Reserve a table. Newsletter.');
  assert.equal(hits.cart, 2);
  assert.ok(hits.menu >= 1 && hits.hours >= 1 && hits.booking >= 1 && hits.newsletter >= 1);
  assert.equal(keywordHitsFromText('x'.repeat(10) + ' pricing '.repeat(100)).pricing, 20, 'capped');
  assert.deepEqual(schemaTypesFromJsonLd('{"@context":"https://schema.org","@graph":[{"@type":"Restaurant"},{"@type":["Organization","https://schema.org/LocalBusiness"]}]}').sort(), ['LocalBusiness', 'Organization', 'Restaurant']);
  assert.deepEqual(schemaTypesFromJsonLd(''), []);
});

test('autoPack: a scan that could not read the page falls back to shop and says it did not detect', () => {
  assert.deepEqual(autoPack(null), { pack: 'shop', detected: false });
  assert.deepEqual(autoPack(scan({ pageTextChars: 0, totalButtonsAndLinks: 0, totalImages: 0 })), { pack: 'shop', detected: false });
  assert.deepEqual(autoPack(scan({ keywordHits: { pricing: 4, signup: 4 } })), { pack: 'saas', detected: true });
});

// ---- scoring: a finding for every new task ----
const EXPECTED = {
  find_pricing_plans: ['pricing-not-found', 'high'], reach_signup: ['signup-not-found', 'high'], find_docs: ['docs-not-found', 'medium'],
  contact_sales: ['sales-contact-not-found', 'medium'], search_topic: ['search-not-found', 'medium'], read_article: ['article-not-readable', 'high'],
  find_newsletter: ['newsletter-not-found', 'low'], find_author_contact: ['author-contact-not-found', 'low'], find_hours: ['hours-not-found', 'high'],
  find_location: ['location-not-found', 'high'], find_menu_or_services: ['menu-not-found', 'medium'], reach_booking: ['booking-not-found', 'high'],
};

test('every new task: a failure gives its own finding, a site cause, a fix, a standard and a pass check', () => {
  assert.deepEqual(Object.keys(EXPECTED).sort(), [...NEW_TASKS].sort());
  for (const [id, [type, severity]] of Object.entries(EXPECTED)) {
    const { points, findings } = scoreTask(taskOf(id));
    assert.equal(points, 0, id);
    assert.equal(findings.length, 1, id);
    const f = findings[0];
    assert.equal(f.type, type, id);
    assert.equal(f.severity, severity, id);
    assert.equal(f.taskId, id);
    assert.ok(f.pointsIfFixed > 0, `${id} would gain points if fixed`);
    for (const key of ['text', 'likelyCause', 'fix', 'standard', 'passCheck']) assert.ok(f[key], `${id}.${key}`);
    assert.ok(!/confus|lost|struggl/i.test(f.text + f.likelyCause), `${id}: never blame the agent (D22)`);
    assert.ok(FINDING_TYPES.includes(type));
    for (const key of ['likelyCause', 'fix', 'standard', 'passCheck']) assert.ok(FIX_TEMPLATES[type][key], `template ${type}.${key}`);
  }
});

test('a passed new task scores like any other: clean pass 25, bands, web search -5', () => {
  assert.equal(scoreTask(taskOf('find_hours', { status: 'passed', numSteps: 3, seconds: 30 })).points, 25);
  assert.equal(scoreTask(taskOf('reach_booking', { status: 'passed', numSteps: 8, seconds: 100 })).points, 15 + 3 + 2);
  const ws = scoreTask(taskOf('find_docs', { status: 'passed', numSteps: 3, seconds: 30, steps: [{ id: 's', label: 'search', usedWebSearch: true, screenshotUrl: '' }] }));
  assert.equal(ws.points, 20);
  assert.ok(ws.findings.some((f) => f.type === 'needed-web-search'));
});

test('answer checks stay shop-only: a SaaS answer with $ and a quantity gives neither finding', () => {
  const saas = scoreTask(taskOf('find_pricing_plans', { status: 'passed', numSteps: 3, seconds: 30, answer: 'Pro $49 per month, quantity: 2 seats' }), { siteShowsRupees: true });
  assert.deepEqual(saas.findings, []);
  const shop = scoreTask(taskOf('find_price', { status: 'passed', numSteps: 3, seconds: 30, answer: 'Lipstick $5' }), { siteShowsRupees: true });
  assert.ok(shop.findings.some((f) => f.type === 'currency-mismatch'));
});

test('the 100 stays 4 x 25 for any pack and scales for fewer tasks', () => {
  const pass = (id) => taskOf(id, { status: 'passed', numSteps: 3, seconds: 30 });
  for (const p of PACK_IDS) {
    const four = { id: 'r', tasks: PACKS[p].tasks.map(pass), instantScan: null };
    assert.equal(scoreReport(four).score, 100, p);
  }
  assert.equal(scoreReport({ id: 'r', tasks: [pass('find_hours'), taskOf('reach_booking')], instantScan: null }).score, 50);
  assert.equal(scoreReport({ id: 'r', tasks: [pass('find_docs')], instantScan: null }).score, 100);
  // a mixed list of packs is just tasks
  assert.equal(scoreReport({ id: 'r', tasks: [pass('find_docs'), pass('find_price')], instantScan: null }).score, 100);
  // the custom task is outside the 100
  assert.equal(scoreReport({ id: 'r', tasks: [pass('find_docs'), taskOf('custom', { status: 'passed' })], instantScan: null }).score, 100);
});

test('top fixes work across packs: severity first, one per finding type', () => {
  const report = { id: 'r', instantScan: null, tasks: ['reach_signup', 'find_docs', 'find_newsletter', 'find_pricing_plans'].map((id) => taskOf(id)) };
  const { topFixes } = scoreReport(report);
  assert.deepEqual(topFixes.map((f) => f.severity), ['high', 'high', 'medium']);
});

// ---- instant scan findings: price findings are shop-only ----
test('Instant Scan: a blog or SaaS site is not flagged for no price or no product data', () => {
  const s = scan({ priceAsText: false, productSchema: false, unlabelledButtons: 6, totalButtonsAndLinks: 20, overlayCoveringPage: true });
  const shop = instantScanFindings(s, 'shop').map((f) => f.type);
  assert.ok(shop.includes('price-in-image') && shop.includes('no-product-schema'));
  assert.deepEqual(instantScanFindings(s, 'shop').map((f) => f.type), instantScanFindings(s).map((f) => f.type), 'default is shop');
  for (const p of ['saas', 'content', 'local']) {
    const types = instantScanFindings(s, p).map((f) => f.type);
    assert.deepEqual(types.sort(), ['popup-blocking', 'unlabelled-buttons'], p);
  }
});

// ---- runSiteTest ----
test('runSiteTest stores the pack: given, inferred from the tasks, or shop', async () => {
  const a = await runSiteTest({ url: 'https://www.nykaa.com', id: 'rep_pack_a', tasks: ['find_price'] });
  assert.equal(a.pack, 'shop');
  const b = await runSiteTest({ url: 'https://www.nykaa.com', id: 'rep_pack_b', tasks: ['find_hours'] });
  assert.equal(b.pack, 'local');
  const c = await runSiteTest({ url: 'https://www.nykaa.com', id: 'rep_pack_c', pack: 'saas' });
  assert.equal(c.pack, 'saas');
  assert.deepEqual(c.tasks.map((t) => t.taskId).sort(), [...PACKS.saas.tasks].sort(), 'no tasks given: the pack default');
});

test('replay: a pack task has no recording, so it is not run, not scored and says so', async () => {
  const report = await runSiteTest({ url: 'https://www.nykaa.com', id: 'rep_pack_replay', tasks: ['find_docs', 'find_price'], customText: 'Check the delivery fee' });
  const docs = report.tasks.find((t) => t.taskId === 'find_docs');
  assert.equal(docs.replayNote, REPLAY_PACK_NOTE);
  assert.equal(docs.runId, null);
  assert.equal(docs.answer, null);
  assert.equal(docs.numSteps, 0);
  assert.equal(docs.points, 0);
  assert.deepEqual(docs.findings, [], 'nothing was run, so nothing is blamed on the site');
  const price = report.tasks.find((t) => t.taskId === 'find_price');
  assert.equal(price.replayNote, undefined);
  assert.equal(report.score, scoreReport({ ...report, tasks: [price] }).score, 'score is the recorded task only');
  assert.equal(report.customText, 'Check the delivery fee');
});

test('replay: an all-pack-task test has no score to show, and no findings', async () => {
  const report = await runSiteTest({ url: 'https://www.nykaa.com', id: 'rep_pack_replay_all', pack: 'content' });
  assert.equal(report.tasks.length, 4);
  assert.ok(report.tasks.every((t) => t.replayNote === REPLAY_PACK_NOTE));
  assert.equal(report.score, 0);
  assert.deepEqual(report.topFixes, []);
});
