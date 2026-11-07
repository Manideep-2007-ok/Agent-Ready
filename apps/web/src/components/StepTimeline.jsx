// Step timeline with replay (P3-1): every task's steps as screenshots, the step where a failed task stopped
// highlighted, and a Replay button that plays the screenshots as a slideshow (1.5 s per step).
import { useEffect, useMemo, useState } from 'react';
import { TASK_LABELS } from '@agentready/engine/goals';

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

  if (!steps.length) return null;
  const play = () => { setAt(0); setPlaying(true); };
  const current = steps[at];
  const label = TASK_LABELS[task.taskId] ?? task.taskId;

  return (
    <article className="timeline-task">
      <header className="timeline-head">
        <h3>{label}</h3>
        <span className="muted">{steps.length} steps · {Math.round(task.seconds || 0)} s</span>
        <button type="button" className="secondary" onClick={playing ? () => setPlaying(false) : play} aria-pressed={playing}>
          {playing ? 'Pause' : 'Replay'}
        </button>
      </header>
      {(playing || at > 0) && current && (
        <figure className="timeline-stage">
          <button type="button" className="timeline-stage-shot" onClick={() => onShotClick?.(current.screenshotUrl)} aria-label={`Enlarge step ${at + 1}`}>
            {bad.has(current.screenshotUrl)
              ? <span className="muted">No screenshot for this step</span>
              : <img src={current.screenshotUrl} alt={`Step ${at + 1}: ${current.label}`} onError={() => setBad((b) => new Set(b).add(current.screenshotUrl))} />}
          </button>
          <figcaption aria-live={prefersCalm() ? 'off' : 'polite'}>
            Step {at + 1} of {steps.length}: {current.label}{at === stuck ? ' (the agent stopped here)' : ''}
          </figcaption>
        </figure>
      )}
      <ol className="timeline-steps">
        {steps.map((s, i) => (
          <li key={s.id} className={`${i === stuck ? 'is-stuck' : ''}${i === at && (playing || at > 0) ? ' is-current' : ''}`}>
            <button type="button" onClick={() => { setPlaying(false); setAt(i); }} aria-label={`Step ${i + 1}: ${s.label}`}>
              {bad.has(s.screenshotUrl) ? <span className="timeline-noshot" aria-hidden="true">{i + 1}</span>
                : <img src={s.screenshotUrl} alt="" loading="lazy" onError={() => setBad((b) => new Set(b).add(s.screenshotUrl))} />}
              <span className="timeline-label">
                <b>{i + 1}.</b> {s.label}
                {s.usedWebSearch && <em> (web search)</em>}
                {i === stuck && <strong className="timeline-stuck"> Stopped here</strong>}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </article>
  );
}

/** @param {{report: import('@agentready/engine/types').SiteReport, onShotClick?: (url:string)=>void}} props */
export default function StepTimeline({ report, onShotClick }) {
  const tasks = report.tasks.filter((t) => (t.steps ?? []).some((s) => s.screenshotUrl));
  if (!tasks.length) return null;
  return (
    <section className="card timeline" aria-labelledby="timeline-title">
      <h2 id="timeline-title">Step by step</h2>
      <p className="muted">Every step each agent took, with its screenshot. Press Replay to watch a task again.</p>
      {tasks.map((t) => <TaskSteps key={t.taskId} task={t} onShotClick={onShotClick} />)}
    </section>
  );
}
