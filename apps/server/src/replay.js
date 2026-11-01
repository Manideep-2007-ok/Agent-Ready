// Replay mode (TINYFISH_MOCK=1, e.g. the public demo copy) can only replay runs we recorded. For any other site it
// would show a recording of a different site under the new name, so those are refused with a plain explanation.
import { config } from './config.js';

const RECORDED = ['nykaa', 'myntra', 'swiggy'];

export function hasRecording(url) {
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch { return false; }
  let demoHost = '';
  try { demoHost = config.demoStoreUrl ? new URL(config.demoStoreUrl).hostname : ''; } catch { /* none */ }
  return RECORDED.some((name) => host.includes(name)) || host === demoHost || host === 'agent-ready-demo.vercel.app'
    || host === 'example.com' || host === 'www.example.com' || host === 'localhost' || host === '127.0.0.1';
}

export const REPLAY_ONLY_MESSAGE =
  'This public demo replays real agent runs we recorded, so it can show our demo store, nykaa.com, myntra.com and ' +
  'swiggy.com. Testing any other site needs live agents: that runs from our laptop (or your own copy with a TinyFish key).';

/** Throws a 400 in replay mode for sites with no recording. */
export function assertReplayable(url) {
  if (config.mock && !hasRecording(url)) throw Object.assign(new Error(REPLAY_ONLY_MESSAGE), { status: 400 });
}
