// Engine settings from environment variables (see docs/ARCHITECTURE.md section 18).
// Read once at import. Scripts that use `node --env-file=.env` populate env before import, so this works.
const num = (v, d) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);

export const config = Object.freeze({
  apiKey: process.env.TINYFISH_API_KEY || '',
  maxParallel: Math.floor(num(process.env.TINYFISH_MAX_PARALLEL, 2)),
  maxDurationSeconds: num(process.env.TINYFISH_MAX_DURATION_SECONDS, 150),
  pollIntervalMs: num(process.env.TINYFISH_POLL_INTERVAL_MS, 3000), // how often a dropped live stream is polled (tests shorten it)
  mock: ['1', 'true'].includes(String(process.env.TINYFISH_MOCK || '').toLowerCase()),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
  llmProvider: process.env.LLM_PROVIDER || '',
  llmApiKey: process.env.LLM_API_KEY || '',
  // Cost limit per test in rupees (D43): the test stops when its agents have spent this much. 0 turns it off.
  budgetPerTestRupees: Number.isFinite(Number(process.env.BUDGET_PER_TEST_RUPEES)) && process.env.BUDGET_PER_TEST_RUPEES !== ''
    ? Math.max(0, Number(process.env.BUDGET_PER_TEST_RUPEES)) : 300,
});

/** Call before a REAL TinyFish request. Returns the key or throws a plain message (never prints the key). */
export function requireApiKey() {
  if (!config.apiKey) throw new Error('TINYFISH_API_KEY is not set. Add it to .env or set TINYFISH_MOCK=1');
  return config.apiKey;
}
