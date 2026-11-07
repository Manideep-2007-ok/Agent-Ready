// Cancellation. One RunContext per test (report id): it owns the AbortController for that test's live streams, knows
// which TinyFish runs are in flight, and can stop everything at once:
//   1. abort the live streams and polling      2. drop this test's tasks from the queue
//   3. tell TinyFish to cancel the runs that are already going (so they stop costing money)
// CANCELLED is final: nothing started for a cancelled test (no bot-wall retry, no queued task) ever runs.
import * as tf from './tinyfish.js';
import { cancelGroup, priorityForSource } from './queue.js';

/** @type {Map<string, RunContext>} */
const contexts = new Map();

export class RunContext {
  /** @param {{id:string, source?:string}} p */
  constructor({ id, source = 'web' }) {
    this.id = id;
    this.source = source;
    this.priority = priorityForSource(source);
    this.controller = new AbortController();
    this.signal = this.controller.signal;
    /** @type {Set<string>} TinyFish run ids that are in flight */
    this.runIds = new Set();
    this.cancelled = false;
    this.reason = null;
    /** Resolves when the cancel calls to TinyFish have been tried (runner waits for it before reading TinyFish's step count). */
    this.cancelDone = Promise.resolve();
    /** Live agent steps spent by this test, and the most it may spend (D43; null = no limit). */
    this.stepsSpent = 0;
    this.maxSteps = null;
  }

  /** Count live steps; once the test's step limit is passed, stop it (reason 'budget'). */
  spend(steps = 1) {
    this.stepsSpent += steps;
    if (this.maxSteps != null && !this.cancelled && this.stepsSpent >= this.maxSteps) this.cancel('budget').catch(() => {});
  }

  /**
   * Remember a run that is in flight. If the test was already stopped (STARTED arrived after the Stop click), nothing
   * would ever cancel this run, so cancel it on TinyFish right now (best effort, never throws).
   */
  trackRun(runId) {
    if (!runId) return;
    if (this.cancelled) {
      const late = Promise.resolve().then(() => tf.cancelRun(runId)).catch(() => {});
      this.cancelDone = Promise.all([this.cancelDone, late]); // the cost read waits for this cancel too
      return;
    }
    this.runIds.add(runId);
  }
  untrackRun(runId) { this.runIds.delete(runId); }

  /**
   * Stop this test. Safe to call twice. `skipRunIds` are runs TinyFish already cancelled (no need to ask again).
   * Resolves when the cancel calls to TinyFish have been tried (they are best effort and never throw).
   * @returns {Promise<{cancelledRuns:number, droppedFromQueue:number}>}
   */
  async cancel(reason = 'stopped', { skipRunIds = [] } = {}) {
    if (this.cancelled) return { cancelledRuns: 0, droppedFromQueue: 0 };
    this.cancelled = true;
    this.reason = reason;
    const droppedFromQueue = cancelGroup(this.id);
    const toCancel = [...this.runIds].filter((r) => !skipRunIds.includes(r));
    this.runIds.clear();
    this.controller.abort();
    // Best effort and bounded: a slow TinyFish must not keep the Stop button waiting (the time cap ends stragglers anyway).
    let finish;
    this.cancelDone = new Promise((r) => { finish = r; });
    const results = await Promise.race([
      Promise.allSettled(toCancel.map((r) => tf.cancelRun(r))),
      new Promise((resolve) => setTimeout(() => resolve(toCancel.map(() => ({ status: 'rejected' }))), 8000).unref?.()),
    ]);
    finish();
    const failed = results.filter((r) => r.status === 'rejected').length;
    if (failed) console.warn(`[engine] ${failed} of ${toCancel.length} run(s) could not be cancelled on TinyFish for ${this.id}; they stop at their time cap`);
    return { cancelledRuns: toCancel.length - failed, droppedFromQueue };
  }

  /** Forget this test (call when it is over). */
  release() { if (contexts.get(this.id) === this) contexts.delete(this.id); }
}

/** Create and register a context for a test. Registering lets cancelReport(id) find it. */
export function createRunContext({ id, source = 'web' }) {
  const ctx = new RunContext({ id, source });
  contexts.set(id, ctx);
  return ctx;
}

export const getRunContext = (id) => contexts.get(id) ?? null;
export const isReportActive = (id) => contexts.has(id);
export const activeReportIds = () => [...contexts.keys()];

/** Stop one test by report id. `found` is false when nothing is running under that id. */
export async function cancelReport(id, reason = 'stopped') {
  const ctx = contexts.get(id);
  if (!ctx) return { found: false, cancelledRuns: 0, droppedFromQueue: 0 };
  return { found: true, ...(await ctx.cancel(reason)) };
}

/** Stop every running test (server or CLI shutting down). */
export async function cancelAll(reason = 'shutdown') {
  const all = await Promise.all([...contexts.values()].map((c) => c.cancel(reason)));
  return { tests: all.length, cancelledRuns: all.reduce((n, r) => n + r.cancelledRuns, 0) };
}
