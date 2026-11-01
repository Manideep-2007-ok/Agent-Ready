// One finding, answering the six questions from ARCHITECTURE.md section 13 in plain words.
// Causes are inferred, so they are always shown as "Likely cause" and always name a site cause (D22).
import { useState } from 'react';
import { TASK_LABELS } from '@agentready/engine/goals';

/** @typedef {import('@agentready/engine/types').Finding} Finding */

const BOT_WALL_TYPES = ['blocks-cloud-agents', 'blocks-automation', 'site-broken'];
const taskList = (ids) => ids.map((id) => TASK_LABELS[id] ?? id).join(', ');

/** "While trying to: Find a price", or for a grouped finding "Blocked all 4 tasks: ..." / "Found on 2 tasks: ...". */
function whereText(finding, taskIds, totalTasks) {
  if (!taskIds.length) return 'On the home page (Instant Scan)';
  if (taskIds.length === 1) return `While trying to: ${TASK_LABELS[taskIds[0]] ?? taskIds[0]}`;
  const verb = BOT_WALL_TYPES.includes(finding.type) ? 'Blocked' : 'Found on';
  const count = taskIds.length === totalTasks ? `all ${taskIds.length} tasks` : `${taskIds.length} tasks`;
  return `${verb} ${count}: ${taskList(taskIds)}`;
}

const SEVERITY = {
  critical: 'Critical: AI shoppers cannot get in',
  high: 'High: blocks an everyday task',
  medium: 'Medium: slows agents down',
  low: 'Low: worth fixing',
};

/**
 * @param {{finding: Finding, taskIds?: string[], totalTasks?: number, rank?: number, onShotClick?: (url:string)=>void}} props
 * taskIds: every task this (grouped) finding hit; defaults to the finding's own task.
 * rank: 1-3 when this finding is one of the Top 3 fixes.
 */
export default function FindingCard({ finding, taskIds = finding.taskId ? [finding.taskId] : [], totalTasks, rank, onShotClick }) {
  // Some steps have no screenshot (e.g. the agent's final "report" step): hide the picture instead of a broken icon.
  const [shotFailed, setShotFailed] = useState(false);
  const where = whereText(finding, taskIds, totalTasks);
  const impact = finding.pointsIfFixed > 0
    ? `Fixing this can add up to ${finding.pointsIfFixed} points to the score.`
    : 'Not part of the 100-point score, but it gets in AI shoppers’ way.';

  return (
    <article id={rank ? `top-fix-${rank}` : undefined} className={`card finding sev-${finding.severity}`}>
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
