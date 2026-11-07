// The docs' findings reference and task-pack pages come from the engine's own data (scripts/gen-docs-data.mjs), so the
// docs cannot drift from the code: every finding type and pack is present, and the committed file is up to date.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FINDING_TYPES, PACK_ID_LIST } from '@agentready/engine/types';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const file = path.join(root, 'apps/web/src/docs/generated.json');
const read = () => JSON.parse(fs.readFileSync(file, 'utf8'));

test('every finding type has an entry with a likely cause and a fix', () => {
  const data = read();
  assert.deepEqual(data.findings.map((f) => f.type).sort(), [...FINDING_TYPES].sort());
  assert.ok(data.findings.every((f) => f.fix && f.likelyCause), 'every finding has a fix and a likely cause');
});

test('every pack is listed in order with its four tasks, labels and goals', () => {
  const data = read();
  assert.deepEqual(data.packs.map((p) => p.id), [...PACK_ID_LIST]);
  for (const p of data.packs) {
    assert.equal(p.tasks.length, 4, p.id);
    assert.ok(p.tasks.every((t) => t.label && t.goal), p.id);
  }
});

test('the committed file matches what the script generates now', () => {
  const fresh = execFileSync(process.execPath, [path.join(root, 'scripts/gen-docs-data.mjs'), '--stdout'], { cwd: root }).toString();
  assert.equal(fresh, fs.readFileSync(file, 'utf8'), 'run: npm run docs:data');
});
