// Step timeline with replay (P3-1): every task's steps as screenshots, the step where a failed task stopped
// highlighted, and a Replay button that plays the screenshots as a slideshow (1.5 s per step). Each task also shows the
// agent's answer and its checks, so Overview can stay a table once the test is done.
import { useEffect, useMemo, useState } from 'react';
import { GOAL_SUFFIX, TASK_LABELS } from '@agentready/engine/goals';
import { Button, EmptyState, Panel } from '../design/index.js';
import { TaskOutcome } from './taskNotes.jsx';

const STEP_MS = 1500;
const prefersCalm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The step to point at: the last one of a task that did not pass (where the agent gave up). */
const stuckIndex = (task) => (task.status === 'passed' || !task.steps?.length ? -1 : task.steps.length - 1);

function TaskSteps({ task, onShotClick }) {
  const steps = useMemo(() => (task.steps ?? []).filter((s) => s.screenshotUrl), [task.steps]);
  const stuck = stuckIndex({ ...task, steps });
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [bad, setBad] = useState(() => new Set());

  useEffect(() => {
    if (!playing) return undefined;
    if (at >= steps.length - 1) { setPlaying(false); return undefined; }
    const t = setTimeout(() => setAt((i) => i + 1), STEP_MS);
    return () => clearTimeout(t);
  }, [playing, at, steps.length]);

  const play = () => { setAt(0); setPlaying(true); };
  const current = steps[at];
  // A custom task is titled with the user's own words, as on its lane.
  const custom = task.taskId === 'custom' && typeof task.goal === 'string' ? task.goal.replace(GOAL_SUFFIX, '').trim() : '';
  const label = task.taskId === 'custom' ? (custom ? `Your task: ${custom}` : 'Your task') : TASK_LABELS[task.taskId] ?? task.taskId;

  return (
    <article className="timeline-task">
      <header className="timeline-head">
        <h3>{label}</h3>
        <span className="ar-mono ar-faint">{steps.length} steps · {Math.round(task.seconds || 0)}s</span>
        {steps.length > 0 && (
          <Button size="sm" className="no-print" onClick={playing ? () => setPlaying(false) : play} aria-pressed={playing}>
            {playing ? 'Pause' : 'Replay'}
          </Button>
        )}
      </header>
      <TaskOutcome task={task} />
      {(playing || at > 0) && current && (
        <figure className="timeline-stage">
          <button type="button" className="timeline-stage-shot" onClick={() => onShotClick?.(current.screenshotUrl)} aria-label={`Enlarge step ${at + 1}`}>
            {bad.has(current.screenshotUrl)
              ? <span className="ar-muted">No screenshot for this step</span>
              : <img src={current.screenshotUrl} alt={`Step ${at + 1}: ${current.label}`} onError={() => setBad((b) => new Set(b).add(current.screenshotUrl))} />}
          </button>
          <figcaption aria-live={prefersCalm() ? 'off' : 'polite'}>
            Step {at + 1} of {steps.length}: {current.label}{at === stuck ? ' (the agent stopped here)' : ''}
          </figcaption>
        </figure>
      )}
      {steps.length > 0 && <ol className="timeline-steps">
        {steps.map((s, i) => (
          <li key={s.id} className={`${i === stuck ? 'is-stuck' : ''}${i === at && (playing || at > 0) ? ' is-current' : ''}`}>
            <button type="button" onClick={() => { setPlaying(false); setAt(i); }} aria-label={`Step ${i + 1}: ${s.label}`}>
              {/* a step whose picture cannot load shows its label only, not an empty box */}
              {!bad.has(s.screenshotUrl) && <img src={s.screenshotUrl} alt="" loading="lazy" onError={() => setBad((b) => new Set(b).add(s.screenshotUrl))} />}
              <span className="timeline-label">
                <b>{i + 1}.</b> {s.label}
                {s.usedWebSearch && <em> (web search)</em>}
                {i === stuck && <strong className="timeline-stuck"> Stopped here</strong>}
              </span>
            </button>
          </li>
        ))}
      </ol>}
    </article>
  );
}

/** @param {{report: import('@agentready/engine/types').SiteReport, onShotClick?: (url:string)=>void}} props */
export default function StepTimeline({ report, onShotClick }) {
  const said = (t) => t.answer || t.blocker || t.replayNote;
  const tasks = report.tasks.filter((t) => (t.steps ?? []).some((s) => s.screenshotUrl) || said(t));
  if (!tasks.length) return <Panel><EmptyState title="No steps yet" body="Screenshots of every step appear here once an agent finishes a task." /></Panel>;
  return (
    <Panel className="timeline ar-panel--plain">
      <p className="ar-muted ar-tight">Every step each agent took, with its screenshot and the agent&apos;s answer. Press Replay to watch a task again.</p>
      {tasks.map((t) => <TaskSteps key={t.taskId} task={t} onShotClick={onShotClick} />)}
    </Panel>
  );
}
