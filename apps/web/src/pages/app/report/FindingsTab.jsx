// Findings: the Detailed Fix Report button, then every finding (task and Instant Scan, D25) grouped and ranked, the
// Top 3 marked. Redesign spec 5.3.
import { useState } from 'react';
import { Button, EmptyState, Panel } from '../../../design/index.js';
import FindingCard from '../../../components/FindingCard.jsx';
import { buildFixes } from '../../../api.js';

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const findingKey = (f) => `${f.type}|${f.taskId ?? ''}`;

/** The same finding on several tasks (one bot wall that blocked all four) is one card; points add up. */
export function groupFindings(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = `${f.type}|${f.text}`;
    const g = groups.get(key);
    if (!g) groups.set(key, { ...f, taskIds: f.taskId ? [f.taskId] : [], members: [f] });
    else {
      if (f.taskId && !g.taskIds.includes(f.taskId)) g.taskIds.push(f.taskId);
      g.pointsIfFixed = (g.pointsIfFixed ?? 0) + (f.pointsIfFixed ?? 0);
      g.screenshotUrl ??= f.screenshotUrl;
      g.members.push(f);
    }
  }
  return [...groups.values()].sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || (b.pointsIfFixed ?? 0) - (a.pointsIfFixed ?? 0));
}

export const allFindings = (report) => [...report.tasks.flatMap((t) => t.findings ?? []), ...(report.scanFindings ?? [])];

function FixReport({ report, onEnriched }) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState('');
  const ready = state === 'done' || report.tasks.some((t) => (t.findings ?? []).some((f) => f.frameworkExample || f.element));
  const run = async () => {
    setState('building');
    setError('');
    try { onEnriched(await buildFixes(report.id)); setState('done'); } catch (e) { setError(e.message); setState('idle'); }
  };
  return (
    <Panel label="Detailed fix report" actions={
      <Button size="sm" variant={ready ? 'secondary' : 'primary'} onClick={run} loading={state === 'building'} disabled={state === 'building'}>
        {state === 'building' ? 'Writing the fix report…' : ready ? 'Rebuild fix report' : 'Get detailed fix report'}
      </Button>} className="no-print">
      <p className="ar-panel-body ar-muted">
        {ready
          ? "Each finding below now shows the page element, a code example for this site's framework and how to check the fix."
          : 'Opens the page where each agent got stuck, finds the element at fault and writes a fix for your framework.'}
      </p>
      {error && <p className="ar-error" role="alert">{error}</p>}
    </Panel>
  );
}

/** @param {{report:object, onEnriched:(r:object)=>void, onShotClick:(u:string)=>void}} props */
export default function FindingsTab({ report, onEnriched, onShotClick }) {
  const groups = groupFindings(allFindings(report));
  const ranks = new Map((report.topFixes ?? []).map((f, i) => [findingKey(f), i + 1]));
  const rankOf = (g) => g.members.map((f) => ranks.get(findingKey(f))).find(Boolean);
  const totalTasks = report.tasks.filter((t) => t.taskId !== 'custom').length;
  return (
    <div className="ar-stack">
      <FixReport report={report} onEnriched={onEnriched} />
      {groups.length
        ? groups.map((g, i) => <FindingCard key={`${findingKey(g)}-${i}`} n={i + 1} finding={g} taskIds={g.taskIds} totalTasks={totalTasks} rank={rankOf(g)} onShotClick={onShotClick} />)
        : <Panel><EmptyState title="Nothing to fix" body="AI agents could do every task on this site." /></Panel>}
    </div>
  );
}
