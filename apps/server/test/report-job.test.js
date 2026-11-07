// reportJob with a fake engine, in live mode: pack auto-detect from the Instant Scan, scan findings per pack, Stop during detection.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
process.env.TINYFISH_MOCK = '0';
process.env.AGENTREADY_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-job-'));
process.env.LOG_LEVEL = 'silent';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { startReport, cancelDetection } = await import('../src/reportJob.js');
const store = await import('../src/store.js');
const engineReal = await import('@agentready/engine');

const scanOf = (over) => ({ pageTextChars: 900, unlabelledButtons: 0, totalButtonsAndLinks: 20, imagesWithoutAlt: 0, totalImages: 3, priceAsText: false,
  overlayCoveringPage: true, productSchema: false, robotsTxt: 'found', sitemap: 'found', framework: 'unknown', seconds: 1, schemaTypes: [], keywordHits: {}, ...over });

/** A fake engine: the real pure functions, a scripted scan and a runSiteTest that records what it was asked and ends at once. */
function fakeEngine({ scan, scanDelay = 0 }) {
  const calls = { runSiteTest: [] };
  return {
    calls,
    engine: {
      ...engineReal,
      activeReportIds: () => [],
      instantScan: async () => { if (scanDelay) await new Promise((r) => setTimeout(r, scanDelay)); return scan; },
      runSiteTest: async (opts, onEvent) => {
        calls.runSiteTest.push(opts);
        const tasks = opts.tasks.map((taskId) => ({ taskId, goal: '', mode: 'lite', proxy: 'off', runId: null, status: 'passed', answer: 'ok', blocker: null, stuckUrl: null,
          streamingUrl: null, steps: [], numSteps: 3, seconds: 30, points: 0, findings: [], verdict: 'none', attempts: [] }));
        const report = { id: opts.id, url: opts.url, source: 'web', testedAt: new Date().toISOString(), pack: opts.pack, status: 'complete', score: 0, botWall: 'none',
          costRupees: 0, framework: 'unknown', instantScan: null, tasks, topFixes: [] };
        Object.assign(report, engineReal.scoreReport(report));
        return report;
      },
    },
  };
}
const events = () => { const log = []; return { log, publish: (e) => log.push(e) }; };
const done = async (id) => { for (let i = 0; i < 200; i++) { const r = await store.getReport(id); if (r && r.status !== 'running') return r; await new Promise((x) => setTimeout(x, 25)); } throw new Error('timeout'); };

test('auto: the scan decides the pack, the dashboard hears about it, then that pack runs', async () => {
  const { engine, calls } = fakeEngine({ scan: scanOf({ keywordHits: { pricing: 5, signup: 4, docs: 2 } }) });
  const ev = events();
  const id = await startReport({ url: 'https://app.example.net', pack: 'auto' }, { engine, events: ev });
  assert.equal((await store.getReport(id)).detectingPack, true, 'while detecting the running report says so');
  const rep = await done(id);
  assert.equal(rep.pack, 'saas');
  assert.equal(rep.packDetected, true);
  assert.equal(rep.detectingPack, undefined);
  assert.deepEqual(calls.runSiteTest[0].tasks, ['find_pricing_plans', 'reach_signup', 'contact_sales', 'find_docs']);
  assert.equal(calls.runSiteTest[0].pack, 'saas');
  const types = ev.log.map((e) => e.type);
  assert.ok(types.indexOf('pack-detected') > types.indexOf('instant-scan'), types.join());
  assert.deepEqual(ev.log.find((e) => e.type === 'pack-detected'), { type: 'pack-detected', reportId: id, pack: 'saas', detected: true });
  // a SaaS site is not told it has "no price": only the pop-up finding is left
  assert.deepEqual(rep.scanFindings.map((f) => f.type), ['popup-blocking']);
});

test('auto: a shop scan keeps the shop findings (no price text, no product data)', async () => {
  const { engine, calls } = fakeEngine({ scan: scanOf({ keywordHits: { cart: 5 } }) });
  const id = await startReport({ url: 'https://shop.example.net', pack: 'auto' }, { engine, events: events() });
  const rep = await done(id);
  assert.equal(rep.pack, 'shop');
  assert.deepEqual(calls.runSiteTest[0].tasks, ['find_returns', 'add_to_cart', 'find_price', 'find_contact']);
  assert.deepEqual(rep.scanFindings.map((f) => f.type).sort(), ['no-product-schema', 'popup-blocking', 'price-in-image']);
});

test('auto: a scan that read nothing falls back to shop and says it was not detected', async () => {
  const { engine } = fakeEngine({ scan: scanOf({ pageTextChars: 0, totalButtonsAndLinks: 0, totalImages: 0 }) });
  const rep = await done(await startReport({ url: 'https://x.example.net', pack: 'auto' }, { engine, events: events() }));
  assert.equal(rep.pack, 'shop');
  assert.equal(rep.packDetected, false);
});

test('auto with explicit tasks does not wait for the scan: the tasks name the pack', async () => {
  const { engine, calls } = fakeEngine({ scan: scanOf({ keywordHits: { cart: 9 } }), scanDelay: 150 });
  const id = await startReport({ url: 'https://x.example.net', pack: 'auto', tasks: ['find_hours'] }, { engine, events: events() });
  const first = await store.getReport(id);
  assert.equal(first.detectingPack, undefined);
  const rep = await done(id);
  assert.equal(rep.pack, 'local');
  assert.deepEqual(calls.runSiteTest[0].tasks, ['find_hours']);
  assert.equal(calls.runSiteTest[0].pack, 'local');
});

test('an explicit pack starts the agents at once (the scan runs next to them) and uses that pack for scan findings', async () => {
  const { engine, calls } = fakeEngine({ scan: scanOf({}), scanDelay: 100 });
  const id = await startReport({ url: 'https://x.example.net', pack: 'content' }, { engine, events: events() });
  const rep = await done(id);
  assert.equal(rep.pack, 'content');
  assert.deepEqual(calls.runSiteTest[0].tasks, ['search_topic', 'read_article', 'find_newsletter', 'find_author_contact']);
  assert.deepEqual(rep.scanFindings.map((f) => f.type), ['popup-blocking']);
});

test('Stop during detection: the test is cancelled, no agent starts', async () => {
  const { engine, calls } = fakeEngine({ scan: scanOf({ keywordHits: { pricing: 5, signup: 4 } }), scanDelay: 400 });
  const ev = events();
  const id = await startReport({ url: 'https://x.example.net', pack: 'auto' }, { engine, events: ev });
  assert.equal(cancelDetection(id), true);
  assert.equal(cancelDetection(id), false, 'second stop finds nothing to stop');
  const rep = await done(id);
  assert.equal(rep.status, 'cancelled');
  assert.equal(rep.score, 0);
  assert.equal(rep.detectingPack, undefined);
  assert.equal(calls.runSiteTest.length, 0);
  assert.ok(ev.log.some((e) => e.type === 'report-complete'));
});

test('Watch alerts say "AI shoppers" for a shop and "AI agents" for every other pack', async () => {
  const { formatAlert } = await import('../src/watch.js');
  const task = { taskId: 'reach_booking', status: 'failed', numSteps: 6, blocker: 'No booking page found' };
  const current = { id: 'rep_x', testedAt: '2026-11-02T10:00:00Z', tasks: [task] };
  const clinic = formatAlert({ watch: { url: 'https://clinic.example.in', tasks: ['reach_booking'], pack: 'local' }, lastGood: null, current, task });
  assert.match(clinic, /^🔴 AgentReady: AI agents can't reach the booking form on clinic\.example\.in/);
  const shopTask = { ...task, taskId: 'add_to_cart' };
  const shop = formatAlert({ watch: { url: 'https://shop.example.in', tasks: ['add_to_cart'] }, lastGood: null, current: { ...current, tasks: [shopTask] }, task: shopTask });
  assert.match(shop, /^🔴 AgentReady: AI shoppers can't add to cart and read the total on shop\.example\.in/);
});
