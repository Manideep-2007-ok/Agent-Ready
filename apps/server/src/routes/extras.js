// Small routes that belong to the dashboard: leaderboard and the demo store's "apply fixes" switch.
import { Router } from 'express';
import { config } from '../config.js';
import * as store from '../store.js';
import { httpError } from './tests.js';

export default function extrasRoutes() {
  const router = Router();

  router.get('/leaderboard', async (_req, res) => res.json(await store.listLeaderboard()));

  // "Apply fixes": the demo store reads ?flaws=on|off, so we hand back the address to re-test.
  router.post('/demo-store/flaws', (req, res) => {
    if (typeof req.body?.on !== 'boolean') throw httpError(400, 'Send {"on": true} or {"on": false}.');
    if (!config.demoStoreUrl) throw httpError(400, 'DEMO_STORE_URL is not set in .env.');
    res.json({ on: req.body.on, url: `${config.demoStoreUrl}/?flaws=${req.body.on ? 'on' : 'off'}` });
  });

  return router;
}
