// Notes about one task's result, shared by the live lanes (Overview) and the Steps tab: confirm runs (D41), the claim
// check (D42), the replay note (D35), and the agent's own answer or what blocked it.
import './Lane.css';

/** After a confirmed test: how many runs agreed (D41). */
export function confirmNote(task) {
  const runs = (task?.runs ?? []).filter((r) => !r.stopped);
  if (runs.length < 2) return null;
  const passed = runs.filter((r) => r.passed).length;
  return task.flaky
    ? <div className="ar-lane-note ar-lane-note--warn" role="note">Runs disagreed: passed {passed} of {runs.length}. The result shown is the majority.</div>
    : <div className="ar-lane-note" role="note">Confirmed: {runs.length} of {runs.length} runs agree</div>;
}

/** Claim check (D42): did the page the agent named show what it reported? */
export function claimNote(task) {
  const c = task?.claim;
  if (!c) return null;
  if (c.status === 'confirmed') return <div className="ar-lane-note" role="note">Checked: the page it named shows {c.facts.map((f) => f.label).join(', ')}</div>;
  if (c.status === 'off-site') return <div className="ar-lane-note ar-lane-note--warn" role="note">The answer points to another website</div>;
  return <div className="ar-lane-note ar-lane-note--warn" role="note">Not confirmed: the page it named does not show {c.facts.filter((f) => !f.found).map((f) => f.label).join(', ')}</div>;
}

/** Everything a finished task says about its result, for the Steps tab (the lanes show the same while they are up). */
export function TaskOutcome({ task }) {
  const stopped = String(task.status).toLowerCase() === 'cancelled';
  return (
    <div className="timeline-outcome">
      {task.replayNote && <div className="ar-lane-replay" role="note">{task.replayNote}</div>}
      {confirmNote(task)}
      {claimNote(task)}
      {task.answer && <div className="ar-lane-result"><strong>Agent&apos;s answer</strong>{task.answer}</div>}
      {!stopped && task.blocker && <div className="ar-lane-result ar-lane-result--bad"><strong>What blocked it</strong>{task.blocker}</div>}
    </div>
  );
}
