// Top 3 fixes (D25: severity first, then points, one per finding type; ranked by the server). Each row says what to
// fix, where and what it is worth; clicking it opens the finding on the Findings tab.
import { TASK_LABELS } from '@agentready/engine/goals';
import { Badge, Panel } from '../design/index.js';

const SEVERITY = { critical: ['fail', 'Critical'], high: ['fail', 'High'], medium: ['warn', 'Medium'], low: ['wait', 'Low'] };

/** @param {{fixes: object[], onJump?: (rank:number)=>void}} props  taskCount on a fix: how many tasks one fix covers */
export default function TopFixes({ fixes, onJump }) {
  if (!fixes.length) return <Panel label="Top fixes"><p className="ar-panel-body ar-muted">No fixes needed: AI agents could do every task.</p></Panel>;
  return (
    <Panel label={fixes.length === 1 ? 'Top fix' : `Top ${fixes.length} fixes`} className="ar-topfixes">
      <ol className="ar-topfix-list">
        {fixes.map((f, i) => {
          const [tone, word] = SEVERITY[f.severity] ?? ['neutral', f.severity];
          return (
            <li key={`${f.type}|${f.taskId ?? ''}`}>
              <button type="button" className="ar-topfix" onClick={() => onJump?.(i + 1)}>
                <span className="ar-topfix-n">{i + 1}</span>
                <span className="ar-topfix-text">
                  <b>{f.fix || f.text}</b>
                  <span className="ar-muted">
                    {f.taskCount > 1 ? `${f.taskCount} tasks` : f.taskId ? TASK_LABELS[f.taskId] ?? f.taskId : 'Instant Scan'}
                    {' · '}
                    {f.pointsIfFixed > 0 ? `up to +${f.pointsIfFixed} points` : 'not part of the score'}
                  </span>
                </span>
                <Badge tone={tone}>{word}</Badge>
              </button>
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
