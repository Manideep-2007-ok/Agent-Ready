// /api/tests*, /api/instant-scan, /api/shot, /api/reports/:id/fixes
import fs from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { TASK_IDS } from '@agentready/engine/types';
import { config } from '../config.js';
import * as store from '../store.js';
import { startReport } from '../reportJob.js';
import { assertReplayable } from '../replay.js';

// Real TinyFish ids are UUIDs; mock ids look like mock-nykaa_find_price-l39yqq. Both are safe filename characters.
const RUN_ID = /^[\w-]{1,80}$/;
const SCORED_TASKS = TASK_IDS.filter((id) => id !== 'custom');

/** An error carrying an HTTP status; the error handler in index.js turns it into JSON. */
export const httpError = (status, message) => Object.assign(new Error(message), { status });

/** Accepts only http(s) URLs. Cloud browsers cannot reach localhost, so that is refused with the way out. */
export function parseSiteUrl(input) {
  const text = String(input ?? '').trim();
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw httpError(400, 'Please enter a valid website address, for example https://www.nykaa.com');
  }
  const host = url.hostname;
  if (!config.mock && (host === 'localhost' || host.endsWith('.localhost') || /^(127\.|10\.|192\.168\.)/.test(host))) {
    throw httpError(400, 'AI agents run in the cloud and cannot reach localhost. Use the agentready command-line tool to test a local site.');
  }
  return url.toString();
}

export function parseTasks(tasks) {
  if (tasks === undefined) return undefined;
  if (!Array.isArray(tasks) || tasks.some((t) => !SCORED_TASKS.includes(t))) {
    throw httpError(400, `tasks must be a list of: ${SCORED_TASKS.join(', ')}`);
  }
  return tasks;
}

export function parseCustomTask(text) {
  if (text === undefined || text === null || String(text).trim() === '') return undefined;
  if (!config.features.CUSTOM_TASK) throw httpError(404, 'Custom tasks are turned off.');
  const trimmed = String(text).trim();
  if (trimmed.length > 300) throw httpError(400, 'Please keep the custom task under 300 characters.');
  return trimmed;
}

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

const sse =(res, event) => res.write(`data: ${JSON.stringify(event)}\n\n`);

export default function testsRoutes({ engine, events }) {
  const router = Router();

  router.post('/tests', async (req, res) => {
    const url = parseSiteUrl(req.body?.url);
    assertReplayable(url);
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
    const report = await store.getReport(req.params.id);
    if (!report) throw httpError(404, 'We could not find that report.');
    res.json(report);
  });

  // Live updates. The first messages replay what already happened so a late or refreshed page catches up.
  router.get('/tests/:id/events', async (req, res) => {
    const report = await store.getReport(req.params.id);
    if (!report) throw httpError(404, 'We could not find that report.');
    events.subscribe(report.id, res);
    if (report.instantScan) sse(res, { type: 'instant-scan', reportId: report.id, scan: report.instantScan });
    for (const task of report.tasks) sse(res, { type: 'task-update', reportId: report.id, task });
    if (report.status === 'complete') sse(res, { type: 'report-complete', reportId: report.id, report });
  });

  router.post('/instant-scan', async (req, res) => {
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

  router.post('/reports/:id/fixes', async (req, res) => {
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
