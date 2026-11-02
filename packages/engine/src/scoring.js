// Scoring: plain, pure code (no I/O, no AI). Same input always gives the same score.
/** @typedef {import('./types.js').TaskResult} TaskResult */
/** @typedef {import('./types.js').SiteReport} SiteReport */
/** @typedef {import('./types.js').Finding} Finding */
/** @typedef {import('./types.js').BotWallVerdict} BotWallVerdict */

export const USD_INR = 88;
export const USD_PER_STEP = 0.016;

const VERDICT_RANK = { none: 0, 'blocks-cloud-agents': 1, 'blocks-automation': 2, 'site-broken': 3 };
const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

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

const DOLLAR_RE = /(?:US\s?\$|\$|\bUSD\b)\s?\d|\d\s?(?:USD|dollars?)\b/i;
const RUPEE_RE = /₹|\bRs\.?\s?\d|\bINR\b|\brupees?\b/i;

/** True when the answer quotes a dollar price while the site's own text uses rupees. */
export function detectCurrencyMismatch(answer, siteShowsRupees) {
  if (!answer || !siteShowsRupees) return false;
  return DOLLAR_RE.test(answer) && !RUPEE_RE.test(answer);
}

const FAIL_FINDING = {
  add_to_cart: ['cart-not-found', 'high', "Add to cart or the cart total could not be found", 'The Add to cart button or the cart total is hard to find: no clear text label, hidden behind a menu, or covered by another element.', 'Give the Add to cart control a visible text label (or aria-label) and show the cart total as plain text on the cart page.', 'WCAG 4.1.2 Name, Role, Value', 'Add to cart passes in 5 steps or fewer'],
  find_price: ['price-not-found', 'high', 'No product price could be read', 'Prices may be drawn inside images or loaded so late that they are not in the page text.', 'Show prices as plain text next to the product name and add schema.org Product/Offer data.', 'WCAG 1.1.1 Non-text Content; schema.org Product', 'A product price is found in 5 steps or fewer'],
  find_returns: ['returns-not-found', 'medium', 'The return policy could not be found', 'There is probably no clear "Returns" link in the header or footer; the policy sits deep inside a help centre.', 'Add a "Returns" or "Refund policy" link to the footer and header of every page.', undefined, 'The return policy is found in 5 steps or fewer'],
  find_contact: ['contact-not-found', 'medium', 'No way to contact support could be found', 'There is probably no visible Contact or Support link, or contact options only open after login.', 'Add a "Contact us" link to the footer of every page with an email, phone or form that works without login.', undefined, 'The contact page is found in 5 steps or fewer'],
};

/**
 * Score one task.
 * @param {TaskResult & {verdict?: BotWallVerdict}} task
 * @param {{siteShowsRupees?: boolean}} [context]  facts about the whole site (from the Instant Scan) for the answer checks
 * @returns {{points:number, findings:Finding[]}}
 */
export function scoreTask(task, context = {}) {
  // A stopped task proves nothing about the site: no points, no findings.
  if (task.status === 'cancelled') return { points: 0, findings: [] };
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
    if (t.taskId !== 'custom') score += points;
    all.push(...findings);
    totalSteps += t.attempts?.length ? t.attempts.reduce((n, a) => n + (a.numSteps || 0), 0) : t.numSteps || 0;
  }
  const topFixes = rankFixes(all);
  // Out of 100 for the tasks actually run: 4 tasks x 25 as before; a 2-task CLI or 1-task Watch run scales up,
  // so "both tasks passed" never reads as 50/100.
  const scored = report.tasks.filter((t) => t.taskId !== 'custom').length;
  if (scored) score = Math.round((score * 4) / scored);
  return {
    score: Math.max(0, Math.min(100, score)),
    botWall: siteVerdict(report.tasks),
    costRupees: Math.round(totalSteps * USD_PER_STEP * USD_INR * 100) / 100,
    topFixes,
  };
}
