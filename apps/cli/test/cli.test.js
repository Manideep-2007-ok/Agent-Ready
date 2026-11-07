import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, normaliseUrl, findTunnelUrl, buildTestUrl, LOCAL_RE, checkPackFlags, resolveTasks, packLine } from '../src/lib.js';
import { startServer, call, waitFor, sleep, NO_ENV_FILE } from '../../server/test/helpers.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const bin = path.join(root, 'apps/cli/bin/agentready.js');

/** Runs the CLI in a temp folder (it writes its report there). Replay mode unless `env` says otherwise. */
function cli(args, { env = {}, signal: killWith, killAfterMs } = {}) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-cli-'));
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, ...args], {
      cwd, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, TINYFISH_MOCK: '1', TINYFISH_MOCK_SPEED: '300', LOG_LEVEL: 'silent',
        AGENTREADY_SERVER: '', AGENTREADY_ENV_FILE: NO_ENV_FILE, ...env },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    if (killWith) setTimeout(() => child.kill(killWith), killAfterMs);
    child.on('exit', (code, sig) => resolve({ code, sig, stdout, stderr, cwd, files: fs.readdirSync(cwd) }));
  });
}

test('parseArgs: values, inline values, flags, and complaints', () => {
  const a = parseArgs(['localhost:3000', '--tasks', 'find_price,add_to_cart', '--json', '--min-score=80', '--no-tunnel', '--no-scan']);
  assert.deepEqual([a.url, a.tasks, a.json, a.minScore, a.noTunnel, a.noScan, a.errors], ['localhost:3000', ['find_price', 'add_to_cart'], true, 80, true, true, []]);
  assert.deepEqual(parseArgs([]).errors, []);
  assert.match(parseArgs(['x.com', '--bogus']).errors[0], /Unknown option: --bogus/);
  assert.match(parseArgs(['x.com', '--tasks']).errors[0], /needs a value/);
  assert.match(parseArgs(['x.com', '--min-score', 'abc']).errors[0], /0 to 100/);
  assert.match(parseArgs(['x.com', '--min-score', '101']).errors[0], /0 to 100/);
  assert.match(parseArgs(['x.com', 'y.com']).errors[0], /extra argument/);
  assert.equal(parseArgs(['--help']).help, true);
});

test('normaliseUrl: local addresses default to http, others to https, no other schemes', () => {
  assert.equal(normaliseUrl('localhost:3000').href, 'http://localhost:3000/');
  assert.equal(normaliseUrl('192.168.1.5:8080/a?x=1').href, 'http://192.168.1.5:8080/a?x=1');
  assert.equal(normaliseUrl('nykaa.com').href, 'https://nykaa.com/');
  assert.equal(normaliseUrl('http://localhost:5500/?flaws=on').search, '?flaws=on');
  assert.throws(() => normaliseUrl('ftp://x.com'), /Only http/);
  assert.throws(() => normaliseUrl(''), /No web address/);
  assert.equal(LOCAL_RE.test('myshop.local'), true);
  assert.equal(LOCAL_RE.test('nykaa.com'), false);
});

test('tunnel address is found even when split across chunks, skipping api.trycloudflare.com', () => {
  const log = 'INF Requesting new quick Tunnel on https://api.trycloudflare.com ...\nINF +---+\nINF |  https://fuzzy-lamp-demo-1234.trycloudflare.com  |';
  assert.equal(findTunnelUrl(log), 'https://fuzzy-lamp-demo-1234.trycloudflare.com');
  assert.equal(findTunnelUrl('https://api.trycloudflare.com only'), null);
  assert.equal(findTunnelUrl('nothing'), null);
  assert.equal(findTunnelUrl('https://fuzzy-lamp.trycloudflare.com/extra'), 'https://fuzzy-lamp.trycloudflare.com');
});

test('the page path and query survive the tunnel (e.g. /?flaws=on)', () => {
  const parsed = normaliseUrl('http://localhost:5500/?flaws=on');
  assert.equal(buildTestUrl('https://abc.trycloudflare.com', parsed), 'https://abc.trycloudflare.com/?flaws=on');
  assert.equal(buildTestUrl('https://abc.trycloudflare.com/', normaliseUrl('localhost:3000/shop/p1?id=4&x=y')), 'https://abc.trycloudflare.com/shop/p1?id=4&x=y');
  assert.equal(buildTestUrl('https://abc.trycloudflare.com', normaliseUrl('localhost:3000')), 'https://abc.trycloudflare.com/');
});

test('exit code 2 for usage and setup problems', async () => {
  for (const args of [[], ['--json'], ['nykaa.com', '--tasks', 'nope'], ['nykaa.com', '--bogus'], ['nykaa.com', '--min-score', '150'], ['ftp://nykaa.com'], ['nykaa.com', '--tasks', 'custom']]) {
    const r = await cli(args);
    assert.equal(r.code, 2, `${args.join(' ')}\n${r.stderr}`);
    assert.match(r.stderr, /Usage: agentready|Please give|Unknown|not a valid/);
  }
  const help = await cli(['--help']);
  assert.equal(help.code, 0);
  assert.match(help.stderr, /--no-scan/);
  const nokey = await cli(['https://nykaa.com'], { env: { TINYFISH_MOCK: '', TINYFISH_API_KEY: '' } });
  assert.equal(nokey.code, 2);
  assert.match(nokey.stderr, /TINYFISH_API_KEY is not set/);
});

test('--json prints only the report on stdout, progress goes to stderr; replay mode is announced', async () => {
  const r = await cli(['https://www.nykaa.com', '--no-tunnel', '--json', '--tasks', 'find_price']);
  assert.equal(r.code, 0, r.stderr);
  const report = JSON.parse(r.stdout);
  assert.equal(report.tasks.length, 1);
  assert.equal(report.source, 'cli');
  assert.ok(report.score > 0);
  assert.match(r.stderr, /mock mode: replaying recorded runs/);
  assert.match(r.stderr, /Find a product and its price/);
  assert.ok(r.files.some((f) => /^agentready-report-.*\.json$/.test(f)), 'report file saved next to where it ran');
});

test('Instant Scan runs by default (flawed page shows its fixes) and --no-scan skips it', async () => {
  const withScan = await cli(['http://localhost:5500/?flaws=on', '--no-tunnel', '--json', '--tasks', 'find_price']);
  assert.equal(withScan.code, 0, withScan.stderr);
  const rep = JSON.parse(withScan.stdout);
  assert.ok(rep.instantScan, 'scan result present');
  const types = rep.scanFindings.map((f) => f.type);
  assert.ok(types.includes('popup-blocking') && types.includes('price-in-image'), types.join());
  assert.ok(rep.topFixes.some((f) => f.type === 'popup-blocking'), 'scan findings reach the top fixes');
  assert.ok(rep.scanFindings.every((f) => f.likelyCause && f.fix), 'enriched with the fix write-up');

  const text = await cli(['http://localhost:5500/?flaws=on', '--no-tunnel', '--tasks', 'find_price']);
  assert.match(text.stdout, /\[popup-blocking\]/);
  assert.doesNotMatch(text.stdout, /No fixes needed/);

  const without = await cli(['http://localhost:5500/?flaws=on', '--no-tunnel', '--json', '--no-scan', '--tasks', 'find_price']);
  const rep2 = JSON.parse(without.stdout);
  assert.equal(rep2.instantScan, null);
  assert.ok(!(rep2.scanFindings?.length));
  assert.doesNotMatch(without.stderr, /Instant Scan/);
});

test('--min-score: exit 1 below the minimum, 0 at or above', async () => {
  const base = ['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--tasks', 'find_returns']; // the slow, web-search task scores well under 100
  const ok = await cli([...base, '--min-score', '30']);
  assert.equal(ok.code, 0, ok.stderr);
  const low = await cli([...base, '--min-score', '100']);
  assert.equal(low.code, 1);
  assert.match(low.stderr, /below the minimum 100/);
  assert.match(low.stdout, /AgentReady score/, 'the report is still printed');
});

test('Ctrl+C cancels the in-flight runs, writes no report and exits 130', async () => {
  const r = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan'], { env: { TINYFISH_MOCK_SPEED: '2' }, signal: 'SIGINT', killAfterMs: 2500 });
  assert.equal(r.code, 130, r.stderr + r.stdout);
  assert.match(r.stderr, /Stopping: cancelling the agent runs/);
  assert.match(r.stderr, /Stopped 2 agent run\(s\)/);
  assert.equal((r.stdout.match(/\[mock\] cancel /g) || []).length, 2, 'both in-flight runs were cancelled');
  assert.ok(!r.files.some((f) => f.startsWith('agentready-report')), 'no half report');
  assert.doesNotMatch(r.stdout, /AgentReady score/);
});

test('SIGTERM does the same and exits 143', async () => {
  const r = await cli(['https://www.myntra.com', '--no-tunnel', '--no-scan'], { env: { TINYFISH_MOCK_SPEED: '2' }, signal: 'SIGTERM', killAfterMs: 2500 });
  assert.equal(r.code, 143, r.stderr);
  assert.match(r.stderr, /SIGTERM received/);
  assert.equal((r.stdout.match(/\[mock\] cancel /g) || []).length, 2);
});

test('AGENTREADY_SERVER: the report is uploaded and the dashboard link opens it', async () => {
  const srv = await startServer({ port: 4219 });
  try {
    const r = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--tasks', 'find_price'], { env: { AGENTREADY_SERVER: srv.base } });
    assert.equal(r.code, 0, r.stderr);
    const id = /Dashboard: .*#\/test\/(\S+)/.exec(r.stdout)?.[1];
    assert.ok(id, r.stdout);
    const got = await call(srv.base, `/api/tests/${id}`);
    assert.equal(got.status, 200);
    assert.equal(got.json.source, 'cli');
  } finally { await srv.stop(); }
});

test('upload failures are explained, the test result is kept', async () => {
  const down = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--tasks', 'find_price'], { env: { AGENTREADY_SERVER: 'http://127.0.0.1:1' } });
  assert.equal(down.code, 0);
  assert.match(down.stderr, /Could not upload the report to http:\/\/127\.0\.0\.1:1: could not connect/);
  assert.match(down.stderr, /still saved on this computer/);
  assert.doesNotMatch(down.stdout, /Dashboard:/);

  const srv = await startServer({ port: 4220, env: { FEATURE_CLI_UPLOAD: 'false' } });
  try {
    const off = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--tasks', 'find_price'], { env: { AGENTREADY_SERVER: srv.base } });
    assert.equal(off.code, 0);
    assert.match(off.stderr, /server answered 404: The cli_upload feature is turned off/);
  } finally { await srv.stop(); }
});

test('a site on localhost without cloudflared gets install help (exit 2)', async () => {
  const r = await cli(['http://localhost:5500'], { env: { PATH: path.dirname(process.execPath) } });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /needs "cloudflared"/);
  assert.match(r.stderr, /brew install cloudflared/);
});

test('--version prints the package version; --badge writes an SVG with the score; badge flag needs a value', async () => {
  const v = await cli(['--version']);
  assert.equal(v.code, 0);
  assert.equal(v.stdout.trim(), JSON.parse(fs.readFileSync(path.join(root, 'apps/cli/package.json'), 'utf8')).version);
  const r = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--json', '--tasks', 'find_price', '--badge', 'b.svg']);
  assert.equal(r.code, 0, r.stderr);
  const score = JSON.parse(r.stdout).score;
  const svg = fs.readFileSync(path.join(r.cwd, 'b.svg'), 'utf8');
  assert.match(svg, /^<svg /);
  assert.ok(svg.includes(`${score}/100`), svg);
  const bad = await cli(['https://www.nykaa.com', '--badge']);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /--badge needs a value/);
});

// ---- task packs (D40) ----
test('parseArgs: --pack, --task, --tasks quick and none', () => {
  const a = parseArgs(['x.com', '--pack', 'SaaS', '--task', 'Find the refund terms', '--tasks', 'quick']);
  assert.deepEqual([a.pack, a.task, a.tasks, a.errors], ['saas', 'Find the refund terms', ['quick'], []]);
  assert.deepEqual(parseArgs(['x.com', '--tasks', 'none', '--task', 'x']).tasks, []);
  assert.deepEqual(parseArgs(['x.com', '--tasks=find_docs,find_price']).tasks, ['find_docs', 'find_price']);
  assert.equal(parseArgs(['x.com']).pack, null);
  assert.equal(parseArgs(['x.com']).task, null);
  assert.match(parseArgs(['x.com', '--pack']).errors[0], /needs a value/);
  assert.match(parseArgs(['x.com', '--task']).errors[0], /needs a value/);
});

test('checkPackFlags: unknown pack, unknown task ids, task text, none and quick rules', () => {
  const check = (argv) => checkPackFlags(parseArgs(['x.com', ...argv]));
  assert.deepEqual(check([]).errors, []);
  assert.deepEqual(check(['--pack', 'auto']).errors, []);
  assert.deepEqual(check(['--pack', 'local', '--tasks', 'find_docs,find_price']).errors, [], 'ids from any pack, whatever the pack');
  assert.match(check(['--pack', 'blog']).errors[0], /Unknown pack: blog\. Choose one of: auto, shop, saas, content, local/);
  assert.match(check(['--tasks', 'find_docs,nope']).errors[0], /Unknown task\(s\): nope/);
  assert.match(check(['--tasks', 'custom']).errors[0], /Unknown task/);
  assert.match(check(['--tasks', 'none']).errors[0], /needs a task of your own/);
  assert.deepEqual(check(['--tasks', 'none', '--task', 'find the fee']).errors, []);
  assert.match(check(['--tasks', 'none', '--task', 'x', '--min-score', '50']).errors[0], /no score/);
  assert.match(check(['--task', '   ']).errors[0], /needs some text/);
  assert.match(check(['--task', 'x'.repeat(301)]).errors[0], /300 characters/);
  assert.deepEqual(check(['--task', '\u00e9'.repeat(300)]).errors, [], '300 characters is fine');
  assert.equal(check(['--task', '  a\u0007b  ']).customText, 'ab');
  assert.equal(check(['--tasks', 'quick']).quick, true);
  assert.match(check(['--tasks', 'quick,find_price']).errors[0], /cannot be mixed|Unknown task/);
});

test('resolveTasks and packLine', () => {
  assert.deepEqual(resolveTasks(null, 'saas'), ['find_pricing_plans', 'reach_signup', 'contact_sales', 'find_docs']);
  assert.deepEqual(resolveTasks(['quick'], 'local'), ['find_hours', 'reach_booking']);
  assert.deepEqual(resolveTasks(['find_price', 'find_price', 'find_docs'], 'content'), ['find_price', 'find_docs']);
  assert.deepEqual(resolveTasks([], 'shop'), []);
  assert.equal(packLine({ how: 'detected', pack: 'saas' }), 'Detected: SaaS site \u2014 using the saas pack (override with --pack)');
  assert.match(packLine({ how: 'undetected', pack: 'shop' }), /Could not tell what kind of site this is.*using the shop pack/);
  assert.match(packLine({ how: 'no-scan', pack: 'shop' }), /Instant Scan is off.*using the shop pack \(choose one with --pack\)/);
  assert.equal(packLine({ how: 'detected', pack: 'local', usingPack: false }), 'Detected: Local business (override with --pack)');
});

test('usage errors for packs exit 2 with a plain message; --help lists the packs and their tasks', async () => {
  for (const [args, re] of [
    [['nykaa.com', '--pack', 'banking'], /Unknown pack: banking/],
    [['nykaa.com', '--tasks', 'none'], /needs a task of your own/],
    [['nykaa.com', '--task', 'x'.repeat(301)], /300 characters/],
    [['nykaa.com', '--tasks', 'none', '--task', 'x', '--min-score', '10'], /no score/],
    [['nykaa.com', '--tasks', 'find_docs,hack'], /Unknown task\(s\): hack/],
  ]) {
    const r = await cli(args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.stderr, re);
  }
  const help = await cli(['--help']);
  assert.equal(help.code, 0);
  for (const re of [/--pack/, /--task TEXT/, /quick/, /none/, /saas\s+find_pricing_plans, reach_signup, contact_sales, find_docs/, /local\s+reach_booking/, /content\s+search_topic/, /shop\s+find_returns/]) assert.match(help.stderr, re);
});

test('--pack shop runs the four shop tasks; the report says so and the terminal prints "Tested as"', async () => {
  const r = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--pack', 'shop', '--tasks', 'find_price']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Tested as: Online store\n/);
  const j = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--json', '--pack', 'shop']);
  const report = JSON.parse(j.stdout);
  assert.equal(report.pack, 'shop');
  assert.deepEqual(report.tasks.map((t) => t.taskId).sort(), ['add_to_cart', 'find_contact', 'find_price', 'find_returns']);
});

test('auto: the Instant Scan picks the pack and the terminal says so; the pack tasks are listed (replay: no recordings, so not run)', async () => {
  const r = await cli(['https://saas.example.com', '--no-tunnel', '--json']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /Detected: SaaS site \u2014 using the saas pack \(override with --pack\)/);
  const report = JSON.parse(r.stdout);
  assert.equal(report.pack, 'saas');
  assert.equal(report.packDetected, true);
  assert.deepEqual(report.tasks.map((t) => t.taskId).sort(), ['contact_sales', 'find_docs', 'find_pricing_plans', 'reach_signup']);
  assert.ok(report.tasks.every((t) => /no recording/.test(t.replayNote)));
  assert.ok(!report.scanFindings.some((f) => ['price-in-image', 'no-product-schema'].includes(f.type)), 'a SaaS site is not flagged for a missing product price');
  for (const [host, pack] of [['blog.example.com', 'content'], ['clinic.example.com', 'local'], ['www.nykaa.com', 'shop']]) {
    const x = await cli([`https://${host}`, '--no-tunnel', '--json', '--tasks', 'quick']);
    assert.equal(JSON.parse(x.stdout).pack, pack, host);
  }
});

test('auto: a page with no signals in replay mode stays a shop test; --no-scan without --pack says shop; explicit task ids name the pack', async () => {
  const a = await cli(['https://example.com', '--no-tunnel', '--json', '--tasks', 'find_price']);
  assert.equal(JSON.parse(a.stdout).pack, 'shop');
  const none = await cli(['https://example.com', '--no-tunnel', '--no-scan', '--json', '--tasks', 'quick']);
  assert.match(none.stderr, /Instant Scan is off, so the kind of site was not detected \u2014 using the shop pack/);
  assert.equal(JSON.parse(none.stdout).pack, 'shop');
  assert.deepEqual(JSON.parse(none.stdout).tasks.map((t) => t.taskId).sort(), ['add_to_cart', 'find_price']);
  const hours = await cli(['https://clinic.example.com', '--no-tunnel', '--json', '--tasks', 'find_hours,reach_booking']);
  const rep = JSON.parse(hours.stdout);
  assert.equal(rep.pack, 'local');
  assert.doesNotMatch(hours.stderr, /Detected:/, 'task ids name the pack, no waiting for the scan');
  const flag = await cli(['https://clinic.example.com', '--no-tunnel', '--json', '--no-scan', '--pack', 'content', '--tasks', 'read_article']);
  assert.equal(JSON.parse(flag.stdout).pack, 'content', '--pack wins');
});

test('--tasks quick runs the two key tasks of the pack', async () => {
  const r = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--json', '--tasks', 'quick']);
  assert.deepEqual(JSON.parse(r.stdout).tasks.map((t) => t.taskId).sort(), ['add_to_cart', 'find_price']);
});

test('--task adds a custom task that is scored separately; --tasks none runs only that task', async () => {
  const both = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--json', '--tasks', 'find_price', '--task', 'Find the delivery fee']);
  const rep = JSON.parse(both.stdout);
  assert.deepEqual(rep.tasks.map((t) => t.taskId).sort(), ['custom', 'find_price']);
  assert.equal(rep.customText, 'Find the delivery fee');
  assert.equal(rep.score, JSON.parse((await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--json', '--tasks', 'find_price'])).stdout).score, 'the custom task is outside the 100');
  assert.match(both.stderr, /\[Your task\]/);
  const text = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--tasks', 'find_price', '--task', 'Find the delivery fee']);
  assert.match(text.stdout, /Your task: "Find the delivery fee"/);

  const only = await cli(['https://www.nykaa.com', '--no-tunnel', '--no-scan', '--tasks', 'none', '--task', 'Find the delivery fee']);
  assert.equal(only.code, 0, only.stderr);
  assert.match(only.stdout, /AgentReady score: none \(only your own task ran/);
  assert.match(only.stdout, /with 1 AI agent task/);
  const j = JSON.parse((await cli(['https://www.nykaa.com', '--no-tunnel', '--json', '--tasks', 'none', '--task', 'Find the delivery fee'])).stdout);
  assert.deepEqual(j.tasks.map((t) => t.taskId), ['custom']);
  assert.equal(j.pack, 'shop', 'the scan of a recorded shop says shop');
});

test('--tasks none with a scan: the pack is detected only to choose the scan findings', async () => {
  const r = await cli(['https://blog.example.com', '--no-tunnel', '--json', '--tasks', 'none', '--task', 'Find the author page']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /Detected: Blog or news site \(override with --pack\)/);
  const report = JSON.parse(r.stdout);
  assert.equal(report.pack, 'content');
  assert.ok(!report.scanFindings.some((f) => f.type === 'price-in-image'));
});
