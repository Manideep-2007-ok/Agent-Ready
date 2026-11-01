// Demo store before/after (ARCHITECTURE.md section 14). The store reads ?flaws=on|off, so "Apply fixes" means:
// re-test the same store at ?flaws=off. The new report's URL keeps the old one (#/test/<new>/<before>) to compare.
import { useEffect, useState } from 'react';
import { TASK_LABELS } from '@agentready/engine/goals';
import { getReport } from '../api.js';

/** @typedef {import('@agentready/engine/types').SiteReport} SiteReport */

export const FLAWS = 'a pop-up covering the page, prices shown only as images, an unlabelled cart button and a hidden returns page';

const sameHost = (a, b) => {
  try { return new URL(a).host === new URL(b).host; } catch { return false; }
};
const flawsOn = (url) => {
  try { return new URL(url).searchParams.get('flaws') === 'on'; } catch { return false; }
};

// Steps an agent spent on a task, counting every attempt (the cost meter counts them too).
const stepsOf = (t) => (t.attempts?.length ? t.attempts.reduce((n, a) => n + (a.numSteps || 0), 0) : t.numSteps ?? t.steps?.length ?? 0);
const totalSteps = (r) => r.tasks.reduce((n, t) => n + stepsOf(t), 0);

/** The effort the fixes saved: total steps, cost, and each task that needed noticeably more steps before. */
function Effort({ before, after }) {
  const slower = after.tasks
    .map((t) => ({ t, was: before.tasks.find((b) => b.taskId === t.taskId) }))
    .filter(({ t, was }) => was && stepsOf(was) - stepsOf(t) >= 3);
  return (
    <ul className="ba-effort">
      <li>Agent steps: <b>{totalSteps(before)} → {totalSteps(after)}</b></li>
      <li>Agent cost: <b>₹{Math.round(before.costRupees)} → ₹{Math.round(after.costRupees)}</b></li>
      {slower.map(({ t, was }) => (
        <li key={t.taskId}>
          {TASK_LABELS[t.taskId] ?? t.taskId}: <b>{stepsOf(was)} → {stepsOf(t)} steps</b>
        </li>
      ))}
    </ul>
  );
}

/**
 * @param {{report: SiteReport|null, beforeId?: string|null, demoStoreUrl: string|null, url: string,
 *   busy: boolean, onApplyFixes: () => void}} props
 * report: the finished report (null while running); url: the address being tested.
 */
export default function DemoStoreCard({ report, beforeId, demoStoreUrl, url, busy, onApplyFixes }) {
  const [before, setBefore] = useState(null);

  useEffect(() => {
    setBefore(null);
    if (beforeId) getReport(beforeId).then(setBefore).catch(() => setBefore(null));
  }, [beforeId]);

  if (!demoStoreUrl || !sameHost(url, demoStoreUrl)) return null;

  // After "Apply fixes": show the jump from the flawed run to this one.
  if (before) {
    const diff = report ? report.score - before.score : null;
    return (
      <section className="card demo-card">
        <div className="before-after">
          <a href={`#/test/${encodeURIComponent(before.id)}`} className="ba-box ba-before">
            <span className="muted">Before fixes</span>
            <b>{before.score}/100</b>
          </a>
          <span className="ba-arrow" aria-hidden="true">→</span>
          <div className="ba-box ba-after">
            <span className="muted">After fixes</span>
            <b>{report ? `${report.score}/100` : 'Testing…'}</b>
          </div>
          {diff !== null && (
            <span className={`chip ${diff > 0 ? 'band-pass' : 'band-warn'}`}>
              {diff > 0 ? `+${diff} points` : diff === 0 ? 'No change' : `${diff} points`}
            </span>
          )}
        </div>
        {report && <Effort before={before} after={report} />}
      </section>
    );
  }

  // A finished run on the flawed store: offer the one-click fix.
  if (report && flawsOn(report.url)) {
    return (
      <section className="card demo-card">
        <p>
          This is our demo store with four flaws switched on: {FLAWS}. Switch them off to see what fixing them does to
          the score.
        </p>
        <button type="button" onClick={onApplyFixes} disabled={busy}>
          {busy ? 'Starting…' : 'Apply fixes and re-test'}
        </button>
      </section>
    );
  }
  return null;
}
