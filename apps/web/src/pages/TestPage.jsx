// Test page: URL box -> live lanes -> score -> findings. The report id lives in the URL (#/test/<id>), so a refresh,
// a shared link or a saved demo report (e.g. #/test/rep_20261031_demo_nykaa) opens straight into the result.
import { useEffect, useState } from 'react';
import { getHealth, getReport, listReports, setDemoFlaws, startTest, useLiveEvents } from '../api.js';
import { navigate } from '../nav.js';
import Lane from '../components/Lane.jsx';
import InstantScanCard from '../components/InstantScanCard.jsx';
import FindingCard from '../components/FindingCard.jsx';
import ShotViewer from '../components/ShotViewer.jsx';
import ScoreCard from '../components/ScoreCard.jsx';
import DemoStoreCard from '../components/DemoStoreCard.jsx';

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const findingKey = (f) => `${f.type}|${f.taskId ?? ''}`;

function TestForm({ busy, onStart, onDemo }) {
  const [url, setUrl] = useState('');
  const [customTask, setCustomTask] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (url.trim()) onStart(url.trim(), showCustom ? customTask.trim() : '');
  };

  return (
    <form className="card test-form" onSubmit={submit}>
      <div className="row">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Website to test, e.g. nykaa.com"
          aria-label="Website to test"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !url.trim()}>{busy ? 'Testing…' : 'Test my site'}</button>
      </div>
      {showCustom && (
        <input
          type="text"
          value={customTask}
          onChange={(e) => setCustomTask(e.target.value)}
          placeholder="Your own task, e.g. find the delivery charge for a ₹300 order"
          aria-label="Custom task"
          maxLength={300}
          disabled={busy}
        />
      )}
      <div className="form-links">
        {!showCustom && (
          <button type="button" className="link-button" onClick={() => setShowCustom(true)} disabled={busy}>
            + Add your own task
          </button>
        )}
        {onDemo && (
          <button type="button" className="link-button" onClick={onDemo} disabled={busy}>
            Try it on our demo store (with flaws)
          </button>
        )}
      </div>
    </form>
  );
}

/** Shown while the test runs; ScoreCard takes over once the report is complete. */
function Progress({ url, tasks, connection }) {
  const finished = tasks.filter((t) => ['passed', 'failed', 'blocked'].includes(t.status)).length;
  return (
    <section className="card">
      <div className="progress">
        <span className="big">Testing…</span>
        <span>{url}</span>
        <span className="muted">{tasks.length ? `${finished} of ${tasks.length} tasks finished` : 'Starting the agents'}</span>
        {connection === 'lost' && <span className="muted">Connection dropped, reconnecting…</span>}
      </div>
    </section>
  );
}

/**
 * The same finding on several tasks (e.g. one bot wall that blocked all four) becomes one card: one fix covers
 * them all. Points add up, since fixing it gives every one of those tasks its points back.
 */
function groupFindings(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = `${f.type}|${f.text}`;
    const group = groups.get(key);
    if (!group) groups.set(key, { ...f, taskIds: f.taskId ? [f.taskId] : [], members: [f] });
    else {
      if (f.taskId && !group.taskIds.includes(f.taskId)) group.taskIds.push(f.taskId);
      group.pointsIfFixed = (group.pointsIfFixed ?? 0) + (f.pointsIfFixed ?? 0);
      group.screenshotUrl ??= f.screenshotUrl;
      group.members.push(f);
    }
  }
  return [...groups.values()];
}

/** Task findings and Instant Scan findings (D25), grouped, most serious first; the Top 3 are marked. */
function Findings({ report, onShotClick }) {
  const groups = groupFindings([...report.tasks.flatMap((t) => t.findings ?? []), ...(report.scanFindings ?? [])]).sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || (b.pointsIfFixed ?? 0) - (a.pointsIfFixed ?? 0),
  );
  const ranks = new Map((report.topFixes ?? []).map((f, i) => [findingKey(f), i + 1]));
  const rankOf = (group) => group.members.map((f) => ranks.get(findingKey(f))).find(Boolean);
  const totalTasks = report.tasks.filter((t) => t.taskId !== 'custom').length;
  if (!groups.length) return <section className="card">No problems found: AI agents could do every task.</section>;
  return (
    <section className="findings">
      <h2>What to fix ({groups.length})</h2>
      {groups.map((g, i) => (
        <FindingCard key={`${findingKey(g)}-${i}`} finding={g} taskIds={g.taskIds} totalTasks={totalTasks} rank={rankOf(g)} onShotClick={onShotClick} />
      ))}
    </section>
  );
}

function RecentReports() {
  const [reports, setReports] = useState([]);
  useEffect(() => {
    listReports().then(setReports).catch(() => setReports([]));
  }, []);
  if (!reports.length) return null;
  return (
    <section className="card">
      <h2>Recent tests</h2>
      <div className="recent">
        {reports.slice(0, 8).map((r) => (
          <a key={r.id} href={`#/test/${encodeURIComponent(r.id)}`}>
            {new URL(r.url).hostname} · {r.status === 'complete' ? `${r.score}/100` : 'running'}
          </a>
        ))}
      </div>
    </section>
  );
}

export default function TestPage({ reportId, beforeId }) {
  const live = useLiveEvents(reportId);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [shot, setShot] = useState(null);
  const [demoStoreUrl, setDemoStoreUrl] = useState(null);
  const jumpToFix = (rank) => document.getElementById(`top-fix-${rank}`)?.scrollIntoView({ block: 'start' });

  // The address being tested, for the progress line (the live stream only carries it at the end).
  useEffect(() => {
    setUrl('');
    setError('');
    if (reportId) getReport(reportId).then((r) => setUrl(r.url)).catch((e) => setError(e.message));
  }, [reportId]);

  useEffect(() => {
    getHealth().then((h) => setDemoStoreUrl(h.demoStoreUrl ?? null)).catch(() => setDemoStoreUrl(null));
  }, []);

  /** Starts a test and opens it; `getUrl` may first ask the server for the address (demo store). */
  const begin = async (getUrl, customTask, from) => {
    setError('');
    setStarting(true);
    try {
      const { reportId: id } = await startTest(await getUrl(), customTask);
      navigate('test', id, from);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };
  const onStart = (siteUrl, customTask) => begin(() => siteUrl, customTask);
  const onDemo = () => begin(async () => (await setDemoFlaws(true)).url);
  // Re-test the same store with its flaws off, remembering this report to show the before/after.
  const onApplyFixes = () => begin(async () => (await setDemoFlaws(false)).url, '', reportId);

  const tasks = Object.values(live.tasks);
  const running = Boolean(reportId) && live.connection !== 'done' && !error;

  return (
    <>
      <TestForm busy={starting || running} onStart={onStart} onDemo={demoStoreUrl ? onDemo : null} />
      {error && <section className="card error">{error}</section>}
      {reportId && !error && (
        <>
          <DemoStoreCard
            report={live.report}
            beforeId={beforeId}
            demoStoreUrl={demoStoreUrl}
            url={live.report?.url || url}
            busy={starting}
            onApplyFixes={onApplyFixes}
          />
          {live.report ? <ScoreCard report={live.report} onJump={jumpToFix} /> : <Progress url={url} tasks={tasks} connection={live.connection} />}
          {(live.scan || !live.report) && <InstantScanCard scan={live.scan} loading={!live.scan} />}
          <section className="lanes">
            {tasks.map((task) => <Lane key={task.taskId} task={task} onShotClick={setShot} />)}
          </section>
          {live.report && <Findings report={live.report} onShotClick={setShot} />}
        </>
      )}
      {!reportId && <RecentReports />}
      <ShotViewer url={shot} onClose={() => setShot(null)} />
    </>
  );
}
