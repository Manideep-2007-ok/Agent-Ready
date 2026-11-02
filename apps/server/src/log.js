// One-line structured logs: a JSON object per line, e.g. {"t":"...","event":"test.start","id":"rep_...","host":"nykaa.com"}.
// Only fields a caller passes are printed, and callers pass ids, hosts, counts and statuses: never keys, headers or
// full URLs. LOG_LEVEL=silent turns them off (the automated tests do that).
const silent = () => String(process.env.LOG_LEVEL || '').toLowerCase() === 'silent';

/** Host and path only: no query string (could hold tokens) and no credentials. */
export function safeUrl(url) {
  try { const u = new URL(url); return `${u.host}${u.pathname === '/' ? '' : u.pathname}`; } catch { return String(url || '').slice(0, 80); }
}

/**
 * @param {string} event  e.g. test.start, test.finish, test.cancel, test.error, watch.start ...
 * @param {Record<string, string|number|boolean|null|undefined>} [fields]
 */
export function logEvent(event, fields = {}) {
  if (silent()) return;
  const clean = {};
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) clean[k] = typeof v === 'string' ? v.slice(0, 200) : v;
  console.log(JSON.stringify({ t: new Date().toISOString(), event, ...clean }));
}
