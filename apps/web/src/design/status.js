// Task status and score -> badge tone and words. Pure, shared by every page (and tested in node).
/** @typedef {'pass'|'fail'|'warn'|'wait'|'accent'|'neutral'} Tone */

const WALLS = ['blocks-cloud-agents', 'blocks-automation', 'site-broken'];

/** @returns {{tone: Tone, label: string}} */
export function statusBadge(status, verdict) {
  if (status === 'passed') return { tone: 'pass', label: 'PASSED' };
  if (status === 'blocked' || (status === 'failed' && WALLS.includes(verdict))) return { tone: 'fail', label: 'BLOCKED' };
  if (status === 'failed') return { tone: 'fail', label: 'FAILED' };
  if (status === 'running') return { tone: 'accent', label: 'RUNNING' };
  if (status === 'cancelled') return { tone: 'wait', label: 'STOPPED' };
  return { tone: 'wait', label: 'WAITING' };
}

/** Readiness band for a score out of 100. @returns {{tone: Tone, label: string}} */
export function scoreBand(score) {
  if (score >= 80) return { tone: 'pass', label: 'Ready for AI agents' };
  if (score >= 50) return { tone: 'warn', label: 'Partly ready' };
  return { tone: 'fail', label: 'Not ready' };
}
