// Public API of the engine.
export { config, requireApiKey } from './config.js';
export * from './tinyfish.js';
export { enqueue, getQueueSize, getRunningCount } from './queue.js';
export { runTask, runSiteTest, looksBlocked, parseAgentAnswer } from './runner.js';
export { runTaskWithBotWall } from './botwall.js';
export { scoreTask, scoreReport, siteVerdict, USD_INR } from './scoring.js';
export { GOAL_SUFFIX, TASK_GOALS, TASK_LABELS, DEFAULT_TASK_ORDER, buildGoal } from './goals.js';
export * from './types.js';
// fixes.js is written by another teammate; keep this line last.
export { buildFixReport, FIX_TEMPLATES, detectFramework } from './fixes.js';
export { instantScan, instantScanFindings, auditPage } from './instantScan.js';
