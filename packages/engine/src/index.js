// Public API of the engine.
export { config, requireApiKey } from './config.js';
export * from './tinyfish.js';
export { enqueue, getQueueSize, getRunningCount, getQueueState, cancelGroup, QueueCancelled, PRIORITY, priorityForSource } from './queue.js';
export { createRunContext, getRunContext, isReportActive, activeReportIds, cancelReport, cancelAll, RunContext } from './runContext.js';
export { loadDotEnv } from './env.js';
export { fixturesAvailable } from './mock.js';
export { badgeSvg, badgeValue, badgeForReport } from './badge.js';
export { runTask, runSiteTest, looksBlocked, parseAgentAnswer, REPLAY_CUSTOM_NOTE, REPLAY_PACK_NOTE } from './runner.js';
export { runTaskWithBotWall } from './botwall.js';
export { scoreTask, scoreReport, rankFixes, siteVerdict, isScored, USD_INR, detectQuantity, detectCurrencyMismatch, countAddToCartPresses, taskSteps, estimateCost, RUPEES_PER_STEP } from './scoring.js';
export { confirmTask, decideMajority, canConfirm } from './confirm.js';
export { checkClaims, planClaimCheck, claimFacts, extractUrls } from './claims.js';
export { GOAL_SUFFIX, TASK_GOALS, TASK_LABELS, DEFAULT_TASK_ORDER, buildGoal, PACKS, PACK_IDS, DEFAULT_PACK, SHOP_TASKS, normalisePack, packOfTask, packForTasks, defaultTasksFor, packSiteLabel } from './goals.js';
export { detectPack, autoPack, packScores, hasPackSignals, keywordHitsFromText, schemaTypesFromJsonLd, KEYWORD_SOURCES } from './packs.js';
export * from './types.js';
// fixes.js is written by another teammate; keep this line last.
export { buildFixReport, FIX_TEMPLATES, detectFramework } from './fixes.js';
export { instantScan, instantScanFindings, auditPage, auditSite, aiAgentsBlockedByRobots, AI_AGENTS } from './instantScan.js';
