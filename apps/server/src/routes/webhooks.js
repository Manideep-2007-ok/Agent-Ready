// /api/webhooks (mounted by index.js: app.use('/api/webhooks', webhooksRouter)).
// Needs express.json() before it (index.js does that).
import { Router } from 'express';
import { resolveWebhook, handleMonitorWebhook } from '../watch.js';

const router = Router();

// TinyFish webhooks, always answered 200 fast: a run finished ({event:'run.completed', run_id, ...}) or a Page Monitor
// ran ({fetch_monitor_id, outcome, judgment, ...}; a relevant change starts that watch's check, P2-5).
router.post('/tinyfish', (req, res) => {
  res.status(200).json({ ok: true });
  try {
    if (req.body?.fetch_monitor_id) handleMonitorWebhook(req.body).catch(() => {});
    else resolveWebhook(req.body);
  } catch { /* ignore */ }
});

export default router;
