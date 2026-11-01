// Confirm-then-alert path of runCheck, no credits:
//   node apps/server/scripts/watch-confirm-smoke.js
// Swiggy add_to_cart replays a real failed run. With a hand-made "last good" report saved first,
// the first check must re-run the task once, alert once and set failing=true; a second check must not re-alert.
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';

process.env.TINYFISH_MOCK = '1';
process.env.TINYFISH_MOCK_SPEED ??= '50';
delete process.env.ALERT_WEBHOOK_URL; // sendAlert prints "[alert] ..." instead of posting
process.env.AGENTREADY_DATA_DIR = await fsp.mkdtemp(path.join(os.tmpdir(), 'agentready-confirm-'));
const DATA = process.env.AGENTREADY_DATA_DIR;

const watchMod = await import('../src/watch.js');
const { runCheck, getWatch, setPublisher } = watchMod;

// Count alerts through the live-event publisher (sendAlert itself only logs without a webhook URL).
const events = [];
setPublisher((e) => { events.push(e); });
// Count agent runs: mock.js logs "[mock] run <id> replays <fixture>" once per run.
let runs = 0;
const log = console.log;
console.log = (...a) => { if (a[0] === '[mock]' && String(a[1]).startsWith('run ')) runs++; else log(...a); };

// A passing add_to_cart report from "earlier today".
const lastGood = {
  id: 'rep_lastgood', url: 'https://www.swiggy.com/', source: 'watch', testedAt: '2026-11-01T16:30:00Z', pack: 'shopping',
  status: 'complete', score: 25, botWall: 'none', costRupees: 7.04, framework: 'unknown', instantScan: null, topFixes: [],
  tasks: [{ taskId: 'add_to_cart', goal: '', mode: 'lite', proxy: 'off', runId: 'r0', status: 'passed', answer: '₹100',
    blocker: null, stuckUrl: null, streamingUrl: null, steps: [], numSteps: 5, seconds: 40, points: 25, findings: [], verdict: 'none' }],
};
const watch = { id: 'w_confirm', url: 'https://www.swiggy.com/', tasks: ['add_to_cart'], everyMinutes: 20, enabled: true,
  createdAt: '2026-11-01T16:00:00Z', lastGoodReportId: lastGood.id, failing: false };
await fsp.mkdir(path.join(DATA, 'reports'), { recursive: true });
await fsp.mkdir(path.join(DATA, 'watch'), { recursive: true });
await fsp.writeFile(path.join(DATA, 'reports', `${lastGood.id}.json`), JSON.stringify(lastGood));
await fsp.writeFile(path.join(DATA, 'watch', 'watches.json'), JSON.stringify([watch]));

let ok = true;
const check = (cond, msg) => { log(cond ? 'PASS' : 'FAIL', msg); ok &&= cond; };

let runsBefore = runs;
const r1 = await runCheck(await getWatch(watch.id));
check(runs - runsBefore === 2, `first check = 1 run + 1 confirming re-run (got ${runs - runsBefore})`);
const alerts1 = events.filter((e) => e.type === 'watch-alert');
check(alerts1.length === 1, `first check alerts once (got ${alerts1.length})`);
log('  alert:', alerts1[0]?.message);
check(/since \d{2}:\d{2}\./.test(alerts1[0]?.message ?? '') && /Last good: 22:00 \(5 steps\)/.test(alerts1[0]?.message ?? ''),
  '24-hour times ("Last good: 22:00 (5 steps)")');
check((await getWatch(watch.id)).failing === true, 'watch.failing is true after the alert');
check(r1.tasks[0].attempts?.length >= 1 && r1.tasks[0].status !== 'passed', 'report holds the confirming re-run');
check(r1.score === 0 && r1.tasks[0].points === 0 && r1.topFixes[0]?.type === 'cart-not-found',
  `score/topFixes recomputed after re-run (score=${r1.score}, top=${r1.topFixes[0]?.type}, cost=₹${r1.costRupees})`);
const saved = JSON.parse(await fsp.readFile(path.join(DATA, 'reports', `${r1.id}.json`), 'utf8'));
check(saved.score === r1.score && saved.topFixes.length === r1.topFixes.length, 'saved report matches recomputed one');

const before = events.length;
runsBefore = runs;
const r2 = await runCheck(await getWatch(watch.id));
check(events.slice(before).filter((e) => e.type === 'watch-alert').length === 0, 'second failing check does not re-alert');
check(runs - runsBefore === 1 && r2.tasks[0].status !== 'passed', `second check skips the confirming re-run (runs=${runs - runsBefore})`);
check((await getWatch(watch.id)).failing === true, 'watch stays failing');

// Concurrency guard: a second runCheck while one is running returns null.
const p = runCheck(await getWatch(watch.id));
check((await runCheck(await getWatch(watch.id))) === null, 'parallel check on the same watch is refused');
await p;

// Recovery: point the watch at a site whose recorded run passes (mock replays the passing localhost run).
const wf = path.join(DATA, 'watch', 'watches.json');
await fsp.writeFile(wf, JSON.stringify([{ ...(await getWatch(watch.id)), url: 'https://example.com/' }]));
const before3 = events.length;
const r3 = await runCheck(await getWatch(watch.id));
const rec = events.slice(before3).filter((e) => e.type === 'watch-recovered');
log('  recovery:', rec[0]?.message);
check(rec.length === 1 && /^🟢 AgentReady: Add to cart and read the total on example\.com works again \(\d{2}:\d{2}\)\.$/.test(rec[0].message),
  'recovery message sent once');
const w3 = await getWatch(watch.id);
check(w3.failing === false && w3.lastGoodReportId === r3.id, 'failing cleared and last good moved to the new report');

const history = JSON.parse(await fsp.readFile(path.join(DATA, 'watch', `${watch.id}.json`), 'utf8'));
check(history.length === 4 && new Set(history).size === 4, `history has 4 different reports (${history.join(', ')})`);

log(ok ? 'ALL PASS' : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
