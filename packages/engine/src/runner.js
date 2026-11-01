// Runs agent tasks (one attempt) and whole site tests. Talks to TinyFish only through tinyfish.js.
import { buildGoal, DEFAULT_TASK_ORDER } from './goals.js';
import { enqueue } from './queue.js';
import * as tf from './tinyfish.js';
import { runTaskWithBotWall } from './botwall.js';
import { scoreReport } from './scoring.js';

/** @typedef {import('./types.js').TaskResult} TaskResult */
/** @typedef {import('./types.js').SiteReport} SiteReport */
/** @typedef {import('./types.js').Step} Step */

const BLOCK_RE = /access denied|denied|error page|blocked|captcha|something went wrong|blank|empty page|could not load|not available|\(null\)/i;

/** Did this failed task fail because the site blocked the agent? (not just "could not find the page") */
export function looksBlocked(task) {
  if (task.status === 'passed') return false;
  if (!task.runId) return false; // never started: not the site's fault
  return BLOCK_RE.test(task.blocker || '') || (task.numSteps ?? 0) < 2;
}

/** Turn whatever TinyFish gave us into the answer object, or null. Tries object, result.result, JSON string, {...} substring. */
export function parseAgentAnswer(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try { return parseAgentAnswer(JSON.parse(raw)); } catch { /* try substring */ }
    const a = raw.indexOf('{'), b = raw.lastIndexOf('}');
    if (a === -1 || b <= a) return null;
    const inner = raw.slice(a, b + 1);
    try { return parseAgentAnswer(JSON.parse(inner)); } catch { /* maybe Python style */ }
    try { return parseAgentAnswer(JSON.parse(pythonToJson(inner))); } catch { /* give up */ }
    return null;
  }
  if (typeof raw === 'object') {
    if ('success' in raw) return raw;
    if (raw.result != null) return parseAgentAnswer(raw.result);
  }
  return null;
}

/** The run record can hold Python-style text: {'success': True, 'answer': None}. Best-effort convert to JSON. */
function pythonToJson(text) {
  return text
    .replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null')
    .replace(/(?<=[{[,:]\s*)'|'(?=\s*[:,}\]])/g, '"'); // only quotes next to { [ , : } ] (keeps "couldn't")
}

/** Older recordings have no `answer` key; build a short "key: value; ..." text from the other fields. */
function answerText(a) {
  if (a.answer != null && a.answer !== '') return typeof a.answer === 'string' ? a.answer : JSON.stringify(a.answer);
  const skip = new Set(['success', 'blocker', 'stuck_url', 'steps_taken', 'answer']);
  const parts = Object.entries(a).filter(([k, v]) => !skip.has(k) && v != null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
  return parts.length ? parts.join('; ') : null;
}

const secondsBetween = (a, b) => (a && b ? Math.max(0, (Date.parse(b) - Date.parse(a)) / 1000) : null);

/** Run records -> our Step[]. Web-search flags come from the live PROGRESS events (matched by label, then order). */
function buildSteps(runId, run, progress) {
  const used = new Set();
  // The last record is a "Task completed" marker with no screenshot and no duration: not a real step.
  const isEndMarker = (s) => s.screenshot === null && s.duration == null;
  return (run.steps || []).filter((s) => s.action && !isEndMarker(s)).map((s, i) => {
    let idx = progress.findIndex((p, j) => !used.has(j) && p.purpose === s.action);
    if (idx === -1 && progress[i] && !used.has(i)) idx = i;
    if (idx !== -1) used.add(idx);
    const secs = parseFloat(s.duration);
    return {
      id: s.id, label: s.action, seconds: Number.isFinite(secs) ? secs : null,
      screenshotUrl: `/api/shot/${runId}/${s.id}`,
      usedWebSearch: idx !== -1 ? !!progress[idx].usedWebSearch : false,
      ...(s.timestamp ? { at: s.timestamp } : {}),
    };
  });
}

/**
 * One agent attempt for one task. Goes through the queue. Never throws: problems become a failed TaskResult.
 * @returns {Promise<TaskResult>}
 */
export async function runTask({ url, taskId, customText, mode = 'lite', proxy = 'off' }, onEvent) {
  const emit = (e) => { try { onEvent?.(e); } catch { /* a bad listener must not break the run */ } };
  const goal = buildGoal(taskId, customText);
  /** @type {TaskResult} */
  const task = { taskId, goal, mode, proxy, runId: null, status: 'queued', answer: null, blocker: null, stuckUrl: null,
    streamingUrl: null, steps: [], numSteps: 0, seconds: 0, points: 0, findings: [] };
  const update = (status) => { task.status = status; emit({ kind: 'task-update', task: { ...task, steps: [...task.steps] } }); };

  return enqueue(async () => {
    const t0 = Date.now();
    const progress = []; // live PROGRESS events
    let runId = null, finalEvent = null, run = null;
    try {
      try {
        finalEvent = await tf.startRunSSE({ url, goal, mode, proxy, taskId }, {
          onStarted: (id) => { runId = task.runId = id; },
          onStreamingUrl: (u) => { task.streamingUrl = u; emit({ kind: 'streaming-url', taskId, url: u }); },
          onProgress: (p) => {
            progress.push(p);
            const step = { id: `p${progress.length - 1}`, label: p.purpose, seconds: null, screenshotUrl: '', usedWebSearch: p.usedWebSearch, ...(p.at ? { at: p.at } : {}) };
            task.numSteps = progress.length;
            emit({ kind: 'step', taskId, step });
          },
        });
        runId = finalEvent.runId || runId;
      } catch (err) {
        if (err.code === 'STREAM_DROPPED' && (err.runId || runId)) {
          runId = err.runId || runId;
          console.warn(`[engine] live stream dropped for run ${runId}, polling instead`);
          run = await tf.waitForRun(runId, { intervalMs: 3000 });
        } else if (err.code === 'STREAM_DROPPED') {
          throw new Error('Could not start the agent run');
        } else throw err;
      }
      task.runId = runId;
      if (!run) run = await tf.getRun(runId);

      task.steps = buildSteps(runId, run, progress);
      task.numSteps = Number(run.num_of_steps) || task.steps.length;
      task.seconds = Math.round(secondsBetween(run.started_at, run.finished_at) ?? (Date.now() - t0) / 1000);
      if (!task.streamingUrl && run.streaming_url) task.streamingUrl = run.streaming_url;

      // Prefer the clean COMPLETE event result; the run record may hold a Python-style string.
      const status = finalEvent?.status || run.status;
      const answer = parseAgentAnswer(finalEvent?.result) || parseAgentAnswer(run.result);
      if (status === 'FAILED' || status === 'CANCELLED') {
        task.blocker = (typeof run.error === 'string' ? run.error : run.error?.message) || `The run ended with status ${status}`;
      } else if (!answer) {
        task.blocker = 'Agent returned no structured answer';
      } else {
        task.answer = answerText(answer);
        task.blocker = answer.blocker ? String(answer.blocker) : null;
        task.stuckUrl = answer.stuck_url || null;
        if (answer.success === true) task.status = 'passed'; // COMPLETED alone is not success
        else if (!task.blocker) task.blocker = 'The agent reported it could not complete the task';
      }
    } catch (err) {
      task.runId = runId || task.runId;
      task.blocker = /Could not start/.test(err.message) ? err.message : `Could not run the agent: ${err.message}`;
      task.seconds = task.seconds || Math.round((Date.now() - t0) / 1000);
    }
    if (task.status !== 'passed') task.status = looksBlocked(task) ? 'blocked' : 'failed';
    update(task.status);
    return task;
  }, {
    onQueued: () => update('queued'),
    onStart: () => update('running'),
  });
}

const usedIds = new Set();
function makeReportId(url) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  let label = 'site';
  try { label = new URL(url).hostname.replace(/^www\./, '').split('.')[0].replace(/[^a-z0-9]/gi, '') || 'site'; } catch { /* keep default */ }
  const base = `rep_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}_${label}`;
  let id = base, n = 2;
  while (usedIds.has(id)) id = `${base}_${n++}`; // two tests of one site in the same minute stay distinct
  usedIds.add(id);
  return id;
}

/**
 * Test a whole site: all tasks at once (the queue limits real parallelism), then score.
 * @returns {Promise<SiteReport>}
 */
export async function runSiteTest({ url, tasks = DEFAULT_TASK_ORDER, customText, source = 'web', id } = {}, onEvent) {
  const emit = (e) => { try { onEvent?.(e); } catch { /* ignore */ } };
  const ids = [...tasks];
  if (customText && customText.trim() && !ids.includes('custom')) ids.push('custom');

  // Show every lane as "waiting" straight away.
  for (const taskId of ids) {
    emit({ kind: 'task-update', task: { taskId, goal: buildGoal(taskId, customText), mode: 'lite', proxy: 'off', runId: null, status: 'queued',
      answer: null, blocker: null, stuckUrl: null, streamingUrl: null, steps: [], numSteps: 0, seconds: 0, points: 0, findings: [] } });
  }

  const results = await Promise.all(ids.map(async (taskId) => {
    try {
      return await runTaskWithBotWall({ url, taskId, customText }, onEvent);
    } catch (err) { // one task must never kill the report
      return { taskId, goal: buildGoal(taskId, customText), mode: 'lite', proxy: 'off', runId: null, status: 'failed', answer: null,
        blocker: `Could not run the agent: ${err.message}`, stuckUrl: null, streamingUrl: null, steps: [], numSteps: 0, seconds: 0,
        points: 0, findings: [], attempts: [], verdict: 'none' };
    }
  }));

  /** @type {SiteReport} */
  const report = { id: id || makeReportId(url), url, source, testedAt: new Date().toISOString(), pack: 'shopping', status: 'complete',
    score: 0, botWall: 'none', costRupees: 0, framework: 'unknown', instantScan: null, tasks: results, topFixes: [] };
  Object.assign(report, scoreReport(report));
  emit({ kind: 'report-complete', report });
  return report;
}
