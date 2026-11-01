// Test page: URL box -> live lanes -> score. The report id lives in the URL (#/test/<id>), so a refresh,
// a shared link or a saved demo report (e.g. #/test/rep_20261031_demo_nykaa) opens straight into the result.
import { useEffect, useState } from 'react';
import { getReport, listReports, startTest, useLiveEvents } from '../api.js';
import { navigate } from '../nav.js';
import Lane from '../components/Lane.jsx';
import InstantScanCard from '../components/InstantScanCard.jsx';
import ShotViewer from '../components/ShotViewer.jsx';

const BOT_WALL_TEXT = {
  none: null,
  'blocks-cloud-agents': 'This site blocks AI agents coming from cloud servers. They only got in through an Indian home-network address.',
  'blocks-automation': 'This site blocks automated browsers. Agents only got in with stealth mode.',
  'site-broken': 'Agents could not use this site at all, even with every workaround.',
};

function TestForm({ busy, onStart }) {
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
      {showCustom ? (
        <input
          type="text"
          value={customTask}
          onChange={(e) => setCustomTask(e.target.value)}
          placeholder="Your own task, e.g. find the delivery charge for a ₹300 order"
          aria-label="Custom task"
          maxLength={300}
          disabled={busy}
        />
      ) : (
        <button type="button" className="link-button" onClick={() => setShowCustom(true)} disabled={busy}>
          + Add your own task
        </button>
      )}
    </form>
  );
}

/** Shown while running; once done it shows the score. ScoreCard.jsx will replace the done state next. */
function Progress({ url, tasks, report, connection }) {
  const finished = tasks.filter((t) => ['passed', 'failed', 'blocked'].includes(t.status)).length;
  if (report) {
    const wall = BOT_WALL_TEXT[report.botWall];
    return (
      <section className={`card ${wall ? 'error' : ''}`}>
        <div className="progress">
          <span className="big">{report.score}/100</span>
          <span>{report.url}</span>
          <span className="muted">Agent cost ≈ ₹{report.costRupees}</span>
        </div>
        {wall && <p><b>Blocked:</b> {wall}</p>}
      </section>
    );
  }
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

export default function TestPage({ reportId }) {
  const live = useLiveEvents(reportId);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [shot, setShot] = useState(null);

  // The address being tested, for the progress line (the live stream only carries it at the end).
  useEffect(() => {
    setUrl('');
    setError('');
    if (reportId) getReport(reportId).then((r) => setUrl(r.url)).catch((e) => setError(e.message));
  }, [reportId]);

  const onStart = async (siteUrl, customTask) => {
    setError('');
    setStarting(true);
    try {
      const { reportId: id } = await startTest(siteUrl, customTask);
      navigate('test', id);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };

  const tasks = Object.values(live.tasks);
  const running = Boolean(reportId) && live.connection !== 'done' && !error;

  return (
    <>
      <TestForm busy={starting || running} onStart={onStart} />
      {error && <section className="card error">{error}</section>}
      {reportId && !error && (
        <>
          <Progress url={url} tasks={tasks} report={live.report} connection={live.connection} />
          {(live.scan || !live.report) && <InstantScanCard scan={live.scan} loading={!live.scan} />}
          <section className="lanes">
            {tasks.map((task) => <Lane key={task.taskId} task={task} onShotClick={setShot} />)}
          </section>
        </>
      )}
      {!reportId && <RecentReports />}
      <ShotViewer url={shot} onClose={() => setShot(null)} />
    </>
  );
}
