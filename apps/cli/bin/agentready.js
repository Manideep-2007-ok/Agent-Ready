#!/usr/bin/env node
// AgentReady CLI: test a website (even one on localhost) with real AI web agents.
// Usage: agentready <url> [--tasks a,b] [--json] [--min-score N] [--no-tunnel] [--no-scan]
// Exit codes: 0 ok, 1 score below --min-score or the test could not finish, 2 bad usage / setup.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDotEnv } from '@agentready/engine/env';
import { parseArgs, normaliseUrl, findTunnelUrl, buildTestUrl, LOCAL_RE } from '../src/lib.js';

// 1. Load .env (repo root, then current folder) before the engine reads its settings. A missing file is fine.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
loadDotEnv([path.join(repoRoot, '.env'), path.join(process.cwd(), '.env')]);

const { runSiteTest, buildFixReport, instantScan, instantScanFindings, scoreReport, rankFixes, cancelAll, TASK_LABELS, DEFAULT_TASK_ORDER, config } =
  await import('@agentready/engine');

// ---- arguments ----
const opts = parseArgs(process.argv.slice(2));
const { json: asJson, minScore } = opts;
const tasks = opts.tasks ?? DEFAULT_TASK_ORDER;

// Engine logs (e.g. "[mock] ...") use console.log; with --json keep stdout clean for the JSON only.
const printJson = console.log.bind(console);
if (asJson) console.log = console.error;
const say = (...m) => (asJson ? console.error(...m) : console.log(...m)); // progress goes to stderr with --json
const usage = (why) => {
  if (why) console.error(why);
  console.error('Usage: agentready <url> [--tasks find_price,add_to_cart] [--json] [--min-score N] [--no-tunnel] [--no-scan]\n' +
    `Tasks: ${Object.keys(TASK_LABELS).filter((t) => t !== 'custom').join(', ')}\n` +
    '  --no-tunnel   test the address as it is (no Cloudflare tunnel); use for sites that are already public\n' +
    '  --no-scan     skip the Instant Scan (pop-ups, unlabelled buttons, prices in images)\n' +
    '  --min-score N exit with code 1 if the score is below N (for CI)');
  process.exit(opts.help && !why ? 0 : 2);
};
if (opts.help) usage();
if (opts.errors.length) usage(opts.errors.join('\n'));
if (!opts.url) usage('Please give the address of the site to test.');
let parsed;
try { parsed = normaliseUrl(opts.url); } catch (e) { usage(`That is not a valid web address (${e.message}).`); }
const unknown = tasks.filter((t) => !TASK_LABELS[t] || t === 'custom');
if (unknown.length) usage(`Unknown task(s): ${unknown.join(', ')}`);
if (!tasks.length) usage('--tasks needs at least one task.');

// Without a key every task would "fail" and the report would wrongly blame the site.
if (!config.mock && !config.apiKey) {
  console.error('TINYFISH_API_KEY is not set. Add it to .env (repo root or this folder), or set TINYFISH_MOCK=1 to replay recorded runs.');
  process.exit(2);
}

// ---- tunnel: cloud agents cannot reach localhost, so expose it with Cloudflare ----
let tunnel = null;
const stopTunnel = () => { if (tunnel && !tunnel.killed) tunnel.kill(); };
const quit = (code) => { stopTunnel(); process.exit(code); };

// Ctrl+C / kill: cancel the agent runs that are already going FIRST (they cost money until they stop), then the tunnel.
let interrupted = false;
async function onSignal(name, code) {
  if (interrupted) quit(code); // second Ctrl+C: leave right now
  interrupted = true;
  console.error(`\n${name} received. Stopping: cancelling the agent runs so they stop costing credits...`);
  const hardStop = setTimeout(() => quit(code), 10_000);
  try { const r = await cancelAll('cli-interrupt'); console.error(`Stopped ${r.cancelledRuns} agent run(s).`); } catch (e) { console.error(`Could not cancel every run (${e.message}); they end at their time cap.`); }
  clearTimeout(hardStop);
  quit(code);
}
process.on('SIGINT', () => onSignal('Ctrl+C', 130));
process.on('SIGTERM', () => onSignal('SIGTERM', 143));
process.on('SIGHUP', () => onSignal('Terminal closed', 129));
process.on('exit', stopTunnel);

const isLocal = LOCAL_RE.test(parsed.hostname);

function hasCloudflared() {
  return new Promise((resolve) => {
    const p = spawn('cloudflared', ['--version'], { stdio: 'ignore' });
    p.on('error', () => resolve(false));
    p.on('exit', (code) => resolve(code === 0));
  });
}

function startTunnel(localUrl) {
  return new Promise((resolve, reject) => {
    tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', localUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => reject(new Error('The tunnel did not start within 30 seconds.')), 30000);
    // Buffer output (the URL can be split across chunks).
    let out = '';
    const onData = (chunk) => {
      out = (out + chunk.toString()).slice(-8192);
      const found = findTunnelUrl(out);
      if (found) { clearTimeout(timer); resolve(found); }
    };
    tunnel.stdout.on('data', onData);
    tunnel.stderr.on('data', onData);
    tunnel.on('error', (e) => { clearTimeout(timer); reject(e); });
    tunnel.on('exit', () => { clearTimeout(timer); reject(new Error('The tunnel stopped unexpectedly.')); });
  });
}

// Wait until the tunnel address answers (at least 5 s, at most about 15 s).
async function waitReachable(u) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(4000) }); if (r.status < 500 && Date.now() - start >= 5000) return; } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
}

try {
  let testUrl = parsed.href;
  if (isLocal && !opts.noTunnel) {
    if (!(await hasCloudflared())) {
      console.error('This site is on your computer, so AgentReady needs "cloudflared" to give the agents a public address.\n' +
        'Install it:\n  Arch:  sudo pacman -S cloudflared\n  macOS: brew install cloudflared\n' +
        '  Other: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
      process.exit(2);
    }
    say('Opening a temporary public tunnel to your site...');
    // Tunnel the site's origin, then keep the page path and query (e.g. /?flaws=on) on the public address.
    const tunnelUrl = await startTunnel(parsed.origin);
    await waitReachable(tunnelUrl);
    testUrl = buildTestUrl(tunnelUrl, parsed);
    say(`Tunnel ready: ${tunnelUrl}`);
  }

  if (config.mock) say('(mock mode: replaying recorded runs, no credits used)');
  say(`Testing ${testUrl} with ${tasks.length} AI agent task(s)${opts.noScan ? '' : ' and an Instant Scan'}...\n`);

  // ---- run the test with live progress ----
  const lastStatus = {};
  const onEvent = (e) => {
    if (e.kind === 'task-update') {
      const { taskId, status } = e.task;
      if (lastStatus[taskId] === status) return;
      lastStatus[taskId] = status;
      const text = status === 'queued' ? 'waiting for an agent' : status;
      say(`  [${TASK_LABELS[taskId]}] ${text}`);
    } else if (e.kind === 'step') {
      say(`  [${TASK_LABELS[e.taskId]}]   step: ${e.step.label}`);
    }
  };
  // The Instant Scan runs next to the agents (it never throws; a failed scan just has no findings).
  const scanPromise = opts.noScan ? null : instantScan(testUrl).catch(() => null);
  let report = await runSiteTest({ url: testUrl, tasks, source: 'cli' }, onEvent);
  if (interrupted) await new Promise(() => {}); // the signal handler is cancelling and will exit; never print a half report
  if (report.status === 'cancelled') {
    console.error('The test was stopped before it finished (an agent run was cancelled). No report was written.');
    quit(1);
  }
  report.url = parsed.href; // show the address the developer typed, not the tunnel

  if (scanPromise) {
    const scan = await scanPromise;
    if (scan) {
      report.instantScan = scan;
      report.scanFindings = instantScanFindings(scan);
      Object.assign(report, scoreReport(report)); // the answer checks use what the scan saw (prices in rupees)
      report.topFixes = rankFixes([...report.tasks.flatMap((t) => t.findings ?? []), ...report.scanFindings]);
    } else say('(Instant Scan skipped: it could not finish)');
  }
  try { report = await buildFixReport(report, { useAI: !!process.env.LLM_API_KEY && !config.mock }); } catch (e) { say(`(Fix details skipped: ${e.message})`); }

  // ---- save + optional upload ----
  const file = path.resolve(`agentready-report-${report.id}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  let dashboard = null;
  if (process.env.AGENTREADY_SERVER) {
    const base = process.env.AGENTREADY_SERVER.replace(/\/$/, '');
    try {
      const r = await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report), signal: AbortSignal.timeout(15000) });
      if (!r.ok) {
        const detail = (await r.json().catch(() => ({})))?.error;
        throw new Error(`the server answered ${r.status}${detail ? `: ${detail}` : ''}`);
      }
      dashboard = `${base}/#/test/${report.id}`;
    } catch (e) {
      const reason = e.name === 'TimeoutError' ? `${base} did not answer within 15 seconds`
        : e.message === 'fetch failed' || e.cause?.code ? `could not connect to ${base} (is the AgentReady server running there?)` : e.message;
      console.error(`Could not upload the report to ${base}: ${reason}.\nThe report is still saved on this computer: ${file}`);
    }
  }

  // ---- print ----
  if (asJson) {
    printJson(JSON.stringify(report, null, 2));
  } else {
    const verdicts = {
      none: 'No bot wall: AI agents can reach the site.',
      'blocks-cloud-agents': 'Blocks cloud AI agents (they only got in through an India proxy).',
      'blocks-automation': 'Blocks automated browsers (agents only got in with stealth mode).',
      'site-broken': 'Site did not load for agents at all, even with proxy and stealth.',
    };
    const n = report.tasks.length;
    console.log(`\nAgentReady score: ${report.score}/100${n < 4 ? ` (out of ${n} task${n === 1 ? '' : 's'} tested)` : ''}`);
    console.log(`Bot wall: ${verdicts[report.botWall] || report.botWall}`);
    console.log(`Cost: about ₹${Number(report.costRupees).toFixed(2)}\n`);
    const rows = report.tasks.map((t) => [TASK_LABELS[t.taskId] || t.taskId, t.status, String(t.numSteps), `${Math.round(t.seconds)}s`]);
    const head = ['Task', 'Result', 'Steps', 'Time'];
    const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    for (const r of [head, ...rows]) console.log(r.map((c, i) => c.padEnd(w[i])).join('  '));
    if (report.topFixes?.length) {
      console.log('\nTop fixes:');
      report.topFixes.slice(0, 3).forEach((f, i) => {
        console.log(`${i + 1}. [${f.type}] ${f.text}\n   Fix: ${f.fix}  (+${f.pointsIfFixed} points)`);
      });
    } else console.log('\nNo fixes needed.');
    console.log(`\nReport saved: ${file}`);
    if (dashboard) console.log(`Dashboard: ${dashboard}`);
  }

  stopTunnel();
  if (minScore !== null && report.score < minScore) {
    console.error(`Score ${report.score} is below the minimum ${minScore}.`);
    process.exit(1);
  }
} catch (err) {
  console.error(`AgentReady could not finish: ${err.message}`);
  quit(1);
}
