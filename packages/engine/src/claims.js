// Claim checks (P2-2, D42): a passed task's answer names a page ("the policy is at <url>, 30 days"). We read that page with
// TinyFish Fetch (free) and look for the facts the agent reported. Only what the agent itself said is checked, and a
// claim that cannot be checked stays "unchecked": it is never counted against the site. Findings only, never points.
import { fetchPages } from './tinyfish.js';
import { config } from './config.js';

/** @typedef {import('./types.js').TaskResult} TaskResult */
/** @typedef {import('./types.js').ClaimCheck} ClaimCheck */

const URL_RE = /https?:\/\/[^\s"'<>)\]}]+/gi;
const CHECK_BUDGET_MS = 20_000;

/** Every http(s) address in the text, trailing punctuation removed. */
export function extractUrls(text) {
  return [...String(text || '').matchAll(URL_RE)].map((m) => m[0].replace(/[.,;:!?]+$/, ''));
}

const sameSite = (a, b) => {
  try {
    const h = (u) => new URL(u).hostname.replace(/^www\./, '').toLowerCase();
    const x = h(a), y = h(b);
    return x === y || x.endsWith('.' + y) || y.endsWith('.' + x);
  } catch { return false; }
};

const digits = (s) => s.replace(/[^\d]/g, '');

/**
 * Facts in the agent's answer that a page should show as text, per task. Conservative: only facts with a clear shape.
 * @returns {{label:string, test:(pageText:string)=>boolean}[]}
 */
export function claimFacts(taskId, answer) {
  const a = String(answer || '');
  const facts = [];
  if (taskId === 'find_returns') {
    const m = a.match(/\b(\d{1,3})\s*(?:-\s*)?(?:days?|day)\b/i);
    if (m) facts.push({ label: `${m[1]} days`, test: (t) => new RegExp(`\\b${m[1]}\\s*(?:-\\s*)?(?:days?|working days|business days)\\b`, 'i').test(t) });
  }
  if (taskId === 'find_price' || taskId === 'add_to_cart' || taskId === 'find_pricing_plans' || taskId === 'find_menu_or_services') {
    // ₹1,299 / Rs. 499 / $49 / 499 INR: compared as digits so "1,299" matches "1299".
    const m = a.match(/(?:₹|Rs\.?|INR|\$|USD)\s?(\d[\d,]*(?:\.\d{1,2})?)|(\d[\d,]*(?:\.\d{1,2})?)\s?(?:INR|USD|rupees)/i);
    const n = m && (m[1] || m[2]);
    if (n && digits(n).length >= 2) {
      const want = digits(n.replace(/\.00$/, ''));
      facts.push({ label: `price ${n}`, test: (t) => (t.match(/\d[\d,]*(?:\.\d{1,2})?/g) || []).some((x) => digits(x.replace(/\.00$/, '')) === want) });
    }
  }
  if (['find_contact', 'contact_sales', 'find_author_contact'].includes(taskId)) {
    const email = a.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
    if (email) facts.push({ label: email[0], test: (t) => t.toLowerCase().includes(email[0].toLowerCase()) });
    const phone = a.match(/(?:\+?\d[\d\s-]{8,}\d)/);
    if (phone && digits(phone[0]).length >= 8) {
      const tail = digits(phone[0]).slice(-8); // country codes and spacing differ between answer and page
      facts.push({ label: phone[0].trim(), test: (t) => digits(t).includes(tail) });
    }
  }
  return facts;
}

/** Tasks whose answer can name a page with checkable facts. */
const CHECKED = new Set(['find_returns', 'find_price', 'add_to_cart', 'find_contact', 'contact_sales', 'find_author_contact', 'find_pricing_plans', 'find_menu_or_services']);

/**
 * What to check for one task, or null. Pure (no I/O).
 * @returns {{url:string|null, offSite:boolean, facts:ReturnType<typeof claimFacts>}|null}
 */
export function planClaimCheck(task, siteUrl) {
  if (task.status !== 'passed' || !CHECKED.has(task.taskId) || !task.answer) return null;
  const urls = extractUrls(task.answer);
  const facts = claimFacts(task.taskId, task.answer);
  const own = urls.find((u) => sameSite(u, siteUrl)) ?? null;
  if (!own && urls.length) return { url: urls[0], offSite: true, facts };
  if (!own || !facts.length) return null;
  return { url: own, offSite: false, facts };
}

/**
 * Check every passed task's claims. Writes `task.claim` (ClaimCheck). Never throws, bounded to 20 s.
 * Replay mode skips it: the recordings are of real sites whose pages have changed since.
 * @param {TaskResult[]} tasks
 * @param {string} siteUrl
 */
export async function checkClaims(tasks, siteUrl) {
  if (config.mock) return;
  const plans = tasks.map((t) => [t, planClaimCheck(t, siteUrl)]).filter(([, p]) => p);
  for (const [t, p] of plans) if (p.offSite) t.claim = { status: 'off-site', url: p.url, facts: [] };
  const toFetch = plans.filter(([, p]) => !p.offSite);
  if (!toFetch.length) return;
  let pages;
  try {
    let timer;
    pages = await Promise.race([
      fetchPages([...new Set(toFetch.map(([, p]) => p.url))]),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), CHECK_BUDGET_MS); timer.unref?.(); }),
    ]).finally(() => clearTimeout(timer));
  } catch { return; } // no page text, no verdict: unchecked
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  for (const [t, p] of toFetch) {
    const page = byUrl.get(p.url);
    if (!page || page.error || !(page.text || '').trim()) continue; // unreadable: unchecked, not a failure
    const facts = p.facts.map((f) => ({ label: f.label, found: f.test(page.text) }));
    t.claim = { status: facts.every((f) => f.found) ? 'confirmed' : 'not-found', url: p.url, facts };
  }
}
