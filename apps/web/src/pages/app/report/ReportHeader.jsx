// Report header: the site, kind of site, date and source; score with its band, cost and steps; and the page actions
// (Stop while running; Re-run, Copy link, Save as PDF when finished). Redesign spec 5.3.
import { packSiteLabel, normalisePack } from '@agentready/engine/goals';
import { Badge, Button, Stat, scoreBand, useToast } from '../../../design/index.js';
import { href } from '../../../routes.js';

export const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u || ''; } };
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const stepsOf = (t) => (t.attempts?.length ? t.attempts.reduce((n, a) => n + (a.numSteps || 0), 0) : t.numSteps || 0)
  + (t.runs ?? []).slice(1).reduce((n, r) => n + (r.numSteps || 0), 0);

/**
 * @param {{report:object|null, url:string, tasks:object[], running:boolean, stopping:boolean,
 *   onStop:()=>void, onRerun:()=>void, rerunning:boolean}} props
 */
export default function ReportHeader({ report, url, tasks, running, stopping, onStop, onRerun, rerunning }) {
  const toast = useToast();
  const done = tasks.filter((t) => ['passed', 'failed', 'blocked', 'cancelled'].includes(t.status)).length;
  const finished = report && report.status === 'complete';
  const band = finished ? scoreBand(report.score) : null;
  const pack = normalisePack(report?.pack);
  const copy = async () => {
    const link = `${location.origin}${location.pathname}${href('app', 'test', report?.id)}`;
    try { await navigator.clipboard.writeText(link); toast('Link copied'); } catch { window.prompt('Copy this link:', link); }
  };

  return (
    <header className="ar-report-head">
      <div className="ar-report-id">
        <div className="ar-crumbs"><a href={href('app', 'tests')}>Tests</a> / {report?.id ?? '…'}</div>
        <h1 className="ar-report-host">{hostOf(report?.url || url) || 'Loading…'}</h1>
        <div className="ar-report-meta">
          {pack && <Badge tone="neutral">{packSiteLabel(pack)}</Badge>}
          {report?.confirm && <Badge tone="accent">Confirmed runs</Badge>}
          {report?.testedAt && <span>{when(report.testedAt)}</span>}
          {report?.source && <span className="ar-mono">from {report.source}</span>}
        </div>
      </div>
      <div className="ar-report-stats">
        {finished ? (
          <div className="ar-stat">
            <span className="ar-label">Score</span>
            <span className="ar-stat-value"><span className="ar-report-score">{report.score}</span><span className="ar-stat-unit">/100</span></span>
            <Badge tone={band.tone}>{band.label}</Badge>
          </div>
        ) : (
          <div className="ar-stat">
            <span className="ar-label">Status</span>
            <span className="ar-stat-value ar-stat-value--sm">{report?.status === 'cancelled' ? 'Stopped' : stopping ? 'Stopping…' : 'Testing…'}</span>
            <span className="ar-mono ar-faint">{tasks.length ? `${done} of ${tasks.length} tasks finished` : 'Starting the agents'}</span>
          </div>
        )}
        {report && <Stat label="Agent cost" value={`₹${Math.round(report.costRupees ?? 0)}`} />}
        {report && <Stat label="Steps" value={report.tasks.reduce((n, t) => n + stepsOf(t), 0)} />}
      </div>
      <div className="ar-report-actions no-print">
        {running ? (
          <Button variant="primary" onClick={onStop} disabled={stopping}>{stopping ? 'Stopping…' : 'Stop test'}</Button>
        ) : (
          <>
            <Button variant="primary" onClick={onRerun} loading={rerunning} disabled={rerunning || !report}>Re-run</Button>
            {report && <Button onClick={copy}>Copy link</Button>}
            {finished && <Button onClick={() => window.print()}>Save as PDF</Button>}
          </>
        )}
      </div>
    </header>
  );
}
