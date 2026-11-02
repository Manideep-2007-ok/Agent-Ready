// Race page: one task, up to 3 sites at once (D23). Each site is a normal report followed live over SSE; the page
// polls the race itself for the ranking. The race id lives in the URL (#/race/<id>) so a refresh keeps the view.
import { useEffect, useState } from 'react';
import { TASK_LABELS } from '@agentready/engine/goals';
import { cancelRace, getHealth, getRace, startRace, useLiveEvents, useQueueNote } from '../api.js';
import { navigate } from '../nav.js';
import Lane from '../components/Lane.jsx';
import ShotViewer from '../components/ShotViewer.jsx';

const RACE_TASKS = ['find_price', 'add_to_cart', 'find_returns', 'find_contact'];
const MAX_SITES = 3;
// Sites with a recording in replay mode (apps/server/src/replay.js); the demo store comes from /api/health.
const RECORDED_CHIPS = [
  { name: 'Nykaa', url: 'nykaa.com' },
  { name: 'Myntra', url: 'myntra.com' },
  { name: 'Swiggy', url: 'swiggy.com' },
];

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const placeText = (n) => (n === 1 ? 'Winner' : n === 2 ? '2nd place' : '3rd place');
const stepsOf = (t) => t?.numSteps ?? t?.steps?.length ?? 0;

function RaceForm({ busy, replay, demoStoreUrl, onStart }) {
  const [taskId, setTaskId] = useState('find_price');
  const [sites, setSites] = useState(['', '']);
  const filled = sites.map((s) => s.trim()).filter(Boolean);
  const setSite = (i, value) => setSites((prev) => prev.map((s, k) => (k === i ? value : s)));
  const chips = [...RECORDED_CHIPS, ...(demoStoreUrl ? [{ name: 'Demo store', url: demoStoreUrl }] : [])];
  const addChip = (url) => {
    if (sites.some((s) => s.trim() === url)) return;
    setSites((prev) => {
      const empty = prev.findIndex((s) => !s.trim());
      if (empty !== -1) return prev.map((s, k) => (k === empty ? url : s));
      return prev.length < MAX_SITES ? [...prev, url] : prev;
    });
  };
  const submit = (e) => { e.preventDefault(); if (filled.length >= 2) onStart(taskId, filled); };

  return (
    <form className="card race-form" onSubmit={submit}>
      <div>
        <h2>Race: who is easiest for AI shoppers?</h2>
        <p className="muted">Pick one task and up to {MAX_SITES} websites. Agents try the same task on each site at the same time, and the site where they finish with the fewest steps wins.</p>
      </div>
      <label className="race-field">
        <span>Task</span>
        <select value={taskId} onChange={(e) => setTaskId(e.target.value)} disabled={busy} aria-label="Task to race">
          {RACE_TASKS.map((id) => <option key={id} value={id}>{TASK_LABELS[id]}</option>)}
        </select>
      </label>
      <div className="race-sites">
        {sites.map((site, i) => (
          <input key={i} type="text" value={site} onChange={(e) => setSite(i, e.target.value)} disabled={busy}
            placeholder={i === 0 ? 'First site, e.g. nykaa.com' : `Site ${i + 1}`} aria-label={`Website ${i + 1}`} />
        ))}
      </div>
      {replay && (
        <div className="site-chips" role="group" aria-label="Sites we have recordings for">
          <span className="muted">Try a recorded site:</span>
          {chips.map((c) => (
            <button key={c.name} type="button" className="secondary" onClick={() => addChip(c.url)} disabled={busy}>{c.name}</button>
          ))}
        </div>
      )}
      <div className="race-actions">
        {sites.length < MAX_SITES && (
          <button type="button" className="link-button" onClick={() => setSites((p) => [...p, ''])} disabled={busy}>Add a third site</button>
        )}
        <button type="submit" disabled={busy || filled.length < 2}>{busy ? 'Racing…' : 'Start race'}</button>
      </div>
    </form>
  );
}

/** One site in the race: follows its report live and shows the shared lane. */
function RaceLane({ lane, taskId, place, finished, onShotClick }) {
  const live = useLiveEvents(lane.reportId);
  const task = live.tasks[taskId];
  const running = live.connection !== 'done';
  const waitReason = useQueueNote(lane.reportId, running && (!task || task.status === 'queued'));
  const host = hostOf(lane.url);
  const classes = ['race-lane', place === 1 ? 'race-winner' : ''].join(' ').trim();
  return (
    <div className={classes}>
      <div className="race-lane-head">
        <b>{host}</b>
        {place ? <span className={`chip ${place === 1 ? 'band-pass' : ''}`}>{placeText(place)}</span> : null}
        {finished && !place && task && <span className="chip">No place</span>}
      </div>
      <Lane task={task} label={TASK_LABELS[taskId]} onShotClick={onShotClick} waitReason={waitReason} />
      {live.report && <a className="race-report-link" href={`#/test/${encodeURIComponent(lane.reportId)}`}>Open the full report for {host}</a>}
    </div>
  );
}

function Summary({ race }) {
  const winner = race.rank?.[0] && race.lanes.find((l) => l.reportId === race.rank[0].reportId);
  const stopped = race.lanes.every((l) => l.report?.status === 'cancelled');
  if (stopped) return <section className="card stopped-card" role="status"><b>Race stopped.</b> <span className="muted">No winner is named for a stopped race.</span></section>;
  if (!winner) {
    return (
      <section className="card race-summary" role="status">
        <b>No winner.</b> <span className="muted">The agents could not finish this task on any of these sites. Open each report to see where they got stuck.</span>
      </section>
    );
  }
  const t = winner.task;
  return (
    <section className="card race-summary race-summary-win" role="status">
      <div className="race-win-line"><span className="chip band-pass">Winner</span> <b>{hostOf(winner.url)}</b></div>
      <span className="muted">Finished in {stepsOf(t)} steps and {Math.round(t.seconds)} seconds. Fewest steps wins; the same number of steps goes to the faster site.</span>
      <ol className="race-ranking" aria-label="Finishing order">
        {race.rank.map((r) => {
          const lane = race.lanes.find((l) => l.reportId === r.reportId);
          return <li key={r.reportId}>{hostOf(lane.url)}: {stepsOf(lane.task)} steps, {Math.round(lane.task.seconds)} s</li>;
        })}
      </ol>
    </section>
  );
}

export default function RacePage({ raceId }) {
  const [replay, setReplay] = useState(false);
  const [demoStoreUrl, setDemoStoreUrl] = useState(null);
  const [race, setRace] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [shot, setShot] = useState(null);

  useEffect(() => {
    getHealth().then((h) => { setReplay(Boolean(h.mock)); setDemoStoreUrl(h.demoStoreUrl ?? null); }).catch(() => {});
  }, []);

  // Follow the race itself (for the ranking) until every site has a final report.
  useEffect(() => {
    setRace(null); setError(''); setStopping(false);
    if (!raceId) return undefined;
    let stop = false;
    let timer;
    const poll = async () => {
      try {
        const r = await getRace(raceId);
        if (stop) return;
        setRace(r);
        if (r.lanes.some((l) => !l.report || l.report.status === 'running')) timer = setTimeout(poll, 1500);
      } catch (e) { if (!stop) setError(e.message); }
    };
    poll();
    return () => { stop = true; clearTimeout(timer); };
  }, [raceId]);

  const onStart = async (taskId, urls) => {
    setError(''); setStarting(true);
    try {
      const { raceId: id } = await startRace(taskId, urls);
      navigate('race', id);
    } catch (e) { setError(e.message); } finally { setStarting(false); }
  };
  const running = Boolean(race) && race.lanes.some((l) => !l.report || l.report.status === 'running');
  const onStop = async () => {
    setStopping(true);
    try { const r = await cancelRace(raceId); if (!r?.cancelled) setStopping(false); } catch (e) { setError(e.message); setStopping(false); }
  };
  const placeOf = (reportId) => running ? null : race?.rank?.find((r) => r.reportId === reportId)?.place ?? null;

  return (
    <>
      <RaceForm busy={starting || running} replay={replay} demoStoreUrl={demoStoreUrl} onStart={onStart} />
      {error && <section className="card error" role="alert">{error}</section>}
      {race && !error && (
        <>
          {running ? (
            <section className="card">
              <div className="progress">
                <span className="big">{stopping ? 'Stopping…' : 'Racing…'}</span>
                <span>{TASK_LABELS[race.taskId]}</span>
                <button type="button" className="secondary stop-test" onClick={onStop} disabled={stopping}>{stopping ? 'Stopping…' : 'Stop race'}</button>
              </div>
            </section>
          ) : <Summary race={race} />}
          <section className="lanes race-lanes" aria-label="Racing sites">
            {race.lanes.map((lane) => (
              <RaceLane key={lane.reportId} lane={lane} taskId={race.taskId} place={placeOf(lane.reportId)} finished={!running} onShotClick={setShot} />
            ))}
          </section>
        </>
      )}
      <ShotViewer url={shot} onClose={() => setShot(null)} />
    </>
  );
}
