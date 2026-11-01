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
const scanA = { ...f('unlabelled-buttons', undefined, 'medium', 0), text: '12 of 40 buttons and links have no label' };
const scanB = { ...f('unlabelled-buttons', undefined, 'high', 0), text: 'second finding of the same type (shares one AI call)' };
const scanC = f('no-product-schema', undefined, 'low', 0);
const report = {
  id: 'rep_demo', url: 'https://example.com', source: 'web', testedAt: new Date().toISOString(), pack: 'shopping',
  status: 'complete', score: 40, botWall: 'blocks-cloud-agents', costRupees: 10, framework: 'unknown', instantScan: null,
  tasks: [
    { taskId: 'add_to_cart', status: 'failed', stuckUrl: 'https://example.com/cart', findings: [cart] },
    { taskId: 'find_returns', status: 'passed', stuckUrl: null, findings: [search] },
    { taskId: 'find_price', status: 'failed', stuckUrl: null, findings: [wall] },
  ],
  topFixes: [cart, wall, search],
  scanFindings: [scanA, scanB, scanC],
};
const out = await buildFixReport(report);
for (const t of out.tasks) for (const x of t.findings) console.log(x.type, '\n  cause:', x.likelyCause, '\n  fix:', x.fix, '\n  std:', x.standard, '\n  ex:', x.frameworkExample, '\n  check:', x.passCheck, '\n  element:', x.element ?? null);
console.log('topFixes:', out.topFixes.map((x) => x.type).join(', '), '| framework:', out.framework);
for (const x of out.scanFindings) console.log('[scan]', x.type, '| text:', x.text, '\n  cause:', x.likelyCause, '\n  ex:', x.frameworkExample);
console.log('scanFindings enriched?', out.scanFindings.every((x) => x.likelyCause && x.passCheck), '| input scan untouched?', report.scanFindings[0].likelyCause === '');
const { scanFindings: _drop, ...noScan } = report;
console.log('no scanFindings field stays absent?', !('scanFindings' in await buildFixReport(noScan)));
console.log('input mutated?', report.topFixes[0].likelyCause !== '');
