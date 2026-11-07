// Instant Scan (ARCHITECTURE section 8): a 15-30 s page audit using TinyFish Fetch + Browser API.
// Never throws. Findings from the scan are NOT part of the 100-point score (pointsIfFixed = 0).
import { chromium } from 'playwright-core';
import { config } from './config.js';
import { fetchPages, createBrowserSession, closeBrowserSession } from './tinyfish.js';
import { detectFramework, FIX_TEMPLATES } from './fixes.js';
import { KEYWORD_SOURCES, KEYWORD_CAP } from './packs.js';
import { normalisePack } from './goals.js';

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
  // The keyword patterns are shared with detectPack (packs.js); they travel into the page as text.
  return page.evaluate(({ sources, cap }) => {
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
    const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent || '');
    const productSchema = ld.some((t) => /Product|Offer/.test(t));
    // Same reading as schemaTypesFromJsonLd (packs.js), written out here because a page may forbid eval/new Function.
    const schemaTypes = [...new Set(ld.flatMap((t) => [...t.matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]*")/g)].flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((n) => n[1].replace(/^.*[/#]/, '')))))];
    // A visible way to the cart: a link or button whose text, label or address says cart, bag or basket.
    const cartRe = /\b(?:cart|bag|basket|trolley)\b/i;
    const cartLink = controls.some((el) => cartRe.test([(el.innerText || ''), el.getAttribute('aria-label') || '', el.getAttribute('title') || '', el.getAttribute('href') || ''].join(' ')));
    const lower = text.toLowerCase();
    const keywordHits = {};
    for (const [key, source] of Object.entries(sources)) keywordHits[key] = Math.min(cap, (lower.match(new RegExp(source, 'g')) || []).length);
    return {
      unlabelledButtons, totalButtonsAndLinks: controls.length, imagesWithoutAlt, totalImages: imgs.length,
      priceAsText: /₹\s?\d|Rs\.?\s?\d|INR\s?\d/.test(text), overlayCoveringPage, productSchema, schemaTypes, keywordHits, cartLink,
    };
  }, { sources: KEYWORD_SOURCES, cap: KEYWORD_CAP });
}

// Fetch answered for this URL but had no content (404, empty, blocked): call it "missing" in plain words.
// "error" is kept for when the whole Fetch call failed (see fetchPart's catch).
const status = (r) => (r && !r.error && (r.text || '').trim() ? 'found' : 'missing');

// AI agents and crawlers by their robots.txt names. The user-triggered ones (a person asked an assistant to visit) matter
// most for shopping; training crawlers are listed because a site that blocks them often blocks the others by mistake.
export const AI_AGENTS = ['ChatGPT-User', 'OAI-SearchBot', 'GPTBot', 'Claude-User', 'ClaudeBot', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'CCBot', 'Applebot-Extended'];

/**
 * Which AI agents robots.txt keeps out of the whole site (a "Disallow: /" in the group that applies to them, with no
 * "Allow: /" beside it). The group for an agent is the one naming it, else "*". Pure; unparseable text blocks nobody.
 * @returns {string[]}
 */
export function aiAgentsBlockedByRobots(text) {
  const groups = []; // {agents:string[], rules:{allow:boolean, path:string}[]}
  let current = null, lastWasAgent = false;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase(), value = m[2].trim();
    if (key === 'user-agent') {
      if (!lastWasAgent || !current) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === 'disallow' || key === 'allow') && current) {
      current.rules.push({ allow: key === 'allow', path: value });
      lastWasAgent = false;
    } else lastWasAgent = false;
  }
  const blocksAll = (g) => g.rules.some((r) => !r.allow && r.path === '/') && !g.rules.some((r) => r.allow && (r.path === '/' || r.path === '/*'));
  const star = groups.filter((g) => g.agents.includes('*'));
  return AI_AGENTS.filter((name) => {
    const own = groups.filter((g) => g.agents.includes(name.toLowerCase()));
    const apply = own.length ? own : star;
    return apply.some(blocksAll);
  });
}

async function fetchPart(url) {
  let origin = url;
  try { origin = new URL(url).origin; } catch { /* keep url */ }
  try {
    const [page, robots, sitemap, llms] = await fetchPages([url, origin + '/robots.txt', origin + '/sitemap.xml', origin + '/llms.txt']);
    return {
      pageTextChars: (page?.text || '').length, robotsTxt: status(robots), sitemap: status(sitemap), llmsTxt: status(llms),
      aiBlockedAgents: status(robots) === 'found' ? aiAgentsBlockedByRobots(robots.text) : [],
    };
  } catch {
    return { pageTextChars: 0, robotsTxt: 'error', sitemap: 'error', llmsTxt: 'error', aiBlockedAgents: [] };
  }
}

const PRODUCT_PAGE_MS = 12_000;

/** First same-origin link that looks like a product page (/product, /products/, /p/, product.html?id=). */
async function findProductLink(page, url) {
  return page.evaluate((base) => {
    const origin = new URL(base).origin;
    const here = location.href.split('#')[0];
    for (const a of document.querySelectorAll('a[href]')) {
      let u;
      try { u = new URL(a.getAttribute('href'), location.href); } catch { continue; }
      if (u.origin !== origin || u.href.split('#')[0] === here) continue;
      if (/\/products?(\/|\.html|$)|\/p\/|\/dp\//i.test(u.pathname)) return u.href;
    }
    return null;
  }, url);
}

async function auditProductPage(page, url) {
  const link = await findProductLink(page, url);
  if (!link) return null;
  return withTimeout((async () => {
    await page.goto(link, { waitUntil: 'domcontentloaded', timeout: PRODUCT_PAGE_MS });
    await sleep(2000);
    return auditPage(page);
  })(), PRODUCT_PAGE_MS + 4000, 'Product page scan');
}

/** Home + product page: counts add up; a problem on either page counts; schema/price text found on either page counts. */
function mergeAudits(home, product) {
  if (!product) return home;
  return {
    unlabelledButtons: home.unlabelledButtons + product.unlabelledButtons,
    totalButtonsAndLinks: home.totalButtonsAndLinks + product.totalButtonsAndLinks,
    imagesWithoutAlt: home.imagesWithoutAlt + product.imagesWithoutAlt,
    totalImages: home.totalImages + product.totalImages,
    priceAsText: home.priceAsText || product.priceAsText,
    overlayCoveringPage: home.overlayCoveringPage || product.overlayCoveringPage,
    productSchema: home.productSchema || product.productSchema,
    cartLink: !!(home.cartLink || product.cartLink),
    schemaTypes: [...new Set([...(home.schemaTypes || []), ...(product.schemaTypes || [])])],
    keywordHits: Object.fromEntries(Object.keys({ ...home.keywordHits, ...product.keywordHits }).map((k) => [k, Math.min(KEYWORD_CAP, (home.keywordHits?.[k] || 0) + (product.keywordHits?.[k] || 0))])),
  };
}

/**
 * Audit the open home page, then one product page if a link to one exists. Exported for tests with any Playwright page.
 * Many flaws (icon-only Add to cart, price images) live on a product page, not the home page.
 */
export async function auditSite(page, url) {
  const home = await auditPage(page);
  const framework = await detectFramework(page);
  const product = await auditProductPage(page, url).catch(() => null);
  return { ...mergeAudits(home, product), framework };
}

const BROWSER_DEFAULTS = { unlabelledButtons: 0, totalButtonsAndLinks: 0, imagesWithoutAlt: 0, totalImages: 0, priceAsText: false, overlayCoveringPage: false, productSchema: false, framework: 'unknown', schemaTypes: [], keywordHits: {}, cartLink: false };

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
    return auditSite(page, url);
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

// Replay scans of the recorded shops: they mention Add to cart, so detectPack calls them shops.
const SHOP_HITS = { cart: 6, pricing: 0, signup: 0, docs: 0, article: 0, newsletter: 0, hours: 0, booking: 0, menu: 0 };
const MOCKS = {
  nykaa: { pageTextChars: 284, unlabelledButtons: 41, totalButtonsAndLinks: 230, imagesWithoutAlt: 18, totalImages: 26, priceAsText: true, overlayCoveringPage: true, productSchema: false, robotsTxt: 'found', sitemap: 'found', framework: 'unknown', schemaTypes: [], keywordHits: SHOP_HITS },
  myntra: { pageTextChars: 3100, unlabelledButtons: 515, totalButtonsAndLinks: 619, imagesWithoutAlt: 12, totalImages: 12, priceAsText: true, overlayCoveringPage: false, productSchema: false, robotsTxt: 'found', sitemap: 'found', framework: 'unknown', schemaTypes: [], keywordHits: SHOP_HITS },
  // example.com: one link, no images, no price, no robots.txt.
  example: { pageTextChars: 230, unlabelledButtons: 0, totalButtonsAndLinks: 1, imagesWithoutAlt: 0, totalImages: 0, priceAsText: false, overlayCoveringPage: false, productSchema: false, robotsTxt: 'missing', sitemap: 'missing', framework: 'unknown', schemaTypes: [], keywordHits: {} },
  // Demo store (apps/demo-store) with ?flaws=on, home + one product page: popup, prices as images without alt,
  // icon-only Add to cart button (product page; the icon cart link still shows a number).
  demoFlawed: { pageTextChars: 520, unlabelledButtons: 1, totalButtonsAndLinks: 23, imagesWithoutAlt: 7, totalImages: 7, priceAsText: false, overlayCoveringPage: true, productSchema: false, robotsTxt: 'missing', sitemap: 'missing', framework: 'unknown', schemaTypes: [], keywordHits: SHOP_HITS },
  // Fake test hosts only (replay mode): a name with saas / blog / clinic in it reads like that kind of site, so the pack detection can be tried without a live scan.
  saas: { pageTextChars: 1500, unlabelledButtons: 0, totalButtonsAndLinks: 30, imagesWithoutAlt: 0, totalImages: 4, priceAsText: true, overlayCoveringPage: false, productSchema: false, robotsTxt: 'found', sitemap: 'found', framework: 'unknown', schemaTypes: ['SoftwareApplication'], keywordHits: { cart: 0, pricing: 8, signup: 6, docs: 4, article: 1, newsletter: 1, hours: 0, booking: 0, menu: 0 } },
  blog: { pageTextChars: 4000, unlabelledButtons: 0, totalButtonsAndLinks: 40, imagesWithoutAlt: 1, totalImages: 8, priceAsText: false, overlayCoveringPage: false, productSchema: false, robotsTxt: 'found', sitemap: 'found', framework: 'unknown', schemaTypes: ['Blog', 'BlogPosting'], keywordHits: { cart: 0, pricing: 0, signup: 0, docs: 0, article: 12, newsletter: 3, hours: 0, booking: 0, menu: 0 } },
  clinic: { pageTextChars: 1200, unlabelledButtons: 2, totalButtonsAndLinks: 22, imagesWithoutAlt: 2, totalImages: 5, priceAsText: false, overlayCoveringPage: false, productSchema: false, robotsTxt: 'missing', sitemap: 'missing', framework: 'unknown', schemaTypes: ['Dentist'], keywordHits: { cart: 0, pricing: 0, signup: 0, docs: 0, article: 0, newsletter: 0, hours: 3, booking: 5, menu: 2 } },
  clean: { pageTextChars: 1800, unlabelledButtons: 0, totalButtonsAndLinks: 25, imagesWithoutAlt: 0, totalImages: 6, priceAsText: true, overlayCoveringPage: false, productSchema: true, robotsTxt: 'found', sitemap: 'missing', framework: 'unknown', schemaTypes: ['Product', 'Offer'], keywordHits: SHOP_HITS },
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
        : host === 'example.com' || host === 'www.example.com' ? MOCKS.example
        : /saas/.test(host) ? MOCKS.saas : /blog/.test(host) ? MOCKS.blog : /clinic/.test(host) ? MOCKS.clinic
        : flawsOn ? MOCKS.demoFlawed : MOCKS.clean;
      return done({ llmsTxt: 'missing', aiBlockedAgents: [], cartLink: m.keywordHits?.cart > 0, ...m });
    }
    const [f, b] = await Promise.all([fetchPart(url), browserPart(url)]);
    return done({ ...BROWSER_DEFAULTS, ...b, ...f });
  } catch {
    return done({ ...BROWSER_DEFAULTS, pageTextChars: 0, robotsTxt: 'error', sitemap: 'error', llmsTxt: 'error', aiBlockedAgents: [] });
  }
}

/**
 * Findings from an Instant Scan. Not part of the 100-point score, so pointsIfFixed is 0.
 * Price and product-data findings only make sense for shops: a blog or a SaaS site is not flagged for "no price" (D40).
 * @param {InstantScan} scan
 * @param {import('./types.js').PackId|string} [pack]  the pack the site is tested as; default shop (what every earlier caller meant)
 * @returns {Finding[]}
 */
export function instantScanFindings(scan, pack = 'shop') {
  const isShop = (normalisePack(pack) ?? 'shop') === 'shop';
  const who = isShop ? 'an AI shopper' : 'an AI agent';
  if (!scan) return [];
  const mk = (type, severity, text) => {
    const t = FIX_TEMPLATES[type] || {};
    return { type, severity, text, likelyCause: t.likelyCause || '', fix: t.fix || '', standard: t.standard, passCheck: t.passCheck, pointsIfFixed: 0, verified: true };
  };
  const out = [];
  // robots.txt is read by Fetch, so this finding does not need the browser part.
  const blocked = scan.aiBlockedAgents || [];
  if (blocked.length) {
    const userAgents = blocked.filter((a) => /-User$/.test(a));
    out.push(mk('robots-blocks-ai-agents', userAgents.length ? 'high' : 'medium',
      `robots.txt tells ${blocked.length} AI agent${blocked.length === 1 ? '' : 's'} to stay away from the whole site (${blocked.join(', ')})${userAgents.length ? ', including assistants that visit on behalf of a person' : ''}.`));
  }
  // If the browser part failed, its fields are defaults (0 controls, 0 images): do not report findings from them.
  const browserRan = (scan.totalButtonsAndLinks || 0) > 0 || (scan.totalImages || 0) > 0;
  if (!browserRan) return out;
  if (scan.overlayCoveringPage) out.push(mk('popup-blocking', 'high', `A pop-up or banner covers most of the page, so ${who} cannot see or click what is underneath.`));
  if (scan.unlabelledButtons > 0) {
    const pct = scan.totalButtonsAndLinks ? scan.unlabelledButtons / scan.totalButtonsAndLinks : 0;
    out.push(mk('unlabelled-buttons', pct > 0.2 ? 'high' : 'medium', `${scan.unlabelledButtons} of ${scan.totalButtonsAndLinks} buttons and links have no text or label, so ${who} cannot tell what they do (WCAG 4.1.2 Name, Role, Value).`));
  }
  // Only when the page has images (a price could be drawn in one); a text-only page like example.com has no price at all.
  if (isShop && !scan.priceAsText && (scan.totalImages || 0) > 0) out.push(mk('price-in-image', 'high', 'No price was found as text on the page; it may be drawn inside an image, which AI shoppers cannot read.'));
  if (isShop && scan.cartLink === false) out.push(mk('no-cart-link', 'medium', 'No link or button to the cart was found on the home page or a product page, so an AI shopper has to guess where the cart is.'));
  if (isShop && !scan.productSchema) out.push(mk('no-product-schema', 'low', 'The page has no schema.org Product data, so agents must guess product details from the page layout.'));
  return out;
}
