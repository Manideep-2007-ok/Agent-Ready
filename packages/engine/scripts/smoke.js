// Usage (from packages/engine):  node scripts/smoke.js <url> [taskId]   |   node scripts/smoke.js <url> --site
// Mock:  TINYFISH_MOCK=1 TINYFISH_MOCK_SPEED=20 node scripts/smoke.js https://www.nykaa.com find_returns
// Imports the modules directly (not index.js) so it works before fixes.js exists.
const args = process.argv.slice(2);
const site = args.includes('--site');
const [url, taskId = 'find_price'] = args.filter((a) => !a.startsWith('--'));
if (!url) { console.error('Usage: node scripts/smoke.js <url> [taskId] [--site]'); process.exit(1); }

const { runTaskWithBotWall } = await import('../src/botwall.js');
const { runSiteTest } = await import('../src/runner.js');
const { getQueueSize, getRunningCount } = await import('../src/queue.js');

let maxRunning = 0;
const onEvent = (e) => {
  maxRunning = Math.max(maxRunning, getRunningCount());
  const brief = e.kind === 'task-update' ? `${e.task.taskId} -> ${e.task.status} (steps ${e.task.numSteps})`
    : e.kind === 'step' ? `${e.taskId}: ${e.step.label}${e.step.usedWebSearch ? ' [web search]' : ''}`
    : e.kind === 'report-complete' ? `score ${e.report.score}` : JSON.stringify(e);
  console.log(`[event ${e.kind}] ${brief}  (running ${getRunningCount()}, waiting ${getQueueSize()})`);
};

try {
  const result = site ? await runSiteTest({ url }, onEvent) : await runTaskWithBotWall({ url, taskId }, onEvent);
  console.log('\n=== FINAL', site ? 'SiteReport' : 'TaskResult', '===');
  console.log(JSON.stringify(result, (k, v) => (k === 'steps' && Array.isArray(v) ? `[${v.length} steps]` : v), 2));
  console.log(`max parallel runs seen: ${maxRunning}`);
} catch (err) {
  console.error('Smoke test failed:', err.message);
  process.exit(1);
}
