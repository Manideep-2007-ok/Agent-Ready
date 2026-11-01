// Prints the sequence of task-update statuses per task (mock only, no credits).
// Usage (from packages/engine): node scripts/event-count.js [--site]
//   default: single-task runs through runTaskWithBotWall; --site: runs each site via runSiteTest (the path the dashboard sees).
process.env.TINYFISH_MOCK = '1';
process.env.TINYFISH_MOCK_SPEED ||= '100';
const { runTaskWithBotWall } = await import('../src/botwall.js');
const { runSiteTest } = await import('../src/runner.js');
const viaSite = process.argv.includes('--site');

const cases = [
  ['https://www.nykaa.com', 'find_price'],
  ['https://www.myntra.com', 'find_price'],
  ['https://www.swiggy.com', 'add_to_cart'],
];
for (const [url, taskId] of cases) {
  const seq = [];
  const onEvent = (e) => {
    if (e.kind === 'task-update' && e.task.taskId === taskId) {
      seq.push(`${e.task.status}${e.task.verdict ? `[verdict=${e.task.verdict},attempts=${e.task.attempts?.length}]` : e.task.attempts ? `[attempts=${e.task.attempts.length}]` : ''}`);
    }
    if (e.kind === 'attempt' && e.taskId === taskId) seq.push(`<attempt ${e.attempt} ${e.mode}/${e.proxy}>`);
  };
  if (viaSite) await runSiteTest({ url, tasks: [taskId] }, onEvent);
  else await runTaskWithBotWall({ url, taskId }, onEvent);
  const counts = {};
  for (const s of seq) { const k = s.replace(/[[<].*/, ''); if (k) counts[k] = (counts[k] || 0) + 1; }
  console.log(`${url} ${taskId}${viaSite ? ' (runSiteTest)' : ''}\n  ${seq.join(' -> ')}\n  counts: ${JSON.stringify(counts)}`);
}
