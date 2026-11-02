// Agent-Ready Watch (ARCHITECTURE.md section 12): re-test a live site on a schedule and alert when AI shoppers
// can no longer do a task. One card per watch: status, Run now (live lanes), pause/resume, history, live alerts.
import { useCallback, useEffect, useState } from 'react';
import { TASK_LABELS } from '@agentready/engine/goals';
import { cancelTest, createWatch, getHealth, getWatchHistory, listWatches, runWatchNow, updateWatch, useLiveEvents, useQueueNote } from '../api.js';
import Lane from '../components/Lane.jsx';
import ShotViewer from '../components/ShotViewer.jsx';

/** @typedef {import('@agentready/engine/types').Watch} Watch */
/** @typedef {import('@agentready/engine/types').SiteReport} SiteReport */

const every = (m) => (m < 60 ? `${m} min` : m === 1440 ? 'day' : m % 60 ? `${m} min` : `${m / 60} h`);
const when = (iso) => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const failedTasks = (r) => r.tasks.filter((t) => t.status !== 'passed');
const stepsOf = (r) => r.tasks.reduce((n, t) => n + (t.numSteps ?? t.steps?.length ?? 0), 0);

// What a watch re-tests. Add to cart is the money task (and the cheapest useful check, ~₹10); all four is ~₹40.
const WATCH_SCOPES = {
  cart: { label: 'Add to cart (≈₹10/check)', tasks: ['add_to_cart'] },
  all: { label: 'All 4 tasks (≈₹40/check)', tasks: ['find_returns', 'add_to_cart', 'find_price', 'find_contact'] },
};

function NewWatchForm({ defaultUrl, onCreated }) {
  const [url, setUrl] = useState('');
  const [minutes, setMinutes] = useState(20);
  const [scope, setScope] = useState('cart'); // each real check costs ~₹10 per task, so default to the one that matters most
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (defaultUrl) setUrl((u) => u || defaultUrl); }, [defaultUrl]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const text = url.trim();
      await createWatch(/^https?:\/\//i.test(text) ? text : `https://${text}`, Number(minutes), WATCH_SCOPES[scope].tasks);
      setUrl('');
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card test-form" onSubmit={submit}>
      <h2>Watch a site</h2>
      <p className="muted watch-intro">
        Real AI agents re-test the site on a schedule. If a task that used to work stops working, you get an alert in
        Discord or Slack.
      </p>
      <div className="row">
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Website to watch" aria-label="Website to watch" disabled={busy} />
        <label className="every">
          every
          <select value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={busy} aria-label="How often">
            {[10, 20, 30, 60, 180, 1440].map((m) => (
              <option key={m} value={m}>{every(m)}</option>
            ))}
          </select>
        </label>
        <label className="every">
          watch
          <select value={scope} onChange={(e) => setScope(e.target.value)} disabled={busy} aria-label="What to watch">
            {Object.entries(WATCH_SCOPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy || !url.trim()}>{busy ? 'Adding…' : 'Start watching'}</button>
      </div>
      {error && <p className="form-error">{error}</p>}
    </form>
  );
}

/** One past check: when, score, and which tasks failed. */
function HistoryRow({ report }) {
  const failed = failedTasks(report);
  return (
    <li className="history-row">
      <span className={`chip ${failed.length ? 'band-fail' : 'band-pass'}`}>{failed.length ? 'Problem' : 'All passed'}</span>
      <span>{when(report.testedAt)}</span>
      <span><b>{report.score}/100</b> · {stepsOf(report)} steps</span>
      {failed.length > 0 && <span className="muted">Failed: {failed.map((t) => TASK_LABELS[t.taskId] ?? t.taskId).join(', ')}</span>}
      <a href={`#/test/${encodeURIComponent(report.id)}`}>Open report</a>
    </li>
  );
}

/** @param {{watch: Watch, onChange: () => void, onShotClick: (url:string)=>void}} props */
function WatchCard({ watch, onChange, onShotClick }) {
  const [history, setHistory] = useState([]);
  const [checkId, setCheckId] = useState(null);
  const [alert, setAlert] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const live = useLiveEvents(checkId);

  const loadHistory = useCallback(() => {
    getWatchHistory(watch.id).then(setHistory).catch(() => setHistory([]));
  }, [watch.id]);
  useEffect(loadHistory, [loadHistory]);

  // When a Run-now check finishes: refresh history and the watch (its failing flag may have changed).
  useEffect(() => {
    if (live.connection === 'done') {
      loadHistory();
      onChange();
    }
  }, [live.connection, loadHistory, onChange]);

  // Live alerts for this watch (the same message that goes to Discord/Slack).
  useEffect(() => {
    const source = new EventSource(`/api/watch/${encodeURIComponent(watch.id)}/events`);
    source.onmessage = (e) => {
      let event;
      try { event = JSON.parse(e.data); } catch { return; }
      if (event.type === 'watch-alert' || event.type === 'watch-recovered') {
        setAlert({ type: event.type, message: event.message });
        loadHistory();
        onChange();
      }
    };
    return () => source.close();
  }, [watch.id, loadHistory, onChange]);

  const act = async (fn) => {
    setError('');
    setBusy(true);
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const runNow = () => act(async () => {
    setAlert(null);
    setCheckId((await runWatchNow(watch.id)).reportId);
  });
  const togglePaused = () => act(async () => {
    await updateWatch(watch.id, { enabled: !watch.enabled });
    onChange();
  });

  const checking = Boolean(checkId) && live.connection !== 'done';
  const waitReason = useQueueNote(checkId, checking && Object.values(live.tasks).some((t) => t.status === 'queued'));
  const stopCheck = () => act(async () => { await cancelTest(checkId); });
  const status = !watch.enabled
    ? { cls: 'band-warn', text: 'Paused' }
    : watch.failing
      ? { cls: 'band-fail', text: 'Alert: AI shoppers are stuck' }
      : history.length
        ? { cls: 'band-pass', text: 'All good' }
        : { cls: 'band-warn', text: 'No checks yet' };
  const tasks = Object.values(live.tasks);

  return (
    <section className="card watch-card">
      <header className="watch-head">
        <div>
          <div className="score-site">{watch.url}</div>
          <div className="muted">
            Every {every(watch.everyMinutes)} · {watch.tasks.map((t) => TASK_LABELS[t] ?? t).join(', ')}
          </div>
        </div>
        <span className={`chip ${status.cls}`}>{status.text}</span>
      </header>

      <div className="watch-actions">
        <button type="button" onClick={runNow} disabled={busy || checking}>{checking ? 'Checking…' : 'Run now'}</button>
        {checking && <button type="button" className="secondary" onClick={stopCheck} disabled={busy}>Stop check</button>}
        <button type="button" className="secondary" onClick={togglePaused} disabled={busy}>{watch.enabled ? 'Pause' : 'Resume'}</button>
      </div>
      {error && <p className="form-error">{error}</p>}

      {alert && (
        <div className={alert.type === 'watch-alert' ? 'bot-wall' : 'recovered'} role="alert">
          <b>{alert.type === 'watch-alert' ? 'Alert sent:' : 'Recovered:'}</b> {alert.message}
        </div>
      )}

      {checkId && (
        <>
          <p className="muted">
            {checking ? 'Checking now…' : live.report?.status === 'cancelled' ? 'Check stopped.' : live.report ? `Check finished: ${live.report.score}/100.` : ''}{' '}
            <a href={`#/test/${encodeURIComponent(checkId)}`}>Open full report</a>
          </p>
          {tasks.length > 0 && (
            <section className="lanes">
              {tasks.map((task) => <Lane key={task.taskId} task={task} onShotClick={onShotClick} waitReason={waitReason} />)}
            </section>
          )}
        </>
      )}

      <h3>History</h3>
      {history.length ? (
        <ol className="history">{history.slice(0, 10).map((r) => <HistoryRow key={r.id} report={r} />)}</ol>
      ) : (
        <p className="muted">No checks yet. Press Run now, or wait for the next scheduled check.</p>
      )}
    </section>
  );
}

export default function WatchPage() {
  const [watches, setWatches] = useState(null);
  const [error, setError] = useState('');
  const [demoUrl, setDemoUrl] = useState('');
  const [shot, setShot] = useState(null);

  const reload = useCallback(() => {
    listWatches().then((w) => { setWatches(w); setError(''); }).catch((e) => setError(e.message));
  }, []);
  useEffect(reload, [reload]);
  useEffect(() => {
    getHealth().then((h) => h.demoStoreUrl && setDemoUrl(`${h.demoStoreUrl}/?flaws=off`)).catch(() => {});
  }, []);

  return (
    <>
      <NewWatchForm defaultUrl={watches && !watches.length ? demoUrl : ''} onCreated={reload} />
      {error && <section className="card error">{error}</section>}
      {watches?.map((w) => <WatchCard key={w.id} watch={w} onChange={reload} onShotClick={setShot} />)}
      {watches && !watches.length && !error && <section className="card muted">Nothing is being watched yet.</section>}
      <ShotViewer url={shot} onClose={() => setShot(null)} />
    </>
  );
}
