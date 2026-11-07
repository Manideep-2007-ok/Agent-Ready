// An in-process fake of the TinyFish Agent API, for tests that need failures the recordings do not have
// (cancelled runs, dropped streams, 5xx, hangs). It REPLACES globalThis.fetch and throws on any other host,
// so a test can never reach the real API. The API key used in these tests is a dummy string.

const enc = new TextEncoder();
let counter = 0;

/** A TinyFish run record as GET /v1/runs/{id} returns it. */
export function runRecord({ runId, status = 'COMPLETED', steps = 5, result = { success: true, answer: 'ok', blocker: null, stuck_url: null }, error = null } = {}) {
  const t0 = Date.parse('2026-11-02T10:00:00Z');
  return {
    run_id: runId, status, num_of_steps: steps, error, result,
    started_at: new Date(t0).toISOString(), finished_at: new Date(t0 + 30_000).toISOString(),
    steps: Array.from({ length: steps }, (_, i) => ({ id: `s${i}`, action: `Step ${i + 1}`, duration: '2.0s', screenshot: 'x', timestamp: new Date(t0 + i * 1000).toISOString() })),
  };
}

/**
 * @param {{
 *   runSse?: (call:{index:number, body:any, runId:string}) => {events?:object[], end?:'complete'|'hang'|'drop'|'http', status?:number, body?:object, run?:object},
 *   cancelStatus?: number,
 *   getRunStatuses?: (runId:string, n:number) => object|number,
 *   pages?: Record<string,string>,
 * }} handlers
 */
export function installFakeTinyFish(handlers = {}) {
  const real = globalThis.fetch;
  const calls = { sse: [], getRun: [], cancel: [], blocked: [] };
  const runs = new Map(); // runId -> run record served by GET /runs/{id}

  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    // TinyFish Fetch: `handlers.pages` maps a URL to its page text (a missing URL comes back as an error, like the real API).
    if (url.host === 'api.fetch.tinyfish.ai' && handlers.pages) {
      const { urls } = JSON.parse(init.body);
      calls.fetch = [...(calls.fetch ?? []), ...urls];
      const results = urls.filter((u) => handlers.pages[u] != null).map((u) => ({ url: u, text: handlers.pages[u] }));
      const errors = urls.filter((u) => handlers.pages[u] == null).map((u) => ({ url: u, error: 'HTTP 404' }));
      return new Response(JSON.stringify({ results, errors }), { status: 200 });
    }
    if (url.host !== 'agent.tinyfish.ai') {
      calls.blocked.push(url.href);
      throw new Error(`fake network: unexpected call to ${url.href}`);
    }
    const signal = init.signal;

    if (url.pathname === '/v1/automation/run-sse') {
      const index = calls.sse.length;
      const runId = `run-${++counter}-${index}`;
      const body = JSON.parse(init.body);
      const spec = handlers.runSse?.({ index, body, runId }) ?? {};
      calls.sse.push({ index, body, runId, spec });
      if (spec.end === 'http') return new Response(JSON.stringify(spec.body ?? { error: 'boom' }), { status: spec.status ?? 503 });
      if (spec.run) runs.set(runId, { ...spec.run, run_id: runId });
      const events = (spec.events ?? [{ type: 'STARTED', run_id: runId }, { type: 'PROGRESS', purpose: 'Open the page' },
        { type: 'COMPLETE', run_id: runId, status: 'COMPLETED', result: { success: true, answer: 'ok', blocker: null, stuck_url: null } }]).map((e) => ({ run_id: runId, ...e }));
      if (!runs.has(runId)) runs.set(runId, runRecord({ runId, steps: events.filter((e) => e.type === 'PROGRESS').length }));
      let sent = 0;
      const stream = new ReadableStream({
        async pull(controller) {
          if (signal?.aborted) return controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          if (sent < events.length) {
            const { delay, ...ev } = events[sent]; // `delay` (ms) holds an event back, e.g. a STARTED that arrives late
            await new Promise((r) => setTimeout(r, delay ?? 5));
            sent++;
            controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
            return;
          }
          if (spec.end === 'drop') return controller.error(new TypeError('terminated')); // connection broke before COMPLETE
          if (spec.end === 'hang') {
            await new Promise((resolve) => { signal?.addEventListener('abort', resolve, { once: true }); if (signal?.aborted) resolve(); });
            return controller.error(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          }
          controller.close();
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    }

    let m = /^\/v1\/runs\/([^/]+)\/cancel$/.exec(url.pathname);
    if (m && init.method === 'POST') {
      calls.cancel.push(m[1]);
      return new Response(JSON.stringify({ ok: true }), { status: handlers.cancelStatus ?? 200 });
    }
    m = /^\/v1\/runs\/([^/]+)$/.exec(url.pathname);
    if (m) {
      const n = calls.getRun.filter((r) => r === m[1]).length;
      calls.getRun.push(m[1]);
      const custom = await handlers.getRunStatuses?.(m[1], n); // may be a promise (a slow TinyFish)
      if (typeof custom === 'number') return new Response('upstream error', { status: custom });
      if (custom) return new Response(JSON.stringify(custom), { status: 200 });
      return new Response(JSON.stringify(runs.get(m[1]) ?? runRecord({ runId: m[1] })), { status: 200 });
    }
    calls.blocked.push(url.href);
    throw new Error(`fake network: unhandled ${init.method || 'GET'} ${url.pathname}`);
  };
  return { calls, runs, restore: () => { globalThis.fetch = real; } };
}
