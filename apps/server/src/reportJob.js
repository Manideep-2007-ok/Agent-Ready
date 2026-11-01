// Starts a site test in the background and turns engine events into dashboard (SSE) events.
// Shared by POST /api/tests and Race Mode, so both behave the same.
import { DEFAULT_TASK_ORDER } from '@agentready/engine/goals';
import * as store from './store.js';

/** @typedef {import('@agentready/engine/types').SiteReport} SiteReport */

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

  const upsertTask = (task) => {
    const at = report.tasks.findIndex((t) => t.taskId === task.taskId);
    if (at === -1) report.tasks.push(task);
    else report.tasks[at] = task;
  };

  // Engine events -> LiveEvents (shapes in types.js). 'attempt' events are engine-internal.
  const onEvent = (e) => {
    if (e.kind === 'task-update') {
      upsertTask(e.task);
      save();
      events.publish({ type: 'task-update', reportId, task: e.task });
    } else if (e.kind === 'step') {
      events.publish({ type: 'step', reportId, taskId: e.taskId, step: e.step });
    } else if (e.kind === 'streaming-url') {
      events.publish({ type: 'streaming-url', reportId, taskId: e.taskId, url: e.url });
    }
  };

  const scan = instantScan
    ? engine
        .instantScan(report.url)
        .then((result) => {
          report.instantScan = result;
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
    report.status = 'complete';
    await save();
    events.publish({ type: 'report-complete', reportId, report });
    return;
  }

  await scan;
  // Our id and scan win; everything else (score, tasks, findings, botWall, cost) comes from the engine.
  Object.assign(report, result, { id: reportId, instantScan: report.instantScan ?? result.instantScan, status: 'complete' });
  await save();
  events.publish({ type: 'report-complete', reportId, report });
}
