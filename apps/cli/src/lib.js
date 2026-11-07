// Pure helpers for the CLI (no I/O), so they can be unit-tested.
import { PACKS, PACK_IDS, TASK_LABELS, packForTasks } from '@agentready/engine/goals';

export const MAX_TASK_TEXT = 300; // same limit as the dashboard's custom task

export const LOCAL_RE = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1?\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|.*\.local|.*\.localhost)$/i;

const VALUE_FLAGS = ['tasks', 'min-score', 'badge', 'pack', 'task'];
const BOOL_FLAGS = ['json', 'no-tunnel', 'no-scan', 'help', 'version'];

/**
 * @param {string[]} argv  process.argv.slice(2)
 * `--tasks` is a comma list of task ids from any pack, or `quick` (the pack's two key tasks), or `none` (only the `--task` text).
 * @returns {{url?:string, tasks:string[]|null, pack:string|null, task:string|null, json:boolean, minScore:number|null, noTunnel:boolean, noScan:boolean, help:boolean, version:boolean, badge:string|null, errors:string[]}}
 */
export function parseArgs(argv) {
  const out = { url: undefined, tasks: null, pack: null, task: null, json: false, minScore: null, noTunnel: false, noScan: false, help: false, version: false, badge: null, errors: [] };
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
      if (name === 'badge') out.badge = value;
      else if (name === 'pack') out.pack = value.trim().toLowerCase();
      else if (name === 'task') out.task = value;
      else if (name === 'tasks') out.tasks = value.trim().toLowerCase() === 'none' ? [] : value.split(',').map((t) => t.trim()).filter(Boolean);
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

/**
 * Everything about the pack and task flags that can be checked without running anything.
 * @param {ReturnType<typeof parseArgs>} opts
 * @returns {{errors:string[], customText:string|null, quick:boolean}}  `quick` = --tasks quick (needs the pack to be known)
 */
export function checkPackFlags(opts) {
  const errors = [];
  if (opts.pack !== null && opts.pack !== 'auto' && !PACK_IDS.includes(opts.pack)) {
    errors.push(`Unknown pack: ${opts.pack}. Choose one of: auto, ${PACK_IDS.join(', ')}`);
  }
  let customText = null;
  if (opts.task !== null) {
    customText = opts.task.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (!customText) errors.push('--task needs some text, for example --task "find the delivery charge for a $30 order"');
    else if ([...customText].length > MAX_TASK_TEXT) errors.push(`--task must be ${MAX_TASK_TEXT} characters or fewer`);
  }
  const tasks = opts.tasks;
  const quick = Array.isArray(tasks) && tasks.length === 1 && tasks[0].toLowerCase() === 'quick';
  if (Array.isArray(tasks) && tasks.length === 0 && !opts.errors.some((e) => /--tasks/.test(e))) {
    // `--tasks none`: only the custom task runs
    if (!customText) errors.push('--tasks none needs a task of your own: add --task "..."');
    if (opts.minScore !== null) errors.push('--min-score needs at least one task from a pack (a custom task alone has no score)');
  } else if (Array.isArray(tasks) && !quick) {
    const unknown = tasks.filter((t) => !TASK_LABELS[t] || t === 'custom');
    if (unknown.length) errors.push(`Unknown task(s): ${unknown.join(', ')}. Use --help to see every task id, or use --task "..." for your own task.`);
    if (tasks.some((t) => ['quick', 'none'].includes(t.toLowerCase()))) errors.push('--tasks quick and --tasks none cannot be mixed with task ids');
  }
  return { errors, customText, quick };
}

/**
 * The task list to run once the pack is known.
 * @param {string[]|null} tasks  parsed --tasks (null = the pack's four)
 * @param {string} pack  a pack id
 * @returns {string[]}
 */
export function resolveTasks(tasks, pack) {
  if (tasks === null) return [...PACKS[pack].tasks];
  if (tasks.length === 1 && tasks[0].toLowerCase() === 'quick') return [...PACKS[pack].quick];
  return [...new Set(tasks)];
}

/** The pack for a run that names explicit task ids but no pack: the pack of the first task. */
export const packOfTaskList = (tasks) => packForTasks(tasks);

/** One line for the terminal about how the pack was chosen. `how`: 'flag' | 'detected' | 'undetected' | 'no-scan' | 'tasks' */
export function packLine({ how, pack, usingPack = true }) {
  const name = PACKS[pack].siteLabel;
  const using = usingPack ? ` \u2014 using the ${pack} pack` : '';
  if (how === 'detected') return `Detected: ${name}${using} (override with --pack)`;
  if (how === 'undetected') return `Could not tell what kind of site this is (the Instant Scan could not read the page)${using} (choose one with --pack)`;
  if (how === 'no-scan') return `The Instant Scan is off, so the kind of site was not detected${using} (choose one with --pack)`;
  return `Pack: ${name}`;
}
