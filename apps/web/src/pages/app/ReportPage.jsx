// Report workbench (#/app/test/<id>[/<beforeId>]): header with score and actions, then tabs Overview, Findings,
// Steps, History and Scan. Follows the test live over SSE (a refresh replays what happened). Redesign spec 5.3.
import { useEffect, useState } from 'react';
import { EmptyState, Panel, Tabs, TabPanel, Button } from '../../design/index.js';
import { cancelTest, getHealth, getReport, setDemoFlaws, startTest, useLiveEvents, useQueueNote } from '../../api.js';
import { navigate } from '../../nav.js';
import { href } from '../../routes.js';
import ReportHeader from './report/ReportHeader.jsx';
import OverviewTab from './report/OverviewTab.jsx';
import FindingsTab, { allFindings, groupFindings } from './report/FindingsTab.jsx';
import StepTimeline from '../../components/StepTimeline.jsx';
import SiteHistory from '../../components/SiteHistory.jsx';
import InstantScanCard from '../../components/InstantScanCard.jsx';
import DemoStoreCard from '../../components/DemoStoreCard.jsx';
import ShotViewer from '../../components/ShotViewer.jsx';

const BUDGET_NOTE = (r) => `The agents reached this test's cost limit of ₹${r.budgetRupees}, so the test was stopped. `;

function Stopped({ report }) {
  const done = report.tasks.filter((t) => ['passed', 'failed', 'blocked'].includes(t.status)).length;
  return (
    <div className="ar-banner ar-banner--wait ar-stopped" role="status">
      <span className="ar-label">{report.stopReason === 'budget' ? 'Cost limit reached' : 'Test stopped'}</span>
      <span>
        {report.stopReason === 'budget' && BUDGET_NOTE(report)}
        {done} of {report.tasks.length} tasks had finished. No score is given for a stopped test. Agent cost so far ≈ ₹{report.costRupees}.
      </span>
    </div>
  );
}

/** Top 3 fixes with the task count and summed points of a fix that clears the same finding on several tasks. */
function topFixesOf(report) {
  const all = allFindings(report);
  return (report.topFixes ?? []).map((f) => {
    const same = all.filter((g) => g.type === f.type && g.text === f.text);
    return same.length < 2 ? f : { ...f, taskCount: same.length, pointsIfFixed: same.reduce((n, g) => n + (g.pointsIfFixed ?? 0), 0) };
  });
}

export default function ReportPage({ id, beforeId }) {
  const live = useLiveEvents(id);
  const [url, setUrl] = useState('');
  const [error, setError] = useState(''); // the report itself could not be loaded
  const [actionError, setActionError] = useState(''); // Stop, Re-run or Apply fixes failed: the report stays on screen
  const [tab, setTab] = useState('overview');
  const [shot, setShot] = useState(null);
  const [stopping, setStopping] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [enriched, setEnriched] = useState(null);
  const [demoStoreUrl, setDemoStoreUrl] = useState(null);
  const [jump, setJump] = useState(null);

  useEffect(() => {
    setUrl(''); setError(''); setActionError(''); setStopping(false); setRerunning(false); setEnriched(null); setTab('overview');
    getReport(id).then((r) => setUrl(r.url)).catch((e) => setError(e.message));
  }, [id]);
  useEffect(() => { getHealth().then((h) => setDemoStoreUrl(h.demoStoreUrl ?? null)).catch(() => {}); }, []);
  // A Top fix opens the Findings tab, then scrolls to its card once that tab is shown.
  useEffect(() => {
    if (!jump || tab !== 'findings') return;
    document.getElementById(`top-fix-${jump}`)?.scrollIntoView({ block: 'start' });
    setJump(null);
  }, [jump, tab]);

  const tasks = Object.values(live.tasks);
  const report = enriched?.id === live.report?.id ? enriched : live.report;
  const running = !error && live.connection !== 'done';
  const waitReason = useQueueNote(id, running && tasks.some((t) => t.status === 'queued'));

  if (error) {
    return (
      <Panel className="ar-error-panel">
        <div className="ar-error" role="alert"><EmptyState title={error} body="The link may be mistyped, or the report was made on another server."
          action={<Button as="a" href={href('app', 'tests')}>Back to tests</Button>} /></div>
      </Panel>
    );
  }

  const onStop = async () => {
    setStopping(true);
    setActionError('');
    try { const r = await cancelTest(id); if (!r?.cancelled) setStopping(false); } catch (e) { setActionError(e.message); setStopping(false); }
  };
  const onRerun = async () => {
    setRerunning(true);
    setActionError('');
    try {
      const r = report ?? (await getReport(id));
      const { reportId } = await startTest(r.url, r.customText, { confirm: !!r.confirm, pack: r.pack });
      navigate('test', reportId);
    } catch (e) { setActionError(e.message); setRerunning(false); }
  };
  const onApplyFixes = async () => {
    setRerunning(true);
    setActionError('');
    try {
      const { reportId } = await startTest((await setDemoFlaws(false)).url);
      navigate('test', reportId, id);
    } catch (e) { setActionError(e.message); setRerunning(false); }
  };

  const finished = report?.status === 'complete';
  const stopped = report?.status === 'cancelled';
  const findingsCount = finished ? groupFindings(allFindings(report)).length : null;
  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'findings', label: 'Findings', count: findingsCount ?? undefined },
    { id: 'steps', label: 'Steps' },
    { id: 'history', label: 'History' },
    { id: 'scan', label: 'Scan' },
  ];
  const demo = (
    <DemoStoreCard report={report} beforeId={beforeId} demoStoreUrl={demoStoreUrl} url={report?.url || url} busy={rerunning} onApplyFixes={onApplyFixes} />
  );

  return (
    <div className="ar-report">
      <ReportHeader report={report} url={url} tasks={tasks} running={running} stopping={stopping} onStop={onStop} onRerun={onRerun} rerunning={rerunning} />
      {actionError && <p className="ar-error" role="alert">{actionError}</p>}
      {live.connection === 'lost' && running && <p className="ar-faint ar-small">Connection dropped, reconnecting…</p>}
      <Tabs tabs={TABS} current={tab} onChange={setTab} label="Report sections" idPrefix="report" />
      <TabPanel id="overview" current={tab} idPrefix="report" label="Overview">
        <OverviewTab report={report} tasks={tasks} fixes={finished ? topFixesOf(report) : []} onShotClick={setShot} waitReason={waitReason}
          onJump={(rank) => { setTab('findings'); setJump(rank); }} demo={demo} stoppedPanel={stopped ? <Stopped report={report} /> : null} />
      </TabPanel>
      <TabPanel id="findings" current={tab} idPrefix="report" label="Findings">
        {finished ? <FindingsTab report={report} onEnriched={setEnriched} onShotClick={setShot} />
          : <Panel><EmptyState title={stopped ? 'No findings for a stopped test' : 'Findings appear when the test finishes'} body="Half a test says nothing about the site." /></Panel>}
      </TabPanel>
      <TabPanel id="steps" current={tab} idPrefix="report" label="Steps">
        <StepTimeline report={report ?? { tasks }} onShotClick={setShot} />
      </TabPanel>
      <TabPanel id="history" current={tab} idPrefix="report" label="History">
        {finished ? <SiteHistory report={report} /> : <Panel><EmptyState title="History appears when the test finishes" /></Panel>}
      </TabPanel>
      <TabPanel id="scan" current={tab} idPrefix="report" label="Scan">
        {(live.scan || running) && <InstantScanCard scan={live.scan} loading={!live.scan} />}
        {!live.scan && !running && <Panel><EmptyState title="No Instant Scan for this test" body="Tests from the command line can skip the scan." /></Panel>}
      </TabPanel>
      <ShotViewer url={shot} onClose={() => setShot(null)} />
    </div>
  );
}
