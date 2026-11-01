// /api/watch routes (mounted by index.js: app.use('/api/watch', watchRouter)).
import { Router } from 'express';
import crypto from 'node:crypto';
import { DEFAULT_TASK_ORDER } from '@agentready/engine';
import { listWatches, getWatch, createWatch, updateWatch, getHistory, runCheck, isRunning } from '../watch.js';

const router = Router();
const VALID_TASKS = ['find_price', 'add_to_cart', 'find_returns', 'find_contact'];

router.use((req, res, next) => {
  if (process.env.FEATURE_WATCH === 'false') return res.status(404).json({ error: 'Watch is turned off' });
  next();
});

const validMinutes = (n) => Number.isFinite(n) && n >= 1 && n <= 1440;

router.get('/', async (req, res) => {
  try { res.json(await listWatches()); } catch { res.status(500).json({ error: 'Could not load watches' }); }
});

router.post('/', async (req, res) => {
  try {
    const { url, everyMinutes = 20, tasks = DEFAULT_TASK_ORDER } = req.body ?? {};
    let parsed;
    try { parsed = new URL(url); } catch { /* handled below */ }
    if (!parsed || !['http:', 'https:'].includes(parsed.protocol)) {
      return res.status(400).json({ error: 'Please give a full web address starting with http:// or https://' });
    }
    if (!validMinutes(Number(everyMinutes))) return res.status(400).json({ error: 'everyMinutes must be between 1 and 1440' });
    if (!Array.isArray(tasks) || !tasks.length || !tasks.every((t) => VALID_TASKS.includes(t))) {
      return res.status(400).json({ error: 'tasks must be a list of: ' + VALID_TASKS.join(', ') });
    }
    res.status(201).json(await createWatch({ url: parsed.href, everyMinutes: Number(everyMinutes), tasks }));
  } catch (err) {
    res.status(500).json({ error: 'Could not create the watch' });
  }
});

router.post('/:id/run-now', async (req, res) => {
  try {
    const watch = await getWatch(req.params.id);
    if (!watch) return res.status(404).json({ error: 'Watch not found' });
    if (isRunning(watch.id)) return res.status(409).json({ error: 'A check is already running for this watch' });
    const reportId = 'rep_' + new Date().toISOString().replace(/\D/g, '').slice(0, 12) + '_w' + crypto.randomBytes(2).toString('hex');
    runCheck(watch, { reportId }).catch((e) => console.warn('[watch] run-now failed:', e?.message));
    res.json({ reportId });
  } catch {
    res.status(500).json({ error: 'Could not start the check' });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    if (!(await getWatch(req.params.id))) return res.status(404).json({ error: 'Watch not found' });
    res.json(await getHistory(req.params.id));
  } catch { res.status(500).json({ error: 'Could not load history' }); }
});

router.patch('/:id', async (req, res) => {
  try {
    const { enabled, everyMinutes } = req.body ?? {};
    if (enabled !== undefined && typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled must be true or false' });
    if (everyMinutes !== undefined && !validMinutes(Number(everyMinutes))) return res.status(400).json({ error: 'everyMinutes must be between 1 and 1440' });
    const w = await updateWatch(req.params.id, { enabled, everyMinutes: everyMinutes === undefined ? undefined : Number(everyMinutes) });
    if (!w) return res.status(404).json({ error: 'Watch not found' });
    res.json(w);
  } catch { res.status(500).json({ error: 'Could not update the watch' }); }
});

export default router;
