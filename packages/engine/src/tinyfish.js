// Every TinyFish HTTP call lives here (plain fetch, header X-API-Key). Mock mode delegates to mock.js.
import { config, requireApiKey } from './config.js';
import * as mock from './mock.js';
import { ANSWER_SCHEMA } from './goals.js';

const AGENT = 'https://agent.tinyfish.ai';
const FETCH_API = 'https://api.fetch.tinyfish.ai';
const SEARCH_API = 'https://api.search.tinyfish.ai';
const BROWSER_API = 'https://api.browser.tinyfish.ai';

// Every non-streaming call gets a time limit, so a hung connection can never freeze a poll loop or a cancel.
const REQUEST_TIMEOUT_MS = 30_000;
const withTimeout = (signal, ms = REQUEST_TIMEOUT_MS) => (signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms));
const abortError = () => Object.assign(new Error('Aborted'), { name: 'AbortError' });
const sleepAbortable = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(abortError());
  const t = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  const onAbort = () => { clearTimeout(t); reject(abortError()); };
  signal?.addEventListener('abort', onAbort, { once: true });
});

const headers = (json = false) => ({ 'X-API-Key': requireApiKey(), ...(json ? { 'Content-Type': 'application/json' } : {}) });

/** Throw a plain error for non-2xx answers. The message never contains the API key. */
async function check(res, what) {
  if (res.ok) return res;
  let detail = '';
  try { detail = (await res.text()).slice(0, 200); } catch { /* ignore */ }
  if (config.apiKey) detail = detail.split(config.apiKey).join('***'); // in case an error page echoes the key
  throw Object.assign(new Error(`TinyFish ${what} failed (HTTP ${res.status})${detail ? `: ${detail}` : ''}`), { status: res.status });
}

const proxyConfig = (proxy) => (proxy === 'IN' || proxy === 'US' ? { enabled: true, type: 'tinyfish', country_code: proxy } : { enabled: false });

// Structured answers (P2-4): every run asks for ANSWER_SCHEMA. If the account refuses the field (HTTP 400 naming it),
// the run is sent again without it and the refusal is remembered, so a run is never lost to it.
let schemaRefused = false;
const refusesSchema = (err) => err?.status === 400 && /output_schema/i.test(err.message);

function runBody({ url, goal, mode = 'lite', proxy = 'off', maxSeconds, webhookUrl }) {
  const body = {
    url, goal,
    browser_profile: mode,
    proxy_config: proxyConfig(proxy),
    agent_config: { max_duration_seconds: maxSeconds || config.maxDurationSeconds }, // never max_steps / capture_config
  };
  if (!schemaRefused) body.output_schema = ANSWER_SCHEMA;
  if (webhookUrl) body.webhook_url = webhookUrl;
  return body;
}

/** POST a run; on an output_schema refusal, remember it and POST once more without the field. */
async function postRun(path, params, what, init = {}) {
  const send = () => fetch(`${AGENT}${path}`, { method: 'POST', headers: headers(true), body: JSON.stringify(runBody(params)), ...init });
  const res = await send();
  try { return await check(res, what); } catch (err) {
    if (schemaRefused || !refusesSchema(err)) throw err;
    schemaRefused = true;
    return check(await send(), what);
  }
}

/**
 * Start a run and follow its live event stream.
 * Throws an error with code 'STREAM_DROPPED' (and runId if known) if the stream ends before COMPLETE.
 * `taskId` is only used by mock mode to choose a recording.
 */
export async function startRunSSE(params, handlers = {}) {
  if (config.mock) return mock.startRunSSE(params, handlers);
  const { onStarted, onStreamingUrl, onProgress, onComplete, signal } = handlers;
  let runId = null;
  // The start request gets 60 s to be answered; once the stream is open only the caller's `signal` can stop it.
  const startCtl = new AbortController();
  const startTimer = setTimeout(() => startCtl.abort(), 60_000);
  let res;
  try {
    res = await postRun('/v1/automation/run-sse', params, 'start run', { signal: signal ? AbortSignal.any([signal, startCtl.signal]) : startCtl.signal });
  } catch (err) {
    if (signal?.aborted) throw err; // the caller cancelled
    if (startCtl.signal.aborted) throw new Error('TinyFish did not answer in time (start run)');
    throw err;
  } finally { clearTimeout(startTimer); }

  const dropped = (why) => Object.assign(new Error(`Live stream closed before the run finished (${why})`), { code: 'STREAM_DROPPED', runId });
  const handle = (e) => {
    if (e.run_id && !runId) runId = e.run_id;
    switch (e.type) {
      case 'STARTED': onStarted?.(e.run_id); break;
      case 'STREAMING_URL': onStreamingUrl?.(e.streaming_url); break;
      case 'PROGRESS': onProgress?.({ purpose: e.purpose, usedWebSearch: e.tinyfish_api === 'search', at: e.timestamp }); break;
      case 'COMPLETE': {
        const out = { runId: e.run_id || runId, status: e.status, result: e.result, error: e.error ?? null };
        onComplete?.(out);
        return out;
      }
      default: break; // HEARTBEAT and others are ignored
    }
    return null;
  };

  try {
    for await (const e of parseSSE(res.body)) {
      const done = handle(e);
      if (done) return done;
    }
  } catch (err) {
    if (err.name === 'AbortError' || signal?.aborted) throw err; // the caller cancelled: do not poll
    throw dropped(err.cause?.code || err.name || 'network error');
  }
  throw dropped('stream ended');
}

/**
 * Read a text/event-stream body and yield each event's JSON. Handles events split across chunks,
 * \r\n line endings, several `data:` lines in one event, and a last event with no blank line after it.
 * Exported so it can be tested without the network.
 */
export async function* parseSSE(body) {
  const decoder = new TextDecoder();
  let buf = '';
  const parse = (block) => {
    const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).replace(/^ /, '')).join('\n');
    if (!data.trim()) return null;
    try { return JSON.parse(data); } catch { return null; }
  };
  for await (const chunk of body) {
    buf = (buf + decoder.decode(chunk, { stream: true })).replace(/\r\n/g, '\n');
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) { // events end with a blank line
      const e = parse(buf.slice(0, idx));
      buf = buf.slice(idx + 2);
      if (e) yield e;
    }
  }
  const last = parse((buf + decoder.decode()).replace(/\r\n/g, '\n'));
  if (last) yield last;
}

/** Start a background run. Returns {runId}. */
export async function startRunAsync(params) {
  if (config.mock) return mock.startRunAsync(params);
  const res = await postRun('/v1/automation/run-async', params, 'start background run', { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  const j = await res.json();
  return { runId: j.run_id };
}

/** Raw run record (status, steps, result...). */
export async function getRun(runId, { signal } = {}) {
  if (config.mock) return mock.getRun(runId);
  const res = await fetch(`${AGENT}/v1/runs/${encodeURIComponent(runId)}`, { headers: headers(), signal: withTimeout(signal) });
  await check(res, 'read run');
  return res.json();
}

const FINISHED = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

/** Poll every 3 s until the run finishes. Returns the final run record. An aborted `signal` stops polling (AbortError). */
export async function waitForRun(runId, { intervalMs = 3000, timeoutMs = 10 * 60 * 1000, signal } = {}) {
  if (config.mock) return mock.waitForRun(runId, { signal });
  const t0 = Date.now();
  for (;;) {
    if (signal?.aborted) throw abortError();
    let run = null;
    try { run = await getRun(runId, { signal }); } catch (err) {
      if (err.name === 'AbortError' && signal?.aborted) throw err;
      if ([401, 403, 404].includes(err.status)) throw err; // will never succeed; other errors (network blips, 5xx) retry
    }
    if (run && FINISHED.has(run.status)) return run;
    if (Date.now() - t0 > timeoutMs) throw new Error('Timed out waiting for the agent run to finish');
    await sleepAbortable(intervalMs, signal);
  }
}

export async function cancelRun(runId) {
  if (config.mock) return mock.cancelRun(runId);
  const res = await fetch(`${AGENT}/v1/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST', headers: headers(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  await check(res, 'cancel run');
  return res.json().catch(() => ({ ok: true }));
}

/** JPEG bytes of one step (needs the key, so the browser gets it through our /api/shot route). */
export async function getStepScreenshot(runId, stepId) {
  if (config.mock) return mock.getStepScreenshot(runId, stepId);
  const res = await fetch(`${AGENT}/v1/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(stepId)}/screenshot`, { headers: headers(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  await check(res, 'read screenshot');
  return Buffer.from(await res.arrayBuffer());
}

/** TinyFish Fetch (free). Returns [{url, text, error}]. */
export async function fetchPages(urls) {
  if (config.mock) return mock.fetchPages(urls);
  const res = await fetch(FETCH_API, { method: 'POST', headers: headers(true), body: JSON.stringify({ urls }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  await check(res, 'fetch pages');
  const j = await res.json();
  // Failed URLs come back in errors[], not results[], so match by URL (ignoring a trailing slash), never by position.
  const norm = (u) => String(u || '').replace(/\/$/, '');
  const byUrl = new Map();
  for (const r of j.results || []) { byUrl.set(norm(r.url), r); if (r.final_url) byUrl.set(norm(r.final_url), r); }
  const errByUrl = new Map((j.errors || []).map((e) => [norm(e.url), e]));
  return urls.map((u) => {
    const r = byUrl.get(norm(u));
    if (r && r.text != null) return { url: u, text: typeof r.text === 'string' ? r.text : JSON.stringify(r.text), error: null };
    const e = errByUrl.get(norm(u));
    return { url: u, text: '', error: e?.error || e?.message || 'No content returned' };
  });
}

/** TinyFish Search (free). Returns results[]. */
export async function search(query) {
  if (config.mock) return mock.search(query);
  const res = await fetch(`${SEARCH_API}?query=${encodeURIComponent(query)}`, { headers: headers(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  await check(res, 'search');
  const j = await res.json();
  return j.results || [];
}

/** Open a cloud browser. Returns {sessionId, cdpUrl} for playwright connectOverCDP. */
export async function createBrowserSession({ url, countryCode = 'IN', timeoutSeconds = 60 } = {}) {
  if (config.mock) return mock.createBrowserSession({ url, countryCode, timeoutSeconds });
  const res = await fetch(BROWSER_API, { method: 'POST', headers: headers(true), body: JSON.stringify({ url, timeout_seconds: timeoutSeconds, proxy_config: { country_code: countryCode } }), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  await check(res, 'open browser');
  const j = await res.json();
  const sessionId = j.session_id || j.sessionId || j.id;
  const cdpUrl = j.cdp_url || j.cdpUrl || j.ws_url || j.wsUrl;
  if (!sessionId || !cdpUrl) throw new Error('TinyFish browser answer had no session id or CDP address');
  return { sessionId, cdpUrl };
}

export async function closeBrowserSession(sessionId) {
  if (config.mock) return mock.closeBrowserSession(sessionId);
  const res = await fetch(`${BROWSER_API}/${encodeURIComponent(sessionId)}`, { method: 'DELETE', headers: headers(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!res.ok && res.status !== 404) await check(res, 'close browser');
}

export async function getWallet() {
  if (config.mock) return mock.getWallet();
  const res = await fetch(`${AGENT}/v1/wallet`, { headers: headers(), signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  await check(res, 'read wallet');
  return res.json();
}
