import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeSvg, badgeValue, badgeForReport } from '../src/badge.js';

const fill = (svg) => [...svg.matchAll(/<rect x="\d+" width="\d+" height="20" fill="(#\w+)"/g)].map((m) => m[1])[0];

test('colour bands: green >=90, yellow-green >=75, amber >=50, red below', () => {
  const c = (s) => badgeValue(s).color;
  assert.equal(c(100), '#3fb950'); assert.equal(c(90), '#3fb950');
  assert.equal(c(89), '#a4b72b'); assert.equal(c(75), '#a4b72b');
  assert.equal(c(74), '#e5a00d'); assert.equal(c(50), '#e5a00d');
  assert.equal(c(49), '#d73a49'); assert.equal(c(0), '#d73a49');
  assert.equal(badgeValue(87.6).text, '88/100');
  assert.equal(badgeValue(250).text, '100/100');
});

test('stopped, error, unknown and junk scores are grey', () => {
  for (const s of ['stopped', 'error', 'unknown', null, undefined, NaN, 'abc']) assert.equal(badgeValue(s).color, '#8b949e', String(s));
  assert.equal(badgeValue('stopped').text, 'stopped');
  assert.equal(badgeValue(null).text, 'unknown');
});

test('the SVG is well formed, sized, and has the label and value', () => {
  const svg = badgeSvg({ score: 82 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="\d+" height="20"/);
  assert.match(svg, /agent-ready/); assert.match(svg, /82\/100/);
  assert.equal(fill(svg), '#a4b72b');
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  // every opened tag is closed or self-closed
  const tags = [...svg.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)];
  const stack = [];
  for (const [, close, name, self] of tags) { if (self) continue; if (close) assert.equal(stack.pop(), name); else stack.push(name); }
  assert.deepEqual(stack, []);
});

test('label text is escaped (no markup injection)', () => {
  const svg = badgeSvg({ score: 10, label: '<script>"x"&\'</script>' });
  assert.ok(!svg.includes('<script>'));
  assert.match(svg, /&lt;script&gt;&quot;x&quot;&amp;&#39;&lt;\/script&gt;/);
});

test('badgeForReport: complete, cancelled, running and missing reports', () => {
  assert.match(badgeForReport({ status: 'complete', score: 95 }), /95\/100/);
  assert.match(badgeForReport({ status: 'cancelled', score: 0 }), /stopped/);
  assert.match(badgeForReport({ status: 'running' }), /unknown/);
  assert.match(badgeForReport(null), /unknown/);
});
