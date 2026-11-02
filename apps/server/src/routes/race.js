// /api/race*: the same task (any pack's task id) on up to 3 sites at once. Each site is a normal report (source 'race'),
// so the dashboard follows each lane through /api/tests/:id/events.
import { Router } from 'express';
import { TASK_IDS } from '@agentready/engine/types';
import * as store from '../store.js';
import { startReport } from '../reportJob.js';
import { rateLimit } from '../rateLimit.js';
import { httpError, parseSiteUrl, cancelRunningReport } from './tests.js';
import { assertReplayable, assertReplayPack } from '../replay.js';
import { assertSafeId } from '../validate.js';

const MAX_SITES = 3; // D23: the account runs 3 agents at once.

export default function raceRoutes({ engine, events }) {
  const router = Router();

  router.post('/race', rateLimit('race'), async (req, res) => {
    const { taskId, urls } = req.body ?? {};
    if (Array.isArray(urls) && urls.length > MAX_SITES) throw httpError(400, `Please give between 2 and ${MAX_SITES} websites.`);
    if (!TASK_IDS.includes(taskId) || taskId === 'custom') throw httpError(400, 'Please choose a task to race.');
    if (!Array.isArray(urls) || urls.length < 2 || urls.length > MAX_SITES) {
      throw httpError(400, `Please give between 2 and ${MAX_SITES} websites.`);
    }
    const parsed = urls.map(parseSiteUrl);
    parsed.forEach(assertReplayable); // replay mode: refuse sites with no recording before anything starts
    assertReplayPack(undefined, [taskId]); // ... and tasks with no recording (only the shop tasks have one)

    const lanes = [];
    for (const url of parsed) {
      const reportId = await startReport({ url, tasks: [taskId], source: 'race', instantScan: false }, { engine, events });
      lanes.push({ url, reportId });
    }
    const race = { id: `race_${Date.now().toString(36)}`, taskId, createdAt: new Date().toISOString(), lanes };
    await store.saveRace(race);
    res.status(202).json({ raceId: race.id });
  });

  // Lanes with their current report, ranked: passed first, then fastest.
  router.get('/race/:id', async (req, res) => {
    const race = await store.getRace(req.params.id);
    if (!race) throw httpError(404, 'We could not find that race.');
    const lanes = await Promise.all(
      race.lanes.map(async (lane) => {
        const report = await store.getReport(lane.reportId);
        const task = report?.tasks.find((t) => t.taskId === race.taskId) ?? null;
        return { ...lane, report, task };
      }),
    );
    const rank = lanes
      .filter((lane) => lane.task?.status === 'passed')
      // Fewest steps wins; the same number of steps: fastest.
      .sort((a, b) => (a.task.numSteps ?? a.task.steps?.length ?? 0) - (b.task.numSteps ?? b.task.steps?.length ?? 0) || a.task.seconds - b.task.seconds)
      .map((lane, i) => ({ reportId: lane.reportId, place: i + 1 }));
    res.json({ ...race, lanes, rank });
  });

  // Stop every lane of a race (idempotent: finished lanes are left alone).
  router.post('/race/:id/cancel', async (req, res) => {
    assertSafeId(req.params.id, 'race');
    const race = await store.getRace(req.params.id);
    if (!race) throw httpError(404, 'We could not find that race.');
    let cancelled = false;
    for (const lane of race.lanes) {
      const report = await store.getReport(lane.reportId);
      if (report) cancelled = (await cancelRunningReport(report, { engine, events })).cancelled || cancelled;
    }
    res.json({ ok: true, cancelled });
  });

  return router;
}
