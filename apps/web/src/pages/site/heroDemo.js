// The landing hero's demo as a pure function of time: heroFrame(scenario, ms) -> what the panel shows at that moment.
// Both scenarios are our demo store's real runs on 1 Nov 2026 (rep_demo_flaws_on, rep_demo_flaws_off): same tasks,
// recorded steps, score and cost. Agents run two at a time, as on our TinyFish account (D9). No randomness, so the
// loop is the same every time and reduced motion can jump to the last frame.

export const SCENARIOS = [
  {
    tab: 'Flaws on', url: 'agent-ready-demo.vercel.app/?flaws=on', score: 91, cost: 49, band: ['pass', 'Ready for AI agents'],
    note: 'Pop-up, prices as images, icon-only cart, buried returns page',
    rows: [
      { id: 'T1', task: 'Find a product and its price', steps: 5, secs: 21 },
      { id: 'T2', task: 'Add to cart and read the total', steps: 17, secs: 75 },
      { id: 'T3', task: 'Find the return policy', steps: 10, secs: 37 },
      { id: 'T4', task: 'Find customer support', steps: 3, secs: 8 },
    ],
  },
  {
    tab: 'Flaws off', url: 'agent-ready-demo.vercel.app/?flaws=off', score: 97, cost: 27, band: ['pass', 'Ready for AI agents'],
    note: 'The same store with the four flaws fixed',
    rows: [
      { id: 'T1', task: 'Find a product and its price', steps: 4, secs: 22 },
      { id: 'T2', task: 'Add to cart and read the total', steps: 7, secs: 22 },
      { id: 'T3', task: 'Find the return policy', steps: 5, secs: 16 },
      { id: 'T4', task: 'Find customer support', steps: 3, secs: 21 },
    ],
  },
];

const PER_STEP = 110; // ms of demo time per agent step
export const TIMING = { typeStart: 200, typeDur: 900, runStart: 1300, scoreAt: 3700, scoreDur: 700, end: 7600 };

/** When each task starts and ends: two slots, the next waiting task takes the first slot that frees up. */
function schedule(rows) {
  const slots = [TIMING.runStart, TIMING.runStart];
  return rows.map((r) => {
    const i = slots[0] <= slots[1] ? 0 : 1;
    const start = slots[i];
    const end = start + r.steps * PER_STEP;
    slots[i] = end;
    return { start, end };
  });
}
const PLANS = SCENARIOS.map((s) => schedule(s.rows));

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** @returns {{idx:number, typed:number, rows:{id:string,task:string,secs:number,steps:number,state:'waiting'|'running'|'passed'}[], score:number|null, verdict:boolean}} */
export function heroFrame(idx, t) {
  const s = SCENARIOS[idx];
  const typed = clamp(Math.floor(((t - TIMING.typeStart) / TIMING.typeDur) * s.url.length), 0, s.url.length);
  const rows = s.rows.map((r, i) => {
    const { start, end } = PLANS[idx][i];
    if (t < start) return { id: r.id, task: r.task, secs: r.secs, steps: 0, state: 'waiting' };
    if (t >= end) return { id: r.id, task: r.task, secs: r.secs, steps: r.steps, state: 'passed' };
    return { id: r.id, task: r.task, secs: r.secs, steps: Math.floor(((t - start) / (end - start)) * r.steps), state: 'running' };
  });
  let score = null;
  if (t >= TIMING.scoreAt) {
    const p = Math.min(1, (t - TIMING.scoreAt) / TIMING.scoreDur);
    score = Math.round(s.score * (1 - (1 - p) ** 3));
  }
  return { idx, typed, rows, score, verdict: t >= TIMING.scoreAt + TIMING.scoreDur };
}

/** The finished run: what reduced motion shows, and where each loop holds before the next scenario. */
export const finalFrame = (idx) => heroFrame(idx, TIMING.end - 1);
