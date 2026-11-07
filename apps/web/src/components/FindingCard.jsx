// One finding, answering the six questions in plain words (What happened? Where? Why? How bad? How to fix? How do we
// know?). Causes are inferred, so they are shown as "Likely cause" and always name a site cause (D22).
import { useState } from 'react';
import { TASK_LABELS } from '@agentready/engine/goals';
import { Badge } from '../design/index.js';

const BOT_WALL_TYPES = ['blocks-cloud-agents', 'blocks-automation', 'site-broken'];
const SEVERITY = { critical: ['fail', 'Critical'], high: ['fail', 'High'], medium: ['warn', 'Medium'], low: ['wait', 'Low'] };
const IMPACT = { critical: 'AI agents cannot get in.', high: 'Blocks an everyday task.', medium: 'Slows agents down.', low: 'Worth fixing.' };

function whereText(finding, taskIds, totalTasks) {
  if (!taskIds.length) return 'Found by the Instant Scan';
  if (taskIds.length === 1) return `While trying to: ${TASK_LABELS[taskIds[0]] ?? taskIds[0]}`;
  const verb = BOT_WALL_TYPES.includes(finding.type) ? 'Blocked' : 'Found on';
  const count = taskIds.length === totalTasks ? `all ${taskIds.length} tasks` : `${taskIds.length} tasks`;
  return `${verb} ${count}: ${taskIds.map((id) => TASK_LABELS[id] ?? id).join(', ')}`;
}

/**
 * @param {{finding:object, n:number, taskIds?:string[], totalTasks?:number, rank?:number, onShotClick?:(u:string)=>void}} props
 * n: position in the list (F1, F2...); rank: 1-3 when this finding is one of the Top 3 fixes.
 */
export default function FindingCard({ finding, n, taskIds = finding.taskId ? [finding.taskId] : [], totalTasks, rank, onShotClick }) {
  const [shotFailed, setShotFailed] = useState(false);
  const [tone, word] = SEVERITY[finding.severity] ?? ['neutral', finding.severity];
  const impact = finding.pointsIfFixed > 0
    ? `${IMPACT[finding.severity] ?? ''} Fixing it can add up to ${finding.pointsIfFixed} points to the score.`
    : `${IMPACT[finding.severity] ?? ''} Not part of the 100-point score, but it gets in AI agents' way.`;
  return (
    <article id={rank ? `top-fix-${rank}` : undefined} className="ar-panel ar-finding">
      <header className="ar-finding-head">
        <span className="ar-mono ar-faint">F{n}</span>
        <h3>{finding.text}</h3>
        <span className="ar-badges">
          {rank && <Badge tone="accent">Top fix {rank}</Badge>}
          <Badge tone={tone}>{word}</Badge>
        </span>
      </header>
      <dl className="ar-finding-qa">
        <dt>What happened?</dt>
        <dd>{finding.text}</dd>
        <dt>Where exactly?</dt>
        <dd>
          {whereText(finding, taskIds, totalTasks)}
          {finding.element?.htmlSnippet && <pre className="ar-snippet">{finding.element.htmlSnippet}</pre>}
          {finding.screenshotUrl && !shotFailed && (
            <button type="button" className="ar-finding-shot" onClick={() => onShotClick?.(finding.screenshotUrl)}>
              <img src={finding.screenshotUrl} alt="Screen where the agent got stuck" onError={() => setShotFailed(true)} loading="lazy" />
            </button>
          )}
        </dd>
        <dt>Why does it break AI agents?</dt>
        <dd>{finding.likelyCause ? <><b>Likely cause:</b> {finding.likelyCause}</> : 'No cause recorded.'}</dd>
        <dt>How bad is it?</dt>
        <dd>{impact}</dd>
        <dt>How to fix it?</dt>
        <dd>
          {finding.fix || 'Get the detailed fix report for the steps.'}
          {finding.standard && <div className="ar-faint ar-small">Standard: {finding.standard}</div>}
          {finding.frameworkExample && <pre className="ar-snippet">{finding.frameworkExample}</pre>}
        </dd>
        <dt>How do we know it&apos;s fixed?</dt>
        <dd>{finding.passCheck || 'Run the test again: this finding should be gone.'}</dd>
      </dl>
    </article>
  );
}
