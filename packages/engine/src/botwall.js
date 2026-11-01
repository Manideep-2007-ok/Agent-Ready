// Bot-wall cascade: no proxy -> India proxy -> stealth + India proxy (docs/ARCHITECTURE.md section 6).
import { runTask, looksBlocked } from './runner.js';
import { config } from './config.js';
export { siteVerdict } from './scoring.js';

/** @typedef {import('./types.js').TaskResult} TaskResult */
const RETRY_PAUSE_MS = 1500; // lets the lane show 'Blocked' before the retry starts
const PLAN = [
  { mode: 'lite', proxy: 'off' }, // how cloud AI agents arrive
  { mode: 'lite', proxy: 'IN' },
  { mode: 'stealth', proxy: 'IN' },
];

/**
 * Run a task; only if it fails AND looks blocked, retry with a proxy, then stealth.
 * Returns the last attempt's TaskResult plus `attempts[]` and `verdict`.
 * Verdict: passed on attempt 1 -> none, 2 -> blocks-cloud-agents, 3 -> blocks-automation,
 * blocked on every attempt tried -> site-broken. A normal failure on attempt 1 -> none (no re-run).
 * A normal failure after the wall was already passed (attempt 2 or 3) -> verdict of that wall.
 */
export async function runTaskWithBotWall({ url, taskId, customText }, onEvent) {
  const attempts = [];
  let result;
  for (let i = 0; i < PLAN.length; i++) {
    const { mode, proxy } = PLAN[i];
    if (i > 0) onEvent?.({ kind: 'attempt', taskId, attempt: i + 1, mode, proxy });
    result = await runTask({ url, taskId, customText, mode, proxy, emitFinal: false, attempts }, onEvent);
    // numSteps feeds the cost meter; blocker + screenshotUrl keep the evidence of the wall after a later attempt passes.
    const lastStep = result.steps[result.steps.length - 1];
    attempts.push({ mode, proxy, runId: result.runId, passed: result.status === 'passed', numSteps: result.numSteps,
      blocker: result.blocker, screenshotUrl: lastStep?.screenshotUrl || null });
    if (result.status === 'passed' || !looksBlocked(result)) break;
    if (i < PLAN.length - 1) {
      // Lane shows 'blocked' for a moment, then the retry (queued/running updates carry attempts so far + the new mode/proxy).
      onEvent?.({ kind: 'task-update', task: { ...result, attempts: [...attempts] } });
      // Held outside the queue, so no agent slot waits on it. Mock speed only shortens it in mock mode.
      const speed = Number(process.env.TINYFISH_MOCK_SPEED);
      await new Promise((r) => setTimeout(r, RETRY_PAUSE_MS / (config.mock && Number.isFinite(speed) && speed > 0 ? speed : 1)));
    }
  }
  const last = attempts.length - 1;
  const passed = result.status === 'passed';
  const blocked = looksBlocked(result);
  let verdict;
  if (last === 0) verdict = 'none'; // passed first time, or a normal failure (blocked ones always retry)
  else if (passed || !blocked) verdict = last === 1 ? 'blocks-cloud-agents' : 'blocks-automation';
  else verdict = 'site-broken';
  const final = { ...result, attempts, verdict };
  onEvent?.({ kind: 'task-update', task: final });
  return final;
}
