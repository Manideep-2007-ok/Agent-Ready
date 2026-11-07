#!/usr/bin/env node
// AgentReady CLI: test a website (even one on localhost) with real AI web agents.
// Usage: agentready <url> [--pack auto|shop|saas|content|local] [--tasks a,b|quick|none] [--task "text"] [--json] [--min-score N]
//        [--badge file.svg] [--no-tunnel] [--no-scan] [--confirm] [--version] [--help]
// Exit codes: 0 ok, 1 score below --min-score or the test could not finish, 2 bad usage / setup.
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { loadDotEnv } from '@agentready/engine/env';
import { parseArgs, normaliseUrl, findTunnelUrl, buildTestUrl, LOCAL_RE, checkPackFlags, resolveTasks, packOfTaskList, packLine } from '../src/lib.js';

// 1. Load .env before the engine reads its settings. A missing file is fine. Inside the repo: repo root .env, then the
//    current folder; as the published npm package (no repo around it): only the current folder. Real env vars always win.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const inRepo = existsSync(path.join(repoRoot, 'apps/cli/bin/agentready.js'));
loadDotEnv(process.env.AGENTREADY_ENV_FILE ? [process.env.AGENTREADY_ENV_FILE]
  : [...(inRepo ? [path.join(repoRoot, '.env')] : []), path.join(process.cwd(), '.env')]);

const { runSiteTest, buildFixReport, badgeSvg, fixturesAvailable, instantScan, instantScanFindings, scoreReport, rankFixes, cancelAll, TASK_LABELS, PACKS, PACK_IDS, packSiteLabel, autoPack, hasPackSignals, config } =
  await import('@agentready/engine');

// ---- arguments ----
const opts = parseArgs(process.argv.slice(2));
if (opts.version && !opts.errors.length) {
  const pkg = JSON.parse(readFileSync(path.join(here, '../package.json'), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}
const { json: asJson, minScore } = opts;

// Engine logs (e.g. "[mock] ...") use console.log; with --json keep stdout clean for the JSON only.
const printJson = console.log.bind(console);
if (asJson) console.log = console.error;
const say = (...m) => (asJson ? console.error(...m) : console.log(...m)); // progress goes to stderr with --json
const usage = (why) => {
  if (why) console.error(why);
  const packTasks = PACK_IDS.map((p) => `  ${p.padEnd(8)} ${PACKS[p].tasks.join(', ')}`).join('\n');
  console.error('Usage: agentready <url> [--pack auto|shop|saas|content|local] [--tasks ids|quick|none] [--task "text"] [--json] [--min-score N] [--badge file.svg] [--no-tunnel] [--no-scan] [--confirm]\n' +
    '  --pack P      what kind of site this is. auto (default) reads the site with the Instant Scan and picks one;\n' +
    '                with --no-scan and no --pack the shop pack is used\n' +
    '  --tasks LIST  task ids from any pack, comma separated (default: the four tasks of the pack);\n' +
    '                quick = the two key tasks of the pack (cheaper); none = no pack tasks, only --task\n' +
    '  --task TEXT   add a task of your own (up to 300 characters). It is scored separately and is not part of the\n' +
    '                100. With --tasks none it is the only task that runs\n' +
    '  --no-tunnel   test the address as it is (no Cloudflare tunnel); use for sites that are already public\n' +
    '  --no-scan     skip the Instant Scan (pop-ups, unlabelled buttons, prices in images)\n' +
    '  --confirm     run each task again (a third time if the two disagree) and keep the majority; costs about 2x\n' +
    '  --min-score N exit with code 1 if the score is below N (for CI)\n' +
    '  --badge FILE  write an Agent-Ready score badge (SVG) after the run\n' +
    '  --json        print the full report as JSON on stdout (progress goes to stderr)\n' +
    '  --version     print the version\n' +
    `Packs and their tasks:\n${packTasks}\n` +
    'Needs TINYFISH_API_KEY (environment variable or a .env file in this folder). Cost: about $0.016 per agent step.');
  process.exit(opts.help && !why ? 0 : 2);
};
if (opts.help) usage();
if (opts.errors.length) usage(opts.errors.join('\n'));
if (!opts.url) usage('Please give the address of the site to test.');
let parsed;
try { parsed = normaliseUrl(opts.url); } catch (e) { usage(`That is not a valid web address (${e.message}).`); }
const flags = checkPackFlags(opts);
if (flags.errors.length) usage(flags.errors.join('\n'));
const customText = flags.customText;

// Without a key every task would "fail" and the report would wrongly blame the site.
if (config.mock && !fixturesAvailable()) {
  console.error('TINYFISH_MOCK=1 replays recordings that only exist in the AgentReady repository, so it does not work in the installed package.\nUnset TINYFISH_MOCK and set TINYFISH_API_KEY to test a site for real.');
  process.exit(2);
}
if (!config.mock && !config.apiKey) {
  console.error('TINYFISH_API_KEY is not set. Set it as an environment variable or put it in a .env file in this folder.\nCreate a key in your TinyFish account (docs: https://docs.tinyfish.ai). It is only used from this computer.');
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

  // ---- which pack? --pack names it; explicit task ids name it too; otherwise the Instant Scan decides (auto) ----
  // The Instant Scan runs next to the agents (it never throws; a failed scan just has no findings). Only "auto" with no
  // task ids has to wait for it, because the pack decides which tasks to run.
  const scanPromise = opts.noScan ? null : instantScan(testUrl).catch(() => null);
  let pack = opts.pack && opts.pack !== 'auto' ? opts.pack : null;
  let how = 'flag';
  const idsGiven = Array.isArray(opts.tasks) && opts.tasks.length > 0 && !flags.quick;
  if (!pack && idsGiven) { pack = packOfTaskList(opts.tasks); how = 'tasks'; }
  const needPackNow = !pack && (opts.tasks === null || flags.quick); // auto with the pack's own tasks, or quick
  if (needPackNow) {
    if (!scanPromise) { pack = 'shop'; how = 'no-scan'; }
    else {
      say('Reading the site to see what kind it is (Instant Scan)...');
      const scan = await scanPromise;
      let picked = autoPack(scan);
      // Replay mode only has shop recordings: a scan with no signal at all (example.com, localhost) stays a shop test.
      if (config.mock && !hasPackSignals(scan)) picked = { pack: 'shop', detected: false };
      pack = picked.pack;
      how = picked.detected ? 'detected' : 'undetected';
    }
    say(packLine({ how, pack }));
  } else if (!pack) {
    // --tasks none with no --pack: no pack tasks to choose, but the pack still decides which scan findings make sense
    // (a blog is not told it has no price). It is settled when the scan has finished.
    how = 'detected';
  }
  const tasks = pack ? resolveTasks(opts.tasks, pack) : [];
  const total = tasks.length + (customText ? 1 : 0);
  say(`Testing ${testUrl} with ${total} AI agent task(s)${opts.noScan ? '' : ' and an Instant Scan'}...\n`);

  // ---- run the test with live progress ----
  const lastStatus = {};
  const labelOf = (id) => (id === 'custom' ? 'Your task' : TASK_LABELS[id] ?? id);
  const onEvent = (e) => {
    if (e.kind === 'task-update') {
      const { taskId, status } = e.task;
      if (lastStatus[taskId] === status) return;
      lastStatus[taskId] = status;
      const text = status === 'queued' ? 'waiting for an agent' : status;
      say(`  [${labelOf(taskId)}] ${text}`);
    } else if (e.kind === 'step') {
      say(`  [${labelOf(e.taskId)}]   step: ${e.step.label}`);
    }
  };
  let report = await runSiteTest({ url: testUrl, tasks, pack: pack ?? 'shop', customText: customText ?? undefined, source: 'cli', confirm: opts.confirm }, onEvent);
  if (interrupted) await new Promise(() => {}); // the signal handler is cancelling and will exit; never print a half report
  if (report.status === 'cancelled') {
    console.error(report.stopReason === 'budget'
      ? `The test reached its cost limit (₹${report.budgetRupees}, set with BUDGET_PER_TEST_RUPEES) and was stopped. No report was written.`
      : 'The test was stopped before it finished (an agent run was cancelled). No report was written.');
    quit(1);
  }
  report.url = parsed.href; // show the address the developer typed, not the tunnel

  if (scanPromise) {
    const scan = await scanPromise;
    if (scan) {
      if (!pack) { // --tasks none, no --pack: use what the scan says, for the scan findings only
        pack = autoPack(scan).pack;
        report.pack = pack;
        say(packLine({ how: 'detected', pack, usingPack: false }));
      }
      report.instantScan = scan;
      report.scanFindings = instantScanFindings(scan, report.pack);
      Object.assign(report, scoreReport(report)); // the answer checks use what the scan saw (prices in rupees)
      report.topFixes = rankFixes([...report.tasks.flatMap((t) => t.findings ?? []), ...report.scanFindings]);
    } else say('(Instant Scan skipped: it could not finish)');
  }
  if (how === 'detected' || how === 'undetected') report.packDetected = how === 'detected';
  try { report = await buildFixReport(report, { useAI: !!process.env.LLM_API_KEY && !config.mock }); } catch (e) { say(`(Fix details skipped: ${e.message})`); }

  // ---- save + optional upload ----
  const file = path.resolve(`agentready-report-${report.id}.json`);
  writeFileSync(file, JSON.stringify(report, null, 2));
  if (opts.badge) {
    try { writeFileSync(path.resolve(opts.badge), badgeSvg({ score: report.score })); say(`Badge saved: ${path.resolve(opts.badge)}`); }
    catch (e) { console.error(`Could not write the badge to ${opts.badge}: ${e.message}`); }
  }
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
    const scored = report.tasks.filter((t) => t.taskId !== 'custom' && !t.replayNote);
    const n = scored.length;
    console.log(`\nTested as: ${packSiteLabel(report.pack)}${report.packDetected === true ? ' (detected)' : ''}`);
    console.log(n ? `AgentReady score: ${report.score}/100${n < 4 ? ` (out of ${n} task${n === 1 ? '' : 's'} tested)` : ''}` : 'AgentReady score: none (only your own task ran, and it is not part of the 100)');
    console.log(`Bot wall: ${verdicts[report.botWall] || report.botWall}`);
    console.log(`Cost: about ₹${Number(report.costRupees).toFixed(2)}\n`);
    const rows = report.tasks.map((t) => [labelOf(t.taskId), t.status + (t.flaky ? ' (runs disagreed)' : t.runs?.length > 1 ? ` (${t.runs.filter((r) => !r.stopped).length} runs)` : ''), String(t.numSteps), `${Math.round(t.seconds)}s`]);
    const head = ['Task', 'Result', 'Steps', 'Time'];
    const w = head.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
    for (const r of [head, ...rows]) console.log(r.map((c, i) => c.padEnd(w[i])).join('  '));
    const mine = report.tasks.find((t) => t.taskId === 'custom');
    if (mine) {
      console.log(`\nYour task: "${customText}"`);
      console.log(mine.replayNote ? `  ${mine.replayNote}` : `  ${mine.status === 'passed' ? 'Passed' : 'Not done'}${mine.answer ? `. Answer: ${mine.answer}` : mine.blocker ? `. What stopped the agent: ${mine.blocker}` : ''}`);
    }
    const notRun = report.tasks.filter((t) => t.replayNote && t.taskId !== 'custom');
    if (notRun.length) console.log(`\n${notRun[0].replayNote} (${notRun.length} task${notRun.length === 1 ? '' : 's'} not run)`);
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
