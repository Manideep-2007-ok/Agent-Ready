// Smoke test, no credits: TINYFISH_MOCK=1 TINYFISH_MOCK_SPEED=50 node apps/server/scripts/watch-smoke.js
process.env.TINYFISH_MOCK = '1';
process.env.TINYFISH_MOCK_SPEED ??= '50';
delete process.env.ALERT_WEBHOOK_URL; // alerts print to console
// Write to a throwaway folder: watches saved in the real data/ would be scheduled when the server starts.
const os = await import('node:os');
const fsp = await import('node:fs/promises');
process.env.AGENTREADY_DATA_DIR = await fsp.mkdtemp((await import('node:path')).join(os.tmpdir(), 'agentready-smoke-'));

const express = (await import('express')).default;
const { default: watchRouter } = await import('../src/routes/watch.js');
const { default: webhooksRouter } = await import('../src/routes/webhooks.js');
const { compareReports, formatAlert, formatRecovery } = await import('../src/watch.js');

// 1) Pure compare + message formatting with hand-built reports
const task = (taskId, status, numSteps, extra = {}) => ({ taskId, status, numSteps, findings: [], blocker: null, ...extra });
const good = { id: 'rep_good', url: 'https://shop.example.com', testedAt: '2026-11-01T08:30:00Z', botWall: 'none', tasks: [task('add_to_cart', 'passed', 5)] };
const bad = {
  id: 'rep_bad', url: 'https://shop.example.com', testedAt: '2026-11-01T16:30:00Z', botWall: 'none',
  tasks: [task('add_to_cart', 'failed', 12, { blocker: 'A full-screen Diwali pop-up covers the page', findings: [{ type: 'cart-not-found', severity: 'high' }] })],
};
const cmp = compareReports(good, bad);
console.log('compare fail:', JSON.stringify(cmp));
console.log('compare same:', JSON.stringify(compareReports(good, good)));
const watch = { id: 'w_test', url: bad.url, tasks: ['add_to_cart'] };
console.log(formatAlert({ watch, lastGood: good, current: bad, task: bad.tasks[0] }));
console.log(formatRecovery({ watch, current: good, taskIds: ['add_to_cart'] }));

// 2) Routes end to end in mock mode
const app = express();
app.use(express.json());
app.use('/api/watch', watchRouter);
app.use('/api/webhooks', webhooksRouter);
const server = app.listen(0);
const base = `http://localhost:${server.address().port}`;
const api = async (method, p, body) => {
  const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

console.log('bad url ->', (await api('POST', '/api/watch', { url: 'nope' })).status);
const w1 = (await api('POST', '/api/watch', { url: 'https://www.swiggy.com', tasks: ['add_to_cart'], everyMinutes: 59 })).body;
const w2 = (await api('POST', '/api/watch', { url: 'https://www.nykaa.com', tasks: ['find_price'], everyMinutes: 120 })).body;
console.log('created', w1.id, w2.id);
console.log('webhook ->', (await api('POST', '/api/webhooks/tinyfish', { event: 'run.completed', run_id: 'x' })).status);

for (const w of [w1, w2]) {
  const { body } = await api('POST', `/api/watch/${w.id}/run-now`);
  console.log('run-now', w.id, body);
  console.log('second run-now while running ->', (await api('POST', `/api/watch/${w.id}/run-now`)).status);
}
// wait for history to fill
for (let i = 0; i < 120; i++) {
  const h = [(await api('GET', `/api/watch/${w1.id}/history`)).body, (await api('GET', `/api/watch/${w2.id}/history`)).body];
  if (h.every((x) => Array.isArray(x) && x.length)) {
    for (const [i2, w] of [w1, w2].entries()) console.log('history', w.url, h[i2].map((r) => `${r.id} score=${r.score}`));
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
console.log('list ->', (await api('GET', '/api/watch')).body.map((w) => `${w.id} good=${w.lastGoodReportId} failing=${w.failing}`));
console.log('patch ->', (await api('PATCH', `/api/watch/${w1.id}`, { enabled: false })).body.enabled);
server.close();
process.exit(0);
