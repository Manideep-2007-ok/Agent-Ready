// Overview: bot-wall banner, demo-store before/after, Top 3 fixes and the task ledger (T1-T4 + your task). While a test
// runs (or after it was stopped) the live agent lanes are here instead; once it is done the table is enough, and each
// task's steps, answer and checks are in the Steps tab.
import { TASK_LABELS } from '@agentready/engine/goals';
import { Badge, Ledger, Panel, StatusBadge } from '../../../design/index.js';
import Lane from '../../../components/Lane.jsx';
import TopFixes from '../../../components/TopFixes.jsx';

const BOT_WALL_TEXT = {
  'blocks-cloud-agents': 'This site blocks AI agents that come from cloud servers. They only got in through an Indian home-network address.',
  'blocks-automation': 'This site blocks automated browsers. Agents only got in with a stealth browser.',
  'site-broken': 'Agents could not use this site at all, even with every workaround.',
};

/** Runs line for a confirmed task: "2/2 agree" or "passed 2 of 3". */
function runsText(t) {
  const runs = (t.runs ?? []).filter((r) => !r.stopped);
  if (runs.length < 2) return '–';
  const ok = runs.filter((r) => r.passed).length;
  return t.flaky ? `passed ${ok} of ${runs.length}` : `${runs.length}/${runs.length} agree`;
}
function claimText(t) {
  if (!t.claim) return '–';
  return t.claim.status === 'confirmed' ? 'on the page' : t.claim.status === 'off-site' ? 'another site' : 'not on the page';
}

export function TaskLedger({ tasks }) {
  const ordered = [...tasks.filter((t) => t.taskId !== 'custom'), ...tasks.filter((t) => t.taskId === 'custom')];
  let n = 0;
  return (
    <Panel label="Tasks" className="ar-task-ledger ar-panel--plain">
      <Ledger
        caption="Tasks the agents tried"
        columns={[
          { key: 'task', label: 'Task' },
          { key: 'steps', label: 'Steps', align: 'right', mono: true },
          { key: 'time', label: 'Time', align: 'right', mono: true, hideOnPhone: true },
          // Only when the test measured them: confirm runs (D41) and claim checks (D42).
          ...(tasks.some((t) => (t.runs ?? []).length > 1) ? [{ key: 'runs', label: 'Runs', hideOnPhone: true, mono: true }] : []),
          ...(tasks.some((t) => t.claim) ? [{ key: 'claim', label: 'Answer check', hideOnPhone: true }] : []),
          { key: 'result', label: 'Result', align: 'right' },
        ]}
        rows={ordered.map((t) => ({
          id: t.taskId === 'custom' ? 'YOU' : `T${++n}`,
          cells: {
            task: (
              <span className="ar-task-cell">
                {t.taskId === 'custom' ? 'Your task' : TASK_LABELS[t.taskId] ?? t.taskId}
                {t.steps?.some((s) => s.usedWebSearch) && <span className="ar-mono ar-accent"> · web search</span>}
                {t.replayNote && <span className="ar-faint ar-small">{t.taskId === 'custom' ? 'Not run in replay mode' : 'No recording: not run'}</span>}
              </span>
            ),
            steps: t.numSteps ?? 0,
            time: `${Math.round(t.seconds || 0)}s`,
            runs: runsText(t),
            claim: claimText(t),
            result: t.flaky ? <span className="ar-badges"><StatusBadge status={t.status} verdict={t.verdict} /><Badge tone="warn">Varies</Badge></span>
              : <StatusBadge status={t.status} verdict={t.verdict} />,
          },
        }))}
      />
    </Panel>
  );
}

/**
 * @param {{report:object|null, tasks:object[], fixes:object[], onJump:(rank:number)=>void, onShotClick:(u:string)=>void,
 *   waitReason:string, demo:any, stoppedPanel:any}} props
 */
export default function OverviewTab({ report, tasks, fixes, onJump, onShotClick, waitReason, demo, stoppedPanel }) {
  const wall = report?.status === 'complete' && BOT_WALL_TEXT[report.botWall];
  const finished = report?.status === 'complete';
  return (
    <div className="ar-stack">
      {wall && <div className="ar-banner ar-banner--fail" role="alert"><span className="ar-label">Blocked</span>{wall}</div>}
      {stoppedPanel}
      {demo}
      {finished && <TopFixes fixes={fixes} onJump={onJump} />}
      {finished && <TaskLedger tasks={report.tasks} />}
      {!finished && (
        <section aria-label="Agents">
          <div className="ar-section-head"><span className="ar-label">Agent runs</span></div>
          <div className={`lanes${tasks.length >= 4 ? ' lanes-4' : ''}`}>
            {tasks.map((task) => <Lane key={task.taskId} task={task} onShotClick={onShotClick} waitReason={waitReason} />)}
          </div>
        </section>
      )}
    </div>
  );
}
