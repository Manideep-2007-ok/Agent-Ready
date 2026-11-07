// History per site (P3-4): the score over time and what changed since the previous finished test of the same site.
import { useEffect, useState } from 'react';
import { TASK_LABELS } from '@agentready/engine/goals';
import { getSiteHistory } from '../api.js';
import { EmptyState, Panel, Skeleton } from '../design/index.js';

const W = 320, H = 72, PAD = 8;
const fmt = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

/** Score line, 0-100 on the y axis, one dot per test; the open report's dot is larger. */
function Sparkline({ points, currentId }) {
  const x = (i) => (points.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (points.length - 1));
  const y = (s) => H - PAD - (s / 100) * (H - 2 * PAD);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(' ');
  return (
    <svg className="history-spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Score over ${points.length} tests: ${points.map((p) => p.score).join(', ')}`}>
      <line x1={PAD} x2={W - PAD} y1={y(80)} y2={y(80)} className="history-ready" />
      <path d={d} className="history-line" />
      {points.map((p, i) => (
        <circle key={p.id} cx={x(i)} cy={y(p.score)} r={p.id === currentId ? 5 : 3} className={p.id === currentId ? 'history-dot is-current' : 'history-dot'}>
          <title>{`${p.score}/100 on ${fmt(p.testedAt)}`}</title>
        </circle>
      ))}
    </svg>
  );
}

/** Plain list of what differs between two history rows. Pure, exported for tests. */
export function changesBetween(before, after) {
  const out = [];
  const delta = after.score - before.score;
  if (delta) out.push(`Score ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)} (${before.score} → ${after.score})`);
  const prev = new Map(before.tasks.map((t) => [t.taskId, t]));
  for (const t of after.tasks) {
    const p = prev.get(t.taskId);
    if (!p || t.taskId === 'custom') continue;
    const name = TASK_LABELS[t.taskId] ?? t.taskId;
    if (p.status !== t.status) out.push(`${name}: ${p.status} → ${t.status}`);
    else if (t.status === 'passed' && p.numSteps !== t.numSteps) out.push(`${name}: ${p.numSteps} → ${t.numSteps} steps`);
  }
  const gone = before.findingTypes.filter((f) => !after.findingTypes.includes(f));
  const added = after.findingTypes.filter((f) => !before.findingTypes.includes(f));
  if (gone.length) out.push(`Fixed: ${gone.join(', ')}`);
  if (added.length) out.push(`New: ${added.join(', ')}`);
  if (before.botWall !== after.botWall) out.push(`Bot wall: ${before.botWall} → ${after.botWall}`);
  return out;
}

/** @param {{report: import('@agentready/engine/types').SiteReport}} props */
export default function SiteHistory({ report }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let live = true;
    getSiteHistory(report.url).then((r) => live && setRows(r)).catch(() => live && setRows([]));
    return () => { live = false; };
  }, [report.url, report.id]);
  if (!rows) return <Panel label="This site over time"><Skeleton rows={2} /></Panel>;
  if (rows.length < 2) return <Panel><EmptyState title="This is the first finished test of this site" body="Test it again later to see the score over time and what changed." /></Panel>;
  const at = rows.findIndex((r) => r.id === report.id);
  const current = at === -1 ? rows[rows.length - 1] : rows[at];
  const previous = at > 0 ? rows[at - 1] : at === -1 ? rows[rows.length - 2] : null;
  const changes = previous ? changesBetween(previous, current) : [];
  return (
    <Panel label="This site over time" className="history">
      <div className="history-row ar-panel-body">
        <Sparkline points={rows} currentId={report.id} />
        <div>
          <p className="ar-muted">{rows.length} tests from {fmt(rows[0].testedAt)} to {fmt(rows[rows.length - 1].testedAt)}. The dashed line is 80 (ready).</p>
          {previous && (
            <>
              <h3>Since the test before (<a href={`#/app/test/${encodeURIComponent(previous.id)}`}>{fmt(previous.testedAt)}</a>)</h3>
              {changes.length ? <ul className="history-changes">{changes.map((c) => <li key={c}>{c}</li>)}</ul> : <p className="ar-muted">Nothing changed.</p>}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
