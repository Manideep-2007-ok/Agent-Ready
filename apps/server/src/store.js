// JSON-file storage. This is the only module that touches data/, so MongoDB can replace it later.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';

/** @typedef {import('@agentready/engine/types').SiteReport} SiteReport */
/** @typedef {import('@agentready/engine/types').Watch} Watch */

const dirs = {
  reports: path.join(config.dataDir, 'reports'),
  watch: path.join(config.dataDir, 'watch'),
  races: path.join(config.dataDir, 'races'),
  shots: path.join(config.dataDir, 'shots'),
  budget: path.join(config.dataDir, 'budget'),
};

const SAFE_ID = /^[\w-]+$/;
const assertId = (id) => {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) throw new Error(`Invalid id: ${id}`);
  return id;
};

// Writes to the same file run one after another, so two events cannot overwrite each other half way.
const queues = new Map();
function serialise(file, job) {
  const run = (queues.get(file) ?? Promise.resolve()).then(job, job);
  queues.set(file, run.catch(() => {}));
  return run;
}

async function writeJson(file, data) {
  return serialise(file, async () => {
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, file);
  });
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    if (err instanceof SyntaxError) { console.warn(`[store] ignoring unreadable file ${path.basename(file)}`); return fallback; } // half-written or hand-edited
    throw err;
  }
}

async function listJson(dir) {
  try {
    return (await fs.readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export const shotsDir = dirs.shots;

/** @param {SiteReport} report */
export const saveReport = (report) => writeJson(path.join(dirs.reports, `${assertId(report.id)}.json`), report);

/** Live reports first, then the committed demo backups. @returns {Promise<SiteReport|null>} */
export async function getReport(id) {
  if (typeof id !== 'string' || !SAFE_ID.test(id)) return null; // an id that could never exist is simply "not found"
  return (
    (await readJson(path.join(dirs.reports, `${id}.json`))) ??
    (await readJson(path.join(config.cachedDemoDir, 'reports', `${id}.json`)))
  );
}

export async function reportExists(id) {
  return (await getReport(id)) !== null;
}

/** Newest first, only the fields the list view needs. */
export async function listReports(limit = 50) {
  const names = await listJson(dirs.reports);
  const reports = await Promise.all(names.map((name) => readJson(path.join(dirs.reports, name))));
  return reports
    .filter(Boolean)
    .sort((a, b) => String(b.testedAt).localeCompare(String(a.testedAt)))
    .slice(0, limit)
    .map(({ id, url, score, testedAt, status, source, botWall }) => ({ id, url, score, testedAt, status, source, botWall }));
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); } catch { return null; } };

/**
 * Every finished test of one site (same host, www. ignored), oldest first, with what a history chart and a
 * "what changed" list need (P3-4). Live reports and the committed demo backups both count.
 */
export async function siteHistory(url, limit = 30) {
  const host = hostOf(url);
  if (!host) return [];
  const read = async (dir) => Promise.all((await listJson(dir)).map((name) => readJson(path.join(dir, name))));
  const all = [...(await read(dirs.reports)), ...(await read(path.join(config.cachedDemoDir, 'reports')))];
  const seen = new Set();
  return all
    .filter((r) => r && r.status === 'complete' && hostOf(r.url) === host && !seen.has(r.id) && seen.add(r.id))
    .sort((a, b) => String(a.testedAt).localeCompare(String(b.testedAt)))
    .slice(-limit)
    .map((r) => ({
      id: r.id, url: r.url, testedAt: r.testedAt, score: r.score, botWall: r.botWall, costRupees: r.costRupees, source: r.source,
      pack: r.pack, confirm: !!r.confirm,
      tasks: (r.tasks ?? []).map((t) => ({ taskId: t.taskId, status: t.status, numSteps: t.numSteps, seconds: t.seconds, points: t.points, flaky: !!t.flaky })),
      findingTypes: [...new Set([...(r.tasks ?? []).flatMap((t) => (t.findings ?? []).map((f) => f.type)), ...(r.scanFindings ?? []).map((f) => f.type)])],
    }));
}

// Agent spending per day (D43), in rupees: data/budget/<YYYY-MM-DD>.json = {spentRupees, tests}.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const getSpend = async (day) => (DAY_RE.test(day) ? readJson(path.join(dirs.budget, `${day}.json`), { spentRupees: 0, tests: 0 }) : { spentRupees: 0, tests: 0 });
/** Add a finished (or stopped) test's cost to its day. Serialised per file, so two tests finishing together both count. */
export function addSpend(day, rupees) {
  if (!DAY_RE.test(day)) return Promise.resolve();
  const file = path.join(dirs.budget, `${day}.json`);
  return serialise(file + ':add', async () => {
    const now = await readJson(file, { spentRupees: 0, tests: 0 });
    const next = { spentRupees: Math.round(((now.spentRupees || 0) + (Number(rupees) || 0)) * 100) / 100, tests: (now.tests || 0) + 1 };
    await writeJson(file, next);
  });
}

/**
 * Reports still marked 'running' on disk. At server start nothing can really be running, so these were cut off by a
 * restart or crash; recoverInterruptedReports() closes them so lanes do not spin forever.
 */
export async function recoverInterruptedReports({ isActive = () => false } = {}) {
  const names = await listJson(dirs.reports);
  let fixed = 0;
  for (const name of names) {
    const report = await readJson(path.join(dirs.reports, name));
    if (!report || report.status !== 'running' || isActive(report.id)) continue; // a test started since boot is real
    for (const task of report.tasks ?? []) {
      if (['queued', 'running'].includes(task.status)) {
        task.status = 'cancelled';
        task.blocker = 'The test was interrupted because the server restarted.';
      }
    }
    report.status = 'cancelled';
    report.score = 0;
    report.topFixes = [];
    await saveReport(report);
    fixed++;
  }
  return fixed;
}

/** Cached reports used by the leaderboard, ranked by score. */
export async function listLeaderboard() {
  const dir = path.join(config.cachedDemoDir, 'leaderboard');
  const reports = await Promise.all((await listJson(dir)).map((name) => readJson(path.join(dir, name))));
  return reports.filter(Boolean).sort((a, b) => b.score - a.score);
}

/** @param {Watch} watch  Adds the watch, or replaces the one with the same id. */
export async function saveWatch(watch) {
  const file = path.join(dirs.watch, 'watches.json');
  return serialise(`${file}#upsert`, async () => {
    const watches = await readJson(file, []);
    const next = watches.some((w) => w.id === watch.id)
      ? watches.map((w) => (w.id === watch.id ? watch : w))
      : [...watches, watch];
    await writeJson(file, next);
    return watch;
  });
}

/** @returns {Promise<Watch[]>} */
export const listWatches = () => readJson(path.join(dirs.watch, 'watches.json'), []);

export async function appendWatchHistory(watchId, reportId) {
  const file = path.join(dirs.watch, `${assertId(watchId)}.json`);
  return serialise(`${file}#append`, async () => {
    const history = await readJson(file, []);
    await writeJson(file, [...history, reportId]);
  });
}

export const getWatchHistory = (watchId) => readJson(path.join(dirs.watch, `${assertId(watchId)}.json`), []);

export const saveRace = (race) => writeJson(path.join(dirs.races, `${assertId(race.id)}.json`), race);
export const getRace = (id) => readJson(path.join(dirs.races, `${assertId(id)}.json`));
