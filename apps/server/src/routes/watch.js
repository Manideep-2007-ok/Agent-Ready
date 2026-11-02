// /api/watch routes (mounted by index.js: app.use('/api/watch', watchRouter)).
// Errors are thrown with a status (validate.js) and turned into plain JSON by the error handler in index.js.
import { Router } from 'express';
import crypto from 'node:crypto';
import { DEFAULT_TASK_ORDER } from '@agentready/engine';
import { config } from '../config.js';
import { subscribe } from '../events.js';
import { assertReplayable } from '../replay.js';
import { rateLimit } from '../rateLimit.js';
import { MAX_WATCHES, assertSafeId, httpError, parseEveryMinutes, parseSiteUrl, parseTasks } from '../validate.js';
import { errorHandler } from '../errors.js';
import { listWatches, getWatch, createWatch, updateWatch, getHistory, runCheck, isRunning, cancelCheck } from '../watch.js';

const router = Router();
const handle = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

router.use((req, res, next) => {
  if (!config.features.WATCH) return res.status(404).json({ error: 'Watch is turned off' });
  next();
});

const notFound = () => httpError(404, 'Watch not found');
async function findWatch(id) {
  if (!/^[\w-]{1,80}$/.test(id)) throw notFound();
  const watch = await getWatch(id);
  if (!watch) throw notFound();
  return watch;
}

router.get('/', handle(async (_req, res) => res.json(await listWatches())));

router.post('/', rateLimit('watch-create'), handle(async (req, res) => {
  const body = req.body ?? {};
  const url = parseSiteUrl(body.url);
  assertReplayable(url);
  const everyMinutes = parseEveryMinutes(body.everyMinutes);
  const tasks = parseTasks(body.tasks) ?? DEFAULT_TASK_ORDER;
  if ((await listWatches()).length >= MAX_WATCHES) throw httpError(400, `You can watch up to ${MAX_WATCHES} sites. Pause or remove one first.`);
  res.status(201).json(await createWatch({ url, everyMinutes, tasks }));
}));

router.post('/:id/run-now', rateLimit('watch-run'), handle(async (req, res) => {
  const watch = await findWatch(req.params.id);
  if (isRunning(watch.id)) throw httpError(409, 'A check is already running for this watch');
  const reportId = 'rep_' + new Date().toISOString().replace(/\D/g, '').slice(0, 12) + '_w' + crypto.randomBytes(2).toString('hex');
  runCheck(watch, { reportId }).catch((e) => console.warn('[watch] run-now failed:', e?.message));
  res.json({ reportId });
}));

// Stop the check that is running now (the watch itself stays scheduled). Pause also does this.
router.post('/:id/cancel', handle(async (req, res) => {
  const watch = await findWatch(req.params.id);
  res.json({ ok: true, cancelled: await cancelCheck(watch.id) });
}));

// Live alerts for one watch: SSE stream of 'watch-alert' / 'watch-recovered' events.
router.get('/:id/events', handle(async (req, res) => {
  const watch = await findWatch(req.params.id);
  subscribe('watch:' + watch.id, res);
}));

router.get('/:id/history', handle(async (req, res) => {
  const watch = await findWatch(req.params.id);
  res.json(await getHistory(watch.id));
}));

router.patch('/:id', handle(async (req, res) => {
  const { enabled, everyMinutes } = req.body ?? {};
  if (enabled !== undefined && typeof enabled !== 'boolean') throw httpError(400, 'enabled must be true or false');
  const minutes = everyMinutes === undefined ? undefined : parseEveryMinutes(everyMinutes);
  await findWatch(req.params.id);
  const watch = await updateWatch(req.params.id, { enabled, everyMinutes: minutes });
  if (!watch) throw notFound();
  res.json(watch);
}));

// Answer with JSON even when this router is mounted on its own (the smoke scripts do that).
router.use(errorHandler);

export default router;
