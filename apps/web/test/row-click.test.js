// A ledger row link opens on a plain click only: modifier keys, other buttons and a text selection are left to the browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { followsRowClick } from '../src/design/rowClick.js';

const click = (over = {}) => ({ button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...over });

test('a plain left click with nothing selected follows the row link', () => {
  assert.equal(followsRowClick(click(), ''), true);
});

test('modifier keys, a middle click, an already handled click and a text selection do not', () => {
  for (const k of ['ctrlKey', 'metaKey', 'shiftKey', 'altKey']) assert.equal(followsRowClick(click({ [k]: true }), ''), false, k);
  assert.equal(followsRowClick(click({ button: 1 }), ''), false, 'middle click');
  assert.equal(followsRowClick(click({ defaultPrevented: true }), ''), false, 'handled');
  assert.equal(followsRowClick(click(), 'nykaa.com'), false, 'selecting text');
});
