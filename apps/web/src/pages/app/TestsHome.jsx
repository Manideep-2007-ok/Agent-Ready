// Tests home (#/app): start a test (address, kind of site, own task, confirm results, cost estimate) and the ledger of
// recent tests. Redesign spec 5.2.
import { useEffect, useState } from 'react';
import { Badge, Button, EmptyState, Field, Ledger, Panel, Skeleton, StatusBadge, scoreBand } from '../../design/index.js';
import { getEstimate, getHealth, listReports, setDemoFlaws, startTest } from '../../api.js';
import { navigate } from '../../nav.js';
import { href } from '../../routes.js';

const PACKS = [
  ['auto', 'Detect it for me'], ['shop', 'Online store'], ['saas', 'Software (SaaS)'], ['content', 'Blog or news'], ['local', 'Local business'],
];

/** "About ₹23 to ₹84" before a test starts (P2-8); replay mode costs nothing. */
export function costLine(e) {
  if (!e) return '';
  if (e.mock) return ''; // the replay banner at the top already says there is no agent cost
  const limit = e.budget?.perTestRupees ? ` Every test stops at ₹${e.budget.perTestRupees}.` : '';
  const today = e.budget?.perDayRupees ? ` Left today: ₹${e.budget.leftTodayRupees} of ₹${e.budget.perDayRupees}.` : '';
  return `Agent cost: usually ₹${e.lowRupees} to ₹${e.highRupees}, up to ₹${e.worstRupees} if the site blocks agents.${limit}${today}`;
}

function useEstimate(tasks, confirm) {
  const [estimate, setEstimate] = useState(null);
  useEffect(() => {
    let live = true;
    getEstimate(tasks, confirm).then((e) => live && setEstimate(e)).catch(() => live && setEstimate(null));
    return () => { live = false; };
  }, [tasks, confirm]);
  return estimate;
}

function NewTest({ demoStoreUrl }) {
  const [url, setUrl] = useState('');
  const [pack, setPack] = useState('auto');
  const [showCustom, setShowCustom] = useState(false);
  const [customTask, setCustomTask] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const estimate = useEstimate(showCustom && customTask.trim() ? 5 : 4, confirm);

  const begin = async (getUrl, options = {}) => {
    setError('');
    setBusy(true);
    try {
      const { reportId } = await startTest(await getUrl(), options.customTask, options);
      navigate('test', reportId);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  const submit = (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    begin(() => url.trim(), { customTask: showCustom ? customTask.trim() : '', confirm, pack });
  };

  return (
    <Panel label="New test" className="ar-newtest">
      <form className="ar-newtest-form" onSubmit={submit}>
        <div className="ar-newtest-row">
          <Field label="Website to test">
            <input className="ar-input" type="text" inputMode="url" autoComplete="url" placeholder="your-store.com"
              value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
          </Field>
          <Field label="Kind of site">
            <select className="ar-select" value={pack} onChange={(e) => setPack(e.target.value)} disabled={busy}>
              {PACKS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
        {showCustom ? (
          <Field label="Custom task" help="Up to 300 characters. Scored on its own, not part of the 100.">
            <input className="ar-input" type="text" maxLength={300} placeholder="Find the delivery charge for a ₹300 order"
              value={customTask} onChange={(e) => setCustomTask(e.target.value)} disabled={busy} />
          </Field>
        ) : (
          <div><Button variant="ghost" size="sm" onClick={() => setShowCustom(true)} disabled={busy}>+ Add your own task</Button></div>
        )}
        <Field inline label="Confirm results: run each task twice (three times if they disagree) and keep the majority. About twice the cost.">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} disabled={busy} />
        </Field>
        {error && <p className="ar-error" role="alert">{error}</p>}
        <div className="ar-newtest-foot">
          <span className="ar-cost-line">{costLine(estimate)}</span>
          <div className="ar-newtest-actions">
            {demoStoreUrl && (
              <Button onClick={() => begin(async () => (await setDemoFlaws(true)).url)} disabled={busy}>Try the demo store</Button>
            )}
            <Button variant="primary" type="submit" disabled={busy || !url.trim()} loading={busy}>Run test</Button>
          </div>
        </div>
      </form>
    </Panel>
  );
}

const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');

const RECENT_SHOWN = 8;

function Recent() {
  const [rows, setRows] = useState(null);
  const [all, setAll] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = () => {
    setFailed(false); setRows(null);
    listReports().then(setRows).catch(() => setFailed(true));
  };
  useEffect(load, []);
  // A server that did not answer is not "no tests yet": say so, and offer to try again.
  if (failed) {
    return (
      <Panel label="Recent tests" className="ar-recent">
        <EmptyState title="Could not load your recent tests" body="The AgentReady server did not answer. Check that it is running, then try again."
          action={<Button onClick={load}>Try again</Button>} />
      </Panel>
    );
  }
  if (!rows) return <Panel label="Recent tests"><Skeleton rows={3} /></Panel>;
  const status = (r) => (r.status === 'complete' ? null : r.status === 'cancelled' ? 'cancelled' : 'running');
  return (
    <Panel label="Recent tests" className="ar-recent ar-panel--plain"
      actions={rows.length > RECENT_SHOWN && (
        <Button variant="ghost" size="sm" onClick={() => setAll((a) => !a)} aria-expanded={all}>{all ? 'Show fewer' : `Show all ${rows.length}`}</Button>
      )}>
      <Ledger
        caption="Recent tests"
        showId={false}
        columns={[
          { key: 'site', label: 'Site' },
          { key: 'score', label: 'Score', align: 'right', mono: true },
          { key: 'result', label: 'Result' },
          { key: 'source', label: 'From', hideOnPhone: true, mono: true },
          { key: 'date', label: 'Tested', hideOnPhone: true },
        ]}
        rows={(all ? rows : rows.slice(0, RECENT_SHOWN)).map((r) => ({
          id: r.id,
          href: href('app', 'test', r.id),
          cells: {
            site: <span className="ar-host">{hostOf(r.url)}</span>,
            score: r.status === 'complete' ? r.score : '–',
            result: status(r) ? <StatusBadge status={status(r)} /> : <Badge tone={scoreBand(r.score).tone}>{scoreBand(r.score).label}</Badge>,
            source: r.source,
            date: when(r.testedAt),
          },
        }))}
        empty={<EmptyState title="Run your first test" body="Type a website above. Real AI agents will try four everyday tasks on it." />}
      />
    </Panel>
  );
}

export default function TestsHome() {
  const [demoStoreUrl, setDemoStoreUrl] = useState(null);
  useEffect(() => { getHealth().then((h) => setDemoStoreUrl(h.demoStoreUrl ?? null)).catch(() => {}); }, []);
  return (
    <>
      <NewTest demoStoreUrl={demoStoreUrl} />
      <Recent />
    </>
  );
}
