// Top 3 fixes (D25: severity first, then points, one per finding type; ranked by the server).
// Each line says what to fix, where, and what it is worth; clicking it jumps to the full finding card.
import { TASK_LABELS } from '@agentready/engine/goals';

/** @typedef {import('@agentready/engine/types').Finding} Finding */

const SEVERITY_WORD = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };

/** @param {{fixes: (Finding & {taskCount?: number})[], onJump?: (rank:number)=>void}} props  taskCount: tasks one fix covers */
export default function TopFixes({ fixes, onJump }) {
  if (!fixes.length) return <p className="top-fixes-none">No fixes needed: AI agents could do every task.</p>;
  return (
    <div className="top-fixes">
      <h2>{fixes.length === 1 ? 'Top fix' : `Top ${fixes.length} fixes`}</h2>
      <ol>
        {fixes.map((f, i) => (
          <li key={`${f.type}|${f.taskId ?? ''}`}>
            <button type="button" className="top-fix" onClick={() => onJump?.(i + 1)}>
              <span className={`chip sev-chip sev-${f.severity}`}>{SEVERITY_WORD[f.severity] ?? f.severity}</span>
              <span className="top-fix-text">
                <b>{f.fix || f.text}</b>
                <span className="muted">
                  {f.taskCount > 1 ? `${f.taskCount} tasks` : f.taskId ? TASK_LABELS[f.taskId] ?? f.taskId : 'Home page (Instant Scan)'}
                  {' · '}
                  {f.pointsIfFixed > 0 ? `up to +${f.pointsIfFixed} points` : 'not part of the score'}
                </span>
              </span>
              <span className="top-fix-go" aria-hidden="true">See details ↓</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
