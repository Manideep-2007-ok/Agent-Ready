// Agent-Ready Watch: cron scheduler, compare with last good report, alerts (ARCHITECTURE section 12).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import cron from 'node-cron';
import { runSiteTest, runTaskWithBotWall, scoreReport, TASK_LABELS, DEFAULT_TASK_ORDER } from '@agentready/engine';
import { sendAlert } from './alerts.js';

/** @typedef {import('../../../packages/engine/src/types.js').Watch} Watch */
/** @typedef {import('../../../packages/engine/src/types.js').SiteReport} SiteReport */
/** @typedef {import('../../../packages/engine/src/types.js').TaskResult} TaskResult */

// ---------- storage (teammate's store.js if present, else a local JSON fallback) ----------
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
// AGENTREADY_DATA_DIR lets smoke tests write to a temp folder instead of the real data/ (whose watches get scheduled).
const DATA = process.env.AGENTREADY_DATA_DIR || path.join(ROOT, 'data');

async function atomicWrite(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2));
  await fs.rename(tmp, file);
}
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

// TODO(store.js): remove fallback once Sai Shakti's store.js is on main
const fallbackStore = {
  saveReport: (r) => atomicWrite(path.join(DATA, 'reports', `${r.id}.json`), r),
  getReport: (id) => readJson(path.join(DATA, 'reports', `${id}.json`), null),
  listReports: async () => {
    const files = await fs.readdir(path.join(DATA, 'reports')).catch(() => []);
    return Promise.all(files.filter((f) => f.endsWith('.json')).map((f) => readJson(path.join(DATA, 'reports', f), null)));
  },
  saveWatch: async (w) => {
    const all = await readJson(path.join(DATA, 'watch', 'watches.json'), []);
    const i = all.findIndex((x) => x.id === w.id);
    if (i >= 0) all[i] = w; else all.push(w);
    await atomicWrite(path.join(DATA, 'watch', 'watches.json'), all);
  },
  listWatches: () => readJson(path.join(DATA, 'watch', 'watches.json'), []),
  appendWatchHistory: async (watchId, reportId) => {
    const file = path.join(DATA, 'watch', `${watchId}.json`);
    const ids = await readJson(file, []);
    ids.push(reportId);
    await atomicWrite(file, ids);
  },
  getWatchHistory: (watchId) => readJson(path.join(DATA, 'watch', `${watchId}.json`), []),
};

let storePromise;
function getStore() {
  storePromise ??= import('./store.js').then((m) => ({ ...fallbackStore, ...m })).catch(() => fallbackStore);
  return storePromise;
}

// ---------- live events (events.js if present; index.js may inject its own) ----------
// TODO(events.js): remove fallback once Akhil's events.js is on main
let publisher = null;
export function setPublisher(fn) { publisher = fn; }
async function publish(event) {
  try {
    if (publisher) return publisher(event);
    const m = await import('./events.js').catch(() => null);
    if (m?.publish) return m.publish(event);
    console.log('[events] (no events.js)', event.type);
  } catch (err) {
    console.warn('[events] publish failed:', err?.message);
  }
}

// ---------- compare + messages (pure) ----------
const band = (n) => (n <= 5 ? 0 : n <= 10 ? 1 : 2);
const passed = (t) => t?.status === 'passed';
const SEVERE = new Set(['high', 'critical']);
const WALL_RANK = { none: 0, 'blocks-cloud-agents': 1, 'blocks-automation': 2, 'site-broken': 3 };
const wallRank = (v) => WALL_RANK[v || 'none'] ?? 0;

/**
 * Compare a new report with the last good one.
 * @param {SiteReport|null} lastGood
 * @param {SiteReport} current
 * @returns {{alertWorthy:boolean, failingTasks:string[], reasons:string[]}}
 */
export function compareReports(lastGood, current) {
  const failing = new Set();
  const reasons = [];
  const prev = new Map((lastGood?.tasks ?? []).map((t) => [t.taskId, t]));

  for (const t of current.tasks) {
    const p = prev.get(t.taskId);
    if (!lastGood) {
      if (!passed(t)) { failing.add(t.taskId); reasons.push(`${t.taskId} failed (no earlier good report)`); }
      continue;
    }
    if (passed(p) && !passed(t)) { failing.add(t.taskId); reasons.push(`${t.taskId} went from pass to fail`); }
    else if (passed(p) && passed(t) && band(t.numSteps) > band(p.numSteps)) {
      failing.add(t.taskId); reasons.push(`${t.taskId} needs more steps (${p.numSteps} -> ${t.numSteps})`);
    }
    const oldTypes = new Set((p?.findings ?? []).map((f) => f.type));
    for (const f of t.findings ?? []) {
      if (SEVERE.has(f.severity) && !oldTypes.has(f.type)) { failing.add(t.taskId); reasons.push(`new ${f.severity} finding: ${f.type}`); }
    }
  }
  // Only a WORSE bot wall is news; a wall that went away is good news.
  if (lastGood && wallRank(current.botWall) > wallRank(lastGood.botWall)) {
    reasons.push(`bot wall changed: ${lastGood.botWall} -> ${current.botWall}`);
    const bad = current.tasks.filter((t) => !passed(t));
    for (const t of bad.length ? bad : current.tasks) failing.add(t.taskId);
  }
  return { alertWorthy: failing.size > 0, failingTasks: [...failing], reasons };
}

// 24-hour India time, e.g. "22:00".
const hhmm = (iso) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Kolkata' });
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const hostOf = (url) => { try { return new URL(url).host; } catch { return url; } };
const dashLink = (reportId) =>
  `${process.env.PUBLIC_DASHBOARD_URL || process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 4000}`}/#/test/${reportId}`;

/**
 * @param {{watch:Watch, lastGood:SiteReport|null, current:SiteReport, task:TaskResult}} a
 */
export function formatAlert({ watch, lastGood, current, task }) {
  const label = lowerFirst(TASK_LABELS[task.taskId] ?? task.taskId);
  const good = lastGood?.tasks.find((t) => t.taskId === task.taskId);
  const lastGoodText = lastGood ? `${hhmm(lastGood.testedAt)} (${good?.numSteps ?? '?'} steps)` : 'never';
  let now = task.blocker || 'the task did not finish';
  if (passed(task) && task.verdict === 'blocks-automation') now = 'bot protection blocks automated browsers (it only worked in stealth mode)';
  else if (passed(task) && wallRank(task.verdict) > 0) now = 'bot protection blocks AI agents from cloud servers (it only worked through a home-network proxy)';
  else if (passed(task)) now = `it takes ${task.numSteps} steps (was ${good?.numSteps ?? '?'})`;
  now = String(now).trim().replace(/[.\s]+$/, ''); // the message adds its own full stop
  if (now.length > 220) now = now.slice(0, 217).trimEnd() + '…'; // keep chat alerts short (Discord max 2000)
  return `🔴 AgentReady: AI shoppers can't ${label} on ${hostOf(watch.url)} since ${hhmm(current.testedAt)}. ` +
    `Last good: ${lastGoodText}. Now: ${now}. Report: ${dashLink(current.id)}`;
}

/** @param {{watch:Watch, current:SiteReport, taskIds?:string[]}} a */
export function formatRecovery({ watch, current, taskIds }) {
  const ids = taskIds?.length ? taskIds : watch.tasks;
  const label = ids.map((id) => TASK_LABELS[id] ?? id).join(', ');
  return `🟢 AgentReady: ${label} on ${hostOf(watch.url)} works again (${hhmm(current.testedAt)}).`;
}

// ---------- watch CRUD ----------
export async function listWatches() { return (await getStore()).listWatches(); }
export async function getWatch(id) { return (await listWatches()).find((w) => w.id === id) ?? null; }
export async function getHistory(id) {
  const store = await getStore();
  const ids = await store.getWatchHistory(id);
  const reports = await Promise.all([...ids].reverse().map((rid) => store.getReport(rid)));
  return reports.filter(Boolean);
}

export async function createWatch({ url, everyMinutes = 20, tasks = DEFAULT_TASK_ORDER }) {
  /** @type {Watch} */
  const watch = {
    id: 'w_' + crypto.randomBytes(4).toString('hex'),
    url, tasks, everyMinutes, enabled: true,
    createdAt: new Date().toISOString(), lastGoodReportId: null, failing: false,
  };
  await (await getStore()).saveWatch(watch);
  schedule(watch);
  return watch;
}

export async function updateWatch(id, patch) {
  const watch = await getWatch(id);
  if (!watch) return null;
  if (typeof patch.enabled === 'boolean') watch.enabled = patch.enabled;
  if (patch.everyMinutes != null) watch.everyMinutes = patch.everyMinutes;
  await (await getStore()).saveWatch(watch);
  schedule(watch);
  return watch;
}

// ---------- scheduler ----------
const jobs = new Map();   // watchId -> cron task
const running = new Set(); // watchIds with a check in progress
const failingTaskIds = new Map(); // watchId -> taskIds in the last alert (for the recovery text)

export function cronExpression(everyMinutes) {
  const m = Math.max(1, Math.round(everyMinutes));
  if (m < 60) return `*/${m} * * * *`;
  const h = Math.round(m / 60);
  return h >= 24 ? '0 0 * * *' : `0 */${h} * * *`;
}

function schedule(watch) {
  jobs.get(watch.id)?.stop();
  jobs.delete(watch.id);
  if (!watch.enabled) return;
  const task = cron.schedule(cronExpression(watch.everyMinutes), async () => {
    try {
      const fresh = await getWatch(watch.id);
      if (fresh?.enabled) await runCheck(fresh);
    } catch (e) {
      console.warn('[watch] check failed:', e?.message);
    }
  });
  jobs.set(watch.id, task);
}

export async function startWatches() {
  const all = await listWatches();
  for (const w of all) schedule(w);
  console.log(`[watch] scheduled ${jobs.size} watch(es)`);
}

// ---------- webhook waiters (optional background mode) ----------
const waiters = new Map(); // runId -> resolve
export function waitForWebhook(runId, timeoutMs = 10 * 60 * 1000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { waiters.delete(runId); resolve(null); }, timeoutMs);
    waiters.set(runId, (body) => { clearTimeout(timer); waiters.delete(runId); resolve(body); });
  });
}
export function resolveWebhook(body) {
  const fn = waiters.get(body?.run_id);
  if (fn) fn(body);
  return Boolean(fn);
}

// ---------- the check ----------
export function isRunning(watchId) { return running.has(watchId); }

/**
 * Run one check for a watch. Returns the saved report, or null if one is already running.
 * @param {Watch} watch
 * @param {{reportId?:string}} [opts]
 */
export async function runCheck(watch, { reportId } = {}) {
  if (running.has(watch.id)) return null;
  running.add(watch.id);
  try {
    const store = await getStore();
    // Save a "running" report first so the dashboard can open it (and its live lanes) during the check.
    const id = reportId || `rep_${new Date().toISOString().replace(/\D/g, '').slice(0, 12)}_w${Math.random().toString(36).slice(2, 6)}`;
    const live = { id, url: watch.url, source: 'watch', testedAt: new Date().toISOString(), pack: 'shopping', status: 'running',
      score: 0, botWall: 'none', costRupees: 0, framework: 'unknown', instantScan: null, tasks: [], topFixes: [] };
    await store.saveReport(live);
    // Forward engine events to dashboard subscribers of this report (same LiveEvent shape as normal tests).
    const onEvent = (e) => {
      if (e.kind === 'task-update') publish({ type: 'task-update', reportId: id, task: e.task });
      else if (e.kind === 'step') publish({ type: 'step', reportId: id, taskId: e.taskId, step: e.step });
      else if (e.kind === 'streaming-url') publish({ type: 'streaming-url', reportId: id, taskId: e.taskId, url: e.url });
    };
    const report = await runSiteTest({ url: watch.url, tasks: watch.tasks, source: 'watch', id }, onEvent);
    publish({ type: 'report-complete', reportId: id, report });
    await store.saveReport(report);
    await store.appendWatchHistory(watch.id, report.id);

    const lastGood = watch.lastGoodReportId ? await store.getReport(watch.lastGoodReportId) : null;
    const cmp = compareReports(lastGood, report);
    let confirmed = [];

    // Already alerted and still not all passing: nothing new to say, so skip the confirming re-run (saves credits).
    if (cmp.alertWorthy && !watch.failing) {
      // Agents vary (D15): re-run only the suspect tasks once, alert only if they still look bad.
      for (const id of cmp.failingTasks) {
        const retry = await runTaskWithBotWall({ url: watch.url, taskId: id }, () => {});
        const prev = lastGood?.tasks.find((t) => t.taskId === id);
        const stillBad = !passed(retry) ||
          (passed(prev) && band(retry.numSteps) > band(prev.numSteps)) ||
          (lastGood && wallRank(retry.verdict) > wallRank(prev?.verdict));
        const i = report.tasks.findIndex((t) => t.taskId === id);
        report.tasks[i] = retry; // keep the latest evidence in the report
        if (stillBad) confirmed.push(retry);
      }
      // The re-run replaced tasks, so score, bot wall, cost and top fixes must be worked out again.
      // scoreReport also rewrites points + findings inside every task.
      Object.assign(report, scoreReport(report));
      await store.saveReport(report);
    }

    const allPassed = report.tasks.every(passed);
    const fresh = (await getWatch(watch.id)) ?? watch;

    if (confirmed.length && !fresh.failing) {
      const message = formatAlert({ watch: fresh, lastGood, current: report, task: confirmed[0] });
      fresh.failing = true;
      failingTaskIds.set(fresh.id, confirmed.map((t) => t.taskId));
      await store.saveWatch(fresh);
      await sendAlert(message);
      await publish({ type: 'watch-alert', watchId: fresh.id, message, lastGood, current: report });
    } else if (allPassed) {
      const wasFailing = fresh.failing;
      fresh.lastGoodReportId = report.id;
      fresh.failing = false;
      await store.saveWatch(fresh);
      if (wasFailing) {
        const message = formatRecovery({ watch: fresh, current: report, taskIds: failingTaskIds.get(fresh.id) });
        failingTaskIds.delete(fresh.id);
        await sendAlert(message);
        await publish({ type: 'watch-recovered', watchId: fresh.id, message, current: report });
      }
    }
    return report;
  } finally {
    running.delete(watch.id);
  }
}
