// Pre-run snapshot of Indian e-commerce sites for the leaderboard (docs/ARCHITECTURE.md section 20, 15:00-15:30).
// Usage (from packages/engine):
//   node --env-file=../../.env scripts/snapshot.js [--sites nykaa.com,myntra.com] [--tasks find_price,add_to_cart] [--yes] [--out DIR]
// REAL mode costs credits, so it prints an estimate and refuses without --yes.
// MOCK mode (TINYFISH_MOCK=1) works end to end but writes to a temp folder unless --out is given.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, runSiteTest, cancelRun, instantScan, instantScanFindings, buildFixReport, DEFAULT_TASK_ORDER, USD_INR } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DEFAULT_SITES = ['https://www.nykaa.com', 'https://www.myntra.com', 'https://www.ajio.com', 'https://www.meesho.com', 'https://www.tatacliq.com', 'https://www.bewakoof.com'];
const USD_PER_STEP = 0.016;
const STEPS_PER_TASK = 8;

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i !== -1 ? argv[i + 1] : undefined; };
const toUrl = (s) => { s = s.trim(); return /^https?:\/\//i.test(s) ? s : `https://${/^www\./i.test(s) ? s : 'www.' + s}`; };
const sites = (opt('sites') ? opt('sites').split(',').filter(Boolean).map(toUrl) : DEFAULT_SITES);
const tasks = opt('tasks') ? opt('tasks').split(',').map((t) => t.trim()).filter(Boolean) : [...DEFAULT_TASK_ORDER];
const yes = argv.includes('--yes');

const bad = tasks.filter((t) => !DEFAULT_TASK_ORDER.includes(t));
if (bad.length) { console.error(`Unknown task(s): ${bad.join(', ')}. Valid: ${DEFAULT_TASK_ORDER.join(', ')}`); process.exit(1); }
if (!sites.length || !tasks.length) { console.error('Nothing to run.'); process.exit(1); }

// Estimate: ~8 steps per task. A blocked task is retried up to 2 more times, so a site that blocks every task can cost up to 3x.
const base = sites.length * tasks.length * STEPS_PER_TASK * USD_PER_STEP;
console.log(`Plan: ${sites.length} sites x ${tasks.length} tasks (${tasks.join(', ')}), mode ${config.mock ? 'MOCK' : 'REAL'}`);
if (!config.mock) {
  console.log(`Estimated cost: about $${base.toFixed(2)} (Rs ${Math.round(base * USD_INR)}), up to $${(base * 3).toFixed(2)} (Rs ${Math.round(base * 3 * USD_INR)}) if sites block agents and need retries.`);
  if (!yes) { console.error('Refusing to spend credits without --yes. Re-run with --yes to go ahead.'); process.exit(1); }
}

const outRoot = opt('out') ? path.resolve(opt('out')) : config.mock ? path.join(os.tmpdir(), `agentready-snapshot-${Date.now()}`) : path.join(ROOT, 'data/cached-demo');
const dirs = ['leaderboard', 'reports'].map((d) => path.join(outRoot, d));
for (const d of dirs) fs.mkdirSync(d, { recursive: true });
console.log(`Saving to ${outRoot}/{leaderboard,reports}\n`);

const d = new Date();
const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
const hostSlug = (u) => new URL(u).hostname.replace(/^www\./, '').replace(/[^a-z0-9]+/gi, '');

const done = []; // {url, report}
const failed = [];
function summary() {
  const rows = [...done].sort((a, b) => b.report.score - a.report.score);
  console.log('\nRank  Site                 Score  BotWall               Cost(Rs)  Top fix');
  rows.forEach(({ report: r }, i) => {
    const host = new URL(r.url).hostname.replace(/^www\./, '');
    console.log(`${String(i + 1).padEnd(5)} ${host.padEnd(20)} ${String(r.score).padEnd(6)} ${r.botWall.padEnd(21)} ${String(r.costRupees).padEnd(9)} ${r.topFixes[0]?.type ?? 'none'}`);
  });
  const total = rows.reduce((n, { report }) => n + report.costRupees, 0);
  console.log(`\nFinished ${done.length}/${sites.length} sites${failed.length ? `, skipped: ${failed.join(', ')}` : ''}. Total agent cost: Rs ${Math.round(total * 100) / 100}`);
}
// Agent runs still going when Ctrl+C is pressed keep spending credits on TinyFish's side, so cancel them (best effort, 5 s max).
// Browser sessions opened by the instant scan expire on their own (createBrowserSession timeoutSeconds, default 60).
const liveRuns = new Set();
let stopping = false;
process.on('SIGINT', async () => {
  if (stopping) process.exit(130); // second Ctrl+C: leave now
  stopping = true;
  console.log('\nInterrupted. Finished so far:');
  summary();
  if (!config.mock && liveRuns.size) {
    console.log(`Cancelling ${liveRuns.size} running agent run(s)...`);
    const all = Promise.allSettled([...liveRuns].map((id) => cancelRun(id)));
    await Promise.race([all, new Promise((r) => setTimeout(r, 5000))]);
  }
  process.exit(130);
});

for (const url of sites) {
  const id = `rep_${stamp}_snap_${hostSlug(url)}`;
  console.log(`--- ${url}`);
  try {
    // Agents and the instant scan run side by side; a failed scan never blocks the report.
    const [scored, scan] = await Promise.all([
      runSiteTest({ url, tasks, source: 'web', id }, (e) => {
        if (e.kind === 'streaming-url' && e.runId) liveRuns.add(e.runId); // first event that carries the run id
        if (e.kind === 'task-update' && e.task.runId && !['running', 'queued'].includes(e.task.status)) liveRuns.delete(e.task.runId);
        if (e.kind === 'task-update' && ['passed', 'failed', 'blocked'].includes(e.task.status) && e.task.verdict) console.log(`    ${e.task.taskId}: ${e.task.status}`);
      }),
      instantScan(url).catch((err) => { console.warn(`    instant scan failed: ${err.message}`); return null; }),
    ]);
    scored.instantScan = scan;
    scored.scanFindings = scan ? instantScanFindings(scan) : [];
    if (scan?.framework && scan.framework !== 'unknown') scored.framework = scan.framework;
    const report = await buildFixReport(scored, { useAI: false });
    for (const t of report.tasks) t.streamingUrl = null; // live-view links die after the run
    for (const dir of dirs) fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(report, null, 2) + '\n');
    done.push({ url, report });
    console.log(`    score ${report.score}, botWall ${report.botWall}, Rs ${report.costRupees}`);
  } catch (err) {
    failed.push(url);
    console.error(`    SKIPPED ${url}: ${err.message}`);
  }
}
summary();
