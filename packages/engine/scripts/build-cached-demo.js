// Builds the demo backup reports (free, no API key): replays the real 31 Oct runs through the full
// engine (bot-wall, scoring, fix templates) and saves SiteReports to data/cached-demo/reports/ and leaderboard/.
// The dashboard/leaderboard can show these if live runs fail on stage.
// Usage (from repo root): node packages/engine/scripts/build-cached-demo.js
process.env.TINYFISH_MOCK = '1';
process.env.TINYFISH_MOCK_SPEED ||= '100';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const { runSiteTest, buildFixReport } = await import('../src/index.js');

// Only tasks we really recorded for each site (we never invent results).
const SITES = [
  { url: 'https://www.nykaa.com', tasks: ['find_returns', 'add_to_cart', 'find_price', 'find_contact'], slug: 'nykaa' },
  { url: 'https://www.myntra.com', tasks: ['find_price'], slug: 'myntra' },
  { url: 'https://www.swiggy.com', tasks: ['add_to_cart'], slug: 'swiggy' },
];
// Recordings were made on 31 Oct; keep that date so nobody mistakes them for live runs.
const RECORDED_AT = { nykaa: '2026-10-31T09:30:00.000Z', myntra: '2026-10-31T09:45:00.000Z', swiggy: '2026-10-31T09:55:00.000Z' };

// Mock run ids look like mock-<fixture>-abc123; swap them for the real TinyFish run ids.
const index = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cached-demo/fixtures/index.json'), 'utf8'));
const realId = (mockId) => {
  const m = /^mock-(.+)-[a-z0-9]{6}$/.exec(mockId || '');
  return (m && index.find((f) => f.name === m[1])?.runId) || mockId;
};
const swapIds = (report) => {
  let json = JSON.stringify(report);
  for (const id of new Set(json.match(/mock-[a-z0-9_]+-[a-z0-9]{6}/g) || [])) json = json.split(id).join(realId(id));
  return JSON.parse(json);
};

for (const dir of ['reports', 'leaderboard']) fs.mkdirSync(path.join(ROOT, 'data/cached-demo', dir), { recursive: true });

for (const site of SITES) {
  const id = `rep_20261031_demo_${site.slug}`;
  const scored = await runSiteTest({ url: site.url, tasks: site.tasks, source: 'web', id }, () => {});
  const enriched = await buildFixReport(scored, { useAI: false }); // templates only: same text every time
  const report = swapIds({ ...enriched, testedAt: RECORDED_AT[site.slug], streamingNote: undefined });
  for (const t of report.tasks) t.streamingUrl = null; // live-view links expire after a run
  for (const dir of ['reports', 'leaderboard']) {
    fs.writeFileSync(path.join(ROOT, 'data/cached-demo', dir, `${id}.json`), JSON.stringify(report, null, 2) + '\n');
  }
  console.log(`${site.slug}: score ${report.score} (tasks: ${site.tasks.join(', ')}), botWall ${report.botWall}, ₹${report.costRupees}, top fix: ${report.topFixes[0]?.type ?? 'none'}`);
}
console.log('Saved to data/cached-demo/reports/ and data/cached-demo/leaderboard/');
