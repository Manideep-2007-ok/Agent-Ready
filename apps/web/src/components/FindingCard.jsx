// One finding, answering the six questions from ARCHITECTURE.md section 13 in plain words.
// Causes are inferred, so they are always shown as "Likely cause" and always name a site cause (D22).
import { useState } from 'react';
import { TASK_LABELS } from '@agentready/engine/goals';

/** @typedef {import('@agentready/engine/types').Finding} Finding */

const SEVERITY = {
  critical: 'Critical: AI shoppers cannot get in',
  high: 'High: blocks an everyday task',
  medium: 'Medium: slows agents down',
  low: 'Low: worth fixing',
};

/**
 * @param {{finding: Finding, rank?: number, onShotClick?: (url:string)=>void}} props
 * rank: 1-3 when this finding is one of the Top 3 fixes.
 */
export default function FindingCard({ finding, rank, onShotClick }) {
  // Some steps have no screenshot (e.g. the agent's final "report" step): hide the picture instead of a broken icon.
  const [shotFailed, setShotFailed] = useState(false);
  const where = finding.taskId ? `While trying to: ${TASK_LABELS[finding.taskId] ?? finding.taskId}` : 'On the home page (Instant Scan)';
  const impact = finding.pointsIfFixed > 0
    ? `Fixing this can add up to ${finding.pointsIfFixed} points to the score.`
    : 'Not part of the 100-point score, but it gets in AI shoppers’ way.';

  return (
    <article className={`card finding sev-${finding.severity}`}>
      <header className="finding-head">
        <span className={`chip sev-chip sev-${finding.severity}`}>{SEVERITY[finding.severity] ?? finding.severity}</span>
        {rank && <span className="chip top-chip">Top fix #{rank}</span>}
      </header>

      <dl className="finding-qa">
        <dt>What happened?</dt>
        <dd>{finding.text}</dd>

        <dt>Where exactly?</dt>
        <dd>
          {where}
          {finding.element?.htmlSnippet && <pre className="snippet">{finding.element.htmlSnippet}</pre>}
          {finding.screenshotUrl && !shotFailed && (
            <button type="button" className="finding-shot" onClick={() => onShotClick?.(finding.screenshotUrl)}>
              <img src={finding.screenshotUrl} alt="Screen where the agent got stuck" onError={() => setShotFailed(true)} />
            </button>
          )}
        </dd>

        <dt>Why does it break AI agents?</dt>
        <dd>{finding.likelyCause ? <><b>Likely cause:</b> {finding.likelyCause}</> : 'No cause recorded.'}</dd>

        <dt>How bad is it?</dt>
        <dd>{impact}</dd>

        <dt>How to fix it?</dt>
        <dd>
          {finding.fix || 'See the Detailed Fix Report.'}
          {finding.standard && <div className="muted">Standard: {finding.standard}</div>}
          {finding.frameworkExample && <pre className="snippet">{finding.frameworkExample}</pre>}
        </dd>

        <dt>How do we know it&apos;s fixed?</dt>
        <dd>{finding.passCheck || 'Run the test again: this finding should be gone.'}</dd>
      </dl>
    </article>
  );
}
