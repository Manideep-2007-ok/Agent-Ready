// Input checks shared by every route. Each throws an error with a status and a plain-language message.
import { TASK_IDS } from '@agentready/engine/types';
import { config } from './config.js';

export const MAX_URL_LENGTH = 2048;
export const MAX_CUSTOM_TASK_LENGTH = 300;
export const WATCH_MIN_MINUTES = 5;   // each check spends real agent steps, so "every minute" is refused
export const WATCH_MAX_MINUTES = 1440;
export const MAX_WATCHES = 20;
export const SCORED_TASKS = TASK_IDS.filter((id) => id !== 'custom');

/** An error carrying an HTTP status; the error handler in index.js turns it into JSON. */
export const httpError = (status, message) => Object.assign(new Error(message), { status });

// Real TinyFish ids are UUIDs; mock ids look like mock-nykaa_find_price-l39yqq; report ids like rep_20261101_1210_nykaa-2.
export const SAFE_ID = /^[\w-]{1,80}$/;
export const isSafeId = (id) => typeof id === 'string' && SAFE_ID.test(id);

/** Addresses a cloud browser can never reach. */
function isPrivateHost(host) {
  // "localhost." (trailing dot) is the same host; [::ffff:127.0.0.1] (IPv4-mapped IPv6, normalised to ::ffff:7f00:1) is 127.0.0.1.
  let h = host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h);
  if (mapped) { const a = parseInt(mapped[1], 16), b = parseInt(mapped[2], 16); h = `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`; }
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.lan')) return true;
  if (h === '::1' || h === '::' || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe80:/.test(h)) return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(h);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  return false;
}

/**
 * http(s) addresses only. A bare "nykaa.com" gets https://. No credentials in the address, a length cap, and no
 * addresses a cloud browser cannot reach (localhost and private ranges; replay mode allows them for the tests).
 * @returns {string} the normalised address
 */
export function parseSiteUrl(input) {
  const text = String(input ?? '').trim();
  if (!text) throw httpError(400, 'Please enter a website address, for example https://www.nykaa.com');
  if (text.length > MAX_URL_LENGTH) throw httpError(400, `That web address is too long (the limit is ${MAX_URL_LENGTH} characters).`);
  if (/[\u0000-\u001f\u007f\s]/.test(text)) throw httpError(400, 'A web address cannot contain spaces or hidden characters.');
  // An explicit scheme must be http or https ("ftp://x", "javascript:..." and "file:///" are refused).
  const scheme = /^([a-z][a-z0-9+.-]*):(\/\/)?/i.exec(text);
  if (scheme && !/^https?$/i.test(scheme[1]) && (scheme[2] || /^(javascript|data|file|mailto|vbscript|blob|about)$/i.test(scheme[1]))) {
    throw httpError(400, 'Only web addresses starting with http:// or https:// can be tested.');
  }
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    throw httpError(400, 'Please enter a valid website address, for example https://www.nykaa.com');
  }
  if (url.username || url.password) throw httpError(400, 'Please remove the user name and password from the web address.');
  const host = url.hostname;
  if (!host || (!host.includes('.') && !host.includes(':') && !isPrivateHost(host))) {
    throw httpError(400, 'Please enter a valid website address, for example https://www.nykaa.com');
  }
  if (!config.mock && isPrivateHost(host)) {
    throw httpError(400, 'AI agents run in the cloud and cannot reach localhost or private addresses. Use the agentready command-line tool to test a local site.');
  }
  return url.toString();
}

/** A list of scored task ids (no custom: that has its own field). Undefined stays undefined; duplicates are dropped. */
export function parseTasks(tasks, { required = false } = {}) {
  if (tasks === undefined || tasks === null) {
    if (required) throw httpError(400, `tasks must be a list of: ${SCORED_TASKS.join(', ')}`);
    return undefined;
  }
  if (!Array.isArray(tasks) || !tasks.length || tasks.some((t) => !SCORED_TASKS.includes(t))) {
    throw httpError(400, `tasks must be a list of: ${SCORED_TASKS.join(', ')}`);
  }
  return [...new Set(tasks)];
}

export function parseCustomTask(text) {
  if (text === undefined || text === null || String(text).trim() === '') return undefined;
  if (typeof text !== 'string') throw httpError(400, 'The custom task must be text.');
  if (!config.features.CUSTOM_TASK) throw httpError(404, 'Custom tasks are turned off.');
  const trimmed = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  if (!trimmed) return undefined;
  if ([...trimmed].length > MAX_CUSTOM_TASK_LENGTH) throw httpError(400, `Please keep the custom task under ${MAX_CUSTOM_TASK_LENGTH} characters.`);
  return trimmed;
}

/** Minutes between Watch checks: a whole number from 5 to 1440. */
export function parseEveryMinutes(value, fallback = 20) {
  const n = value === undefined || value === null ? fallback : Number(value);
  if (!Number.isInteger(n) || n < WATCH_MIN_MINUTES || n > WATCH_MAX_MINUTES) {
    throw httpError(400, `everyMinutes must be a whole number between ${WATCH_MIN_MINUTES} and ${WATCH_MAX_MINUTES}`);
  }
  return n;
}

/** Throws a 404 for ids that could never exist, so a bad id is a plain "not found", never a server error. */
export function assertSafeId(id, what = 'report') {
  if (!isSafeId(id)) throw httpError(404, `We could not find that ${what}.`);
  return id;
}
