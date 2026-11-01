// Starts a site test in the background and turns engine events into dashboard (SSE) events.
// Shared by POST /api/tests and Race Mode, so both behave the same.
import { DEFAULT_TASK_ORDER } from '@agentready/engine/goals';
import * as store from './store.js';

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
 * @param {{url:string, tasks?:string[], customText?:string, source?:string, instantScan?:boolean}} request
 * @param {{engine:any, events:{publish:Function}}} deps
 * @returns {Promise<string>} the new report id (the test keeps running after this returns)
 */
export async function startReport(request, { engine, events }) {
  const { url, customText, source = 'web', instantScan = true } = request;
  const tasks = request.tasks?.length ? request.tasks : [...DEFAULT_TASK_ORDER];

  /** @type {SiteReport} */
  const report = {
    id: await newReportId(url),
    url,
    source,
    testedAt: new Date().toISOString(),
    pack: 'shopping',
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

  // Not awaited: the dashboard gets the id now and follows progress over SSE.
  runInBackground(report, { tasks, customText, instantScan }, { engine, events }).catch((err) =>
    console.error(`[${report.id}] test crashed:`, err),
  );
  return report.id;
}

async function runInBackground(report, { tasks, customText, instantScan }, { engine, events }) {
  const reportId = report.id;
  const save = () => store.saveReport(report).catch((err) => console.error(`[${reportId}] save failed:`, err));

  const findTask = (taskId) => report.tasks.find((t) => t.taskId === taskId);

  // While running, keep the longer step list so a task-update never drops saved steps. Once finished, the
  // task's own list wins: those are the real run steps with screenshots (live progress steps have none).
  const upsertTask = (task) => {
    const at = report.tasks.findIndex((t) => t.taskId === task.taskId);
    if (at === -1) return report.tasks.push(task);
    const previous = report.tasks[at];
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

  const scan = instantScan
    ? engine
        .instantScan(report.url)
        .then((result) => {
          report.instantScan = result;
          report.scanFindings = engine.instantScanFindings?.(result) ?? [];
          report.topFixes = rankTopFixes(report, engine);
          save();
          events.publish({ type: 'instant-scan', reportId, scan: result });
        })
        .catch((err) => console.error(`[${reportId}] instant scan failed:`, err.message))
    : Promise.resolve();

  let result;
  try {
    result = await engine.runSiteTest({ id: reportId, url: report.url, tasks, customText, source: report.source }, onEvent);
  } catch (err) {
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

  await scan;
  // Our id and scan win; score, tasks, findings, botWall and cost come from the engine.
  Object.assign(report, result, { id: reportId, instantScan: report.instantScan ?? result.instantScan, status: 'complete' });
  report.scanFindings ??= [];
  report.topFixes = rankTopFixes(report, engine);
  await save();
  events.publish({ type: 'report-complete', reportId, report });
}
