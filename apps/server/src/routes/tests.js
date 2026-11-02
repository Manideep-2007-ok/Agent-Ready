// /api/tests*, /api/instant-scan, /api/shot, /api/reports/:id/fixes
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { TASK_IDS } from '@agentready/engine/types';
import { config } from '../config.js';
import * as store from '../store.js';
import { startReport, isJobActive } from '../reportJob.js';
import { logEvent } from '../log.js';
import { rateLimit } from '../rateLimit.js';
import { SAFE_ID, SCORED_TASKS, assertSafeId, httpError, parseSiteUrl, parseTasks, parseCustomTask } from '../validate.js';
import { assertReplayable, recordedDemoReport } from '../replay.js';

const RUN_ID = SAFE_ID;
export { httpError, parseSiteUrl, parseTasks, parseCustomTask };

/**
 * A finished SiteReport posted by the CLI. The CLI prints <server>/#/test/<id> from its own id, so the id is kept
 * (not renamed); the shape is checked so a bad upload cannot break the dashboard.
 */
export function parseUploadedReport(body) {
  const bad = (why) => httpError(400, `This does not look like an AgentReady report: ${why}.`);
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw bad('send the report JSON');
  if (typeof body.id !== 'string' || !RUN_ID.test(body.id)) throw bad('id must be letters, digits, _ or - (up to 80)');
  let url;
  try { url = new URL(body.url); } catch { throw bad('url is missing'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw bad('url must start with http:// or https://');
  if (!Number.isFinite(body.score) || body.score < 0 || body.score > 100) throw bad('score must be 0-100');
  if (!Array.isArray(body.tasks) || body.tasks.some((t) => !t || !TASK_IDS.includes(t.taskId) || !Array.isArray(t.steps ?? []))) {
    throw bad(`tasks must be a list of task results (${TASK_IDS.join(', ')})`);
  }
  return {
    ...body,
    source: 'cli',
    status: 'complete',
    topFixes: Array.isArray(body.topFixes) ? body.topFixes : [],
    scanFindings: Array.isArray(body.scanFindings) ? body.scanFindings : [],
  };
}



export default function testsRoutes({ engine, events }) {
  const router = Router();

  // Never throws: a browser that closed the page mid-replay must not crash the server.
  const sse = (res, event) => (events.send ? events.send(res, event) : false);

  router.post('/tests', rateLimit('tests'), async (req, res) => {
    const url = parseSiteUrl(req.body?.url);
    assertReplayable(url);
    // Replay mode: our demo store opens its real recorded report (91 with flaws, 97 fixed) instead of a sample run.
    const recorded = req.body?.customTask ? null : recordedDemoReport(url);
    if (recorded) return res.status(202).json({ reportId: recorded });
    const tasks = parseTasks(req.body?.tasks);
    const customText = parseCustomTask(req.body?.customTask);
    const reportId = await startReport(
      { url, customText, tasks: customText ? [...(tasks ?? SCORED_TASKS), 'custom'] : tasks },
      { engine, events },
    );
    res.status(202).json({ reportId });
  });

  router.get('/tests', async (_req, res) => res.json(await store.listReports()));

  router.get('/tests/:id', async (req, res) => {
    assertSafeId(req.params.id);
    const report = await store.getReport(req.params.id);
    if (!report) throw httpError(404, 'We could not find that report.');
    res.json(report);
  });

  // Live updates. The first messages replay what already happened so a late or refreshed page catches up.
  router.get('/tests/:id/events', async (req, res) => {
    assertSafeId(req.params.id);
    const report = await store.getReport(req.params.id);
    if (!report) throw httpError(404, 'We could not find that report.');
    events.subscribe(report.id, res);
    if (report.instantScan) sse(res, { type: 'instant-scan', reportId: report.id, scan: report.instantScan });
    for (const task of report.tasks) sse(res, { type: 'task-update', reportId: report.id, task });
    if (report.status !== 'running') sse(res, { type: 'report-complete', reportId: report.id, report });
  });

  // Stop a running test (also a Watch check: they are reports too). Idempotent: stopping a finished test is a no-op.
  router.post('/tests/:id/cancel', async (req, res) => {
    assertSafeId(req.params.id);
    const report = await store.getReport(req.params.id);
    if (!report) throw httpError(404, 'We could not find that report.');
    if (report.status !== 'running') return res.json({ ok: true, cancelled: false, status: report.status });
    const result = await engine.cancelReport?.(report.id, 'user');
    // The agents already finished and only the Instant Scan is still closing: nothing is left to stop (or pay for).
    if (!result?.found && isJobActive(report.id)) return res.json({ ok: true, cancelled: false, status: 'finishing' });
    if (!result?.found) {
      // Marked running on disk, but nothing is running here (the server restarted): close it so the page stops spinning.
      for (const task of report.tasks ?? []) {
        if (['queued', 'running'].includes(task.status)) { task.status = 'cancelled'; task.blocker = 'The test was stopped.'; }
      }
      Object.assign(report, { status: 'cancelled', score: 0, topFixes: [] });
      await store.saveReport(report);
      events.publish({ type: 'report-complete', reportId: report.id, report });
    }
    logEvent('test.cancel', { id: report.id, by: 'user', runsCancelled: result?.cancelledRuns ?? 0, droppedFromQueue: result?.droppedFromQueue ?? 0 });
    res.json({ ok: true, cancelled: true, status: 'cancelling' });
  });

  router.post('/instant-scan', rateLimit('instant-scan'), async (req, res) => {
    res.json(await engine.instantScan(parseSiteUrl(req.body?.url)));
  });

  // Screenshots need the TinyFish key, so the browser asks us and we fetch (and cache) them.
  router.get('/shot/:runId/:stepId', async (req, res) => {
    const { runId, stepId } = req.params;
    if (!RUN_ID.test(runId) || !RUN_ID.test(stepId)) throw httpError(400, 'Invalid screenshot id.');
    const cached = path.join(store.shotsDir, `${runId}_${stepId}.jpg`);
    let image;
    try {
      image = await fs.readFile(cached);
    } catch {
      try {
        image = await engine.getStepScreenshot(runId, stepId);
      } catch {
        throw httpError(404, 'Screenshot not available.');
      }
      await fs.mkdir(store.shotsDir, { recursive: true });
      await fs.writeFile(cached, image).catch(() => {});
    }
    res.type('image/jpeg').set('Cache-Control', 'public, max-age=86400').send(image);
  });

  router.post('/reports/:id/fixes', rateLimit('fixes'), async (req, res) => {
    assertSafeId(req.params.id);
    const report = await store.getReport(req.params.id);
    if (!report) throw httpError(404, 'We could not find that report.');
    const enriched = await engine.buildFixReport(report);
    await store.saveReport(enriched);
    res.json(enriched);
  });

  // CLI upload (AGENTREADY_SERVER): store the finished report so the printed dashboard link opens it.
  // Re-uploading the same CLI report replaces it; an id already used by a web or watch report is refused.
  router.post('/reports', async (req, res) => {
    if (!config.features.CLI_UPLOAD) throw httpError(404, 'The cli_upload feature is turned off.');
    const report = parseUploadedReport(req.body);
    const existing = await store.getReport(report.id);
    if (existing && existing.source !== 'cli') throw httpError(409, 'A different report already uses this id.');
    await store.saveReport(report);
    res.status(201).json({ reportId: report.id });
  });

  return router;
}
