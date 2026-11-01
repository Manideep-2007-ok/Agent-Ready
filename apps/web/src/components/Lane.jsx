import { useEffect, useState } from 'react';
import { TASK_LABELS } from '@agentready/engine/goals';
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

  const title = label || (task && TASK_LABELS[task.taskId]) || 'Task';
  const steps = Array.isArray(task?.steps) ? task.steps.filter(Boolean) : [];
  const lastStep = steps[steps.length - 1];
  const elapsed = running ? Math.max(0, Math.round((now - t0) / 1000)) : Math.round(task?.seconds || 0);
  const attempts = Array.isArray(task?.attempts) ? task.attempts : [];
  const lastAttempt = attempts[attempts.length - 1];
  const showIframe = running && task?.streamingUrl && !iframeFailed;
  const shot = [...steps].reverse().find((s) => s.screenshotUrl)?.screenshotUrl;
  const [label1, cls] = CHIPS[chip];

  return (
    <section className="ar-lane" aria-label={`${title}: ${label1}`}>
      <div className="ar-lane-head">
        <h3 className="ar-lane-title">{title}</h3>
        <span className={`ar-lane-chip ar-lane-chip--${cls}`}>{label1}</span>
      </div>
      <div className="ar-lane-meta">
        <span>{chip === 'waiting' ? '' : `${elapsed}s`}</span>
        <span>{steps.length || task?.numSteps || 0} steps</span>
      </div>
      {attempts.length > 1 && lastAttempt && (
        <div className="ar-lane-attempt">
          Attempt {attempts.length}: {lastAttempt.mode === 'stealth' ? 'stealth browser, ' : ''}{PROXY_NAMES[lastAttempt.proxy] || lastAttempt.proxy}
        </div>
      )}
      <div className="ar-lane-step" aria-live="polite">{lastStep?.label || (running ? 'Starting…' : '')}</div>
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
            <img src={shot} alt={`Latest screenshot: ${lastStep?.label || title}`} />
          </button>
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
