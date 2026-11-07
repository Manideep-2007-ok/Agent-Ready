// P2-5: can agents that search before they visit find a site's key pages? The Instant Scan asks TinyFish Search
// (free), restricted to the site's own domain, for the two pages that matter most for its kind of site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEARCH_TOPICS, topicHit, findability, instantScanFindings } from '../src/instantScan.js';
import { FINDING_TYPES } from '../src/types.js';
import { FIX_TEMPLATES } from '../src/fixes.js';

test('two topics per kind of site, each with words a matching page would use', () => {
  assert.deepEqual(Object.keys(SEARCH_TOPICS), ['shop', 'saas', 'content', 'local']);
  for (const topics of Object.values(SEARCH_TOPICS)) {
    assert.equal(topics.length, 2);
    for (const t of topics) assert.ok(t.label && t.query && t.words instanceof RegExp);
  }
});

test('a hit is a result on the same site (www. ignored) whose address or title matches the topic', () => {
  const [returns] = SEARCH_TOPICS.shop;
  assert.ok(topicHit('shop.example.in', returns, { url: 'https://www.shop.example.in/pages/return-policy', title: 'x' }));
  assert.ok(topicHit('shop.example.in', returns, { url: 'https://shop.example.in/help', title: 'Refunds and returns' }));
  assert.ok(!topicHit('shop.example.in', returns, { url: 'https://shop.example.in/', title: 'Home' }), 'the home page is not the returns page');
  assert.ok(!topicHit('shop.example.in', returns, { url: 'https://other.example.com/return-policy', title: 'Returns' }), 'another site does not count');
});

test('findability: per topic, found with the first matching address, or not found', () => {
  const topics = SEARCH_TOPICS.saas;
  const out = findability('app.example.io', topics, [
    [{ url: 'https://app.example.io/pricing', title: 'Pricing' }],
    [{ url: 'https://app.example.io/blog/launch', title: 'Launch week' }],
  ]);
  assert.deepEqual(out, [
    { topic: topics[0].label, found: true, url: 'https://app.example.io/pricing' },
    { topic: topics[1].label, found: false, url: null },
  ]);
  assert.deepEqual(findability('a.io', topics, [null, null]), [], 'searches that failed say nothing');
});

test('a key page search cannot find is a low finding with a site cause; nothing when every page was found or search did not run', () => {
  assert.ok(FINDING_TYPES.includes('not-in-search'));
  assert.ok(FIX_TEMPLATES['not-in-search']?.fix && FIX_TEMPLATES['not-in-search']?.likelyCause);
  const base = { totalButtonsAndLinks: 10, totalImages: 1, priceAsText: true, cartLink: true, productSchema: true };
  const missing = instantScanFindings({ ...base, searchFindable: [{ topic: 'return policy', found: false, url: null }, { topic: 'contact page', found: true, url: 'https://x/contact' }] }, 'shop');
  const f = missing.find((x) => x.type === 'not-in-search');
  assert.equal(f.severity, 'low');
  assert.match(f.text, /return policy/);
  assert.equal(f.pointsIfFixed, 0);
  assert.ok(!instantScanFindings({ ...base, searchFindable: [{ topic: 'return policy', found: true, url: 'u' }] }, 'shop').some((x) => x.type === 'not-in-search'));
  assert.ok(!instantScanFindings({ ...base }, 'shop').some((x) => x.type === 'not-in-search'));
});
