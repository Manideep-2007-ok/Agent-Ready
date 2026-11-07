// Confirm results (P2-1, D41): run a task a second time with the same network identity, and a third time only when the
// two disagree. The majority decides; a disagreement marks the task "flaky". Opt-in, because every run costs agent steps.
import { runTask } from './runner.js';

/** @typedef {import('./types.js').TaskResult} TaskResult */
/** @typedef {import('./types.js').RepeatRun} RepeatRun */

/** Summary of one run for TaskResult.runs. */
export function runSummary(t) {
  return { runId: t.runId, passed: t.status === 'passed', numSteps: t.numSteps || 0, seconds: t.seconds || 0,
    blocker: t.blocker ?? null, answer: t.answer ? String(t.answer).slice(0, 300) : null };
}

/**
 * Worth confirming? Not a stopped task, not a replay placeholder, not a run that never started, and not a bot wall the
 * cascade already proved on every attempt (a re-run there would repeat the same stealth run at full price).
 */
export function canConfirm(t) {
  return !!t.runId && !t.replayNote && t.status !== 'cancelled' && t.status !== 'blocked';
}

/**
 * Majority of the runs (first = the bot-wall cascade's result, the rest plain repeats). Pure.
 * The task shown is the first run when it agrees with the majority, else the first repeat that does; it keeps the
 * cascade's attempts and verdict (the evidence of any wall).
 * @param {TaskResult} first
 * @param {TaskResult[]} repeats
 * @returns {TaskResult}
 */
export function decideMajority(first, repeats) {
  const all = [first, ...repeats];
  const passes = all.filter((t) => t.status === 'passed').length;
  const majorityPassed = passes * 2 > all.length;
  const pick = all.find((t) => (t.status === 'passed') === majorityPassed) ?? first;
  const flaky = passes > 0 && passes < all.length;
  const shown = pick === first ? first : { ...pick, attempts: first.attempts, verdict: first.verdict };
  return { ...shown, runs: all.map(runSummary), flaky };
}

/**
 * Confirm one finished task. Never throws; a stop during a repeat returns what was decided so far (a stopped repeat
 * is left out of the majority: it proves nothing about the site). The lane keeps showing the first result with
 * `confirming: {run, of}` while a repeat runs; the repeat's own live steps are not shown.
 * @param {TaskResult} first
 * @param {{url:string, customText?:string}} p
 * @returns {Promise<TaskResult>}
 */
export async function confirmTask(first, { url, customText }, onEvent, ctx = null) {
  if (!canConfirm(first) || ctx?.cancelled) return first;
  const emit = (task) => { try { onEvent?.({ kind: 'task-update', task }); } catch { /* ignore */ } };
  const repeats = [];
  const stopped = []; // stopped repeats: not in the majority, but their steps were billed
  const runOnce = async (run, of) => {
    emit({ ...first, confirming: { run, of } });
    // Repeat events are not the lane's: only the closing update (below) changes what the lane shows.
    return runTask({ url, taskId: first.taskId, customText, mode: first.mode, proxy: first.proxy, emitFinal: false }, null, ctx);
  };
  try {
    const second = await runOnce(2, 2);
    (second.status === 'cancelled' ? stopped : repeats).push(second);
    const disagree = repeats.length === 1 && (second.status === 'passed') !== (first.status === 'passed');
    if (disagree && !ctx?.cancelled) {
      const third = await runOnce(3, 3);
      (third.status === 'cancelled' ? stopped : repeats).push(third);
    }
  } catch { /* keep what we have */ }
  const final = repeats.length ? decideMajority(first, repeats) : { ...first, runs: [runSummary(first)], flaky: false };
  // Steps of stopped repeats still cost money: listed so the cost meter counts them.
  for (const t of stopped) final.runs.push({ ...runSummary(t), stopped: true });
  emit(final);
  return final;
}
