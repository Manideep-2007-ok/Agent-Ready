// Mock mode (TINYFISH_MOCK=1): replays real 31 Oct runs from data/cached-demo/fixtures/ so nobody spends credits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(ROOT, 'data/cached-demo/fixtures');
const speed = () => Number(process.env.TINYFISH_MOCK_SPEED) > 0 ? Number(process.env.TINYFISH_MOCK_SPEED) : 1;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms / speed()));
const log = (...a) => console.log('[mock]', ...a);
const cache = new Map(); // fixture name -> parsed fixture
const runs = new Map(); // mock runId -> fixture name

function loadFixture(name) {
  if (!cache.has(name)) cache.set(name, JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8')));
  return cache.get(name);
}

/** Pick the recorded run that best matches the request. */
export function pickFixture({ url = '', taskId, mode = 'lite', proxy = 'off' }) {
  let host = '';
  try { host = new URL(url).hostname; } catch { host = String(url); }
  if (host.includes('nykaa')) {
    return { find_price: 'nykaa_find_price', add_to_cart: 'nykaa_add_to_cart', find_returns: 'nykaa_find_returns', find_contact: 'nykaa_find_contact' }[taskId] || 'nykaa_find_price';
  }
  if (host.includes('swiggy')) return 'swiggy_add_to_cart';
  if (host.includes('myntra')) {
    if (mode === 'stealth') return 'myntra_find_price_stealth';
    return proxy === 'off' ? 'myntra_find_price_noproxy' : 'myntra_find_price_in_proxy';
  }
  return 'localhost_tunnel';
}

const newRunId = (fx) => `mock-${fx}-${Math.random().toString(36).slice(2, 8).padEnd(6, '0')}`;
let indexCache = null;
function fixtureIndex() {
  if (!indexCache) { try { indexCache = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')); } catch { indexCache = []; } }
  return indexCache;
}

function fixtureOfRunId(runId) {
  if (runs.has(runId)) return runs.get(runId);
  const m = /^mock-(.+)-[a-z0-9]{6}$/.exec(runId); // survives server restarts
  if (m && /^[a-z0-9_]+$/.test(m[1])) return m[1]; // fixture names only (runId comes from a URL)
  const real = fixtureIndex().find((f) => f.runId === runId); // cached demo reports keep the real 31 Oct run ids
  if (real) return real.name;
  throw Object.assign(new Error('Unknown mock run'), { status: 404 });
}

export async function startRunSSE(params, h = {}) {
  const name = pickFixture(params);
  const fx = loadFixture(name);
  const runId = newRunId(name);
  runs.set(runId, name);
  log(`run ${runId} replays ${name}`);
  for (const e of fx.sseEvents) {
    if (h.signal?.aborted) throw Object.assign(new Error('Aborted'), { code: 'STREAM_DROPPED', runId });
    if (e.type === 'STARTED') h.onStarted?.(runId);
    else if (e.type === 'STREAMING_URL') h.onStreamingUrl?.(e.streaming_url);
    else if (e.type === 'PROGRESS') {
      await sleep(1500 + Math.random() * 2500);
      h.onProgress?.({ purpose: e.purpose, usedWebSearch: e.tinyfish_api === 'search', at: e.timestamp });
    } else if (e.type === 'COMPLETE') {
      await sleep(300);
      const out = { runId, status: e.status, result: e.result, error: e.error ?? null };
      h.onComplete?.(out);
      return out;
    }
  }
  throw Object.assign(new Error('Mock fixture has no COMPLETE event'), { code: 'STREAM_DROPPED', runId });
}

export async function startRunAsync(params) {
  const name = pickFixture(params);
  const runId = newRunId(name);
  runs.set(runId, name);
  log(`async run ${runId} (${name})${params.webhookUrl ? ', webhook ignored in mock' : ''}`);
  return { runId };
}

export async function getRun(runId) {
  const name = fixtureOfRunId(runId);
  const rec = JSON.parse(JSON.stringify(loadFixture(name).runRecord));
  rec.run_id = runId;
  rec.status = 'COMPLETED';
  return rec;
}

export async function waitForRun(runId) {
  await sleep(1000);
  return getRun(runId);
}

export async function cancelRun(runId) { log('cancel', runId); return { ok: true }; }

export async function getStepScreenshot(runId, stepId) {
  const name = fixtureOfRunId(runId);
  const orig = loadFixture(name).runId;
  const file = path.join(DIR, 'shots', `${orig}_${stepId}.jpg`);
  const notFound = () => Object.assign(new Error('Screenshot not found'), { status: 404 });
  if (!/^[\w-]+$/.test(String(stepId))) throw notFound();
  // Async read so a burst of screenshot requests never blocks the server.
  try { return await fs.promises.readFile(file); } catch { throw notFound(); }
}

export async function fetchPages(urls) {
  log('fetch', urls.join(', '));
  return urls.map((u) => ({ url: u, text: u.endsWith('robots.txt') ? 'User-agent: *\nAllow: /' : u.endsWith('sitemap.xml') ? '<urlset></urlset>' : 'Mock page text. '.repeat(40), error: null }));
}
export async function search(query) { log('search', query); return [{ title: 'Mock result', url: 'https://example.com', snippet: query }]; }
export async function createBrowserSession({ url }) { log('browser session for', url); return { sessionId: 'mock-session', cdpUrl: 'ws://127.0.0.1:0/mock' }; }
export async function closeBrowserSession(id) { log('close session', id); }
export async function getWallet() { return { balance_usd: 14.24, mock: true }; }
