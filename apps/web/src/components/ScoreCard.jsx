// Score card for a finished test: score /100 with a plain verdict, the bot-wall banner (red if blocked),
// agent cost in rupees, how many tasks passed, and the Top 3 fixes.
import { TASK_LABELS } from '@agentready/engine/goals';
import TopFixes from './TopFixes.jsx';

/** @typedef {import('@agentready/engine/types').SiteReport} SiteReport */

const BOT_WALL_TEXT = {
  'blocks-cloud-agents': 'This site blocks AI agents coming from cloud servers. They only got in through an Indian home-network address.',
  'blocks-automation': 'This site blocks automated browsers. Agents only got in with stealth mode.',
  'site-broken': 'Agents could not use this site at all, even with every workaround.',
};

/** Score bands with a text label, never colour alone. */
function band(score) {
  if (score >= 80) return { cls: 'pass', label: 'Ready for AI shoppers' };
  if (score >= 50) return { cls: 'warn', label: 'Partly ready: some tasks are hard for AI shoppers' };
  return { cls: 'fail', label: 'Not ready: AI shoppers struggle here' };
}

const hostname = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
};

/** @param {{report: SiteReport, onJump?: (rank:number)=>void}} props */
export default function ScoreCard({ report, onJump }) {
  const { cls, label } = band(report.score);
  const wall = BOT_WALL_TEXT[report.botWall];
  const scored = report.tasks.filter((t) => t.taskId !== 'custom');
  // "Passed" only counts tasks a normal cloud agent could do; passing via proxy or stealth is a workaround.
  const passed = scored.filter((t) => t.status === 'passed' && (t.verdict ?? 'none') === 'none').length;
  const viaWorkaround = scored.filter((t) => t.status === 'passed' && (t.verdict ?? 'none') !== 'none').length;
  const custom = report.tasks.find((t) => t.taskId === 'custom');

  // A fix that clears the same finding on several tasks is worth all of their points (matches the grouped card).
  const all = [...report.tasks.flatMap((t) => t.findings ?? []), ...(report.scanFindings ?? [])];
  const fixes = (report.topFixes ?? []).map((f) => {
    const same = all.filter((g) => g.type === f.type && g.text === f.text);
    if (same.length < 2) return f;
    return { ...f, taskCount: same.length, pointsIfFixed: same.reduce((n, g) => n + (g.pointsIfFixed ?? 0), 0) };
  });

  return (
    <section className="card score-card">
      {wall && (
        <div className="bot-wall" role="alert">
          <b>Blocked:</b> {wall}
        </div>
      )}
      <div className="score-row">
        <div className={`score-big score-${cls}`}>
          <span className="score-num">{report.score}</span>
          <span className="score-of">/100</span>
        </div>
        <div className="score-meta">
          <div className="score-site">{hostname(report.url)}</div>
          <div className={`chip band-chip band-${cls}`}>{label}</div>
          <div className="muted">
            {passed} of {scored.length} {scored.length === 1 ? 'task' : 'tasks'} passed
            {viaWorkaround > 0 && ` (${viaWorkaround} more only with a workaround)`} · Agent cost ≈ ₹{report.costRupees}
            {report.testedAt && <> · Tested {new Date(report.testedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</>}
          </div>
          {report.confirm && (
            <div className="muted">
              Confirmed: every task ran at least twice and the majority counts
              {scored.some((t) => t.flaky) && ` (${scored.filter((t) => t.flaky).length} gave different results on different runs)`}
            </div>
          )}
          {custom && (
            <div className="muted">
              {TASK_LABELS.custom}: {custom.replayNote ? 'not run in replay mode (live agents only)' : custom.status === 'passed' ? 'passed' : 'not done'} (not part of the 100)
            </div>
          )}
        </div>
      </div>
      <TopFixes fixes={fixes} onJump={onJump} />
    </section>
  );
}
