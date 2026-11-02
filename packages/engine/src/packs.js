// Pack auto-detect (D40): which kind of site is this? A pure function over the Instant Scan, so it is cheap and testable.
// No I/O, no AI. The scan counts a few keyword families on the page it already opens (same page evaluate, no extra cost).
/** @typedef {import('./types.js').InstantScan} InstantScan */
/** @typedef {import('./types.js').PackId} PackId */

/**
 * Keyword families counted on the page text. Regex SOURCES (strings) so the same patterns run inside the browser page
 * (Instant Scan) and here on plain text (`keywordHitsFromText`). Case-insensitive.
 */
export const KEYWORD_SOURCES = {
  cart: 'add to (?:cart|bag|basket)|buy now|view cart|shopping (?:cart|bag)',
  pricing: '\\bpricing\\b|\\bplans?\\b|per (?:month|user|seat)|/ ?mo\\b|compare plans',
  signup: 'sign ?up|get started|free trial|start (?:your )?free|create (?:an )?account|request access',
  docs: '\\bdocs\\b|documentation|api reference|\\bdevelopers?\\b|changelog',
  article: '\\bblog\\b|read more|min read|latest (?:news|posts|articles)|\\bnews\\b|\\barticles?\\b',
  newsletter: 'newsletter|subscribe',
  hours: 'opening hours|business hours|open (?:daily|today|now)|\\bhours\\b|mon(?:day)?\\s*[-–]\\s*(?:fri|sat|sun)',
  booking: 'book (?:a |an |your )?(?:table|now|appointment|online|visit)|reserve|reservations?|appointments?|make a booking',
  menu: '\\bmenu\\b|our services|treatments',
};
export const KEYWORD_KEYS = Object.keys(KEYWORD_SOURCES);
export const KEYWORD_CAP = 20; // one huge page must not outvote the schema signals

/** Count each keyword family in plain text (each count capped at KEYWORD_CAP). @returns {Record<string, number>} */
export function keywordHitsFromText(text) {
  const t = String(text ?? '').toLowerCase();
  const out = {};
  for (const key of KEYWORD_KEYS) out[key] = t ? Math.min(KEYWORD_CAP, (t.match(new RegExp(KEYWORD_SOURCES[key], 'g')) || []).length) : 0;
  return out;
}

/** schema.org @type names in JSON-LD text. Cheap regex on purpose: it also finds types inside @graph. @returns {string[]} */
export function schemaTypesFromJsonLd(text) {
  const types = new Set();
  for (const m of String(text ?? '').matchAll(/"@type"\s*:\s*(\[[^\]]*\]|"[^"]*")/g)) {
    for (const name of m[1].matchAll(/"([^"]+)"/g)) types.add(name[1].replace(/^.*[/#]/, ''));
  }
  return [...types];
}

const SHOP_TYPES = ['Product', 'Offer', 'AggregateOffer', 'ProductGroup', 'IndividualProduct'];
const SAAS_TYPES = ['SoftwareApplication', 'WebApplication', 'MobileApplication', 'SoftwareSourceCode', 'APIReference'];
const CONTENT_TYPES = ['Article', 'BlogPosting', 'NewsArticle', 'Blog', 'TechArticle', 'ScholarlyArticle', 'Report', 'NewsMediaOrganization', 'LiveBlogPosting'];
const LOCAL_TYPES = ['LocalBusiness', 'Restaurant', 'CafeOrCoffeeShop', 'BarOrPub', 'Bakery', 'FoodEstablishment', 'Dentist', 'Physician',
  'MedicalClinic', 'MedicalBusiness', 'HealthAndBeautyBusiness', 'HairSalon', 'BeautySalon', 'DaySpa', 'HealthClub', 'AutoRepair',
  'LodgingBusiness', 'Hotel', 'ProfessionalService', 'LegalService'];
const hasType = (types, list) => types.some((t) => list.includes(t));

/** Tie-break order (D40): content first, then saas, local, shop. */
const TIE_ORDER = ['content', 'saas', 'local', 'shop'];

/**
 * Points for each pack from the scan (and optional page text). Exported so a test or the dashboard can show why.
 * @param {Partial<InstantScan>|null|undefined} scan
 * @param {string} [pageText]
 * @returns {Record<PackId, number>}
 */
export function packScores(scan, pageText) {
  const s = scan || {};
  const fromText = pageText ? keywordHitsFromText(pageText) : {};
  const hit = (key) => Math.max(Number(s.keywordHits?.[key]) || 0, fromText[key] || 0);
  const bonus = (n) => (n > 0 ? 2 + (n >= 3 ? 1 : 0) : 0);
  const types = Array.isArray(s.schemaTypes) ? s.schemaTypes : [];
  const productSchema = s.productSchema === true || hasType(types, SHOP_TYPES);
  const cart = hit('cart');
  return {
    // Shop needs product signals: a product schema, an Add to cart / Buy now control, or prices written as text.
    shop: (productSchema ? 4 : 0) + (cart > 0 ? 3 + (cart >= 3 ? 1 : 0) : 0) + (s.priceAsText === true ? 1 : 0),
    saas: (hasType(types, SAAS_TYPES) ? 4 : 0) + bonus(hit('pricing')) + bonus(hit('signup')) + (hit('docs') > 0 ? 1 : 0),
    content: (hasType(types, CONTENT_TYPES) ? 4 : 0) + bonus(hit('article')) + (hit('newsletter') > 0 ? 1 : 0),
    local: (hasType(types, LOCAL_TYPES) ? 4 : 0) + (hit('hours') > 0 ? 2 : 0) + bonus(hit('booking')) + (hit('menu') > 0 ? 1 : 0),
  };
}

/**
 * Which pack fits this site? Highest score wins. Shop wins only through product signals (they are the only way to score
 * for it). No signals at all, or a tie: content, then saas, local, shop.
 * @param {Partial<InstantScan>|null|undefined} scan
 * @param {string} [pageText]  optional extra page text (for example from TinyFish Fetch)
 * @returns {PackId}
 */
export function detectPack(scan, pageText) {
  const scores = packScores(scan, pageText);
  const best = Math.max(...Object.values(scores));
  return /** @type {PackId} */ (TIE_ORDER.find((id) => scores[id] === best));
}

/** True when the scan carries any signal at all (a failed browser scan has none). */
export function hasPackSignals(scan, pageText) {
  return Math.max(...Object.values(packScores(scan, pageText))) > 0;
}

/**
 * The pack to use for "auto": detected from the scan; shop when the scan could not read the page (a failed scan says
 * nothing, and shop is what every earlier test used). `detected` tells whether the choice came from real signals.
 * @returns {{pack: PackId, detected: boolean}}
 */
export function autoPack(scan, pageText) {
  const browserRan = (scan?.totalButtonsAndLinks || 0) > 0 || (scan?.totalImages || 0) > 0 || (scan?.pageTextChars || 0) > 0 || !!pageText;
  if (!scan || !browserRan) return { pack: 'shop', detected: false };
  return { pack: detectPack(scan, pageText), detected: true };
}
