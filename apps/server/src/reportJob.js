// Starts a site test in the background and turns engine events into dashboard (SSE) events.
// Shared by POST /api/tests and Race Mode, so both behave the same.
import { defaultTasksFor, normalisePack, packForTasks } from '@agentready/engine/goals';
import { config } from './config.js';
import * as store from './store.js';
import { logEvent, safeUrl } from './log.js';
import { httpError } from './validate.js';
import { assertDailyBudget, recordSpend, limits } from './budget.js';

/** @typedef {import('@agentready/engine/types').SiteReport} SiteReport */

/**
 * Top 3 (D25): task findings plus Instant Scan findings, ranked by the engine (severity, then pointsIfFixed,
 * one per finding type). Scan findings score 0 points, so they rank after point-scoring findings of the same severity.
 * @param {SiteReport} report
 * @param {{rankFixes:Function}} engine
 */
export function rankTopFixes(report, engine) {
  return engine.rankFixes([...report.tasks.flatMap((t) => t.findings ?? []), ...(report.scanFindings ?? [])]);
}

// Tests this server process is still working on (agents running, or the Instant Scan still finishing), plus starts
// that passed the limit check but have no id yet. The cancel route uses it to tell "still finishing" from "orphaned
// by a restart"; the limit counts both so a burst of requests cannot slip past it.
const activeJobs = new Set();
let pendingStarts = 0;
/** Is this report still being worked on by this process? */
export const isJobActive = (id) => activeJobs.has(id);

// Tests with pack 'auto' wait for the Instant Scan before any agent starts. No engine cancel switch exists yet at that
// point, so Stop is handled here: it ends the wait and the test becomes 'cancelled' with nothing spent on agents.
const detecting = new Map(); // report id -> function that ends the wait
/** Stop a test that is still detecting its pack. @returns {boolean} true when there was one */
export function cancelDetection(id) {
  const stop = detecting.get(id);
  if (!stop) return false;
  detecting.delete(id);
  stop();
  return true;
}

const slug = (url) => new URL(url).hostname.replace(/^www\./, '').split('.')[0].replace(/[^\w]/g, '') || 'site';
const pad = (n) => String(n).padStart(2, '0');

/** e.g. rep_20261101_1210_nykaa, with -2, -3 ... if that minute and site were already used. */
async function newReportId(url) {
  const now = new Date();
  const base = `rep_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}_${slug(url)}`;
  let id = base;
  for (let n = 2; await store.reportExists(id); n += 1) id = `${base}-${n}`;
  return id;
}

/**
 * `pack`: a pack id, or 'auto' = the Instant Scan decides which pack fits (live mode only; replay mode has shop recordings
 * only, so auto means shop there). Explicit `tasks` win over everything and name the pack too. Neither: shop.
 * `confirm`: run each task again (and a third time when the two disagree) so the result rests on a majority (D41).
 * @param {{url:string, tasks?:string[], pack?:string, customText?:string, source?:string, instantScan?:boolean, confirm?:boolean}} request
 * @param {{engine:any, events:{publish:Function}}} deps
 * @returns {Promise<string>} the new report id (the test keeps running after this returns)
 */
export async function startReport(request, { engine, events }) {
  const { url, customText, source = 'web', instantScan = true, confirm = false } = request;
  // Every running test can spend agent steps; refuse a flood instead of queueing without limit.
  const limit = Number(process.env.MAX_ACTIVE_TESTS) > 0 ? Number(process.env.MAX_ACTIVE_TESTS) : 6;
  const busy = new Set([...(engine.activeReportIds?.() ?? []), ...activeJobs]).size + pendingStarts;
  if (busy >= limit) {
    throw httpError(429, `${limit} tests are already running. Please wait for one to finish (or stop one) and try again.`);
  }
  await assertDailyBudget({ mock: config.mock });
  pendingStarts++; // held until the report has an id and is in activeJobs
  const explicitTasks = request.tasks?.filter((t) => t !== 'custom');
  // Auto-detect needs the scan before the agents start, so it only applies when nothing else names the pack or the tasks.
  const detectPack = request.pack === 'auto' && !explicitTasks?.length && instantScan && !config.mock;
  const pack = normalisePack(request.pack) ?? (explicitTasks?.length ? packForTasks(explicitTasks) : 'shop');
  let report;
  try {
    report = await createRunningReport({ ...request, pack, detectingPack: detectPack, confirm });
    activeJobs.add(report.id);
  } finally {
    pendingStarts--;
  }
  const tasks = explicitTasks?.length ? explicitTasks : detectPack ? null : defaultTasksFor(pack);
  logEvent('test.start', { id: report.id, host: safeUrl(url), source, pack: detectPack ? 'auto' : pack, tasks: (tasks?.length ?? 4) + (customText ? 1 : 0) });

  // Not awaited: the dashboard gets the id now and follows progress over SSE.
  runInBackground(report, { tasks, customText, instantScan, confirm }, { engine, events })
    .catch((err) => {
      logEvent('test.error', { id: report.id, message: err?.message || String(err) });
      console.error(`[${report.id}] test crashed:`, err);
    })
    .finally(() => activeJobs.delete(report.id));
  return report.id;
}

/** Save the "running" report the dashboard opens while the agents work. */
async function createRunningReport({ url, source = 'web', pack = 'shop', customText, detectingPack = false, confirm = false }) {
  /** @type {SiteReport} */
  const report = {
    id: await newReportId(url),
    url,
    source,
    testedAt: new Date().toISOString(),
    pack,
    ...(detectingPack ? { detectingPack: true } : {}),
    ...(customText ? { customText } : {}),
    ...(confirm ? { confirm: true } : {}),
    ...(limits().perTestRupees ? { budgetRupees: limits().perTestRupees } : {}),
    status: 'running',
    score: 0,
    botWall: 'none',
    costRupees: 0,
    framework: 'unknown',
    instantScan: null,
    tasks: [],
    topFixes: [],
  };
  await store.saveReport(report);
  return report;
}

async function runInBackground(report, { tasks, customText, instantScan, confirm }, { engine, events }) {
  // tasks === null: the pack is still to be detected from the Instant Scan (below).
  const reportId = report.id;
  const startedAt = Date.now();
  const save = () => store.saveReport(report).catch((err) => console.error(`[${reportId}] save failed:`, err));

  const findTask = (taskId) => report.tasks.find((t) => t.taskId === taskId);

  // While running, keep the longer step list so a task-update never drops saved steps. Once finished, the
  // task's own list wins: those are the real run steps with screenshots (live progress steps have none).
  const upsertTask = (task) => {
    const at = report.tasks.findIndex((t) => t.taskId === task.taskId);
    if (at === -1) return report.tasks.push(task);
    const previous = report.tasks[at];
    // 'cancelled' is not listed on purpose: a stopped task keeps the longer live step list (it has no run record).
    const finished = ['passed', 'failed', 'blocked'].includes(task.status);
    const steps = finished || task.steps?.length >= previous.steps.length ? task.steps : previous.steps;
    report.tasks[at] = { ...task, steps, streamingUrl: task.streamingUrl ?? previous.streamingUrl };
  };

  // Engine events -> LiveEvents (shapes in types.js). 'attempt' events are engine-internal.
  // Steps are saved as they arrive, so a page refreshed mid-run replays them.
  const onEvent = (e) => {
    if (e.kind === 'task-update') {
      upsertTask(e.task);
      save();
      events.publish({ type: 'task-update', reportId, task: e.task });
    } else if (e.kind === 'step') {
      const task = findTask(e.taskId);
      if (task && !task.steps.some((s) => s.id === e.step.id)) {
        task.steps = [...task.steps, e.step];
        task.numSteps = task.steps.length;
        save();
      }
      events.publish({ type: 'step', reportId, taskId: e.taskId, step: e.step });
    } else if (e.kind === 'streaming-url') {
      const task = findTask(e.taskId);
      if (task) task.streamingUrl = e.url;
      events.publish({ type: 'streaming-url', reportId, taskId: e.taskId, url: e.url });
    }
  };

  // Price and product-data findings are shop-only, so the scan findings depend on the pack (D40).
  const applyScanFindings = () => {
    report.scanFindings = engine.instantScanFindings?.(report.instantScan, report.pack) ?? [];
    // A stopped test keeps no Top fixes (D29), even when its scan finishes after the stop.
    if (report.status !== 'cancelled') report.topFixes = rankTopFixes(report, engine);
  };
  const scan = instantScan
    ? engine
        .instantScan(report.url)
        .then((result) => {
          report.instantScan = result;
          applyScanFindings();
          save();
          events.publish({ type: 'instant-scan', reportId, scan: result });
          return result;
        })
        .catch((err) => { console.error(`[${reportId}] instant scan failed:`, err.message); return null; })
    : Promise.resolve(null);

  // pack 'auto': wait for the scan, then pick the pack that fits (shop when the scan read nothing), tell the dashboard.
  if (!tasks) {
    let stop;
    const stopped = new Promise((resolve) => { stop = () => resolve('stopped'); });
    detecting.set(reportId, stop);
    const scanned = await Promise.race([scan, stopped]).finally(() => detecting.delete(reportId));
    if (scanned === 'stopped') {
      delete report.detectingPack;
      Object.assign(report, { status: 'cancelled', score: 0, topFixes: [], tasks: [] });
      await save();
      events.publish({ type: 'report-complete', reportId, report });
      logEvent('test.cancelled', { id: reportId, status: 'cancelled', score: 0, costRupees: 0, seconds: Math.round((Date.now() - startedAt) / 1000), botWall: 'none' });
      return;
    }
    const { pack, detected } = engine.autoPack(scanned);
    report.pack = pack;
    report.packDetected = detected;
    delete report.detectingPack;
    tasks = defaultTasksFor(pack);
    if (report.instantScan) applyScanFindings();
    await save();
    events.publish({ type: 'pack-detected', reportId, pack, detected });
    logEvent('test.pack', { id: reportId, pack, detected });
  }

  let result;
  try {
    result = await engine.runSiteTest({ id: reportId, url: report.url, tasks, pack: report.pack, customText, source: report.source, confirm, budgetRupees: limits().perTestRupees }, onEvent);
  } catch (err) {
    logEvent('test.error', { id: reportId, message: err.message });
    console.error(`[${reportId}] runSiteTest failed:`, err.message);
    // Anything still unfinished is shown as failed, with the reason in plain words.
    for (const task of report.tasks) {
      if (task.status === 'running' || task.status === 'queued') {
        task.status = 'failed';
        task.blocker = 'The test could not finish. Please try again.';
      }
    }
    await scan;
    report.status = 'complete';
    report.topFixes = rankTopFixes(report, engine);
    await save();
    events.publish({ type: 'report-complete', reportId, report });
    return;
  }

  const cancelled = result.status === 'cancelled';
  if (!cancelled) await scan; // a stopped test does not wait for the page scan
  // Our id and scan win; score, tasks, findings, botWall and cost come from the engine.
  Object.assign(report, result, { id: reportId, instantScan: report.instantScan ?? result.instantScan, status: cancelled ? 'cancelled' : 'complete' });
  report.scanFindings ??= [];
  if (cancelled) {
    report.topFixes = [];
  } else {
    // The answer checks (currency) use what the Instant Scan found, which arrived after the engine scored the tasks.
    if (report.instantScan && engine.scoreReport) Object.assign(report, engine.scoreReport(report));
    report.topFixes = rankTopFixes(report, engine);
  }
  await save();
  await recordSpend(report, { mock: config.mock });
  events.publish({ type: 'report-complete', reportId, report });
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  logEvent(cancelled ? 'test.cancelled' : 'test.finish', { id: reportId, status: report.status, score: report.score, costRupees: report.costRupees, seconds, botWall: report.botWall });
}
