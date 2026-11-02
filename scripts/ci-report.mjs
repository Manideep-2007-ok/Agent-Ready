#!/usr/bin/env node
// Turns an AgentReady JSON report (from `agentready --json`) into the markdown used by the GitHub Action:
// the PR comment (starts with a hidden marker so the Action can find and EDIT it) and the job summary.
//   node scripts/ci-report.mjs report.json [--min-score N] [--target URL] [--run-url URL] [--comment out.md] [--summary out.md]
// With no --comment/--summary the markdown goes to stdout. Prints "score=<n>" and "passed=<true|false>" lines to
// $GITHUB_OUTPUT when that variable is set. Exit code is always 0 for a readable report (the Action decides pass/fail).
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TASK_LABELS, packSiteLabel } from '../packages/engine/src/goals.js';

export const MARKER = '<!-- agentready -->';

/** Text that came from a site or an agent must not break the markdown table, inject HTML or @-mention people. */
export const clean = (s, max = 400) => String(s ?? '')
  .replace(/\s+/g, ' ').trim().slice(0, max)
  .replace(/[<>]/g, (c) => (c === '<' ? '&lt;' : '&gt;'))
  .replace(/\|/g, '\\|').replace(/@/g, '@\u200b').replace(/`/g, "'");

const level = (score) => (score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 50 ? 'needs work' : 'poor');
const BOT = {
  none: 'No bot wall: AI agents can reach the site.',
  'blocks-cloud-agents': 'Blocks cloud AI agents (they only got in through an India proxy).',
  'blocks-automation': 'Blocks automated browsers (agents only got in with stealth mode).',
  'site-broken': 'The site did not load for agents at all, even with proxy and stealth.',
};

/**
 * @param {object|null} report  SiteReport, or null when the test could not finish
 * @param {{minScore?:number, target?:string, runUrl?:string, error?:string}} [opts]
 * @returns {{markdown:string, score:number|null, passed:boolean}}
 */
export function formatReport(report, { minScore = 0, target = '', runUrl = '', error = '' } = {}) {
  const lines = [MARKER];
  const hasScore = report && report.status !== 'cancelled' && Number.isFinite(report.score);
  if (!hasScore) {
    lines.push('## AgentReady: no score', '',
      `The test did not finish${error ? `: ${clean(error)}` : '.'} No score was produced, so this check is marked as failed.`);
    if (target) lines.push('', `Tested address: ${clean(target, 300)}`);
    if (runUrl) lines.push('', `[Workflow run](${runUrl})`);
    return { markdown: lines.join('\n') + '\n', score: null, passed: false };
  }
  const score = Math.round(report.score);
  const passed = score >= minScore;
  const scoredTasks = (report.tasks ?? []).filter((t) => t.taskId !== 'custom' && !t.replayNote);
  const n = scoredTasks.length;
  lines.push(`## AgentReady: ${score}/100 (${level(score)})`, '',
    minScore > 0 ? `**${passed ? 'Passed' : 'Failed'}**: minimum score is ${minScore}.${passed ? '' : ` This site scored ${minScore - score} point${minScore - score === 1 ? '' : 's'} too low.`}` : 'Report only (no minimum score set).',
    '');
  lines.push(`Tested as: ${packSiteLabel(report.pack)}${report.packDetected === true ? ' (detected automatically)' : ''}`, '');
  if (target) lines.push(`Tested: ${clean(target, 300)}${n && n < 4 ? ` (${n} task${n === 1 ? '' : 's'}, score scaled to 100)` : ''}`, '');
  lines.push(`Bot wall: ${BOT[report.botWall] ?? clean(report.botWall)}`, '');
  lines.push('| Task | Result | Steps | Time |', '| --- | --- | --- | --- |');
  for (const t of report.tasks ?? []) {
    lines.push(`| ${clean(t.taskId === 'custom' ? 'Your own task (not in the score)' : TASK_LABELS[t.taskId] ?? t.taskId, 80)} | ${clean(t.status, 20)} | ${Number(t.numSteps) || 0} | ${Math.round(Number(t.seconds) || 0)}s |`);
  }
  const fixes = (report.topFixes ?? []).slice(0, 3);
  lines.push('');
  if (fixes.length) {
    lines.push('### Top fixes', '');
    fixes.forEach((f, i) => {
      lines.push(`${i + 1}. **${clean(f.type, 60)}** (${clean(f.severity, 20)}): ${clean(f.text)}`,
        `   - Fix: ${clean(f.fix)}${f.pointsIfFixed ? ` (+${Number(f.pointsIfFixed) || 0} points)` : ''}`);
    });
  } else lines.push('No fixes needed.');
  lines.push('');
  const cost = Number(report.costRupees);
  lines.push(`<sub>Agent cost about ₹${Number.isFinite(cost) ? cost.toFixed(2) : '?'}${runUrl ? ` · [workflow run](${runUrl})` : ''} · tested with real AI web agents by [AgentReady](https://github.com/Manideep-2007-ok/Agent-Ready)</sub>`);
  return { markdown: lines.join('\n') + '\n', score, passed };
}

function main(argv) {
  const opt = {}; let file = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i]; else file = argv[i];
  }
  if (!file) { console.error('Usage: ci-report.mjs report.json [--min-score N] [--target URL] [--run-url URL] [--comment out.md] [--summary out.md]'); process.exit(2); }
  let report = null; let error = '';
  try { report = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { error = e.code === 'ENOENT' ? 'no report was written' : 'the report could not be read'; }
  if (opt.error) error = opt.error;
  const { markdown, score, passed } = formatReport(report, { minScore: Number(opt['min-score']) || 0, target: opt.target, runUrl: opt['run-url'], error });
  if (opt.comment) writeFileSync(opt.comment, markdown);
  if (opt.summary) appendFileSync(opt.summary, markdown.replace(`${MARKER}\n`, ''));
  if (!opt.comment && !opt.summary) process.stdout.write(markdown);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `score=${score ?? ''}\npassed=${passed}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
