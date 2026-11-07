// Agent-Ready Watch (ARCHITECTURE.md section 12): re-test a live site on a schedule and alert when AI shoppers
// can no longer do a task. One card per watch: status, Run now (live lanes), pause/resume, history, live alerts.
import { useCallback, useEffect, useState } from 'react';
import { TASK_LABELS } from '@agentready/engine/goals';
import { cancelTest, createWatch, getHealth, getWatchHistory, listWatches, runWatchNow, updateWatch, useLiveEvents, useQueueNote } from '../../api.js';
import Lane from '../../components/Lane.jsx';
import ShotViewer from '../../components/ShotViewer.jsx';
import { Badge, Button, EmptyState, Field, Panel, Skeleton } from '../../design/index.js';
import { href } from '../../routes.js';

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
      // No scheme typed: assume https. Any other scheme is left alone so the server can say it is not allowed.
      await createWatch(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`, Number(minutes), WATCH_SCOPES[scope].tasks);
      setUrl('');
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel label="New watch">
      <form className="ar-newtest-form" onSubmit={submit}>
        <div>
          <h2 className="ar-h2">Watch a site</h2>
          <p className="ar-muted ar-small ar-flush">
            Real AI agents re-test the site on a schedule. If a task that used to work stops working, you get an alert in
            Discord or Slack.
          </p>
        </div>
        <div className="ar-watch-row">
          <Field label="Website to watch">
            <input className="ar-input" type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="your-store.com" disabled={busy} />
          </Field>
          <Field label="How often">
            <select className="ar-select" value={minutes} onChange={(e) => setMinutes(e.target.value)} disabled={busy}>
              {[10, 20, 30, 60, 180, 1440].map((m) => <option key={m} value={m}>Every {every(m)}</option>)}
            </select>
          </Field>
          <Field label="What to watch">
            <select className="ar-select" value={scope} onChange={(e) => setScope(e.target.value)} disabled={busy}>
              {Object.entries(WATCH_SCOPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
        </div>
        {error && <p className="ar-error form-error" role="alert">{error}</p>}
        <div className="ar-newtest-foot">
          <span className="ar-cost-line">Each check runs real agents. The cart check costs about ₹10 a time.</span>
          <div className="ar-newtest-actions"><Button variant="primary" type="submit" disabled={busy || !url.trim()} loading={busy}>Start watching</Button></div>
        </div>
      </form>
    </Panel>
  );
}

/** One past check: when, score, and which tasks failed. */
function HistoryRow({ report }) {
  const failed = failedTasks(report);
  return (
    <li className="history-row">
      <Badge tone={failed.length ? 'fail' : 'pass'}>{failed.length ? 'Problem' : 'All passed'}</Badge>
      <span className="ar-mono">{when(report.testedAt)}</span>
      <span><b>{report.score}/100</b> <span className="ar-faint">· {stepsOf(report)} steps</span></span>
      {failed.length > 0 && <span className="ar-muted ar-small">Failed: {failed.map((t) => TASK_LABELS[t.taskId] ?? t.taskId).join(', ')}</span>}
      <a href={href('app', 'test', report.id)}>Open report</a>
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
    ? { tone: 'wait', text: 'Paused' }
    : watch.failing
      ? { tone: 'fail', text: 'Alert: AI shoppers are stuck' }
      : history.length
        ? { tone: 'pass', text: 'All good' }
        : { tone: 'warn', text: 'No checks yet' };
  const tasks = Object.values(live.tasks);

  return (
    <section className="ar-panel watch-card">
      <header className="ar-watch-head">
        <div className="ar-watch-id">
          <span className="ar-host">{watch.url}</span>
          <span className="ar-muted ar-small">
            Every {every(watch.everyMinutes)} · {watch.tasks.map((t) => TASK_LABELS[t] ?? t).join(', ')}
          </span>
        </div>
        <Badge tone={status.tone}>{status.text}</Badge>
      </header>
      <div className="ar-watch-body">
      <div className="ar-watch-actions">
        <Button size="sm" onClick={runNow} disabled={busy || checking}>{checking ? 'Checking…' : 'Run now'}</Button>
        {checking && <Button size="sm" onClick={stopCheck} disabled={busy}>Stop check</Button>}
        <Button size="sm" variant="ghost" onClick={togglePaused} disabled={busy}>{watch.enabled ? 'Pause' : 'Resume'}</Button>
      </div>
      {error && <p className="ar-error form-error" role="alert">{error}</p>}

      {alert && (
        <div className={`ar-banner ${alert.type === 'watch-alert' ? 'ar-banner--fail' : 'ar-banner--wait'}`} role="alert">
          <span className="ar-label">{alert.type === 'watch-alert' ? 'Alert sent' : 'Recovered'}</span> {alert.message}
        </div>
      )}

      {checkId && (
        <>
          <p className="ar-muted ar-small ar-flush">
            {checking ? 'Checking now…' : live.report?.status === 'cancelled' ? 'Check stopped.' : live.report ? `Check finished: ${live.report.score}/100.` : ''}{' '}
            <a href={href('app', 'test', checkId)}>Open full report</a>
          </p>
          {tasks.length > 0 && (
            <section className="lanes">
              {tasks.map((task) => <Lane key={task.taskId} task={task} onShotClick={onShotClick} waitReason={waitReason} />)}
            </section>
          )}
        </>
      )}

      <span className="ar-label">History</span>
      {history.length ? (
        <ol className="ar-watch-history">{history.slice(0, 10).map((r) => <HistoryRow key={r.id} report={r} />)}</ol>
      ) : (
        <p className="ar-muted ar-small ar-flush">No checks yet. Press Run now, or wait for the next scheduled check.</p>
      )}
      </div>
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
      {error && <p className="ar-error" role="alert">{error}</p>}
      {!watches && !error && <Panel><Skeleton rows={3} /></Panel>}
      {watches?.map((w) => <WatchCard key={w.id} watch={w} onChange={reload} onShotClick={setShot} />)}
      {watches && !watches.length && !error && <Panel><EmptyState title="Nothing is being watched yet" body="Add a site above. Agents will re-test it on the schedule you pick." /></Panel>}
      <ShotViewer url={shot} onClose={() => setShot(null)} />
    </>
  );
}
