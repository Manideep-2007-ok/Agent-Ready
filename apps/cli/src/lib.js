// Pure helpers for the CLI (no I/O), so they can be unit-tested.

export const LOCAL_RE = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1?\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.local|.*\.localhost)$/i;

const VALUE_FLAGS = ['tasks', 'min-score'];
const BOOL_FLAGS = ['json', 'no-tunnel', 'no-scan', 'help'];

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @returns {{url?:string, tasks:string[]|null, json:boolean, minScore:number|null, noTunnel:boolean, noScan:boolean, help:boolean, errors:string[]}}
 */
export function parseArgs(argv) {
  const out = { url: undefined, tasks: null, json: false, minScore: null, noTunnel: false, noScan: false, help: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      if (out.url === undefined) out.url = arg; else out.errors.push(`Unexpected extra argument: ${arg}`);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (BOOL_FLAGS.includes(name)) {
      out[name === 'no-tunnel' ? 'noTunnel' : name === 'no-scan' ? 'noScan' : name] = true;
    } else if (VALUE_FLAGS.includes(name)) {
      const value = inline !== undefined ? inline : argv[++i];
      if (value === undefined || value.startsWith('--')) { out.errors.push(`--${name} needs a value`); continue; }
      if (name === 'tasks') out.tasks = value.split(',').map((t) => t.trim()).filter(Boolean);
      else {
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > 100) out.errors.push('--min-score must be a number from 0 to 100');
        else out.minScore = n;
      }
    } else out.errors.push(`Unknown option: --${name}`);
  }
  return out;
}

/** The address as the developer typed it: no scheme means http for local addresses and https for the rest. */
export function normaliseUrl(input) {
  const text = String(input ?? '').trim();
  if (!text) throw new Error('No web address given');
  const host = text.replace(/^[a-z]+:\/\//i, '').split(/[/:?#]/)[0];
  const parsed = new URL(text.includes('://') ? text : `${LOCAL_RE.test(host) ? 'http' : 'https'}://${text}`);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http:// and https:// addresses can be tested');
  return parsed;
}

/** First https://<name>.trycloudflare.com address in cloudflared's output (skips api.trycloudflare.com, which shows up in errors). */
export function findTunnelUrl(text) {
  const m = [...String(text).matchAll(/https:\/\/([a-z0-9-]+)\.trycloudflare\.com/g)].find((x) => x[1] !== 'api');
  return m ? m[0] : null;
}

/** Public tunnel address + the page the developer typed (path and query, e.g. /?flaws=on). */
export function buildTestUrl(tunnelUrl, parsed) {
  return tunnelUrl.replace(/\/$/, '') + (parsed.pathname || '/') + parsed.search;
}
