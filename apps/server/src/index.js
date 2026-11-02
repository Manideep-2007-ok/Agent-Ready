// AgentReady server: Express on PORT (default 4000). Routes live in routes/, storage in store.js.
import './env.js'; // must stay first: loads .env (if any) before the engine reads its settings
import { existsSync, readFileSync } from 'node:fs';
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
import * as store from './store.js';
import { logEvent } from './log.js';
import { errorHandler } from './errors.js';
import { isJobActive } from './reportJob.js';

const { engine, stubbed: stubbedEngine } = await loadEngine();
const { events, stubbed: stubbedEvents } = await loadEvents();
const deps = { engine, events };

const app = express();
// The dashboard is served from this server (same origin), so cross-site calls are not needed. Only local pages may
// call the API: any other website open in the browser must not be able to start paid agent runs.
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
app.use(cors({ origin: (origin, cb) => cb(null, !origin || LOCAL_ORIGIN.test(origin)) }));
// CORS only stops a foreign page from READING answers. A foreign page could still make the browser SEND a body-less
// POST (cancel, run-now) to localhost, so every state-changing request must come from this server's own pages
// (or have no Origin header at all, like curl, the CLI and the tests).
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  let sameHost = false;
  try { sameHost = new URL(origin).host === req.headers.host; } catch { /* not a URL */ }
  if (sameHost || LOCAL_ORIGIN.test(origin)) return next();
  return res.status(403).json({ error: 'This request came from another website and was blocked.' });
});
app.use(express.json({ limit: '1mb' }));

// Express 4 does not catch errors thrown in async handlers, so wrap every route handler once.
const safe = (router) => {
  for (const layer of router.stack) {
    // Every handler of the route (rate limit middleware first, then the real handler), not just the first one.
    for (const handler of layer.route?.stack ?? []) {
      const original = handler.handle;
      handler.handle = (req, res, next) => Promise.resolve(original(req, res, next)).catch(next);
    }
  }
  return router;
};

const requireFeature = (name) => (_req, res, next) =>
  config.features[name] ? next() : res.status(404).json({ error: `The ${name.toLowerCase()} feature is turned off.` });

// Flags gate only their own paths, before any router, so one switched-off feature never hides another.
app.use('/api/race', requireFeature('RACE'));
app.use('/api/leaderboard', requireFeature('LEADERBOARD'));

// demoStoreUrl lets the dashboard offer "Test our demo store" and "Apply fixes" (null when not set).
const version = (() => {
  try { return JSON.parse(readFileSync(path.join(config.repoRoot, 'package.json'), 'utf8')).version || 'dev'; } catch { return 'dev'; }
})();
// queue = who is using the agent slots right now (the dashboard uses it to explain "Waiting for an agent").
app.get('/api/health', (_req, res) => res.json({
  ok: true, version, mock: config.mock, demoStoreUrl: config.demoStoreUrl || null,
  queue: engine.getQueueState?.() ?? null,
  activeTests: engine.activeReportIds?.().length ?? 0,
}));
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
app.use(errorHandler);

// Safety net: one failed background run (agent, scan, watch) must never take the whole server down mid-demo.
// Node 15+ exits on an unhandled rejection by default; log it plainly and keep serving instead.
process.on('unhandledRejection', (err) => console.error('[server] background error (server keeps running):', err?.stack || err));
process.on('uncaughtException', (err) => console.error('[server] unexpected error (server keeps running):', err?.stack || err));

// Listen on this machine only by default, so nobody else on the Wi-Fi can start runs with our key.
// Set HOST=0.0.0.0 to share it on purpose (cloudflared tunnels to localhost and keeps working either way).
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(config.port, host, () => {
  console.log(`AgentReady server on http://localhost:${config.port}  (mock: ${config.mock}${host === '127.0.0.1' ? '' : `, listening on ${host}`})`);
  if (!config.mock && !process.env.TINYFISH_API_KEY) console.warn('  TINYFISH_API_KEY is not set: tests will fail until you add it to .env (or set TINYFISH_MOCK=1).');
  if (stubbedEngine.length) console.log(`  dev stand-in engine in use for: ${stubbedEngine.join(', ')}`);
  if (stubbedEvents) console.log('  dev stand-in SSE hub in use (events.js not found)');
  logEvent('server.start', { port: config.port, version, mock: config.mock, host });
  // Reports left "running" by a restart can never finish: close them so their lanes stop spinning.
  store.recoverInterruptedReports({ isActive: (id) => isJobActive(id) || Boolean(engine.isReportActive?.(id)) })
    .then((n) => { if (n) logEvent('server.recovered', { interruptedTests: n }); })
    .catch((err) => console.error('[server] could not recover interrupted tests:', err.message))
    .finally(() => {
      if (config.features.WATCH) startWatches().catch((err) => console.error('[watch] could not start:', err.message));
    });
});
server.on('error', (err) => { console.error(`[server] could not start: ${err.code === 'EADDRINUSE' ? `port ${config.port} is already in use` : err.message}`); process.exit(1); });

// Ctrl+C / stop: cancel the agent runs that are in flight first, so they do not keep spending credits unseen.
let stopping = false;
async function shutdown(signal) {
  if (stopping) return;
  stopping = true;
  logEvent('server.stop', { signal });
  try { await Promise.race([engine.cancelAll?.('shutdown'), new Promise((r) => setTimeout(r, 8000))]); } catch { /* best effort */ }
  server.close();
  process.exit(0);
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
