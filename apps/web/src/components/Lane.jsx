import { useEffect, useState } from 'react';
import { GOAL_SUFFIX, TASK_LABELS } from '@agentready/engine/goals';
import './Lane.css';
import { claimNote, confirmNote } from './taskNotes.jsx';

const CHIPS = {
  waiting: ['Waiting for an agent', 'waiting'],
  running: ['Running', 'running'],
  passed: ['Passed', 'passed'],
  failed: ['Failed', 'failed'],
  blocked: ['Blocked', 'blocked'],
  cancelled: ['Stopped', 'cancelled'],
};
const PROXY_NAMES = { off: 'no proxy', IN: 'India proxy', US: 'US proxy' };

function chipOf(task) {
  if (!task) return 'waiting';
  const s = String(task.status || '').toLowerCase();
  const v = task.verdict;
  if (s === 'cancelled') return 'cancelled';
  const done = ['passed', 'failed', 'blocked', 'complete', 'completed'].includes(s);
  if (s === 'blocked' || (done && s !== 'passed' && (v === 'blocks-cloud-agents' || v === 'blocks-automation'))) return 'blocked';
  if (s === 'passed') return 'passed';
  if (s === 'failed') return 'failed';
  if (s === 'running' || s === 'started') return 'running';
  return 'waiting';
}

/**
 * One task lane.
 * @param {{task?: object, label?: string, onShotClick?: (url:string)=>void, startedAt?: number, waitReason?: string}} props
 * waitReason: why a waiting lane is waiting (e.g. "2 agents busy: a Watch check is running").
 */
export default function Lane({ task, label, onShotClick, startedAt, waitReason }) {
  const chip = chipOf(task);
  const running = chip === 'running';
  // Timer starts when the lane starts RUNNING (not when it was mounted while still queued).
  const [runStart, setRunStart] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [iframeFailed, setIframeFailed] = useState(false);
  useEffect(() => {
    if (!running) return undefined;
    setRunStart((v) => v ?? Date.now());
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  // A new attempt (bot-wall cascade) brings a new live view: try the iframe again.
  useEffect(() => { setIframeFailed(false); }, [task?.streamingUrl]);
  const t0 = startedAt || runStart || now;

  // A custom task shows the user's own words (its goal minus our fixed answer-format suffix).
  const customText = task?.taskId === 'custom' && typeof task.goal === 'string' ? task.goal.replace(GOAL_SUFFIX, '').trim() : '';
  const shortCustom = customText.length > 70 ? `${customText.slice(0, 67)}…` : customText;
  const title = label || (shortCustom ? `Your task: ${shortCustom}` : (task && TASK_LABELS[task.taskId])) || 'Task';
  const attempts = Array.isArray(task?.attempts) ? task.attempts : [];
  // During a bot-wall retry the live state can still hold the blocked attempt's steps (the dashboard keeps the
  // longer step list while a task runs). Hide steps whose screenshot belongs to an earlier attempt's run.
  const oldRuns = (chip === 'running' || chip === 'waiting') ? attempts.map((a) => a?.runId).filter(Boolean) : [];
  const steps = (Array.isArray(task?.steps) ? task.steps.filter(Boolean) : [])
    .filter((s) => !oldRuns.some((id) => String(s.screenshotUrl || '').includes(`/${id}/`)));
  const lastStep = steps[steps.length - 1];
  const elapsed = running ? Math.max(0, Math.round((now - t0) / 1000)) : Math.round(task?.seconds || 0);
  const lastAttempt = attempts[attempts.length - 1];
  const showIframe = running && task?.streamingUrl && !iframeFailed;
  // Screenshots newest first; if the newest 404s, fall back to the previous step's, and so on.
  const shotUrls = [...steps].reverse().map((s) => s.screenshotUrl).filter(Boolean);
  const shotKey = shotUrls.join('|');
  const [badShots, setBadShots] = useState(() => new Set());
  useEffect(() => { setBadShots(new Set()); }, [shotKey]);
  const shot = shotUrls.find((u) => !badShots.has(u));
  const shotLabel = (steps.find((s) => s.screenshotUrl === shot) || lastStep)?.label || title;
  const markBad = (u) => setBadShots((prev) => new Set(prev).add(u));
  // Bot-wall retry: while a later attempt is queued/running, say why.
  const retrying = (chip === 'running' || chip === 'waiting') && attempts.length >= 1;
  const attemptNo = attempts.length + 1;
  const retryText = attemptNo === 2 ? 'Blocked without a proxy, retrying with India proxy'
    : attemptNo >= 3 ? 'Still blocked, retrying in stealth mode' : '';
  const [label1, cls] = CHIPS[chip];

  return (
    <section className="ar-lane" aria-label={`${title}: ${label1}`}>
      <div className="ar-lane-head">
        <h3 className="ar-lane-title" title={customText || undefined}>{title}</h3>
        <span className={`ar-lane-chip ar-lane-chip--${cls}`}>{label1}</span>
      </div>
      <div className="ar-lane-meta">
        <span>{chip === 'waiting' ? '' : `${elapsed}s`}</span>
        <span>{steps.length || task?.numSteps || 0} steps</span>
      </div>
      {retrying && retryText && (
        <div className="ar-lane-attempt ar-lane-attempt--retry" role="status">
          <strong>Attempt {attemptNo} of 3: {task?.mode === 'stealth' ? 'stealth browser, ' : ''}{PROXY_NAMES[task?.proxy] || task?.proxy}</strong>
          <span>{retryText}</span>
        </div>
      )}
      {!retrying && attempts.length > 1 && lastAttempt && (
        <div className="ar-lane-attempt">
          Attempt {attempts.length}: {lastAttempt.mode === 'stealth' ? 'stealth browser, ' : ''}{PROXY_NAMES[lastAttempt.proxy] || lastAttempt.proxy}
        </div>
      )}
      <div className="ar-lane-step" aria-live="polite">{lastStep?.label || (running ? (task?.streamingUrl ? 'Agent is on the site, looking around…' : 'Starting the agent…') : '')}</div>
      {showIframe || shot ? (
        <div className="ar-lane-view">
          {showIframe ? (
            <iframe
              src={task.streamingUrl}
              title={`Live view: ${title}`}
              sandbox="allow-scripts allow-same-origin"
              onError={() => setIframeFailed(true)}
            />
          ) : (
            <button type="button" className="ar-lane-shot" aria-label={`Enlarge latest screenshot for ${title}`} onClick={() => onShotClick?.(shot)}>
              <img key={shot} src={shot} alt={`Latest screenshot: ${shotLabel}`} onError={() => markBad(shot)} />
            </button>
          )}
        </div>
      ) : (
        // No picture to show: one quiet line instead of an empty grey box.
        <div className="ar-lane-empty">
          {shotUrls.length ? 'No screenshot for this step' : chip === 'waiting' ? 'Waiting for an agent' : chip === 'cancelled' ? 'Stopped before a picture was taken' : 'No picture yet'}
        </div>
      )}
      {chip === 'waiting' && waitReason && <div className="ar-lane-wait" role="status">{waitReason}</div>}
      {task?.confirming && (
        <div className="ar-lane-attempt ar-lane-attempt--retry" role="status">
          <strong>Confirming: run {task.confirming.run} of {task.confirming.of}</strong>
          <span>{task.confirming.run === 3 ? 'The first two runs disagreed, so a third run decides' : 'Running the task again to check the result holds'}</span>
        </div>
      )}
      {!task?.confirming && confirmNote(task)}
      {!running && claimNote(task)}
      {task?.replayNote && <div className="ar-lane-replay" role="note">{task.replayNote}</div>}
      {!running && task?.answer && (
        <div className="ar-lane-result"><strong>Agent&apos;s answer</strong>{task.answer}</div>
      )}
      {!running && chip !== 'cancelled' && task?.blocker && (
        <div className="ar-lane-result ar-lane-result--bad"><strong>What blocked it</strong>{task.blocker}</div>
      )}
    </section>
  );
}
