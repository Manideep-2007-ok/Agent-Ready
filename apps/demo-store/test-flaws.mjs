// Dev-only check of the demo store flaws. Usage: node apps/demo-store/test-flaws.mjs
// Starts its own static server; needs playwright installed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = (() => { try { return require('playwright'); } catch { return require('playwright-core'); } })();

const dir = path.dirname(fileURLToPath(import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(dir, decodeURIComponent(req.url.split('?')[0]));
  if (p.endsWith(path.sep)) p += 'index.html';
  fs.readFile(p, (e, buf) => {
    if (e) return res.writeHead(404).end('nf');
    res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'text/plain; charset=utf-8' }).end(buf);
  });
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const ctx = await browser.newContext({ viewport: { width: 1000, height: 700 } });
const page = await ctx.newPage();
const body = () => page.evaluate(() => document.body.innerText);
const ok = (m) => console.log('ok  ' + m);

// ---- flaws off ----
await page.goto(base + '/index.html?flaws=off');
assert.match(await body(), /₹499/); ok('off: index shows text price');
await page.goto(base + '/product.html?id=1');
const btn = page.locator('.add-btn');
assert.equal((await btn.innerText()).trim(), 'Add to cart'); ok('off: labelled Add to cart button');
assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1); ok('off: JSON-LD Product present');
await btn.click();
await page.goto(base + '/cart.html');
assert.match(await body(), /Cart total: ₹499/); ok('off: cart shows "Cart total: ₹499"');
assert.ok(await page.locator('footer a', { hasText: 'Returns' }).count() >= 1); ok('off: footer Returns link');
await Promise.all([page.waitForURL(/returns/), page.locator('footer a', { hasText: 'Returns' }).click()]);
assert.match(await body(), /10 days/); ok('off: returns page says 10 days');
assert.equal(await page.locator('#sale-popup').count(), 0); ok('off: no popup');

// ---- flaws on ----
await page.goto(base + '/product.html?id=1&flaws=on');
const ov = await page.locator('#sale-popup').boundingBox();
assert.ok(ov && ov.width >= 1000 && ov.height >= 700); ok('on: overlay covers viewport');
assert.ok(!(await body()).includes('₹')); ok('on: no ₹ text in body on product page');
assert.equal(await page.locator('script[type="application/ld+json"]').count(), 0); ok('on: no JSON-LD');
const b = page.locator('.add-btn');
assert.equal((await b.innerText()).trim(), ''); ok('on: Add to cart button has no text');
assert.equal(await b.getAttribute('aria-label'), null);
assert.equal(await b.getAttribute('title'), null); ok('on: no aria-label / title');
assert.equal(await page.locator('.price img').getAttribute('alt'), null); ok('on: price img has no alt');
assert.equal(await page.locator('footer a', { hasText: 'Returns' }).count(), 0); ok('on: no footer Returns link');
assert.equal((await page.locator('.cart-icon-link').innerText()).replace(/\d/g, '').trim(), ''); ok('on: header cart link is icon only');
assert.equal(await page.locator('header a', { hasText: 'Cart' }).count(), 0); ok('on: no Cart text in header');
assert.ok(!(await page.title()).includes('₹'));
{ const html = (await page.content()).replace(/data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+/g, '');
  assert.ok(!/499/.test(html), 'price digits leak into the HTML'); ok('on: price digits not in HTML (src/attrs/JSON-LD)'); }
// persistence across pages without query
await page.goto(base + '/cart.html');
assert.equal(await page.locator('#sale-popup').count(), 1); ok('on: persists to another page via localStorage');
await page.goto(base + '/help/policies/shipping/more/returns.html');
assert.equal(await page.locator('#sale-popup').count(), 1); ok('on: persists on nested page (paths ok)');
// help chain still reaches returns
await page.goto(base + '/help/index.html?flaws=off');
for (const t of ['Policies', 'Shipping', 'More shipping information', 'Returns']) await page.locator('main a', { hasText: t }).first().click(); await page.waitForLoadState('domcontentloaded');
assert.match(await body(), /10 days/); ok('help chain reaches returns');
// hiddenReturns on: the Returns link becomes 'Other information' -> 'Read the full document' (one level deeper)
await page.goto(base + '/help/index.html?hiddenReturns=on');
for (const t of ['Policies', 'Shipping', 'More shipping information']) await page.locator('main a', { hasText: t }).first().click();
assert.equal(await page.locator('main a', { hasText: 'Returns' }).count(), 0); ok('on: no Returns link on help page');
await page.locator('main a', { hasText: 'Other information' }).click();
await page.locator('main a', { hasText: 'Read the full document' }).click(); await page.waitForLoadState('domcontentloaded');
assert.match(await body(), /10 days/); ok('on: deeper chain reaches returns');
await page.goto(base + '/index.html?flaws=off');
// reset
await page.goto(base + '/index.html');
assert.equal(await page.locator('#sale-popup').count(), 0);
assert.match(await body(), /₹499/); ok('?flaws=off reset persisted');
// individual flag
await page.goto(base + '/index.html?hiddenReturns=on');
assert.equal(await page.locator('footer a', { hasText: 'Returns' }).count(), 0);
assert.match(await body(), /₹499/); ok('individual flag works');

// v2: ?flaws=on keeps the four classic flaws; ?flaws=all adds the outcome-changing ones
await page.goto(base + '/product.html?id=1&flaws=on');
assert.equal(await page.locator('#qty').count(), 0); ok('flaws=on: no quantity box (classic four only)');
await page.goto(base + '/product.html?id=1&flaws=off');
await page.evaluate(() => localStorage.removeItem('chai_cart'));
await page.goto(base + '/product.html?id=1&qtyTwo=on');
assert.equal(await page.locator('#qty').inputValue(), '2'); ok('qtyTwo: the quantity box starts at 2');
await page.locator('.add-btn').click();
assert.equal(await page.evaluate(() => Cart.count()), 2); ok('qtyTwo: one click adds two units');
await page.goto(base + '/product.html?id=1&flaws=off');
await page.evaluate(() => localStorage.removeItem('chai_cart'));
await page.goto(base + '/product.html?id=1&slowCart=on');
await page.locator('.add-btn').click();
await page.waitForTimeout(500);
assert.equal(await page.evaluate(() => Cart.count()), 0);
assert.equal(await page.locator('#added').textContent(), ''); ok('slowCart: nothing added and no message right after the click');
await page.waitForTimeout(4000);
assert.equal(await page.evaluate(() => Cart.count()), 1); ok('slowCart: added after 4 s');
await page.goto(base + '/product.html?id=1&flaws=all');
assert.equal(await page.locator('#qty').count(), 1);
assert.equal(await page.locator('#sale-popup').count(), 1); ok('flaws=all: all six flaws');
await page.goto(base + '/index.html?flaws=off');
assert.equal(await page.evaluate(() => JSON.stringify(window.Flaws)), JSON.stringify({ popup: false, priceImg: false, iconCart: false, hiddenReturns: false, qtyTwo: false, slowCart: false })); ok('flaws=off clears v2 too');

await browser.close();
server.close();
console.log('PASS demo-store flaws');
