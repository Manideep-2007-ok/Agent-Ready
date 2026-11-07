// Writes apps/web/src/docs/generated.json: the findings reference (every finding type with its fix template) and the
// task packs, read from the engine so the docs cannot drift from the code. The browser cannot import fixes.js (it
// loads playwright-core), hence the generated file. `--stdout` prints instead of writing (used by the test).
//   npm run docs:data
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FINDING_TYPES } from '../packages/engine/src/types.js';
import { FIX_TEMPLATES } from '../packages/engine/src/fixes.js';
import { PACKS, PACK_IDS, TASK_LABELS, TASK_GOALS } from '../packages/engine/src/goals.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'apps/web/src/docs/generated.json');

const data = {
  findings: FINDING_TYPES.map((type) => {
    const t = FIX_TEMPLATES[type] ?? {};
    return { type, likelyCause: t.likelyCause ?? '', fix: t.fix ?? '', standard: t.standard ?? null, passCheck: t.passCheck ?? null,
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
