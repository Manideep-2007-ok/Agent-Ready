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

const FAIL_FINDING = {
  add_to_cart: ['cart-not-found', 'high', "Add to cart or the cart total could not be found", 'The Add to cart button or the cart total is hard to find: no clear text label, hidden behind a menu, or covered by another element.', 'Give the Add to cart control a visible text label (or aria-label) and show the cart total as plain text on the cart page.', 'WCAG 4.1.2 Name, Role, Value', 'Add to cart passes in 5 steps or fewer'],
  find_price: ['price-not-found', 'high', 'No product price could be read', 'Prices may be drawn inside images or loaded so late that they are not in the page text.', 'Show prices as plain text next to the product name and add schema.org Product/Offer data.', 'WCAG 1.1.1 Non-text Content; schema.org Product', 'A product price is found in 5 steps or fewer'],
  find_returns: ['returns-not-found', 'medium', 'The return policy could not be found', 'There is probably no clear "Returns" link in the header or footer; the policy sits deep inside a help centre.', 'Add a "Returns" or "Refund policy" link to the footer and header of every page.', undefined, 'The return policy is found in 5 steps or fewer'],
  find_contact: ['contact-not-found', 'medium', 'No way to contact support could be found', 'There is probably no visible Contact or Support link, or contact options only open after login.', 'Add a "Contact us" link to the footer of every page with an email, phone or form that works without login.', undefined, 'The contact page is found in 5 steps or fewer'],
};

/**
 * Score one task.
 * @param {TaskResult & {verdict?: BotWallVerdict}} task
 * @returns {{points:number, findings:Finding[]}}
 */
export function scoreTask(task) {
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
  for (const t of report.tasks) {
    const { points, findings } = scoreTask(t);
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
