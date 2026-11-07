// Replay mode (TINYFISH_MOCK=1, e.g. the public demo copy) can only replay runs we recorded. For any other site it
// would show a recording of a different site under the new name, so those are refused with a plain explanation.
import { config } from './config.js';
import { SHOP_TASKS, defaultTasksFor, normalisePack } from '@agentready/engine/goals';

// Exact domains (and their subdomains): a look-alike such as nykaa.evil.example or evil-nykaa.com must not get Nykaa's recording.
const RECORDED = ['nykaa.com', 'myntra.com', 'swiggy.com'];

export function hasRecording(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  let demoHost = '';
  try { demoHost = config.demoStoreUrl ? new URL(config.demoStoreUrl).hostname : ''; } catch { /* none */ }
  return RECORDED.some((d) => host === d || host.endsWith(`.${d}`)) || host === demoHost || host === 'agent-ready-demo.vercel.app'
    || host === 'example.com' || host === 'www.example.com' || host === 'localhost' || host === '127.0.0.1';
}

export const REPLAY_ONLY_MESSAGE =
  'This public demo replays real agent runs we recorded, so it can show our demo store, nykaa.com, myntra.com and ' +
  'swiggy.com. Testing any other site needs live agents: that runs from our laptop (or your own copy with a TinyFish key).';

/** Throws a 400 in replay mode for sites with no recording. */
export function assertReplayable(url) {
  if (config.mock && !hasRecording(url)) throw Object.assign(new Error(REPLAY_ONLY_MESSAGE), { status: 400 });
}

/**
 * Replay mode + our demo store: open the REAL recorded reports (flaws on 91, flaws off 97) instead of replaying an
 * unrelated clean run, which showed the flawed store as 100/100. Returns a cached report id, or null.
 */
export function recordedDemoReport(url) {
  if (!config.mock) return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  let demoHost = 'agent-ready-demo.vercel.app';
  try { if (config.demoStoreUrl) demoHost = new URL(config.demoStoreUrl).hostname; } catch { /* keep default */ }
  if (u.hostname !== demoHost && u.hostname !== 'agent-ready-demo.vercel.app') return null;
  return u.searchParams.get('flaws') === 'off' ? 'rep_demo_flaws_off' : 'rep_demo_flaws_on';
}

export const REPLAY_PACK_MESSAGE =
  'This public demo replays real agent runs we recorded, and we only recorded the online-store tasks (find a price, add to cart, ' +
  'find the return policy, find support). Tasks for SaaS, blog and local-business sites need live agents: run them from our ' +
  'laptop, or from your own copy with a TinyFish key.';

/**
 * Throws a 400 in replay mode when the request asks for tasks from a pack other than shop (there is nothing to replay).
 * 'auto' is fine: in replay mode it always means shop.
 * @param {string|undefined} pack  'auto', a pack id or undefined
 * @param {string[]|undefined} tasks
 */
export function assertReplayPack(pack, tasks) {
  if (!config.mock) return;
  const wanted = tasks?.length ? tasks : pack && pack !== 'auto' ? defaultTasksFor(normalisePack(pack)) : [];
  if (wanted.some((t) => t !== 'custom' && !SHOP_TASKS.includes(t))) throw Object.assign(new Error(REPLAY_PACK_MESSAGE), { status: 400 });
}
