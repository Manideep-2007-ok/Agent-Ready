// Talks to the Express server (/api, proxied by Vite) and keeps live test state from the SSE stream.
import { useEffect, useReducer, useState } from 'react';
import { queueReason } from './queueReason.js';
import { progress } from './design/progress.js';

/** @typedef {import('@agentready/engine/types').SiteReport} SiteReport */
/** @typedef {import('@agentready/engine/types').TaskResult} TaskResult */
/** @typedef {import('@agentready/engine/types').InstantScan} InstantScan */
/** @typedef {import('@agentready/engine/types').LiveEvent} LiveEvent */

/** JSON request; throws an Error with the server's plain-language message on failure. The top loading bar runs while
 * it is open, except for `quiet` background polls. */
export async function api(path, { method = 'GET', body, quiet = false } = {}) {
  const end = quiet ? () => {} : progress.begin();
  try {
    const res = await fetch(`/api${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `The server answered ${res.status}. Is it running on port 4000?`);
    return data;
  } finally { end(); }
}

export const getHealth = () => api('/health');
export const cancelTest = (id) => api(`/tests/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
export const cancelWatchCheck = (id) => api(`/watch/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
export const startTest = (url, customTask, { confirm = false, pack } = {}) =>
  api('/tests', { method: 'POST', body: { url, customTask: customTask || undefined, ...(confirm ? { confirm: true } : {}), ...(pack ? { pack } : {}) } });
export const getEstimate = (tasks, confirm) => api(`/estimate?tasks=${tasks}${confirm ? '&confirm=1' : ''}`);
export const getSiteHistory = (url) => api(`/sites/history?url=${encodeURIComponent(url)}`);
export const getReport = (id) => api(`/tests/${encodeURIComponent(id)}`);
export const listReports = () => api('/tests');
export const buildFixes = (id) => api(`/reports/${encodeURIComponent(id)}/fixes`, { method: 'POST' });
export const getLeaderboard = () => api('/leaderboard');
export const setDemoFlaws = (on) => api('/demo-store/flaws', { method: 'POST', body: { on } });

// Agent-Ready Watch (routes by Manideep, apps/server/src/routes/watch.js).
export const listWatches = () => api('/watch');
export const createWatch = (url, everyMinutes, tasks) => api('/watch', { method: 'POST', body: { url, everyMinutes, ...(tasks ? { tasks } : {}) } });
export const updateWatch = (id, changes) => api(`/watch/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes });
export const runWatchNow = (id) => api(`/watch/${encodeURIComponent(id)}/run-now`, { method: 'POST' });
export const getWatchHistory = (id) => api(`/watch/${encodeURIComponent(id)}/history`);

/**
 * @typedef {Object} LiveState
 * @property {Record<string, TaskResult>} tasks   by taskId, in arrival order
 * @property {InstantScan|null} scan
 * @property {SiteReport|null} report             set once the test is complete
 * @property {'idle'|'connecting'|'live'|'done'|'lost'} connection
 */

/** @type {LiveState} */
const EMPTY = { tasks: {}, scan: null, report: null, connection: 'idle' };

const FINISHED = new Set(['passed', 'failed', 'blocked']);

/**
 * While a task runs, keep whichever step list is longer, so a task-update never wipes steps that streamed in.
 * Once it finishes, its own list wins: those are the real run steps with screenshots (live ones have none).
 */
function mergeTask(previous, next) {
  if (!previous) return next;
  const steps = FINISHED.has(next.status) || next.steps?.length >= previous.steps.length ? next.steps : previous.steps;
  // `confirming` is only on the updates sent while a repeat run goes; the closing update has none.
  return { ...previous, ...next, steps, streamingUrl: next.streamingUrl ?? previous.streamingUrl, confirming: next.confirming };
}

/** @param {LiveState} state @param {LiveEvent | {type:'connecting'|'open'|'lost'}} event */
function reduce(state, event) {
  switch (event.type) {
    case 'connecting':
      return { ...EMPTY, connection: 'connecting' };
    case 'open':
      return state.connection === 'done' ? state : { ...state, connection: 'live' };
    case 'lost':
      return state.connection === 'done' ? state : { ...state, connection: 'lost' };
    case 'instant-scan':
      return { ...state, scan: event.scan };
    case 'task-update':
      return { ...state, tasks: { ...state.tasks, [event.task.taskId]: mergeTask(state.tasks[event.task.taskId], event.task) } };
    case 'step': {
      const task = state.tasks[event.taskId];
      if (!task || task.steps.some((s) => s.id === event.step.id)) return state;
      const steps = [...task.steps, event.step];
      return { ...state, tasks: { ...state.tasks, [event.taskId]: { ...task, steps, numSteps: steps.length } } };
    }
    case 'streaming-url': {
      const task = state.tasks[event.taskId];
      return task ? { ...state, tasks: { ...state.tasks, [event.taskId]: { ...task, streamingUrl: event.url } } } : state;
    }
    case 'report-complete': {
      const tasks = Object.fromEntries(event.report.tasks.map((t) => [t.taskId, t]));
      return { tasks, scan: event.report.instantScan ?? state.scan, report: event.report, connection: 'done' };
    }
    default:
      return state;
  }
}

/**
 * While `active`, asks the server every 3 s which runs hold the agent slots, and returns a plain-language reason
 * ("2 agents busy: a Watch check is running") for lanes that are waiting. '' when there is nothing to say.
 */
export function useQueueNote(reportId, active) {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!active || !reportId) { setNote(''); return undefined; }
    let stop = false;
    const poll = () => api('/health', { quiet: true }).then((h) => { if (!stop) setNote(queueReason(h.queue, reportId)); }).catch(() => {});
    poll();
    const timer = setInterval(poll, 3000);
    return () => { stop = true; clearInterval(timer); };
  }, [reportId, active]);
  return note;
}

/**
 * Follows one report live. The server replays what already happened first, so refreshing the page is safe.
 * @param {string|null} reportId
 * @returns {LiveState}
 */
export function useLiveEvents(reportId) {
  const [state, dispatch] = useReducer(reduce, EMPTY);

  useEffect(() => {
    if (!reportId) return undefined;
    dispatch({ type: 'connecting' });
    const source = new EventSource(`/api/tests/${encodeURIComponent(reportId)}/events`);
    source.onopen = () => dispatch({ type: 'open' });
    source.onmessage = (message) => {
      const event = JSON.parse(message.data);
      dispatch(event);
      if (event.type === 'report-complete') source.close();
    };
    // EventSource retries by itself; we only show that the link dropped.
    source.onerror = () => dispatch({ type: 'lost' });
    return () => source.close();
  }, [reportId]);

  return state;
}

// Race Mode and the leaderboard.
export const startRace = (taskId, urls) => api('/race', { method: 'POST', body: { taskId, urls } });
export const getRace = (id) => api(`/race/${encodeURIComponent(id)}`);
export const cancelRace = (id) => api(`/race/${encodeURIComponent(id)}/cancel`, { method: 'POST' });
