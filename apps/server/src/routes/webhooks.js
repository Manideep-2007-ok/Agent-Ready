// /api/webhooks (mounted by index.js: app.use('/api/webhooks', webhooksRouter)).
// Needs express.json() before it (index.js does that).
import { Router } from 'express';
import { resolveWebhook } from '../watch.js';

const router = Router();

// TinyFish run webhook: {event:'run.completed', run_id, status, data:{...}}. Always answer 200 fast.
router.post('/tinyfish', (req, res) => {
  res.status(200).json({ ok: true });
  try { resolveWebhook(req.body); } catch { /* ignore */ }
});

export default router;
