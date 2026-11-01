// Replays recorded runs in mock mode and prints points + findings, to sanity-check scoring.
process.env.TINYFISH_MOCK = '1';
process.env.TINYFISH_MOCK_SPEED ||= '100';
const { runTaskWithBotWall } = await import('../src/botwall.js');
const { scoreTask } = await import('../src/scoring.js');

const cases = [
  ['https://www.nykaa.com', 'find_price'], ['https://www.nykaa.com', 'add_to_cart'], ['https://www.nykaa.com', 'find_returns'],
  ['https://www.nykaa.com', 'find_contact'], ['https://www.swiggy.com', 'add_to_cart'], ['https://www.myntra.com', 'find_price'],
  ['https://example.com', 'find_price'],
];
for (const [url, taskId] of cases) {
  const t = await runTaskWithBotWall({ url, taskId });
  const { points, findings } = scoreTask(t);
  console.log(`\n${url} ${taskId}: status=${t.status} verdict=${t.verdict} attempts=${t.attempts.map((a) => `${a.mode}/${a.proxy}:${a.passed ? 'pass' : 'fail'}`).join(', ')}`);
  console.log(`  steps=${t.numSteps} seconds=${t.seconds} webSearch=${t.steps.some((s) => s.usedWebSearch)} answer=${String(t.answer).slice(0, 70)}`);
  console.log(`  points=${points} findings=${findings.map((f) => `${f.type}(+${f.pointsIfFixed})`).join(', ') || 'none'}`);
}
