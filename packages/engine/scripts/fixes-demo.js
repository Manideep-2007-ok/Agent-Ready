// Demo: run with `TINYFISH_MOCK=1 node packages/engine/scripts/fixes-demo.js` (no credits, no LLM key).
process.env.TINYFISH_MOCK = '1';
delete process.env.LLM_API_KEY;
const { buildFixReport } = await import('../src/fixes.js');

const f = (type, taskId, severity, pts) => ({
  type, taskId, severity, text: `Demo finding: ${type}`, likelyCause: '', fix: '', pointsIfFixed: pts, verified: true,
});
const cart = f('cart-not-found', 'add_to_cart', 'high', 25);
const search = f('needed-web-search', 'find_returns', 'medium', 5);
const wall = f('blocks-cloud-agents', 'find_price', 'critical', 25);
const report = {
  id: 'rep_demo', url: 'https://example.com', source: 'web', testedAt: new Date().toISOString(), pack: 'shopping',
  status: 'complete', score: 40, botWall: 'blocks-cloud-agents', costRupees: 10, framework: 'unknown', instantScan: null,
  tasks: [
    { taskId: 'add_to_cart', status: 'failed', stuckUrl: 'https://example.com/cart', findings: [cart] },
    { taskId: 'find_returns', status: 'passed', stuckUrl: null, findings: [search] },
    { taskId: 'find_price', status: 'failed', stuckUrl: null, findings: [wall] },
  ],
  topFixes: [cart, wall, search],
};
const out = await buildFixReport(report);
for (const t of out.tasks) for (const x of t.findings) console.log(x.type, '\n  cause:', x.likelyCause, '\n  fix:', x.fix, '\n  std:', x.standard, '\n  ex:', x.frameworkExample, '\n  check:', x.passCheck, '\n  element:', x.element ?? null);
console.log('topFixes:', out.topFixes.map((x) => x.type).join(', '), '| framework:', out.framework);
console.log('input mutated?', report.topFixes[0].likelyCause !== '');
