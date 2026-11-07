// Every text colour on every background it is used on meets WCAG AA (4.5:1), in light and dark (redesign spec 3.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/design/tokens.css');

/** The `--name: value;` declarations inside the block that starts with `selector {`. */
function block(css, selector) {
  const at = css.indexOf(selector + ' {');
  assert.notEqual(at, -1, `tokens.css has no "${selector} {" block`);
  const body = css.slice(at, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}

const hex = (v) => /^#[0-9a-f]{6}$/i.test(v) ? [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)) : null;
/** rgba(r, g, b, a) -> [[r,g,b], a] */
const rgba = (v) => { const m = /^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(v); return m ? [[+m[1], +m[2], +m[3]], +m[4]] : null; };
const lum = (rgb) => {
  const [r, g, b] = rgb.map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = ([rgb, a], base) => rgb.map((c, i) => Math.round(c * a + base[i] * (1 - a)));

const css = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const themes = () => ({ light: block(css, ':root'), dark: block(css, ":root[data-theme='dark']") });

const COLOURS = ['--bg', '--surface', '--surface-2', '--border', '--border-strong', '--text', '--text-muted', '--text-faint',
  '--accent', '--accent-ink', '--pass', '--warn', '--fail', '--wait'];
const SOFT = ['--accent-soft', '--pass-soft', '--warn-soft', '--fail-soft', '--wait-soft'];
const PAIRS = [
  ['--text', '--bg'], ['--text', '--surface'], ['--text', '--surface-2'],
  ['--text-muted', '--bg'], ['--text-muted', '--surface'], ['--text-muted', '--surface-2'],
  ['--text-faint', '--bg'], ['--text-faint', '--surface'],
  ['--accent-ink', '--accent'], ['--accent', '--bg'], ['--accent', '--surface'],
  ['--pass', '--surface'], ['--warn', '--surface'], ['--fail', '--surface'], ['--wait', '--surface'],
];

test('tokens.css defines every spec token in both themes', () => {
  assert.ok(css, 'apps/web/src/design/tokens.css is missing');
  for (const [name, t] of Object.entries(themes())) {
    for (const k of COLOURS) assert.ok(hex(t[k] ?? ''), `${name}: ${k} must be a #rrggbb colour, got ${t[k]}`);
    for (const k of SOFT) assert.ok(rgba(t[k] ?? ''), `${name}: ${k} must be rgba(...), got ${t[k]}`);
  }
});

test('every text token pair meets WCAG AA 4.5:1 in light and dark', () => {
  assert.ok(css, 'apps/web/src/design/tokens.css is missing');
  for (const [name, t] of Object.entries(themes())) {
    for (const [fg, bg] of PAIRS) {
      const r = ratio(hex(t[fg]), hex(t[bg]));
      assert.ok(r >= 4.5, `${name}: ${fg} on ${bg} is ${r.toFixed(2)}:1`);
    }
  }
});

test('status badges (colour on its soft tint over a surface) meet 4.5:1', () => {
  assert.ok(css, 'apps/web/src/design/tokens.css is missing');
  for (const [name, t] of Object.entries(themes())) {
    for (const s of ['pass', 'warn', 'fail', 'wait', 'accent']) {
      const behind = over(rgba(t[`--${s}-soft`]), hex(t['--surface']));
      const r = ratio(hex(t[`--${s}`]), behind);
      assert.ok(r >= 4.5, `${name}: --${s} on --${s}-soft is ${r.toFixed(2)}:1`);
    }
  }
});
