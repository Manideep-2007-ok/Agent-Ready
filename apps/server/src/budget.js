// Spending limits (P2-8, D43). Per test: the engine stops a test at BUDGET_PER_TEST_RUPEES (default 300). Per day: this
// server refuses new tests once today's agents have spent BUDGET_PER_DAY_RUPEES (0 or unset = no daily limit).
import * as store from './store.js';
import { httpError } from './validate.js';

const rupees = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
/** Local calendar day, YYYY-MM-DD. */
export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const limits = () => ({
  perTestRupees: process.env.BUDGET_PER_TEST_RUPEES === undefined || process.env.BUDGET_PER_TEST_RUPEES === '' ? 300 : rupees(process.env.BUDGET_PER_TEST_RUPEES),
  perDayRupees: rupees(process.env.BUDGET_PER_DAY_RUPEES),
});

/** What /api/health and /api/estimate show. */
export async function budgetState() {
  const { perTestRupees, perDayRupees } = limits();
  const { spentRupees, tests } = await store.getSpend(today());
  return { perTestRupees, perDayRupees, spentTodayRupees: spentRupees, testsToday: tests,
    leftTodayRupees: perDayRupees ? Math.max(0, Math.round((perDayRupees - spentRupees) * 100) / 100) : null };
}

/** Refuse a new test when today's limit is used up (429, plain words). Replay mode spends nothing and is never refused. */
export async function assertDailyBudget({ mock = false } = {}) {
  if (mock) return;
  const { perDayRupees } = limits();
  if (!perDayRupees) return;
  const { spentRupees } = await store.getSpend(today());
  if (spentRupees >= perDayRupees) {
    throw httpError(429, `Today's testing budget (₹${perDayRupees}) is used up. Tests start again tomorrow, or raise BUDGET_PER_DAY_RUPEES.`);
  }
}

/** Count a finished or stopped test's cost. Never throws. */
export async function recordSpend(report, { mock = false } = {}) {
  if (mock || !report?.costRupees) return;
  await store.addSpend(today(), report.costRupees).catch((err) => console.error('[budget] could not record spend:', err.message));
}
