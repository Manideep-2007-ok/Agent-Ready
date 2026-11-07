// Runs agent tasks (one attempt) and whole site tests. Talks to TinyFish only through tinyfish.js.
import { buildGoal, defaultTasksFor, normalisePack, packForTasks, SHOP_TASKS } from './goals.js';
import { enqueue, QueueCancelled } from './queue.js';
import { createRunContext } from './runContext.js';
import { config } from './config.js';
import * as tf from './tinyfish.js';
import { runTaskWithBotWall } from './botwall.js';
import { scoreReport, RUPEES_PER_STEP } from './scoring.js';
import { confirmTask } from './confirm.js';
import { checkClaims } from './claims.js';

/** @typedef {import('./types.js').TaskResult} TaskResult */
/** @typedef {import('./types.js').SiteReport} SiteReport */
/** @typedef {import('./types.js').Step} Step */

const BLOCK_RE = /access denied|denied|error page|blocked|captcha|something went wrong|blank|empty page|could not load|not available|\(null\)|\b403\b|forbidden/i;
/** The agent's own words say the site refused it (P2-7, live runs 7 Nov). */
export const REFUSED_RE = /\b403\b|forbidden|access denied/i;

/** A "pass" whose answer says the site refused the agent: the answer came from somewhere else (web search), not the site (D13). */
export function saysRefused(task) {
  return task.status === 'passed' && REFUSED_RE.test(task.answer || '');
}

/** Did this failed task fail because the site blocked the agent? (not just "could not find the page") */
export function looksBlocked(task) {
  if (task.status === 'passed' || task.status === 'cancelled') return false; // a stopped run is never "blocked"
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

/** Written on a custom task in replay mode: the recording is of one of our own tasks, not the user's. */
export const REPLAY_CUSTOM_NOTE = 'Replay: this answer is from a recorded run, not your custom task. Custom tasks need live agents.';
/** Written on a pack task in replay mode: recordings exist only for the four shop tasks. Nothing is run and nothing is scored. */
export const REPLAY_PACK_NOTE = 'Replay: there is no recording for this task, so it was not run. Tasks for SaaS, blog and local sites need live agents.';
const STOPPED_TEXT = 'The test was stopped before this task finished.';
const BUDGET_TEXT = 'The test reached its cost limit and was stopped before this task finished.';
const stopText = (ctx) => (ctx?.reason === 'run-cancelled' ? 'The agent run was cancelled.' : ctx?.reason === 'budget' ? BUDGET_TEXT : STOPPED_TEXT);

/**
 * One agent attempt for one task. Goes through the queue. `emitFinal:false` suppresses the closing task-update (the caller emits it).
 * Never throws: problems become a failed TaskResult; a stopped test becomes a 'cancelled' one.
 * `ctx` (RunContext) is the test's cancel switch; when it is cancelled nothing new starts and live streams are aborted.
 * @returns {Promise<TaskResult>}
 */
export async function runTask({ url, taskId, customText, mode = 'lite', proxy = 'off', emitFinal = true, attempts = null }, onEvent, ctx = null) {
  const emit = (e) => { try { onEvent?.(e); } catch { /* a bad listener must not break the run */ } };
  const goal = buildGoal(taskId, customText);
  /** @type {TaskResult} */
  const task = { taskId, goal, mode, proxy, runId: null, status: 'queued', answer: null, blocker: null, stuckUrl: null,
    streamingUrl: null, steps: [], numSteps: 0, seconds: 0, points: 0, findings: [] };
  // Retry attempts (bot-wall cascade) carry the earlier attempts so the lane can say why a retry is running.
  if (attempts?.length) task.attempts = [...attempts];
  const update = (status) => { task.status = status; emit({ kind: 'task-update', task: { ...task, steps: [...task.steps] } }); };
  const stopped = () => {
    task.status = 'cancelled';
    task.blocker = stopText(ctx);
    task.answer = null;
    if (emitFinal) update('cancelled');
    return task;
  };

  // After a stop, TinyFish's own step count is the billed one (the live PROGRESS count can be higher: a run cancelled
  // 5 s in showed 1 step but TinyFish recorded 0 and billed nothing). Best effort: any problem keeps the live count.
  // Runs after the queue slot is given back (the run is already cancelled, so another test's task need not wait on this
  // bookkeeping) and is bounded: at most 8 s for the cancel calls, then 5 s to read the record.
  const settleCost = async (runId) => {
    if (!runId || config.mock) return; // replay has no billing truth
    try {
      await Promise.race([ctx?.cancelDone, new Promise((r) => setTimeout(r, 8000).unref?.())]);
      const run = await tf.getRun(runId, { signal: AbortSignal.timeout(5000) });
      const n = run?.num_of_steps;
      if (n == null || !Number.isFinite(Number(n)) || Number(n) === task.numSteps) return;
      task.numSteps = Number(n);
      if (emitFinal) update('cancelled');
    } catch { /* keep the live count */ }
  };
  let settleRunId = null; // set when a stop interrupted a run that TinyFish may have billed

  if (ctx?.cancelled) return stopped(); // a cancelled test never starts anything new

  // Replay mode only has recordings of the shop tasks (and the custom task shows a note, below). A task from another
  // pack would replay an unrelated shop run, so nothing is run: no steps, no points, a clear note (D35, D40).
  if (config.mock && taskId !== 'custom' && !SHOP_TASKS.includes(taskId)) {
    task.status = 'failed';
    task.replayNote = REPLAY_PACK_NOTE;
    if (emitFinal) update('failed');
    return task;
  }

  try {
    const result = await enqueue(async () => {
      if (ctx?.cancelled) return stopped(); // cancelled while this task was being handed a slot
      const t0 = Date.now();
      const progress = []; // live PROGRESS events
      let runId = null, finalEvent = null, run = null;
      try {
        try {
          finalEvent = await tf.startRunSSE({ url, goal, mode, proxy, taskId }, {
            signal: ctx?.signal,
            onStarted: (id) => { runId = task.runId = id; ctx?.trackRun(id); if (!ctx?.cancelled) update('running'); }, // publish the runId now, not only when the task ends
            onStreamingUrl: (u) => { task.streamingUrl = u; emit({ kind: 'streaming-url', taskId, runId: task.runId, url: u }); },
            onProgress: (p) => {
              progress.push(p);
              const step = { id: `p${progress.length - 1}`, label: p.purpose, seconds: null, screenshotUrl: '', usedWebSearch: p.usedWebSearch, ...(p.at ? { at: p.at } : {}) };
              task.numSteps = progress.length;
              ctx?.spend?.(1);
              emit({ kind: 'step', taskId, step });
            },
          });
          runId = finalEvent.runId || runId;
          if (ctx?.cancelled) throw Object.assign(new Error('aborted'), { name: 'AbortError' }); // stopped while the stream was finishing
        } catch (err) {
          if (ctx?.cancelled || err.name === 'AbortError') throw err; // stopped on purpose: do not poll, handled below
          if (err.code === 'STREAM_DROPPED' && (err.runId || runId)) {
            runId = err.runId || runId;
            ctx?.trackRun(runId);
            console.warn(`[engine] live stream dropped for run ${runId}, polling instead`);
            run = await tf.waitForRun(runId, { intervalMs: config.pollIntervalMs, signal: ctx?.signal });
          } else if (err.code === 'STREAM_DROPPED') {
            throw new Error('Could not start the agent run');
          } else throw err;
        }
        task.runId = runId;
        if (!run) run = await tf.getRun(runId, { signal: ctx?.signal });

        task.steps = buildSteps(runId, run, progress);
        task.numSteps = Number(run.num_of_steps) || task.steps.length;
        task.seconds = Math.round(secondsBetween(run.started_at, run.finished_at) ?? (Date.now() - t0) / 1000);
        if (!task.streamingUrl && run.streaming_url) task.streamingUrl = run.streaming_url;

        // Prefer the clean COMPLETE event result; the run record may hold a Python-style string.
        const status = finalEvent?.status || run.status;
        const answer = parseAgentAnswer(finalEvent?.result) || parseAgentAnswer(run.result);
        if (status === 'CANCELLED') {
          // CANCELLED is final. Someone stopped this run outside AgentReady (e.g. on TinyFish), so the whole test stops:
          // no bot-wall retry and nothing else starts. (A cancel from our own Stop button is handled in the catch below.)
          ctx?.untrackRun(runId);
          if (ctx && !ctx.cancelled) ctx.cancel('run-cancelled', { skipRunIds: [runId] }).catch(() => {});
          task.status = 'cancelled';
          task.blocker = 'The agent run was cancelled.';
        } else if (status === 'FAILED') {
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
        task.seconds = task.seconds || Math.round((Date.now() - t0) / 1000);
        if (ctx?.cancelled || err.name === 'AbortError') {
          task.numSteps = progress.length || task.numSteps;
          // Keep what the agent had done so far (live steps have no screenshots yet).
          task.steps = progress.map((p, i) => ({ id: `p${i}`, label: p.purpose, seconds: null, screenshotUrl: '', usedWebSearch: p.usedWebSearch, ...(p.at ? { at: p.at } : {}) }));
          stopped();
          // The lane shows "stopped" at once, also inside the bot-wall cascade (emitFinal:false), whose closing update
          // only comes after the cost is settled below.
          if (!emitFinal) update('cancelled');
          settleRunId = task.runId; // cost = what TinyFish billed, not our live count (read after the slot is free)
          return task;
        }
        task.blocker = /Could not start|did not answer in time/.test(err.message) ? err.message : `Could not run the agent: ${err.message}`;
      } finally {
        ctx?.untrackRun(runId);
      }
      if (task.status !== 'passed' && task.status !== 'cancelled') task.status = looksBlocked(task) ? 'blocked' : 'failed';
      // Replay mode plays back a recording of OUR tasks. A user's own task was never run, so say so instead of
      // showing an unrelated recorded answer as if it were the result.
      if (config.mock && taskId === 'custom') {
        task.answer = null;
        task.blocker = null;
        task.replayNote = REPLAY_CUSTOM_NOTE;
      }
      if (emitFinal) update(task.status); // runTaskWithBotWall passes emitFinal:false and emits the one complete update itself
      return task;
    }, {
      onQueued: () => update('queued'),
      onStart: () => update('running'),
      priority: ctx?.priority, group: ctx?.id, source: ctx?.source,
    });
    if (settleRunId) await settleCost(settleRunId);
    return result;
  } catch (err) {
    if (err instanceof QueueCancelled || err?.code === 'QUEUE_CANCELLED') return stopped(); // dropped from the queue by a cancel
    throw err;
  }
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
export async function runSiteTest({ url, tasks, pack, customText, source = 'web', id, ctx: givenCtx, confirm = false, budgetRupees } = {}, onEvent) {
  // `pack` names the kind of site (shop, saas, content, local); `tasks` may come from any pack. No tasks: the pack's four.
  // No pack: the pack the tasks belong to. Neither: shop, as before packs existed.
  const packId = normalisePack(pack) ?? (tasks?.length ? packForTasks(tasks) : 'shop');
  tasks = tasks ?? defaultTasksFor(packId);
  // The test's cancel switch. cancelReport(id) finds it by id. A caller that wants to share one switch with extra
  // runs of its own (Watch's confirming re-run) passes `ctx` and releases it itself.
  const reportId = id || givenCtx?.id || makeReportId(url);
  const ctx = givenCtx ?? createRunContext({ id: reportId, source });
  // Cost limit (D43): rupees -> agent steps. 0 or none = no limit.
  const budget = budgetRupees ?? config.budgetPerTestRupees;
  if (budget > 0 && ctx.maxSteps == null) ctx.maxSteps = Math.max(1, Math.floor(budget / RUPEES_PER_STEP));
  try {
    return await runSiteTestInner({ url, tasks, customText, source, reportId, ctx, packId, confirm: !!confirm, budget }, onEvent);
  } finally {
    if (!givenCtx) ctx.release();
  }
}

async function runSiteTestInner({ url, tasks, customText, source, reportId, ctx, packId, confirm, budget }, onEvent) {
  // Drop a task-update that exactly repeats the previous one of the same lane (e.g. the initial 'queued' and the queue's own
  // 'queued'). The key covers more than status, so an update whose content changed (new run, steps, attempts, verdict) still goes out.
  const lastKey = new Map();
  const emit = (e) => {
    if (e.kind === 'task-update') {
      const t = e.task;
      const key = [t.status, t.runId, t.streamingUrl, t.numSteps, t.steps?.length, t.attempts?.length, t.mode, t.proxy, t.verdict, t.blocker, t.confirming?.run, t.runs?.length].join('|');
      if (lastKey.get(t.taskId) === key) return;
      lastKey.set(t.taskId, key);
    }
    try { onEvent?.(e); } catch { /* ignore */ }
  };
  const ids = [...tasks];
  if (customText && customText.trim() && !ids.includes('custom')) ids.push('custom');

  // Show every lane as "waiting" straight away.
  for (const taskId of ids) {
    emit({ kind: 'task-update', task: { taskId, goal: buildGoal(taskId, customText), mode: 'lite', proxy: 'off', runId: null, status: 'queued',
      answer: null, blocker: null, stuckUrl: null, streamingUrl: null, steps: [], numSteps: 0, seconds: 0, points: 0, findings: [] } });
  }

  const results = await Promise.all(ids.map(async (taskId) => {
    try {
      const first = await runTaskWithBotWall({ url, taskId, customText }, emit, ctx);
      return confirm ? await confirmTask(first, { url, customText }, emit, ctx) : first;
    } catch (err) { // one task must never kill the report
      return { taskId, goal: buildGoal(taskId, customText), mode: 'lite', proxy: 'off', runId: null, status: 'failed', answer: null,
        blocker: `Could not run the agent: ${err.message}`, stuckUrl: null, streamingUrl: null, steps: [], numSteps: 0, seconds: 0,
        points: 0, findings: [], attempts: [], verdict: 'none' };
    }
  }));

  // Claim checks read the pages the agents named (free Fetch); a stopped test is not checked.
  if (!ctx.cancelled) await checkClaims(results, url).catch(() => {});

  /** @type {SiteReport} */
  const report = { id: reportId, url, source, testedAt: new Date().toISOString(), pack: packId, status: ctx.cancelled ? 'cancelled' : 'complete',
    score: 0, botWall: 'none', costRupees: 0, framework: 'unknown', instantScan: null, tasks: results, topFixes: [],
    ...(customText?.trim() ? { customText: customText.trim() } : {}),
    ...(confirm ? { confirm: true } : {}),
    ...(budget > 0 ? { budgetRupees: budget } : {}),
    ...(ctx.cancelled ? { stopReason: ctx.reason === 'budget' ? 'budget' : 'user' } : {}) };
  Object.assign(report, scoreReport(report));
  // A stopped test has no score: half a test says nothing about the site. The cost of the steps already taken still counts.
  if (ctx.cancelled) { report.score = 0; report.botWall = 'none'; report.topFixes = []; }
  emit({ kind: 'report-complete', report });
  return report;
}
