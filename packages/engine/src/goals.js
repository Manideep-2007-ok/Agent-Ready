// Tested wording from 31 Oct. Keep GOAL_SUFFIX identical across tasks so answers parse the same way.
/** @typedef {import('./types.js').TaskId} TaskId */

export const GOAL_SUFFIX =
  'Do NOT log in, sign up or pay. If anything blocks you (login wall, popup, captcha, error page, access denied), ' +
  'stop and describe exactly what blocked you and at which step. ' +
  'Return JSON: {"success": true/false, "answer": string or null, "blocker": string or null, "stuck_url": string or null}';

// Goal wording for the four packs. The shop goals were tested on 31 Oct 2026 against real stores. The saas, content and
// local goals are UNTESTED ON LIVE AGENTS: they follow the same style (one clear job, what to report, "do NOT submit" where a
// form is involved) but have not been run yet. docs/PACK-LIVE-TEST.md is how to try each once and tune the wording.
/** @type {Record<Exclude<TaskId,'custom'>, string>} */
export const TASK_GOALS = {
  // ---- shop (tested) ----
  find_price: 'Find any product on this site and report its exact name and price.',
  add_to_cart:
    'Find any product, open its product page and add it to the cart. Then open the cart and report the cart total.',
  find_returns:
    "Find this site's return or refund policy. Report how many days customers have to return a product and the URL of the policy page.",
  find_contact:
    "Find a way to contact this company's customer support (phone, email, chat or contact form) and report it with the page URL where you found it.",
  // ---- saas (untested on live agents) ----
  find_pricing_plans:
    "Find this site's pricing page. Report the name and price of each plan (or say that prices are only given on request) and the URL of the pricing page.",
  reach_signup:
    'Find how a new visitor signs up or starts a free trial. Open the sign-up or free-trial form, but do NOT fill it in or submit it. Report the URL of the form and the names of the fields it asks for.',
  find_docs:
    "Find this site's developer documentation, API reference or help center. Report the URL of the page you reached and the title of one article or section on it.",
  contact_sales:
    'Find a way to contact the sales team or book a demo (form, email, phone number or booking page). Do NOT submit any form. Report what you found and the page URL.',
  // ---- content: blogs, news, documentation (untested on live agents) ----
  search_topic:
    "Work out what this site is mainly about. Then use the site's own search box or its navigation menus (not an outside search engine) to find one article about that topic. Report the article title and its URL.",
  read_article:
    'Open any article or post on this site. Report its title, the author and the date if they are shown, and a one-sentence summary of what it says.',
  find_newsletter:
    'Find the newsletter or email subscribe form on this site. Do NOT enter an email address or subscribe. Report the URL of the page where you found it and what the form asks for.',
  find_author_contact:
    'Find out how to contact the author or the editorial team (an about page, contact page, email address or social profile). Report what you found and the page URL.',
  // ---- local: restaurants, clinics, salons, shops with a location (untested on live agents) ----
  find_hours:
    'Find the opening hours of this business. Report the days and times exactly as the site gives them and the URL of the page where you found them.',
  find_location:
    'Find the address of this business. Report the full address and, if the site gives one, the map link, together with the URL of the page where you found them.',
  find_menu_or_services:
    'Find the menu or the list of services. Report at least three items with their prices if prices are shown, and the URL of the page.',
  reach_booking:
    'Find how to book a table, a reservation or an appointment. Open the booking page or form, but do NOT fill it in or submit it. Report the URL and the names of the fields it asks for.',
};

/** Plain-language lane titles. @type {Record<TaskId, string>} */
export const TASK_LABELS = {
  find_price: 'Find a product and its price',
  add_to_cart: 'Add to cart and read the total',
  find_returns: 'Find the return policy',
  find_contact: 'Find customer support',
  find_pricing_plans: 'Find the pricing plans',
  reach_signup: 'Reach the sign-up form',
  find_docs: 'Find the docs or help center',
  contact_sales: 'Contact sales or book a demo',
  search_topic: 'Find an article on the main topic',
  read_article: 'Open and read an article',
  find_newsletter: 'Find the newsletter sign-up',
  find_author_contact: 'Contact the author or team',
  find_hours: 'Find the opening hours',
  find_location: 'Find the address and map',
  find_menu_or_services: 'Find the menu or services',
  reach_booking: 'Reach the booking form',
  custom: 'Custom task',
};

/** @typedef {import('./types.js').PackId} PackId */

/**
 * The task packs. `tasks` is the default order, slowest first (find_returns took 261 s on Nykaa; for the other packs the
 * order is a guess until real runs measure it). `quick` = the two key tasks, for cheap CI runs.
 * `label` is the short name on the picker; `siteLabel` finishes "Tested as: ...".
 * @type {Record<PackId, {id:PackId, label:string, siteLabel:string, blurb:string, tasks:TaskId[], quick:TaskId[]}>}
 */
export const PACKS = {
  shop: { id: 'shop', label: 'Online store', siteLabel: 'Online store', blurb: 'Find a price, add to cart, find the return policy, find support.',
    tasks: ['find_returns', 'add_to_cart', 'find_price', 'find_contact'], quick: ['find_price', 'add_to_cart'] },
  saas: { id: 'saas', label: 'SaaS', siteLabel: 'SaaS site', blurb: 'Find the pricing plans, reach sign-up, find the docs, contact sales.',
    tasks: ['find_pricing_plans', 'reach_signup', 'contact_sales', 'find_docs'], quick: ['find_pricing_plans', 'reach_signup'] },
  content: { id: 'content', label: 'Blog & news', siteLabel: 'Blog or news site', blurb: 'Find an article by topic, read one, find the newsletter, contact the author.',
    tasks: ['search_topic', 'read_article', 'find_newsletter', 'find_author_contact'], quick: ['search_topic', 'read_article'] },
  local: { id: 'local', label: 'Local business', siteLabel: 'Local business', blurb: 'Find the opening hours, the address, the menu or services, reach booking.',
    tasks: ['reach_booking', 'find_menu_or_services', 'find_location', 'find_hours'], quick: ['find_hours', 'reach_booking'] },
};

export const PACK_IDS = /** @type {PackId[]} */ (Object.keys(PACKS));
export const DEFAULT_PACK = /** @type {PackId} */ ('shop');

/** Shop task order, kept under its old name. Slowest first (find_returns took 261 s on Nykaa). @type {TaskId[]} */
export const DEFAULT_TASK_ORDER = PACKS.shop.tasks;

/** Reports made before packs existed say 'shopping'; they are shop reports. Unknown or missing -> null. @returns {PackId|null} */
export function normalisePack(pack) {
  if (pack === 'shopping') return 'shop';
  return PACK_IDS.includes(pack) ? pack : null;
}

/** Which pack a task id belongs to (null for 'custom' and unknown ids). @returns {PackId|null} */
export function packOfTask(taskId) {
  return PACK_IDS.find((id) => PACKS[id].tasks.includes(taskId)) ?? null;
}

/** The pack a list of task ids points at: the pack of the first pack task (a mixed list is labelled by its first task). @returns {PackId} */
export function packForTasks(tasks) {
  for (const t of tasks ?? []) { const p = packOfTask(t); if (p) return p; }
  return DEFAULT_PACK;
}

/** Default task list of a pack (a copy). @param {PackId|string|null} [pack] */
export function defaultTasksFor(pack) {
  return [...PACKS[normalisePack(pack) ?? DEFAULT_PACK].tasks];
}

/** Plain name of the kind of site, e.g. "SaaS site" ("Tested as: SaaS site"). */
export function packSiteLabel(pack) {
  return PACKS[normalisePack(pack) ?? DEFAULT_PACK].siteLabel;
}

/** Shop task ids: the only ones with recordings in replay mode. */
export const SHOP_TASKS = PACKS.shop.tasks;

/**
 * @param {TaskId} taskId
 * @param {string} [customText]
 * @returns {string}
 */
export function buildGoal(taskId, customText) {
  const base = taskId === 'custom' ? (customText ?? '').trim() : TASK_GOALS[taskId];
  return `${base} ${GOAL_SUFFIX}`;
}
