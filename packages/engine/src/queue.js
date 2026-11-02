// Run queue: at most config.maxParallel agent runs at once. Waiting runs start by priority, then first come first served.
//   priority 0 = a person is waiting (web, CLI, race)   priority 1 = background (Watch checks)
// So a scheduled Watch check can never push a user's test to the back of the line (it only waits for a free slot).
// `group` (a report id) lets a whole test be dropped from the queue at once when it is cancelled.
import { config } from './config.js';

export class QueueCancelled extends Error {
  constructor(message = 'Removed from the queue') { super(message); this.name = 'QueueCancelled'; this.code = 'QUEUE_CANCELLED'; }
}

export const PRIORITY = Object.freeze({ user: 0, background: 1 });
/** Watch checks are background work; everything a person starts is first in line. */
export const priorityForSource = (source) => (source === 'watch' ? PRIORITY.background : PRIORITY.user);

/** @type {{seq:number, priority:number, group:string|null, source:string, start:()=>void, reject:(e:Error)=>void}[]} */
const waiting = [];
/** @type {Set<{group:string|null, source:string}>} */
const active = new Set();
let seq = 0;

function next() {
  while (active.size < config.maxParallel && waiting.length) {
    let best = 0;
    for (let i = 1; i < waiting.length; i++) {
      if (waiting[i].priority < waiting[best].priority) best = i; // ties keep the earlier entry (FIFO)
    }
    waiting.splice(best, 1)[0].start();
  }
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{onQueued?: () => void, onStart?: () => void, priority?: number, group?: string|null, source?: string}} [opts]
 * @returns {Promise<T>} rejects with QueueCancelled if the group is cancelled while this entry waits
 */
export function enqueue(fn, { onQueued, onStart, priority = PRIORITY.user, group = null, source = 'web' } = {}) {
  return new Promise((resolve, reject) => {
    const slot = { group, source };
    const start = () => {
      active.add(slot);
      try { onStart?.(); } catch { /* hooks must not break the queue */ }
      Promise.resolve().then(fn).then(resolve, reject).finally(() => { active.delete(slot); next(); });
    };
    if (active.size < config.maxParallel) start();
    else {
      try { onQueued?.(); } catch { /* ignore */ }
      waiting.push({ seq: seq++, priority, group, source, start, reject });
    }
  });
}

/** Drop every waiting entry of a group. Running ones are not touched (the caller aborts them). Returns how many were dropped. */
export function cancelGroup(group) {
  let dropped = 0;
  for (let i = waiting.length - 1; i >= 0; i--) {
    if (waiting[i].group !== group) continue;
    const [entry] = waiting.splice(i, 1);
    entry.reject(new QueueCancelled());
    dropped++;
  }
  return dropped;
}

export const getQueueSize = () => waiting.length;
export const getRunningCount = () => active.size;

/** What is using the agent slots right now. Shown in /api/health and used to explain "Waiting for an agent". */
export function getQueueState() {
  const bySource = {};
  const groups = {};
  const bump = (source, group, key) => {
    bySource[source] ??= { running: 0, queued: 0 };
    bySource[source][key]++;
    if (group) {
      groups[group] ??= { source, running: 0, queued: 0 };
      groups[group][key]++;
    }
  };
  for (const a of active) bump(a.source, a.group, 'running');
  for (const w of waiting) bump(w.source, w.group, 'queued');
  return { maxParallel: config.maxParallel, running: active.size, queued: waiting.length, bySource, groups };
}
