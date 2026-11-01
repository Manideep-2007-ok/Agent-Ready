import { useEffect, useState } from 'react';
import { GOAL_SUFFIX, TASK_LABELS } from '@agentready/engine/goals';
import './Lane.css';

const CHIPS = {
  waiting: ['Waiting for an agent', 'waiting'],
  running: ['Running', 'running'],
  passed: ['Passed', 'passed'],
  failed: ['Failed', 'failed'],
  blocked: ['Blocked', 'blocked'],
};
const PROXY_NAMES = { off: 'no proxy', IN: 'India proxy', US: 'US proxy' };

function chipOf(task) {
  if (!task) return 'waiting';
  const s = String(task.status || '').toLowerCase();
  const v = task.verdict;
  const done = ['passed', 'failed', 'blocked', 'complete', 'completed'].includes(s);
  if (s === 'blocked' || (done && s !== 'passed' && (v === 'blocks-cloud-agents' || v === 'blocks-automation'))) return 'blocked';
  if (s === 'passed') return 'passed';
  if (s === 'failed') return 'failed';
  if (s === 'running' || s === 'started') return 'running';
  return 'waiting';
}

/**
 * One task lane.
 * @param {{task?: object, label?: string, onShotClick?: (url:string)=>void, startedAt?: number}} props
 */
export default function Lane({ task, label, onShotClick, startedAt }) {
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
      <div className="ar-lane-view">
        {showIframe ? (
          <iframe
            src={task.streamingUrl}
            title={`Live view: ${title}`}
            sandbox="allow-scripts allow-same-origin"
            onError={() => setIframeFailed(true)}
          />
        ) : shot ? (
          <button type="button" className="ar-lane-shot" aria-label={`Enlarge latest screenshot for ${title}`} onClick={() => onShotClick?.(shot)}>
            <img key={shot} src={shot} alt={`Latest screenshot: ${shotLabel}`} onError={() => markBad(shot)} />
          </button>
        ) : shotUrls.length ? (
          <div className="ar-lane-empty">No screenshot for this step</div>
        ) : (
          <div className="ar-lane-empty">{chip === 'waiting' ? 'Waiting for an agent' : 'No picture yet'}</div>
        )}
      </div>
      {!running && task?.answer && (
        <div className="ar-lane-result"><strong>Agent&apos;s answer</strong>{task.answer}</div>
      )}
      {!running && task?.blocker && (
        <div className="ar-lane-result ar-lane-result--bad"><strong>What blocked it</strong>{task.blocker}</div>
      )}
    </section>
  );
}
