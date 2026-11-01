// Promise pool: at most config.maxParallel agent runs at once, the rest wait in FIFO order.
import { config } from './config.js';

const waiting = []; // { start } functions
let running = 0;

function next() {
  while (running < config.maxParallel && waiting.length) waiting.shift()();
}

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{onQueued?: () => void, onStart?: () => void}} [hooks]
 * @returns {Promise<T>}
 */
export function enqueue(fn, { onQueued, onStart } = {}) {
  return new Promise((resolve, reject) => {
    const start = () => {
      running++;
      try { onStart?.(); } catch { /* hooks must not break the queue */ }
      Promise.resolve().then(fn).then(resolve, reject).finally(() => { running--; next(); });
    };
    if (running < config.maxParallel) start();
    else {
      try { onQueued?.(); } catch { /* ignore */ }
      waiting.push(start);
    }
  });
}

export const getQueueSize = () => waiting.length;
export const getRunningCount = () => running;
