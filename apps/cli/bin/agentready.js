#!/usr/bin/env node
// AgentReady CLI: test a website (even one on localhost) with real AI web agents.
// Usage: agentready <url> [--tasks a,b] [--json] [--min-score N] [--no-tunnel]
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// 1. Load .env (repo root, then current folder) without extra dependencies.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
for (const dir of [repoRoot, process.cwd()]) {
  const file = path.join(dir, '.env');
  try { if (existsSync(file)) process.loadEnvFile?.(file); } catch { /* ignore a bad .env */ }
}

const { runSiteTest, buildFixReport, TASK_LABELS, DEFAULT_TASK_ORDER, config } = await import('@agentready/engine');

// ---- arguments ----
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const value = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const url = args.find((a, i) => !a.startsWith('--') && !['--tasks', '--min-score'].includes(args[i - 1]));
const asJson = flag('json');
const minScore = value('min-score') === undefined ? null : Number(value('min-score'));
const tasks = value('tasks') ? value('tasks').split(',').map((t) => t.trim()).filter(Boolean) : DEFAULT_TASK_ORDER;

// Engine logs (e.g. "[mock] ...") use console.log; with --json keep stdout clean for the JSON only.
const printJson = console.log.bind(console);
if (asJson) console.log = console.error;
const say = (...m) => (asJson ? console.error(...m) : console.log(...m)); // progress goes to stderr with --json
const usage = () => {
  console.error('Usage: agentready <url> [--tasks find_price,add_to_cart] [--json] [--min-score N] [--no-tunnel]\n' +
    `Tasks: ${Object.keys(TASK_LABELS).filter((t) => t !== 'custom').join(', ')}`);
  process.exit(2);
};
let parsed;
// No scheme: local addresses default to http (dev servers rarely speak https), others to https.
const LOCAL_RE = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1?\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.local|.*\.localhost)$/i;
try {
  const host = String(url || '').split(/[/:]/)[0];
  parsed = new URL(url?.includes('://') ? url : `${LOCAL_RE.test(host) ? 'http' : 'https'}://${url}`);
} catch { usage(); }
if (!url || (minScore !== null && Number.isNaN(minScore))) usage();
const unknown = tasks.filter((t) => !TASK_LABELS[t] || t === 'custom');
if (unknown.length) { console.error(`Unknown task(s): ${unknown.join(', ')}`); usage(); }

// Without a key every task would "fail" and the report would wrongly blame the site.
if (!config.mock && !config.apiKey) {
  console.error('TINYFISH_API_KEY is not set. Add it to .env (repo root or this folder), or set TINYFISH_MOCK=1 to replay recorded runs.');
  process.exit(2);
}

// ---- tunnel: cloud agents cannot reach localhost, so expose it with Cloudflare ----
let tunnel = null;
const stopTunnel = () => { if (tunnel && !tunnel.killed) tunnel.kill(); };
const quit = (code) => { stopTunnel(); process.exit(code); };
process.on('SIGINT', () => quit(130));
process.on('SIGTERM', () => quit(143));
process.on('SIGHUP', () => quit(129)); // terminal closed: still kill the tunnel
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
    // Buffer output (the URL can be split across chunks). Skip api.trycloudflare.com, which appears in error lines.
    let out = '';
    const onData = (chunk) => {
      out = (out + chunk.toString()).slice(-8192);
      const m = [...out.matchAll(/https:\/\/([a-z0-9-]+)\.trycloudflare\.com/g)].find((x) => x[1] !== 'api');
      if (m) { clearTimeout(timer); resolve(m[0]); }
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
  if (isLocal && !flag('no-tunnel')) {
    if (!(await hasCloudflared())) {
      console.error('This site is on your computer, so AgentReady needs "cloudflared" to give the agents a public address.\n' +
        'Install it:\n  Arch:  sudo pacman -S cloudflared\n  macOS: brew install cloudflared\n' +
        '  Other: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
      process.exit(2);
    }
    say('Opening a temporary public tunnel to your site...');
    const tunnelUrl = await startTunnel(parsed.href);
    await waitReachable(tunnelUrl);
    testUrl = tunnelUrl;
    say(`Tunnel ready: ${tunnelUrl}`);
  }

  if (config.mock) say('(mock mode: replaying recorded runs, no credits used)');
  say(`Testing ${testUrl} with ${tasks.length} AI agent task(s)...\n`);

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
  let report = await runSiteTest({ url: testUrl, tasks, source: 'cli' }, onEvent);
  report.url = parsed.href; // show the address the developer typed, not the tunnel
  try { report = await buildFixReport(report, { useAI: !!process.env.LLM_API_KEY && !config.mock }); } catch (e) { say(`(Fix details skipped: ${e.message})`); }

  // ---- save + optional upload ----
  const file = path.resolve(`agentready-report-${report.id}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  let dashboard = null;
  if (process.env.AGENTREADY_SERVER) {
    const base = process.env.AGENTREADY_SERVER.replace(/\/$/, '');
    try {
      const r = await fetch(`${base}/api/reports`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
      if (!r.ok) throw new Error(`server answered ${r.status}`);
      dashboard = `${base}/?report=${report.id}`;
    } catch (e) { say(`Could not upload the report to ${base}: ${e.message}`); }
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
