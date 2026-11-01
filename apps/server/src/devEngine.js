// DEV STAND-IN for the engine (Manideep's packages/engine). It replays the recorded 31 Oct runs in
// data/cached-demo/fixtures so the server and dashboard can run end to end before the real engine exists.
// loaders.js overlays the real engine on top, function by function, as soon as it is available.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { buildGoal } from '@agentready/engine/goals';

const FIXTURES = path.join(config.cachedDemoDir, 'fixtures');
const FIXTURE_FOR_TASK = {
  find_price: 'nykaa_find_price',
  add_to_cart: 'nykaa_add_to_cart',
  find_returns: 'nykaa_find_returns',
  find_contact: 'nykaa_find_contact',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const readFixture = async (name) => JSON.parse(await fs.readFile(path.join(FIXTURES, `${name}.json`), 'utf8'));

/** Rough points (same bands as the architecture doc) so the demo score looks sensible. */
function pointsFor(passed, numSteps, seconds) {
  if (!passed) return 0;
  return 15 + (numSteps <= 5 ? 6 : numSteps <= 10 ? 3 : 0) + (seconds < 90 ? 4 : seconds < 180 ? 2 : 0);
}

async function replayTask({ url, taskId, customText }, onEvent) {
  const fixture = await readFixture(FIXTURE_FOR_TASK[taskId] ?? 'nykaa_find_price');
  const run = fixture.runRecord;
  const seconds = Math.round((Date.parse(run.finished_at) - Date.parse(run.started_at)) / 1000);
  const base = { taskId, goal: buildGoal(taskId, customText), mode: 'lite', proxy: 'off', runId: run.run_id };
  const task = {
    ...base, status: 'running', answer: null, blocker: null, stuckUrl: null, streamingUrl: null,
    steps: [], numSteps: 0, seconds: 0, points: 0, findings: [],
  };

  onEvent({ kind: 'task-update', taskId, task: { ...task } });
  await sleep(600);
  for (const raw of run.steps) {
    const step = {
      id: raw.id,
      label: raw.action,
      seconds: parseFloat(raw.duration) || null,
      screenshotUrl: `/api/shot/${run.run_id}/${raw.id}`,
      usedWebSearch: false,
      at: new Date().toISOString(),
    };
    task.steps.push(step);
    task.numSteps = task.steps.length;
    onEvent({ kind: 'step', taskId, step });
    await sleep(900);
  }

  const result = run.result ?? {};
  const passed = result.success === true;
  task.status = passed ? 'passed' : 'failed';
  task.answer =
    result.price ?? result.cart_total ?? result.answer ??
    (result.return_days ? `${result.return_days} (${result.policy_url})` : null);
  task.blocker = result.blocker ?? null;
  task.stuckUrl = result.stuck_url ?? null;
  task.seconds = seconds;
  task.points = pointsFor(passed, task.numSteps, seconds);
  onEvent({ kind: 'task-update', taskId, task: { ...task } });
  return task;
}

export async function runSiteTest({ url, tasks, customText, source = 'web' }, onEvent = () => {}) {
  const ids = tasks ?? ['find_returns', 'add_to_cart', 'find_price', 'find_contact'];
  const results = await Promise.all(ids.map((taskId) => replayTask({ url, taskId, customText }, onEvent)));
  const scored = results.filter((task) => task.taskId !== 'custom');
  return {
    id: 'dev',
    url,
    source,
    testedAt: new Date().toISOString(),
    pack: 'shopping',
    status: 'complete',
    score: Math.min(100, scored.reduce((sum, task) => sum + task.points, 0)),
    botWall: 'none',
    costRupees: Math.round(results.reduce((sum, task) => sum + task.numSteps, 0) * 0.016 * 88 * 100) / 100,
    framework: 'unknown',
    instantScan: null,
    tasks: results,
    topFixes: [],
  };
}

export async function instantScan() {
  await sleep(1500);
  return {
    pageTextChars: 284, unlabelledButtons: 515, totalButtonsAndLinks: 619, imagesWithoutAlt: 9,
    totalImages: 9, priceAsText: true, overlayCoveringPage: true, productSchema: false,
    robotsTxt: 'found', sitemap: 'found', framework: 'unknown', seconds: 1.5,
  };
}

export async function getStepScreenshot(runId, stepId) {
  return fs.readFile(path.join(FIXTURES, 'shots', `${runId}_${stepId}.jpg`));
}

export const buildFixReport = async (report) => report;
