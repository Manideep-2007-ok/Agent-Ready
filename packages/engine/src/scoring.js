// Scoring: plain, pure code (no I/O, no AI). Same input always gives the same score.
/** @typedef {import('./types.js').TaskResult} TaskResult */
/** @typedef {import('./types.js').SiteReport} SiteReport */
/** @typedef {import('./types.js').Finding} Finding */
/** @typedef {import('./types.js').BotWallVerdict} BotWallVerdict */

export const USD_INR = 88;
export const USD_PER_STEP = 0.016;

const VERDICT_RANK = { none: 0, 'blocks-cloud-agents': 1, 'blocks-automation': 2, 'site-broken': 3 };
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

/** Counts in the 100: not the custom task, and not a replay placeholder (replay mode has no recording for it). */
export const isScored = (t) => t.taskId !== 'custom' && !t.replayNote;

/** Worst verdict across tasks: site-broken > blocks-automation > blocks-cloud-agents > none. */
export function siteVerdict(tasks) {
  let worst = 'none';
  for (const t of tasks) {
    const v = /** @type {BotWallVerdict} */ (t.verdict || 'none');
    if (VERDICT_RANK[v] > VERDICT_RANK[worst]) worst = v;
  }
  return worst;
}

/** Points for a task (max 25). Step and time bonuses are only given to PASSED tasks. */
function computePoints({ passed, steps, seconds, webSearch, capped }) {
  if (!passed) return 0;
  let p = 15;
  p += steps <= 5 ? 6 : steps <= 10 ? 3 : 0;
  p += seconds < 90 ? 4 : seconds < 180 ? 2 : 0;
  if (webSearch) p = Math.max(0, p - 5);
  if (capped) p = Math.min(p, 5);
  return p;
}

// ---- Answer checks (D28) -------------------------------------------------------------------------------------------
// A task can "pass" with an answer that is wrong. We only say so when the agent's OWN words (its answer, its step
// labels) show it, never from a guess. These produce findings only: they never fail a task or change the score.

/** The largest quantity above 1 that the text states ("quantity: 2", "2 units", "x2"), or null. Conservative on purpose. */
export function detectQuantity(text) {
  if (!text) return null;
  const patterns = [
    /\b(?:quantity|qty)\s*(?:of|is|to|:|=)?\s*(\d{1,3})\b/gi,
    // "2 units", but not a pack size ("Pack of 2 units"); "pieces"/"pcs" are left out: they are nearly always pack sizes ("Set of 3 pieces").
    /(?<!\b(?:pack|set|combo|box|tray|bundle|kit|case)\s+of\s+)\b(\d{1,3})\s*units?\b/gi,
    // "2 items in the cart" / "2 items added", not "2 items in stock" or "48 products in Lipstick" (a listing page).
    /\b(\d{1,3})\s*(?:items?|products?)\s+(?:added|in\s+(?:the\s+|your\s+|my\s+)?(?:cart|bag|basket))\b/gi,
    // "Lipstick x2", not a size ("50 x 30 cm") or a model name ("X 64GB").
    /(?<![\d.]\s*)(?:\bx|×)\s?(\d{1,2})\b(?!\s*(?:\d|cm|mm|m\b|in\b|inch|ml|l\b|g\b|kg|gb|tb))/gi,
  ];
  let max = null;
  for (const re of patterns) {
    for (const m of String(text).matchAll(re)) {
      const n = Number(m[1]);
      if (n > 1 && n < 100 && (max === null || n > max)) max = n;
    }
  }
  return max;
}

// "Read cart total price from image", "Get cart total visually from screenshot".
const PRICE_FROM_IMAGE_RE = /\b(?:price|total|cost)\b[^.]{0,40}\b(?:from|in|inside)\s+(?:the\s+|an?\s+)?(?:image|screenshot|picture)\b|\b(?:price|total)\b[^.]{0,30}\bvisually\b/i;
const DOLLAR_RE = /(?:US\s?\$|\$|\bUSD\b)\s?\d|\d\s?(?:USD|dollars?)\b/i;
const RUPEE_RE = /₹|\bRs\.?\s?\d|\bINR\b|\brupees?\b/i;

/** True when the answer quotes a dollar price while the site's own text uses rupees. */
export function detectCurrencyMismatch(answer, siteShowsRupees) {
  if (!answer || !siteShowsRupees) return false;
  return DOLLAR_RE.test(answer) && !RUPEE_RE.test(answer);
}

/** How many of the agent's steps press Add to cart ("Click 'Add to cart'", "Add the product to the bag"). */
export function countAddToCartPresses(steps) {
  const press = /\b(?:click(?:ing|ed)?|press(?:ing|ed)?|tap(?:ping|ped)?|add(?:ing)?)\b[^.]{0,40}?\badd(?:\s|-)?to(?:\s|-)?(?:cart|bag|basket)\b|\badd(?:ing)?\s+(?:the\s+|this\s+|it\s+|an?\s+)?(?:\w+\s+){0,3}to\s+(?:the\s+)?(?:cart|bag|basket)\b/i;
  const check = /\b(?:verify|check|confirm|see|view|open|go to|navigate)\b/i;
  return (steps || []).filter((s) => press.test(s.label || '') && !check.test(s.label || '')).length;
}

/** Task id -> the finding a failed task creates: [type, severity, what, likelyCause, fix, standard, passCheck]. */
export const FAIL_FINDING = {
  add_to_cart: ['cart-not-found', 'high', "Add to cart or the cart total could not be found", 'The Add to cart button or the cart total is hard to find: no clear text label, hidden behind a menu, or covered by another element.', 'Give the Add to cart control a visible text label (or aria-label) and show the cart total as plain text on the cart page.', 'WCAG 4.1.2 Name, Role, Value', 'Add to cart passes in 5 steps or fewer'],
  find_price: ['price-not-found', 'high', 'No product price could be read', 'Prices may be drawn inside images or loaded so late that they are not in the page text.', 'Show prices as plain text next to the product name and add schema.org Product/Offer data.', 'WCAG 1.1.1 Non-text Content; schema.org Product', 'A product price is found in 5 steps or fewer'],
  find_returns: ['returns-not-found', 'medium', 'The return policy could not be found', 'There is probably no clear "Returns" link in the header or footer; the policy sits deep inside a help centre.', 'Add a "Returns" or "Refund policy" link to the footer and header of every page.', undefined, 'The return policy is found in 5 steps or fewer'],
  find_contact: ['contact-not-found', 'medium', 'No way to contact support could be found', 'There is probably no visible Contact or Support link, or contact options only open after login.', 'Add a "Contact us" link to the footer of every page with an email, phone or form that works without login.', undefined, 'The contact page is found in 5 steps or fewer'],
  // ---- saas / content / local packs (D40). Same shape; wording names a site cause, never the agent (D22). ----
  find_pricing_plans: ['pricing-not-found', 'high', 'The pricing plans could not be found', 'There may be no "Pricing" link in the header or footer, the plans may be drawn as images or load only after a script runs, or prices may be shown only after a form is filled in.', 'Add a "Pricing" link to the header and footer and show each plan name and price as plain text on that page.', 'Clear navigation labels (WCAG 2.4.5 Multiple Ways); WCAG 1.1.1 Non-text Content', 'The plan names and prices are found in 5 steps or fewer'],
  reach_signup: ['signup-not-found', 'high', 'The sign-up or free-trial form could not be reached', 'The sign-up button may be an icon or unclear label such as "Get going", or the form may only open inside a script-driven pop-up that covers the page.', 'Label the main call to action in plain words ("Sign up", "Start free trial") and link it to a page with a real form whose fields have labels.', 'WCAG 2.4.4 Link Purpose; WCAG 3.3.2 Labels or Instructions', 'The sign-up form and its fields are found in 5 steps or fewer'],
  find_docs: ['docs-not-found', 'medium', 'The documentation or help center could not be found', 'There may be no "Docs", "API" or "Help" link in the header or footer, or the docs may live on a separate address that nothing on the main site links to.', 'Link the docs or help center from the header and footer with a plain label ("Docs", "Help center") and list it in sitemap.xml.', 'Sitemaps protocol and clear navigation labels (WCAG 2.4.5 Multiple Ways)', 'The docs or help center is found in 5 steps or fewer'],
  contact_sales: ['sales-contact-not-found', 'medium', 'No way to contact sales or book a demo could be found', 'There may be no visible "Contact sales" or "Book a demo" link, or the only option may be a form hidden behind a login or a chat widget that does not load.', 'Add a "Contact sales" or "Book a demo" link to the header and footer, pointing to a page with a form or an email address in plain text.', 'Clear navigation labels (WCAG 2.4.5 Multiple Ways)', 'A sales contact or demo booking is found in 5 steps or fewer'],
  search_topic: ['search-not-found', 'medium', "An article on the site's main topic could not be found through its own search or menus", 'The site may have no search box, a search that returns nothing without a script, or menus whose topics are not named in plain words.', 'Add a visible search box and topic links in the header, and make search results work as normal links.', 'WCAG 2.4.5 Multiple Ways; WCAG 3.2.4 Consistent Identification', 'An article on the main topic is found in 5 steps or fewer'],
  read_article: ['article-not-readable', 'high', 'An article could not be opened and read', 'Article text may load only after a script runs, sit behind a pop-up or paywall prompt, or be split into pieces with no clear title, author or date.', 'Serve the article text in the page itself, mark it up with one heading and schema.org Article data (headline, author, datePublished), and keep pop-ups off the first screen.', 'schema.org Article; WCAG 1.3.1 Info and Relationships', 'An article opens with its title, author and date readable in 5 steps or fewer'],
  find_newsletter: ['newsletter-not-found', 'low', 'The newsletter sign-up could not be found', 'The subscribe form may only appear in a timed pop-up, or sit in the page footer without a label that says what it is.', 'Add a visible "Subscribe" form or link in the footer of every page, with a labelled email field.', 'WCAG 3.3.2 Labels or Instructions', 'The newsletter form is found in 5 steps or fewer'],
  find_author_contact: ['author-contact-not-found', 'low', 'No way to contact the author or editorial team could be found', 'There may be no "About" or "Contact" link, or the byline may not link to an author page with an email or profile.', 'Link every byline to an author page and add "About" and "Contact" links to the footer with an email address or form.', 'Clear navigation labels (WCAG 2.4.5 Multiple Ways)', 'A way to contact the author or team is found in 5 steps or fewer'],
  find_hours: ['hours-not-found', 'high', 'The opening hours could not be found', 'The hours may be drawn inside an image, shown only in a map widget, or missing from the pages visitors reach first.', 'Write the opening hours as plain text in the footer and on the contact page, and add them to LocalBusiness markup (openingHours).', 'schema.org LocalBusiness openingHours; WCAG 1.1.1 Non-text Content', 'The opening hours are found in 5 steps or fewer'],
  find_location: ['location-not-found', 'high', 'The address and map could not be found', 'The address may be drawn inside an image or only shown inside an embedded map, with no text and no link.', 'Write the full address as plain text on the contact page and in the footer, with a link to the map, and add it to LocalBusiness markup (address).', 'schema.org LocalBusiness address; WCAG 1.1.1 Non-text Content', 'The address and a map link are found in 5 steps or fewer'],
  find_menu_or_services: ['menu-not-found', 'medium', 'The menu or the list of services could not be found', 'The menu may be a PDF or a photo, or the services page may not be linked from the header.', 'Publish the menu or services as a page of plain text with prices, and link it from the header.', 'WCAG 1.1.1 Non-text Content; Clear navigation labels (WCAG 2.4.5 Multiple Ways)', 'The menu or services are found, with prices, in 5 steps or fewer'],
  reach_booking: ['booking-not-found', 'high', 'The booking, reservation or appointment form could not be reached', 'The booking button may be an icon or unclear label, or the form may be hidden inside a third-party widget that does not load for visitors without a script.', 'Add a "Book now" or "Reserve a table" link to the header and make the booking form a normal page with labelled fields.', 'WCAG 2.4.4 Link Purpose; WCAG 3.3.2 Labels or Instructions', 'The booking form and its fields are found in 5 steps or fewer'],
};

/**
 * Score one task.
 * @param {TaskResult & {verdict?: BotWallVerdict}} task
 * @param {{siteShowsRupees?: boolean}} [context]  facts about the whole site (from the Instant Scan) for the answer checks
 * @returns {{points:number, findings:Finding[]}}
 */
export function scoreTask(task, context = {}) {
  // A stopped task proves nothing about the site: no points, no findings. Neither does a replay placeholder (nothing was run).
  if (task.status === 'cancelled' || task.replayNote) return { points: 0, findings: [] };
  const passed = task.status === 'passed';
  const verdict = task.verdict || 'none';
  const webSearch = (task.steps || []).some((s) => s.usedWebSearch);
  const walled = passed && (verdict === 'blocks-cloud-agents' || verdict === 'blocks-automation');
  const seconds = task.seconds ?? 0;
  const steps = task.numSteps || (task.steps || []).length;
  const state = { passed, steps, seconds, webSearch, capped: walled };
  const points = computePoints(state);
  const gain = (changed) => Math.max(0, computePoints({ ...state, ...changed }) - points);

  const last = (task.steps || [])[(task.steps || []).length - 1];
  const verified = (task.steps || []).length >= 1;
  const base = { taskId: task.taskId, verified, ...(last ? { screenshotUrl: last.screenshotUrl } : {}) };
  const blocker = task.blocker ? ` What the agent saw: "${String(task.blocker).slice(0, 200)}".` : '';
  // Bot-wall evidence = the FIRST (blocked) attempt, not the later attempt that got through.
  const wall = task.attempts?.[0];
  const wallBase = { ...base, ...(wall?.screenshotUrl ? { screenshotUrl: wall.screenshotUrl } : {}) };
  const wallSaw = wall?.blocker ? ` What the agent saw without a proxy: "${String(wall.blocker).slice(0, 200)}".` : '';
  /** @type {Finding[]} */
  const findings = [];

  if (verdict === 'blocks-cloud-agents') {
    findings.push({ ...wallBase, type: 'blocks-cloud-agents', severity: 'critical',
      text: `The site refused AI agents that arrive from cloud servers, but let them in through an Indian proxy address.${wallSaw}`,
      likelyCause: 'Bot protection treats traffic from data-centre addresses as hostile.',
      fix: 'Allow verified AI agents in the bot-protection rules (or allow-list their IP ranges / user agents).',
      standard: 'Bot protection allowlisting for verified AI agents',
      passCheck: 'The task passes with the default agent setup (no proxy)',
      pointsIfFixed: gain({ passed: true, capped: false }) });
  } else if (verdict === 'blocks-automation') {
    findings.push({ ...wallBase, type: 'blocks-automation', severity: 'critical',
      text: `The site only let the agent in when it used stealth mode plus an Indian address, so it blocks automated browsers.${wallSaw}`,
      likelyCause: 'Bot protection fingerprints automated browsers and blocks them even from normal addresses.',
      fix: 'Allow verified AI agents in the bot-protection rules instead of blocking all automated browsers.',
      standard: 'Bot protection allowlisting for verified AI agents',
      passCheck: 'The task passes with the default agent setup (no proxy, no stealth)',
      pointsIfFixed: gain({ passed: true, capped: false }) });
  } else if (verdict === 'site-broken') {
    findings.push({ ...base, type: 'site-broken', severity: 'critical',
      text: `The site showed an error or blank page on every attempt, even with proxy and stealth.${blocker}`,
      likelyCause: 'The site returned an error page or empty content to automated visitors (bot protection or a server problem).',
      fix: 'Open the site in a clean cloud browser, find why it returns an error or blank page, and fix or allow-list agents.',
      standard: 'Bot protection allowlisting for verified AI agents',
      passCheck: 'The page loads with real content for the agent on the first attempt',
      pointsIfFixed: gain({ passed: true, capped: false }) });
  }
  // A task can get past the bot wall (attempt 2 or 3) and still fail the task itself: report both.
  if (!passed && verdict !== 'site-broken' && FAIL_FINDING[task.taskId]) {
    const [type, severity, what, likelyCause, fix, standard, passCheck] = FAIL_FINDING[task.taskId];
    findings.push({ ...base, type, severity,
      text: `${what}.${blocker}`, likelyCause, fix, ...(standard ? { standard } : {}), passCheck,
      pointsIfFixed: gain({ passed: true, steps: 5, seconds: 60, webSearch: false, capped: false }) });
  }

  // Answer checks (D28): findings only, never a failed task and never points. Only for the tasks that have a plain answer.
  if (passed && task.taskId === 'add_to_cart') {
    const evidence = [task.answer, ...(task.steps || []).map((s) => s.label)].filter(Boolean).join(' | ');
    const qty = detectQuantity(evidence);
    if (qty) {
      findings.push({ ...base, type: 'wrong-quantity', severity: 'medium',
        text: `The cart answer mentions a quantity of ${qty}, so the total the agent reported may be for ${qty} units instead of one product.`,
        likelyCause: 'Add to cart may add more than one unit (a quantity box starting above 1, or no clear "added" message so a second click looks needed).',
        fix: 'Start the quantity at 1, add exactly one unit per click and confirm "Added to cart" in text next to the button.',
        standard: 'WCAG 4.1.3 Status Messages',
        passCheck: 'One click on Add to cart gives a cart with exactly one unit',
        pointsIfFixed: 0 });
    }
  }
  if (passed && (task.taskId === 'find_price' || task.taskId === 'add_to_cart')) {
    const labelsSayRupees = (task.steps || []).some((s) => RUPEE_RE.test(s.label || ''));
    if (detectCurrencyMismatch(task.answer, context.siteShowsRupees || labelsSayRupees)) {
      findings.push({ ...base, type: 'currency-mismatch', severity: 'low',
        text: 'The agent reported a price in dollars, but this site shows its prices in rupees (₹), so the reported price may not be what shoppers see.',
        likelyCause: 'The page may show more than one currency, or not say which currency a price is in (for example a hidden dollar price in the page data).',
        fix: 'Write the currency symbol next to every price and set offers.priceCurrency in schema.org Product markup.',
        standard: 'schema.org Offer priceCurrency',
        passCheck: 'The price an agent reports matches the price on the page, in the same currency',
        pointsIfFixed: 0 });
    }
  }

  // The agent read the price from a picture (its own step labels or answer say so): the price is likely not text.
  if (passed && (task.taskId === 'find_price' || task.taskId === 'add_to_cart')) {
    const said = [task.answer, ...(task.steps || []).map((s) => s.label)].find((t) => PRICE_FROM_IMAGE_RE.test(t || ''));
    if (said) {
      findings.push({ ...base, type: 'price-in-image', severity: 'high',
        text: `The agent had to read the price from a picture of the page ("${String(said).slice(0, 120)}"), so the price is probably not written as text.`,
        likelyCause: 'The price is drawn inside an image (or a canvas) with no text version, so agents that read the page text cannot find it.',
        fix: 'Write every price as plain text next to the product name, and add it to schema.org Offer data.',
        standard: 'WCAG 1.1.1 Non-text Content; schema.org Offer',
        passCheck: 'The price is found in the page text, without reading a screenshot',
        pointsIfFixed: 0 });
    }
  }

  // No feedback after Add to cart: the agent pressed it more than once (its own step labels say so). Findings only.
  if (passed && task.taskId === 'add_to_cart') {
    const presses = countAddToCartPresses(task.steps);
    if (presses >= 2) {
      findings.push({ ...base, type: 'no-cart-feedback', severity: 'medium',
        text: `The agent pressed Add to cart ${presses} times, so the page may not show clearly that the product was added.`,
        likelyCause: 'After a click on Add to cart nothing visible changes in the page text (no "Added to cart" message, no cart count update), so the click looks like it did nothing.',
        fix: 'Show a text message such as "Added to cart" next to the button and update the cart count, announced with role="status".',
        standard: 'WCAG 4.1.3 Status Messages',
        passCheck: 'Add to cart passes with one press of the button',
        pointsIfFixed: 0 });
    }
  }

  // Repeat runs disagreed (D41). Findings only: the majority already decided the points.
  if (task.flaky && task.runs?.length) {
    const counted = task.runs.filter((r) => !r.stopped);
    const ok = counted.filter((r) => r.passed).length;
    findings.push({ ...base, type: 'inconsistent-results', severity: 'medium',
      text: `Agents got different results on repeat runs: the task passed ${ok} of ${counted.length} times.`,
      likelyCause: 'The page may not behave the same on every visit: a pop-up or banner that shows only sometimes, an A/B test, slow scripts, or a location or stock prompt.',
      fix: 'Make the path for this task the same on every visit: no randomly timed pop-ups, and the key buttons and text present when the page first loads.',
      passCheck: 'Three runs in a row give the same result',
      pointsIfFixed: 0 });
  }

  // Claim checks (D42): the page the agent named does not show what it reported, or it named another website.
  if (passed && task.claim?.status === 'not-found') {
    const missing = task.claim.facts.filter((f) => !f.found).map((f) => f.label).join(', ');
    findings.push({ ...base, type: 'unconfirmed-claim', severity: 'low',
      text: `The agent reported ${missing}, but the page it named (${task.claim.url}) does not show that as text.`,
      likelyCause: 'The information may be drawn inside an image, loaded by a script only after the page opens, or shown only after a click, so a plain read of the page cannot find it.',
      fix: 'Write the key facts (prices, return days, contact details) as plain text in the page itself.',
      standard: 'WCAG 1.1.1 Non-text Content',
      passCheck: 'The page the agent names shows the same facts as text',
      pointsIfFixed: 0 });
  } else if (passed && task.claim?.status === 'off-site') {
    findings.push({ ...base, type: 'unconfirmed-claim', severity: 'low',
      text: `The agent's answer points to a page on another website (${task.claim.url}) instead of this site.`,
      likelyCause: "The information may not be on this site's own pages, or it may be easier to find elsewhere than through the site's navigation.",
      fix: "Publish the information on this site and link it from the header or footer.",
      passCheck: "The agent's answer names a page on this site",
      pointsIfFixed: 0 });
  }

  // Efficiency findings only make sense for tasks that passed.
  if (passed) {
    if (webSearch) {
      findings.push({ ...base, type: 'needed-web-search', severity: 'medium',
        text: 'The agent could not reach the page through the site itself and had to fall back to a web search.',
        likelyCause: 'The page is not linked clearly from the main navigation, so it is easier to find through a search engine.',
        fix: 'Link the page from the header or footer so visitors (and agents) can reach it without searching.',
        passCheck: 'The task passes without any web search',
        pointsIfFixed: gain({ webSearch: false }) });
    }
    if (steps > 10) {
      findings.push({ ...base, type: 'too-many-steps', severity: 'medium',
        text: `It took ${steps} steps to finish this task; a clear page needs about 5.`,
        likelyCause: 'The path to the answer is buried several menus deep or uses unclear link names.',
        fix: 'Shorten the path: put the key link in the header or footer and name it plainly.',
        passCheck: 'The task passes in 5 steps or fewer',
        pointsIfFixed: gain({ steps: 5 }) });
    }
    if (seconds >= 180) {
      findings.push({ ...base, type: 'slow', severity: 'low',
        text: `The task took ${Math.round(seconds)} seconds; a clear page takes under 90.`,
        likelyCause: 'Heavy pages, slow-loading scripts or a long click path slow every visitor down.',
        fix: 'Cut page weight and shorten the click path for this task.',
        passCheck: 'The task passes in under 90 seconds',
        pointsIfFixed: gain({ seconds: 60 }) });
    }
  }
  return { points, findings };
}

/**
 * Top 3 fixes: severity first (critical > high > medium > low), then pointsIfFixed (most points first).
 * Does not mutate the input.
 * @param {Finding[]} findings
 * @returns {Finding[]}
 */
export function rankFixes(findings) {
  const sorted = [...(findings || [])]
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || (b.pointsIfFixed || 0) - (a.pointsIfFixed || 0));
  // One fix per finding type: "allow verified AI agents" is one fix even if it blocked all four tasks.
  const seen = new Set();
  return sorted.filter((f) => !seen.has(f.type) && seen.add(f.type)).slice(0, 3);
}

/** Every billed step of a task: all bot-wall attempts, plus the repeat runs of a confirmed task (runs[0] is the cascade's own). */
export function taskSteps(t) {
  const cascade = t.attempts?.length ? t.attempts.reduce((n, a) => n + (a.numSteps || 0), 0) : t.numSteps || 0;
  const repeats = (t.runs || []).slice(1).reduce((n, r) => n + (r.numSteps || 0), 0);
  return cascade + repeats;
}

export const RUPEES_PER_STEP = USD_PER_STEP * USD_INR;
// Typical steps per task on a small to large site (31 Oct and 1 Nov runs: 3 to 20, most 4 to 13).
const TYPICAL_STEPS = { low: 4, high: 15 };

/**
 * What a test will probably cost, before it starts (P2-8). A bot wall can add up to two more runs per task; confirming
 * adds one or two runs per task. Rupees, rounded.
 * @param {{tasks:number, confirm?:boolean}} p
 * @returns {{lowRupees:number, highRupees:number, worstRupees:number, rupeesPerStep:number}}
 */
export function estimateCost({ tasks, confirm = false }) {
  const n = Math.max(0, Math.floor(tasks || 0));
  const r = (steps) => Math.round(steps * RUPEES_PER_STEP);
  return {
    lowRupees: r(n * TYPICAL_STEPS.low * (confirm ? 2 : 1)),
    highRupees: r(n * TYPICAL_STEPS.high * (confirm ? 2 : 1)),
    worstRupees: r(n * TYPICAL_STEPS.high * (confirm ? 5 : 3)), // bot-wall cascade (3 runs) plus, when confirming, two repeats
    rupeesPerStep: Math.round(RUPEES_PER_STEP * 1000) / 1000,
  };
}

/**
 * Score a whole report. NOTE: this also WRITES task.points and task.findings into every task of `report`
 * (mutates it), because the dashboard reads them from there. Custom tasks are scored but excluded from the 100.
 * @param {SiteReport} report
 * @returns {{score:number, botWall:BotWallVerdict, costRupees:number, topFixes:Finding[]}}
 */
export function scoreReport(report) {
  let score = 0;
  let totalSteps = 0;
  const all = [];
  const context = { siteShowsRupees: report.instantScan?.priceAsText === true };
  for (const t of report.tasks) {
    const { points, findings } = scoreTask(t, context);
    t.points = points;
    t.findings = findings;
    if (isScored(t)) score += points;
    all.push(...findings);
    totalSteps += taskSteps(t);
  }
  const topFixes = rankFixes(all);
  // Out of 100 for the tasks actually run: 4 tasks x 25 as before; a 2-task CLI or 1-task Watch run scales up,
  // so "both tasks passed" never reads as 50/100.
  const scored = report.tasks.filter(isScored).length;
  if (scored) score = Math.round((score * 4) / scored);
  return {
    score: Math.max(0, Math.min(100, score)),
    botWall: siteVerdict(report.tasks),
    costRupees: Math.round(totalSteps * USD_PER_STEP * USD_INR * 100) / 100,
    topFixes,
  };
}
