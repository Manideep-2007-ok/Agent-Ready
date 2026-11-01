// Detailed Fix Report (ARCHITECTURE section 9): evidence, framework, AI write-up, templates.
// Every text names a SITE cause. Never blame the agent (DECISIONS D22).
import { chromium } from 'playwright-core';
import { config } from './config.js';
import { createBrowserSession, closeBrowserSession } from './tinyfish.js';
import { FINDING_TYPES } from './types.js';

/** @typedef {import('./types.js').Finding} Finding */
/** @typedef {import('./types.js').SiteReport} SiteReport */
/** @typedef {import('./types.js').Framework} Framework */
/** @typedef {import('./types.js').ElementEvidence} ElementEvidence */

const BOT_STANDARD = 'Bot protection allowlisting for verified AI agents';
const botFix =
  'Ask your security team or bot-protection vendor (Cloudflare, Akamai, etc.) to allow verified AI agents on product, cart, policy and contact pages, and to stop serving error pages to cloud-hosted browsers.';

/** @type {Record<string, {likelyCause:string, fix:string, standard:string, passCheck:string, frameworkExamples?:Record<string,string>}>} */
export const FIX_TEMPLATES = {
  'blocks-cloud-agents': {
    likelyCause: 'Your bot protection treats visitors from cloud-server addresses as hostile and shows an error page instead of the site.',
    fix: botFix,
    standard: BOT_STANDARD,
    passCheck: 'The same task passes on the first attempt, without a proxy, in a normal cloud browser.',
    frameworkExamples: {
      nextjs: 'In your CDN/WAF rules (Cloudflare, Vercel Firewall), add an allow rule for verified-bot or AI-agent traffic ahead of the challenge rule.',
      shopify: 'Shopify bot protection is managed by Shopify; if you front the store with Cloudflare, add a skip rule for verified AI agents in WAF custom rules.',
      unknown: 'In your WAF/CDN dashboard, add an allow or skip rule for verified AI agent traffic ahead of the challenge or block rule.',
    },
  },
  'blocks-automation': {
    likelyCause: 'Your bot protection blocks automated browsers even when they come from a normal residential address.',
    fix: botFix,
    standard: BOT_STANDARD,
    passCheck: 'The task passes with a standard browser profile and no stealth mode.',
    frameworkExamples: {
      nextjs: 'Relax the browser-fingerprint challenge for verified agents in your WAF, or serve a signed-agent allowlist.',
      shopify: 'Review third-party bot-protection apps installed on the store and whitelist verified AI agents.',
      unknown: 'Review fingerprint and JavaScript-challenge rules in your bot protection and allow verified AI agents.',
    },
  },
  'site-broken': {
    likelyCause: 'The page failed to load or showed an error or blank page even after changing network identity, so the site itself is not serving content.',
    fix: 'Open the stuck URL in a clean browser, check server logs and uptime monitoring for errors at the time of the test, and make sure the page returns real content.',
    standard: 'Availability: pages must return HTTP 200 with real content',
    passCheck: 'The stuck page loads with product or policy content on the first attempt.',
  },
  'needed-web-search': {
    likelyCause: 'The page the shopper needs is not reachable from your navigation, so visitors have to search the wider web to find it.',
    fix: 'Link the page directly from the header or footer with a clear label, and list it in your sitemap.xml.',
    standard: 'Sitemaps protocol and clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'The page is found by following site links only, without any web search.',
    frameworkExamples: {
      nextjs: 'Add the link to your shared footer component and export the route from app/sitemap.js.',
      shopify: 'Add the page to Online Store > Navigation > Footer menu.',
      unknown: 'Add a footer link with the page name (for example "Returns") on every page.',
    },
  },
  'cart-not-found': {
    likelyCause: 'The Add to cart control or the cart page is hard to find or identify: it may be an icon without a text label, or covered by another element.',
    fix: 'Give the add-to-cart button visible text or an aria-label, keep it free of overlays, and make the cart total readable as text on the cart page.',
    standard: 'WCAG 4.1.2 Name, Role, Value',
    passCheck: 'Add to cart and reading the cart total passes in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<button type="button" aria-label="Add to cart" onClick={add}>Add to cart</button>',
      shopify: 'In your theme, make sure the product form submit uses {{ "products.product.add_to_cart" | t }} as visible text.',
      unknown: '<button type="button" aria-label="Add to cart">Add to cart</button>',
    },
  },
  'price-not-found': {
    likelyCause: 'The price is not available as text on the page (for example it is drawn inside an image), or it is hidden behind a pop-up.',
    fix: 'Render prices as real text near the product name and expose them in schema.org Product/Offer markup.',
    standard: 'WCAG 1.1.1 Non-text Content; schema.org Product',
    passCheck: 'A product name and price are found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<span itemProp="price" content="499">₹499</span> inside an element with itemType="https://schema.org/Offer".',
      shopify: 'Use {{ product.price | money }} in the theme as text, never as an image.',
      unknown: '<span class="price">₹499</span> instead of <img src="price.png">.',
    },
  },
  'returns-not-found': {
    likelyCause: 'The return policy is buried several clicks deep or not linked from the footer, so visitors cannot reach it directly.',
    fix: 'Add a "Returns" or "Refund policy" link to the footer of every page.',
    standard: 'Clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'The return policy is found in 5 steps or fewer, without web search.',
    frameworkExamples: {
      nextjs: 'Add <Link href="/returns">Returns</Link> to your Footer component.',
      shopify: 'Online Store > Navigation > Footer menu > add "Refund policy".',
      unknown: '<a href="/returns">Returns</a> in the footer.',
    },
  },
  'contact-not-found': {
    likelyCause: 'There is no obvious Contact or Support link in the header or footer, or it opens only inside a hidden chat widget.',
    fix: 'Add a plain "Contact us" link with an email, phone number or form page to the header or footer.',
    standard: 'Clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'A support contact is found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: 'Add <Link href="/contact">Contact us</Link> to your Footer component.',
      shopify: 'Online Store > Navigation > Footer menu > add the Contact page.',
      unknown: '<a href="/contact">Contact us</a> in the footer.',
    },
  },
  'too-many-steps': {
    likelyCause: 'The path to this page takes many clicks because of nested menus or an unclear layout.',
    fix: 'Shorten the path: link the key page from the home page or footer and use clear link labels.',
    standard: 'Clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'The task finishes in 5 steps or fewer.',
  },
  slow: {
    likelyCause: 'Pages load slowly or the flow needs many page loads, often because of heavy scripts, banners or third-party widgets.',
    fix: 'Defer third-party scripts, compress images and avoid blocking banners on key pages.',
    standard: 'Web performance (Core Web Vitals)',
    passCheck: 'The task finishes in under 90 seconds.',
  },
  'popup-blocking': {
    likelyCause: 'A full-page pop-up or banner covers the content and has no easy close control.',
    fix: 'Give every pop-up a labelled close button, let it be dismissed with Escape, and do not cover the whole page on first load.',
    standard: 'WCAG 2.1.2 No Keyboard Trap; WCAG 4.1.2 Name, Role, Value',
    passCheck: 'The page content is reachable without dismissing a pop-up, or the pop-up closes with one click.',
    frameworkExamples: {
      nextjs: '<button aria-label="Close" onClick={close}>×</button> inside the modal, and close on keydown Escape.',
      shopify: 'In your pop-up app settings, enable a visible close button and delay display until after the first interaction.',
      unknown: '<button aria-label="Close dialog">×</button>',
    },
  },
  'unlabelled-buttons': {
    likelyCause: 'Many buttons and links are icons with no text or aria-label, so nothing tells a visitor (or an agent) what they do.',
    fix: 'Add visible text or an aria-label to every icon-only button and link.',
    standard: 'WCAG 4.1.2 Name, Role, Value',
    passCheck: 'No button or link on the page is left without a name.',
    frameworkExamples: {
      nextjs: '<button aria-label="Add to cart"><CartIcon aria-hidden="true" /></button>',
      shopify: 'In the theme, add aria-label="{{ "general.cart" | t }}" to icon-only links in header and product cards.',
      unknown: '<button aria-label="Add to cart"><svg aria-hidden="true">...</svg></button>',
    },
  },
  'price-in-image': {
    likelyCause: 'The price appears only inside an image, so it has no text a screen reader or an agent can read.',
    fix: 'Show the price as real text and, if an image must be used, add matching alt text.',
    standard: 'WCAG 1.1.1 Non-text Content',
    passCheck: 'The price is found as text in the page, in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<p>₹499</p> instead of <Image src="/price.png" />.',
      shopify: 'Use {{ product.price | money }} as text in the product template.',
      unknown: '<span class="price">₹499</span>',
    },
  },
  'no-product-schema': {
    likelyCause: 'The product page has no schema.org Product/Offer markup, so machines must guess the name and price from the layout.',
    fix: 'Add JSON-LD Product markup with name, image, offers.price and offers.priceCurrency.',
    standard: 'schema.org Product',
    passCheck: 'Google Rich Results Test shows a valid Product on the page.',
    frameworkExamples: {
      nextjs: '<script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify({"@context":"https://schema.org","@type":"Product",name,offers:{"@type":"Offer",price,priceCurrency:"INR"}})}} />',
      shopify: 'Most themes output it with {{ product | structured_data }} in the product template.',
      unknown: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"...","offers":{"@type":"Offer","price":"499","priceCurrency":"INR"}}</script>',
    },
  },
};

// Safety net: every contract type must have a template.
for (const t of FINDING_TYPES) if (!FIX_TEMPLATES[t]) throw new Error('Missing fix template: ' + t);

/**
 * Detect the site framework from a Playwright page. Never throws.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<Framework>}
 */
export async function detectFramework(page) {
  try {
    return await page.evaluate(() => {
      if (document.querySelector('script#__NEXT_DATA__') || self.__next_f) return 'nextjs';
      if (window.Shopify) return 'shopify';
      return 'unknown';
    });
  } catch {
    return 'unknown';
  }
}

// Keywords by finding type, used to find the most relevant element on the stuck page.
const KEYWORDS = {
  'cart-not-found': ['cart', 'bag', 'basket', 'add to'],
  'price-not-found': ['price', '₹', 'rs.', 'buy'],
  'price-in-image': ['price', '₹', 'rs.'],
  'returns-not-found': ['return', 'refund'],
  'contact-not-found': ['contact', 'support', 'help'],
  'unlabelled-buttons': ['cart', 'add'],
  'popup-blocking': ['close', 'dismiss', 'accept'],
};

/**
 * Open the stuck page in a Browser API session and capture the most relevant element.
 * Time-boxed, never throws. Returns null evidence in mock mode or on any failure.
 * @param {string} stuckUrl
 * @param {{type:string}} finding
 * @returns {Promise<{element: ElementEvidence|null, framework: Framework}>}
 */
export async function captureEvidence(stuckUrl, finding) {
  const empty = { element: null, framework: /** @type {Framework} */ ('unknown') };
  if (config.mock || !stuckUrl) return empty;
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(empty), 25000); });
  try {
    return await Promise.race([doCapture(stuckUrl, finding, empty), timeout]);
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

async function doCapture(stuckUrl, finding, empty) {
  let session = null;
  let browser = null;
  try {
    session = await createBrowserSession({ url: stuckUrl, countryCode: 'IN' });
    browser = await chromium.connectOverCDP(session.cdpUrl);
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const framework = await detectFramework(page);
    const words = KEYWORDS[finding.type] || ['cart', 'return', 'contact'];
    const element = await page.evaluate((kw) => {
      const nodes = [...document.querySelectorAll('button, a, [role=button], input[type=submit]')];
      const textOf = (el) => (el.innerText || el.value || '').trim();
      const scoreOf = (el) => {
        const hay = (textOf(el) + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.title || '') + ' ' + (el.className || '') + ' ' + (el.id || '')).toLowerCase();
        return kw.some((w) => hay.includes(w)) ? 1 : 0;
      };
      const el = nodes.find(scoreOf);
      if (!el) return null;
      const cssPath = (n) => {
        if (n.id) return '#' + n.id;
        const parts = [];
        while (n && n.nodeType === 1 && parts.length < 4) {
          let s = n.tagName.toLowerCase();
          if (n.classList.length) s += '.' + [...n.classList].slice(0, 2).join('.');
          parts.unshift(s);
          n = n.parentElement;
        }
        return parts.join(' > ');
      };
      const r = el.getBoundingClientRect();
      return {
        selector: cssPath(el),
        htmlSnippet: el.outerHTML.slice(0, 400),
        text: textOf(el).slice(0, 120),
        ariaLabel: el.getAttribute('aria-label'),
        box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      };
    }, words);
    return { element, framework };
  } catch {
    return empty;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (session?.sessionId) await closeBrowserSession(session.sessionId).catch(() => {});
  }
}

const BLAMES_AGENT = /\b(agent|bot|ai)\b[^.]{0,40}\b(got |was |is |became )?(confused|struggled|failed to understand|made a mistake|mistaken)/i;

/**
 * One AI call per finding. Returns {rootCause, standard, fixRule, frameworkExample, passCheck} or null.
 * Never throws, never exposes the key.
 * @param {Finding} finding
 * @param {ElementEvidence|null} evidence
 * @param {Framework} framework
 */
export async function writeUpWithAI(finding, evidence, framework) {
  const provider = config.llmProvider;
  const key = config.llmApiKey;
  if (!key || !['gemini', 'anthropic', 'openai'].includes(provider)) return null;
  const prompt =
    'You are a web accessibility and e-commerce expert writing a fix note for a site owner.\n' +
    'RULE: name a cause on the SITE. Never blame the agent or say it got confused.\n' +
    `Finding type: ${finding.type}\nWhat happened: ${finding.text}\nTask: ${finding.taskId || 'n/a'}\n` +
    `Framework: ${framework}\nElement evidence: ${evidence ? JSON.stringify(evidence) : 'none'}\n` +
    'Reply with JSON only: {"rootCause": "...", "standard": "...", "fixRule": "...", "frameworkExample": "...", "passCheck": "..."}. ' +
    'Each value is a short plain-language string (frameworkExample may be a code snippet).';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    let res, text;
    if (provider === 'gemini') {
      // Key goes in a header, not the URL, so it can never show up in a logged URL or error.
      res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
          method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
        },
      );
      if (!res.ok) return null;
      text = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
    } else if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) return null;
      text = (await res.json())?.content?.[0]?.text;
    } else {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) return null;
      text = (await res.json())?.choices?.[0]?.message?.content;
    }
    if (typeof text !== 'string') return null;
    const m = text.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(m ? m[0] : text);
    for (const k of ['rootCause', 'standard', 'fixRule', 'frameworkExample', 'passCheck']) {
      if (typeof obj?.[k] !== 'string' || !obj[k].trim()) return null;
    }
    // D22: findings must name a site cause. If the AI blames the agent, use the template instead.
    if (BLAMES_AGENT.test(obj.rootCause)) return null;
    return obj;
  } catch {
    return null; // timeout, network, bad JSON: caller uses the template
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Enrich one finding. Template values fill any gap.
 * @returns {Promise<Finding>}
 */
async function enrichFinding(finding, ctx) {
  const tpl = FIX_TEMPLATES[finding.type] || {};
  const taskCtx = finding.taskId ? ctx.byTask.get(finding.taskId) : null;
  const evidence = taskCtx?.element || null;
  const framework = ctx.framework;
  const ai = ctx.useAI ? await writeUpWithAI(finding, evidence, framework) : null;
  const example = tpl.frameworkExamples?.[framework] || tpl.frameworkExamples?.unknown;
  /** @type {Finding} */
  const out = {
    ...finding,
    likelyCause: ai?.rootCause || tpl.likelyCause || finding.likelyCause,
    fix: ai?.fixRule || tpl.fix || finding.fix,
    standard: ai?.standard || tpl.standard || finding.standard,
    frameworkExample: ai?.frameworkExample || example || finding.frameworkExample,
    passCheck: ai?.passCheck || tpl.passCheck || finding.passCheck,
  };
  if (evidence) out.element = evidence;
  return out;
}

/**
 * Build the Detailed Fix Report. Does not mutate the input.
 * @param {SiteReport} siteReport
 * @param {{useAI?: boolean}} [opts]
 * @returns {Promise<SiteReport>}
 */
export async function buildFixReport(siteReport, { useAI = true } = {}) {
  const report = structuredClone(siteReport);

  // Capture evidence once per stuckUrl, at most 4 captures in total.
  const urls = [...new Set(report.tasks.filter((t) => t.stuckUrl && t.findings?.length).map((t) => t.stuckUrl))].slice(0, 4);
  const captured = new Map();
  await Promise.all(urls.map(async (u) => {
    const task = report.tasks.find((t) => t.stuckUrl === u);
    const f = task.findings[0];
    captured.set(u, await captureEvidence(u, f));
  }));
  const byTask = new Map();
  let framework = report.framework && report.framework !== 'unknown' ? report.framework : 'unknown';
  for (const t of report.tasks) {
    const c = t.stuckUrl ? captured.get(t.stuckUrl) : null;
    if (c) {
      byTask.set(t.taskId, c);
      if (framework === 'unknown' && c.framework !== 'unknown') framework = c.framework;
    }
  }
  report.framework = framework;
  const ctx = { byTask, framework, useAI };

  // Enrich in small batches so AI calls stay bounded. topFixes repeat task findings,
  // so remember each result and reuse it (one AI call per finding, not two).
  const done = new Map();
  const enrichOnce = (f) => {
    const k = `${f.taskId || ''}|${f.type}`;
    if (!done.has(k)) done.set(k, enrichFinding(f, ctx));
    return done.get(k);
  };
  const enrichAll = async (list) => {
    const out = [];
    for (let i = 0; i < list.length; i += 4) out.push(...(await Promise.all(list.slice(i, i + 4).map(enrichOnce))));
    return out;
  };
  for (const t of report.tasks) t.findings = await enrichAll(t.findings || []);
  report.topFixes = await enrichAll(report.topFixes || []);
  return report;
}
