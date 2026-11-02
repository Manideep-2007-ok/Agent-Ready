import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReport, clean, MARKER } from '../../../scripts/ci-report.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const demo = (name) => JSON.parse(fs.readFileSync(path.join(root, 'data/cached-demo/reports', name), 'utf8'));

test('a real recorded report becomes a comment: marker first, score, task table, top fixes', () => {
  const r = demo('rep_demo_flaws_on.json');
  const { markdown, score, passed } = formatReport(r, { minScore: 80, target: 'https://agent-ready-demo.vercel.app/?flaws=on', runUrl: 'https://github.com/o/r/actions/runs/1' });
  assert.ok(markdown.startsWith(`${MARKER}\n`));
  assert.equal(score, Math.round(r.score));
  assert.match(markdown, new RegExp(`## AgentReady: ${score}/100`));
  assert.match(markdown, /\| Task \| Result \| Steps \| Time \|/);
  assert.match(markdown, /Find a product and its price/);
  assert.equal(passed, score >= 80);
  assert.match(markdown, passed ? /\*\*Passed\*\*/ : /\*\*Failed\*\*: minimum score is 80/);
  assert.ok((markdown.match(/^\d\. \*\*/gm) ?? []).length <= 3);
  assert.match(markdown, /workflow run/);
  assert.ok(!markdown.includes('undefined') && !markdown.includes('NaN'));
});

test('min-score 0 means report only and always passes', () => {
  const r = { ...demo('rep_demo_flaws_on.json'), score: 3 };
  const { markdown, passed } = formatReport(r, { minScore: 0 });
  assert.equal(passed, true);
  assert.match(markdown, /Report only/);
  assert.match(markdown, /poor/);
});

test('exactly at the minimum passes; one below fails and says by how much', () => {
  const r = { ...demo('rep_demo_flaws_on.json'), score: 80 };
  assert.equal(formatReport(r, { minScore: 80 }).passed, true);
  const low = formatReport({ ...r, score: 79 }, { minScore: 80 });
  assert.equal(low.passed, false);
  assert.match(low.markdown, /1 point too low/);
});

test('no report, unreadable report or a stopped test: marker kept, no score, failed', () => {
  for (const r of [null, { status: 'cancelled', score: 0, tasks: [] }]) {
    const out = formatReport(r, { minScore: 0, error: 'timeout' });
    assert.equal(out.passed, false); assert.equal(out.score, null);
    assert.ok(out.markdown.startsWith(MARKER));
    assert.match(out.markdown, /no score/);
  }
});

test('text from agents and sites cannot break the table, inject HTML or mention people', () => {
  assert.equal(clean('a | b <img src=x onerror=1> @octocat `x`'), "a \\| b &lt;img src=x onerror=1&gt; @​octocat 'x'");
  const r = demo('rep_demo_flaws_on.json');
  r.topFixes = [{ type: 'x', severity: 'high', text: '@everyone <script>\n| evil', fix: 'f', pointsIfFixed: 5 }];
  const { markdown } = formatReport(r);
  assert.ok(!markdown.includes('<script>'));
  assert.ok(!markdown.includes('@everyone'));
});

test('command line: writes comment + summary files and GITHUB_OUTPUT lines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-ci-'));
  const out = path.join(dir, 'gh-output');
  const res = spawnSync(process.execPath, [path.join(root, 'scripts/ci-report.mjs'), path.join(root, 'data/cached-demo/reports/rep_demo_flaws_on.json'),
    '--min-score', '95', '--comment', path.join(dir, 'c.md'), '--summary', path.join(dir, 's.md')], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out } });
  assert.equal(res.status, 0, res.stderr);
  assert.ok(fs.readFileSync(path.join(dir, 'c.md'), 'utf8').startsWith(MARKER));
  assert.ok(!fs.readFileSync(path.join(dir, 's.md'), 'utf8').includes(MARKER));
  assert.match(fs.readFileSync(out, 'utf8'), /^score=\d+\npassed=(true|false)\n$/);
  const missing = spawnSync(process.execPath, [path.join(root, 'scripts/ci-report.mjs'), path.join(dir, 'nope.json')], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } });
  assert.equal(missing.status, 0);
  assert.match(missing.stdout, /no score/);
});
