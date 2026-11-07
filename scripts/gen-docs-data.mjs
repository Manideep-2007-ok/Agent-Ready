// Writes apps/web/src/docs/generated.json: the findings reference (every finding type with its fix template) and the
// task packs, read from the engine so the docs cannot drift from the code. The browser cannot import fixes.js (it
// loads playwright-core), hence the generated file. `--stdout` prints instead of writing (used by the test).
//   npm run docs:data
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FINDING_TYPES } from '../packages/engine/src/types.js';
import { FIX_TEMPLATES } from '../packages/engine/src/fixes.js';
import { PACKS, PACK_IDS, TASK_LABELS, TASK_GOALS, packOfTask } from '../packages/engine/src/goals.js';
import { FAIL_FINDING } from '../packages/engine/src/scoring.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'apps/web/src/docs/generated.json');

// Groups for the findings reference: who gets in at all, the pack a finding belongs to, or any site. A failed task's
// finding takes its task's pack; the other shop-only findings (shop answers and product pages) are listed here.
const ACCESS = ['blocks-cloud-agents', 'blocks-automation', 'site-broken', 'robots-blocks-ai-agents'];
const SHOP_ONLY = ['price-in-image', 'no-product-schema', 'wrong-quantity', 'currency-mismatch', 'no-cart-feedback', 'no-cart-link'];
const PACK_OF_FINDING = Object.fromEntries(Object.entries(FAIL_FINDING).map(([taskId, [type]]) => [type, packOfTask(taskId)]));
const groupOf = (type) => (ACCESS.includes(type) ? 'access' : SHOP_ONLY.includes(type) ? 'shop' : PACK_OF_FINDING[type] ?? 'any');

const data = {
  findings: FINDING_TYPES.map((type) => {
    const t = FIX_TEMPLATES[type] ?? {};
    return { type, group: groupOf(type), likelyCause: t.likelyCause ?? '', fix: t.fix ?? '', standard: t.standard ?? null, passCheck: t.passCheck ?? null,
      example: t.frameworkExamples?.unknown ?? null };
  }),
  packs: PACK_IDS.map((id) => ({
    id, label: PACKS[id].label, blurb: PACKS[id].blurb, quick: PACKS[id].quick,
    tasks: PACKS[id].tasks.map((taskId) => ({ id: taskId, label: TASK_LABELS[taskId], goal: TASK_GOALS[taskId] })),
  })),
};
const json = `${JSON.stringify(data, null, 2)}\n`;
if (process.argv.includes('--stdout')) process.stdout.write(json);
else {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, json);
  console.log(`wrote ${path.relative(root, out)} (${data.findings.length} findings, ${data.packs.length} packs)`);
}
