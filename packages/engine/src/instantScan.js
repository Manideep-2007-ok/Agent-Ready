// Instant Scan (ARCHITECTURE section 8): a 15-30 s page audit using TinyFish Fetch + Browser API.
// Never throws. Findings from the scan are NOT part of the 100-point score (pointsIfFixed = 0).
import { chromium } from 'playwright-core';
import { config } from './config.js';
import { fetchPages, createBrowserSession, closeBrowserSession } from './tinyfish.js';
import { detectFramework, FIX_TEMPLATES } from './fixes.js';

/** @typedef {import('./types.js').InstantScan} InstantScan */
/** @typedef {import('./types.js').Finding} Finding */

const BROWSER_BUDGET_MS = 40_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Clears its timer so a finished scan never keeps the process (e.g. the CLI) alive for 40 s.
const withTimeout = (p, ms, label) => {
  let t;
  const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label + ' timed out')), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
};

/** The in-page audit. Exported so it can be tested against any Playwright page. */
export async function auditPage(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
    };
    const named = (el) =>
      (el.innerText || '').trim() || el.getAttribute('aria-label')?.trim() || el.getAttribute('title')?.trim() ||
      el.getAttribute('aria-labelledby') || [...el.querySelectorAll('img[alt]')].some((i) => i.getAttribute('alt').trim()) ||
      el.querySelector('svg title');
    const controls = [...document.querySelectorAll('button, [role=button], a')].filter(visible);
    const unlabelledButtons = controls.filter((el) => !named(el)).length;
    const imgs = [...document.querySelectorAll('img')].filter(visible);
    const imagesWithoutAlt = imgs.filter((i) => !(i.getAttribute('alt') || '').trim()).length;
    const text = document.body ? document.body.innerText : '';
    const vw = innerWidth, vh = innerHeight;
    let overlayCoveringPage = false;
    for (const el of document.querySelectorAll('body *')) {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' && s.position !== 'sticky') continue;
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      const h = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if ((w * h) / (vw * vh) > 0.3) { overlayCoveringPage = true; break; }
    }
    const productSchema = [...document.querySelectorAll('script[type="application/ld+json"]')].some((s) => /Product|Offer/.test(s.textContent || ''));
    return {
      unlabelledButtons, totalButtonsAndLinks: controls.length, imagesWithoutAlt, totalImages: imgs.length,
      priceAsText: /₹\s?\d|Rs\.?\s?\d|INR\s?\d/.test(text), overlayCoveringPage, productSchema,
    };
  });
}

const status = (r) => {
  if (r && !r.error && (r.text || '').trim()) return 'found';
  const e = String(r?.error || '');
  return /404|not found|no content/i.test(e) || (r && !r.error) ? 'missing' : 'error';
};

async function fetchPart(url) {
  let origin = url;
  try { origin = new URL(url).origin; } catch { /* keep url */ }
  try {
    const [page, robots, sitemap] = await fetchPages([url, origin + '/robots.txt', origin + '/sitemap.xml']);
    return { pageTextChars: (page?.text || '').length, robotsTxt: status(robots), sitemap: status(sitemap) };
  } catch {
    return { pageTextChars: 0, robotsTxt: 'error', sitemap: 'error' };
  }
}

const BROWSER_DEFAULTS = { unlabelledButtons: 0, totalButtonsAndLinks: 0, imagesWithoutAlt: 0, totalImages: 0, priceAsText: false, overlayCoveringPage: false, productSchema: false, framework: 'unknown' };

async function browserPart(url) {
  let session = null, browser = null, timedOut = false;
  const cleanup = async () => {
    const b = browser, sess = session;
    browser = null; session = null;
    try { await b?.close(); } catch { /* ignore */ }
    try { if (sess) await closeBrowserSession(sess.sessionId); } catch { /* ignore */ }
  };
  const work = (async () => {
    session = await createBrowserSession({ url, countryCode: 'IN' });
    if (timedOut) return null; // finally already ran; the .finally(cleanup) below closes this session
    browser = await chromium.connectOverCDP(session.cdpUrl, { timeout: 20_000 });
    if (timedOut) return null;
    const ctx = browser.contexts()[0] || (await browser.newContext());
    let page = ctx.pages()[0];
    if (!page) page = await ctx.newPage();
    if (!page.url() || page.url() === 'about:blank') await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25_000 });
    await page.waitForLoadState('domcontentloaded');
    await sleep(3000);
    const audit = await auditPage(page);
    return { ...audit, framework: await detectFramework(page) };
  })();
  try {
    const r = await withTimeout(work, BROWSER_BUDGET_MS, 'Browser scan');
    return r || { ...BROWSER_DEFAULTS };
  } catch {
    timedOut = true;
    // The work may still be opening a session/browser after the timeout: close those when it settles.
    work.catch(() => {}).finally(cleanup);
    return { ...BROWSER_DEFAULTS };
  } finally {
    await cleanup();
  }
}

const MOCKS = {
  nykaa: { pageTextChars: 284, unlabelledButtons: 41, totalButtonsAndLinks: 230, imagesWithoutAlt: 18, totalImages: 26, priceAsText: true, overlayCoveringPage: true, productSchema: false, robotsTxt: 'found', sitemap: 'found', framework: 'unknown' },
  myntra: { pageTextChars: 3100, unlabelledButtons: 515, totalButtonsAndLinks: 619, imagesWithoutAlt: 12, totalImages: 12, priceAsText: true, overlayCoveringPage: false, productSchema: false, robotsTxt: 'found', sitemap: 'found', framework: 'unknown' },
  // example.com: one link, no images, no price, no robots.txt.
  example: { pageTextChars: 230, unlabelledButtons: 0, totalButtonsAndLinks: 1, imagesWithoutAlt: 0, totalImages: 0, priceAsText: false, overlayCoveringPage: false, productSchema: false, robotsTxt: 'missing', sitemap: 'missing', framework: 'unknown' },
  // Demo store home page (apps/demo-store) with ?flaws=on: popup, prices as images without alt.
  demoFlawed: { pageTextChars: 520, unlabelledButtons: 0, totalButtonsAndLinks: 17, imagesWithoutAlt: 6, totalImages: 6, priceAsText: false, overlayCoveringPage: true, productSchema: false, robotsTxt: 'missing', sitemap: 'missing', framework: 'unknown' },
  clean: { pageTextChars: 1800, unlabelledButtons: 0, totalButtonsAndLinks: 24, imagesWithoutAlt: 0, totalImages: 6, priceAsText: true, overlayCoveringPage: false, productSchema: true, robotsTxt: 'found', sitemap: 'missing', framework: 'unknown' },
};

/**
 * @param {string} url
 * @returns {Promise<InstantScan>}
 */
export async function instantScan(url) {
  const t0 = Date.now();
  const done = (o) => ({ ...o, seconds: Math.round((Date.now() - t0) / 1000) });
  try {
    if (config.mock) {
      await sleep(1500);
      const host = (() => { try { return new URL(url).hostname; } catch { return String(url); } })();
      const flawsOn = /[?&]flaws=on\b/.test(String(url));
      const m = host.includes('nykaa') ? MOCKS.nykaa : host.includes('myntra') ? MOCKS.myntra
        : host === 'example.com' || host === 'www.example.com' ? MOCKS.example : flawsOn ? MOCKS.demoFlawed : MOCKS.clean;
      return done({ ...m });
    }
    const [f, b] = await Promise.all([fetchPart(url), browserPart(url)]);
    return done({ ...BROWSER_DEFAULTS, ...b, ...f });
  } catch {
    return done({ ...BROWSER_DEFAULTS, pageTextChars: 0, robotsTxt: 'error', sitemap: 'error' });
  }
}

/**
 * Findings from an Instant Scan. Not part of the 100-point score, so pointsIfFixed is 0.
 * @param {InstantScan} scan
 * @returns {Finding[]}
 */
export function instantScanFindings(scan) {
  if (!scan) return [];
  const mk = (type, severity, text) => {
    const t = FIX_TEMPLATES[type] || {};
    return { type, severity, text, likelyCause: t.likelyCause || '', fix: t.fix || '', standard: t.standard, passCheck: t.passCheck, pointsIfFixed: 0, verified: true };
  };
  const out = [];
  // If the browser part failed, its fields are defaults (0 controls, 0 images): do not report findings from them.
  const browserRan = (scan.totalButtonsAndLinks || 0) > 0 || (scan.totalImages || 0) > 0;
  if (!browserRan) return out;
  if (scan.overlayCoveringPage) out.push(mk('popup-blocking', 'high', 'A pop-up or banner covers most of the page, so an AI shopper cannot see or click what is underneath.'));
  if (scan.unlabelledButtons > 0) {
    const pct = scan.totalButtonsAndLinks ? scan.unlabelledButtons / scan.totalButtonsAndLinks : 0;
    out.push(mk('unlabelled-buttons', pct > 0.2 ? 'high' : 'medium', `${scan.unlabelledButtons} of ${scan.totalButtonsAndLinks} buttons and links have no text or label, so an AI shopper cannot tell what they do (WCAG 4.1.2 Name, Role, Value).`));
  }
  // Only when the page has images (a price could be drawn in one); a text-only page like example.com has no price at all.
  if (!scan.priceAsText && (scan.totalImages || 0) > 0) out.push(mk('price-in-image', 'high', 'No price was found as text on the page; it may be drawn inside an image, which AI shoppers cannot read.'));
  if (!scan.productSchema) out.push(mk('no-product-schema', 'low', 'The page has no schema.org Product data, so agents must guess product details from the page layout.'));
  return out;
}
