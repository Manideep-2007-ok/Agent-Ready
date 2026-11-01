// AgentReady server: Express on PORT (default 4000). Routes live in routes/, storage in store.js.
import { existsSync } from 'node:fs';
import path from 'node:path';
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
// The dashboard is served from this server (same origin), so cross-site calls are not needed. Only local pages may
// call the API: any other website open in the browser must not be able to start paid agent runs.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use(cors({ origin: (origin, cb) => cb(null, !origin || LOCAL_ORIGIN.test(origin)) }));
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

// demoStoreUrl lets the dashboard offer "Test our demo store" and "Apply fixes" (null when not set).
app.get('/api/health', (_req, res) => res.json({ ok: true, mock: config.mock, demoStoreUrl: config.demoStoreUrl || null }));
app.use('/api', safe(testsRoutes(deps)));
app.use('/api', safe(raceRoutes(deps)));
app.use('/api', safe(extrasRoutes(deps)));

// Agent-Ready Watch (Manideep's routes; they check FEATURE_WATCH and handle their own errors).
setPublisher(events.publish);
app.use('/api/watch', watchRouter);
app.use('/api/webhooks', webhooksRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route.' }));

// The built dashboard, so links printed by the CLI and Watch alerts (<server>/#/test/<id>) open without Vite.
// Hash routing: index.html at / serves every page.
const webDist = path.join(config.repoRoot, 'apps/web/dist');
if (existsSync(path.join(webDist, 'index.html'))) app.use(express.static(webDist));
else app.get('/', (_req, res) => res.type('text').send('Dashboard not built yet: run "npm run build -w @agentready/web", or use the dev dashboard on http://localhost:5173.'));

// Plain JSON errors; never echo internals or keys.
app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  if (res.headersSent) return res.end();
  res.status(status).json({ error: status >= 500 ? 'Something went wrong on our side. Please try again.' : err.message });
});

// Safety net: one failed background run (agent, scan, watch) must never take the whole server down mid-demo.
// Node 15+ exits on an unhandled rejection by default; log it plainly and keep serving instead.
process.on('unhandledRejection', (err) => console.error('[server] background error (server keeps running):', err?.stack || err));
process.on('uncaughtException', (err) => console.error('[server] unexpected error (server keeps running):', err?.stack || err));

// Listen on this machine only by default, so nobody else on the Wi-Fi can start runs with our key.
// Set HOST=0.0.0.0 to share it on purpose (cloudflared tunnels to localhost and keeps working either way).
const host = process.env.HOST || '127.0.0.1';
app.listen(config.port, host, () => {
  console.log(`AgentReady server on http://localhost:${config.port}  (mock: ${config.mock}${host === '127.0.0.1' ? '' : `, listening on ${host}`})`);
  if (stubbedEngine.length) console.log(`  dev stand-in engine in use for: ${stubbedEngine.join(', ')}`);
  if (stubbedEvents) console.log('  dev stand-in SSE hub in use (events.js not found)');
  if (config.features.WATCH) startWatches().catch((err) => console.error('[watch] could not start:', err.message));
});
