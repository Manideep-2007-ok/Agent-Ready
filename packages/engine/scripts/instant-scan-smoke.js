// Run: TINYFISH_MOCK=1 node packages/engine/scripts/instant-scan-smoke.js
// Part 1: mock scans. Part 2: auditPage on a local HTML string with a local Chromium (no TinyFish).
import { createRequire } from 'node:module';
process.env.TINYFISH_MOCK = process.env.TINYFISH_MOCK || '1';
const { instantScan, instantScanFindings, auditPage } = await import('../src/instantScan.js').then(async (m) => m);
for (const u of ['https://www.nykaa.com', 'https://www.myntra.com', 'https://example.com']) {
  const s = await instantScan(u);
  console.log('\n==', u, JSON.stringify(s));
  for (const f of instantScanFindings(s)) console.log(`  [${f.severity}] ${f.type}: ${f.text}`);
}
const html = `<html><body><button><svg width=10 height=10></svg></button><button>Buy now</button>
<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width=50 height=50><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="ok" width=50 height=50>
<p>Price ₹499</p><div style="position:fixed;top:0;left:0;width:100%;height:100%;background:#000a"><span>Sign up</span></div>
<script type="application/ld+json">{"@type":"Product","name":"x"}</script></body></html>`;
try {
  const require = createRequire(import.meta.url);
  let pw;
  try { pw = require('playwright'); } catch { pw = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright'); }
  const b = await pw.chromium.launch();
  const page = await b.newPage();
  await page.setContent(html);
  console.log('\n== auditPage (local chromium):', JSON.stringify(await auditPage(page)));
  await b.close();
} catch (e) { console.log('\nLocal chromium test skipped:', e.message.split('\n')[0]); }
