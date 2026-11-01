// /api/race*: the same task on up to 3 sites at once. Each site is a normal report (source 'race'),
// so the dashboard follows each lane through /api/tests/:id/events.
import { Router } from 'express';
import { TASK_IDS } from '@agentready/engine/types';
import * as store from '../store.js';
import { startReport } from '../reportJob.js';
import { httpError, parseSiteUrl } from './tests.js';

const MAX_SITES = 3; // D23: the account runs 3 agents at once.

export default function raceRoutes({ engine, events }) {
  const router = Router();

  router.post('/race', async (req, res) => {
    const { taskId, urls } = req.body ?? {};
    if (!TASK_IDS.includes(taskId) || taskId === 'custom') throw httpError(400, 'Please choose a task to race.');
    if (!Array.isArray(urls) || urls.length < 2 || urls.length > MAX_SITES) {
      throw httpError(400, `Please give between 2 and ${MAX_SITES} websites.`);
    }
    const parsed = urls.map(parseSiteUrl);

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
      .sort((a, b) => a.task.seconds - b.task.seconds)
      .map((lane, i) => ({ reportId: lane.reportId, place: i + 1 }));
    res.json({ ...race, lanes, rank });
  });

  return router;
}
