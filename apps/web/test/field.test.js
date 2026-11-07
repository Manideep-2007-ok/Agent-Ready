// Field renders its error text in both layouts (an inline checkbox field used to drop it). Field.jsx is compiled
// with vite's esbuild and rendered to HTML with react-dom/server, so this runs in plain node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { transformWithEsbuild } from 'vite';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '../src/design/Field.jsx');
const require = createRequire(import.meta.url);

async function loadField() {
  const { code } = await transformWithEsbuild(fs.readFileSync(src, 'utf8'), src, { loader: 'jsx', jsx: 'automatic', format: 'esm' });
  // Resolve react from this package, not from the temp folder.
  const fixed = code.replace(/from "react(\/jsx-runtime)?"/g, (_, sub) => `from ${JSON.stringify(pathToFileURL(require.resolve('react' + (sub || ''))).href)}`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ar-field-'));
  const file = path.join(dir, 'Field.mjs');
  fs.writeFileSync(file, fixed);
  return (await import(pathToFileURL(file).href)).default;
}

test('a stacked field shows its error, linked to the control', async () => {
  const Field = await loadField();
  const html = renderToStaticMarkup(h(Field, { label: 'Website', error: 'Type a full address' }, h('input', { type: 'url' })));
  assert.match(html, /role="alert"[^>]*>Type a full address</);
  assert.match(html, /aria-invalid="true"/);
});

test('an inline (checkbox) field shows its error too, linked to the control', async () => {
  const Field = await loadField();
  const html = renderToStaticMarkup(h(Field, { inline: true, label: 'Confirm results', error: 'Not available in replay mode' }, h('input', { type: 'checkbox' })));
  assert.match(html, /role="alert"[^>]*>Not available in replay mode</);
  const errId = html.match(/id="([^"]+)" role="alert"/)?.[1];
  assert.ok(errId, 'the error has an id');
  assert.match(html, new RegExp(`aria-describedby="${errId}"`), 'the checkbox points at its error');
});
