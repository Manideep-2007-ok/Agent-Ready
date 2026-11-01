// AgentReady server: Express on PORT (default 4000). Routes live in routes/, storage in store.js.
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { loadEngine, loadEvents } from './loaders.js';
import testsRoutes from './routes/tests.js';
import raceRoutes from './routes/race.js';
import extrasRoutes from './routes/extras.js';
import watchRouter from './routes/watch.js';
import webhooksRouter from './routes/webhooks.js';
import { startWatches, setPublisher } from './watch.js';

const { engine, stubbed: stubbedEngine } = await loadEngine();
const { events, stubbed: stubbedEvents } = await loadEvents();
const deps = { engine, events };

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Express 4 does not catch errors thrown in async handlers, so wrap every route handler once.
const safe = (router) => {
  for (const layer of router.stack) {
    const handler = layer.route?.stack[0];
    if (!handler) continue;
    const original = handler.handle;
    handler.handle = (req, res, next) => Promise.resolve(original(req, res, next)).catch(next);
  }
  return router;
};

const requireFeature = (name) => (_req, res, next) =>
  config.features[name] ? next() : res.status(404).json({ error: `The ${name.toLowerCase()} feature is turned off.` });

// Flags gate only their own paths, before any router, so one switched-off feature never hides another.
app.use('/api/race', requireFeature('RACE'));
app.use('/api/leaderboard', requireFeature('LEADERBOARD'));

app.get('/api/health', (_req, res) => res.json({ ok: true, mock: config.mock }));
app.use('/api', safe(testsRoutes(deps)));
app.use('/api', safe(raceRoutes(deps)));
app.use('/api', safe(extrasRoutes(deps)));

// Agent-Ready Watch (Manideep's routes; they check FEATURE_WATCH and handle their own errors).
setPublisher(events.publish);
app.use('/api/watch', watchRouter);
app.use('/api/webhooks', webhooksRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));

// Plain JSON errors; never echo internals or keys.
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return res.end();
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message });
});

app.listen(config.port, () => {
  console.log(`AgentReady server on http://localhost:${config.port}  (mock: ${config.mock})`);
  if (stubbedEngine.length) console.log(`  dev stand-in engine in use for: ${stubbedEngine.join(', ')}`);
  if (stubbedEvents) console.log('  dev stand-in SSE hub in use (events.js not found)');
  if (config.features.WATCH) startWatches().catch((err) => console.error('[watch] could not start:', err.message));
});
