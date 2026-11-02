// Small in-memory rate limit: at most `max` requests per `windowMs` per client IP and per bucket.
// Every start-a-test style endpoint spends money (agent steps), so a runaway script or a stuck "double click" must
// not be able to start dozens. The server listens on 127.0.0.1, so "client IP" is normally the person at the laptop.

const hits = new Map(); // `${bucket}|${ip}` -> timestamps (ms) inside the window
const SWEEP_MS = 60_000;

export const RATE_LIMIT_PER_MIN = () => {
  const n = Number(process.env.RATE_LIMIT_PER_MIN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
};

/**
 * @param {string} bucket  e.g. 'tests', 'watch-create', 'watch-run'
 * @param {{max?: number, windowMs?: number}} [opts]  `max` defaults to RATE_LIMIT_PER_MIN (10)
 */
export function rateLimit(bucket, { max, windowMs = 60_000 } = {}) {
  return (req, res, next) => {
    const limit = max ?? RATE_LIMIT_PER_MIN();
    const key = `${bucket}|${req.ip || req.socket?.remoteAddress || 'unknown'}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) {
      const retryAfter = Math.max(1, Math.ceil((windowMs - (now - recent[0])) / 1000));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: `You are starting tests too fast (limit: ${limit} per minute). Please wait ${retryAfter} seconds and try again.` });
    }
    recent.push(now);
    hits.set(key, recent);
    return next();
  };
}

/** For tests: forget every counter. */
export const resetRateLimits = () => hits.clear();

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [key, list] of hits) {
    const fresh = list.filter((t) => now - t < 60_000);
    if (fresh.length) hits.set(key, fresh); else hits.delete(key);
  }
}, SWEEP_MS);
sweeper.unref();
