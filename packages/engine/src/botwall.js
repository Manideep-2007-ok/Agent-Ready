// Bot-wall cascade: no proxy -> India proxy -> stealth + India proxy (docs/ARCHITECTURE.md section 6).
import { runTask, looksBlocked, saysRefused, REFUSED_RE } from './runner.js';
import { config } from './config.js';
export { siteVerdict } from './scoring.js';

/** @typedef {import('./types.js').TaskResult} TaskResult */
/** Wait ms; an aborted signal ends the wait early (no error). */
const pause = (ms, signal) => new Promise((resolve) => {
  if (signal?.aborted) return resolve();
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
});
const RETRY_PAUSE_MS = 1500; // lets the lane show 'Blocked' before the retry starts
const PLAN = [
  { mode: 'lite', proxy: 'off' }, // how cloud AI agents arrive
  { mode: 'lite', proxy: 'IN' },
  { mode: 'stealth', proxy: 'IN' },
];

// D26: an agent that took this many steps on the site with an Indian home address got past any wall, so an error
// that still looks like a block (e.g. the site's own "Something went wrong") is the site failing, not a bot wall.
export const SITE_FAILURE_MIN_STEPS = 5;

/** After the India-proxy attempt (index 1): failed, still looks blocked, but the agent clearly used the site. */
export function isSiteFailure(result, attemptIndex) {
  if (REFUSED_RE.test(result.blocker || '')) return false; // a 403 is a wall, however many pages the agent tried
  return attemptIndex === 1 && result.status !== 'passed' && looksBlocked(result) && (result.numSteps || 0) >= SITE_FAILURE_MIN_STEPS;
}

/**
 * Run a task; only if it fails AND looks blocked, retry with a proxy, then stealth.
 * Returns the last attempt's TaskResult plus `attempts[]` and `verdict`.
 * Verdict: passed on attempt 1 -> none, 2 -> blocks-cloud-agents, 3 -> blocks-automation,
 * blocked on every attempt tried -> site-broken. A normal failure on attempt 1 -> none (no re-run).
 * A normal failure after the wall was already passed (attempt 2 or 3) -> verdict of that wall.
 * Still "blocked" on the India-proxy attempt after 5+ steps -> the site's own error: stop, verdict none (D26).
 */
export async function runTaskWithBotWall({ url, taskId, customText }, onEvent, ctx = null) {
  const attempts = [];
  let result;
  let siteFailure = false;
  for (let i = 0; i < PLAN.length; i++) {
    const { mode, proxy } = PLAN[i];
    if (i > 0) onEvent?.({ kind: 'attempt', taskId, attempt: i + 1, mode, proxy });
    result = await runTask({ url, taskId, customText, mode, proxy, emitFinal: false, attempts }, onEvent, ctx);
    // Refused but "passed": the site said 403/forbidden and the agent answered from elsewhere. Not a pass on this site,
    // and the answer is not step-backed (D13): drop it and treat the attempt as blocked, so the cascade tries again.
    if (saysRefused(result)) {
      result = { ...result, status: 'failed', answer: null,
        blocker: `The site refused the agent (${(result.answer.match(REFUSED_RE) || ['403'])[0]}); its answer came from somewhere else, not the site.` };
    }
    // numSteps feeds the cost meter; blocker + screenshotUrl keep the evidence of the wall after a later attempt passes.
    const lastStep = result.steps[result.steps.length - 1];
    attempts.push({ mode, proxy, runId: result.runId, passed: result.status === 'passed', numSteps: result.numSteps,
      blocker: result.blocker, screenshotUrl: lastStep?.screenshotUrl || null });
    // CANCELLED is final (a Stop click, a cancelled TinyFish run): never a "blocked" retry, never a new run.
    if (result.status === 'cancelled' || ctx?.cancelled) break;
    if (result.status === 'passed' || !looksBlocked(result)) break;
    if (isSiteFailure(result, i)) { siteFailure = true; break; } // D26: not a wall, the site itself is failing
    if (i < PLAN.length - 1) {
      // Lane shows 'blocked' for a moment, then the retry (queued/running updates carry attempts so far + the new mode/proxy).
      onEvent?.({ kind: 'task-update', task: { ...result, attempts: [...attempts] } });
      // Held outside the queue, so no agent slot waits on it. Mock speed only shortens it in mock mode.
      const speed = Number(process.env.TINYFISH_MOCK_SPEED);
      await pause(RETRY_PAUSE_MS / (config.mock && Number.isFinite(speed) && speed > 0 ? speed : 1), ctx?.signal);
      if (ctx?.cancelled) { result = { ...result, status: 'cancelled', blocker: 'The test was stopped before this task finished.' }; break; }
    }
  }
  const last = attempts.length - 1;
  const passed = result.status === 'passed';
  const blocked = looksBlocked(result);
  let verdict;
  if (last === 0 || siteFailure || result.status === 'cancelled') verdict = 'none'; // passed first time, a normal failure, or the site's own error (D26)
  else if (passed || !blocked) verdict = last === 1 ? 'blocks-cloud-agents' : 'blocks-automation';
  else verdict = 'site-broken';
  const final = { ...result, attempts, verdict };
  onEvent?.({ kind: 'task-update', task: final });
  return final;
}
