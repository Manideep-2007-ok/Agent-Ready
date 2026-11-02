// Why is a lane "Waiting for an agent"? Pure function over GET /api/health's `queue`, so it can be unit-tested.
// Only 2 agents run at a time (the TinyFish account limit), so a lane waits while other runs hold the slots.

/**
 * @param {{maxParallel:number, running:number, groups?:Record<string,{source:string, running:number, queued:number}>}|null|undefined} queue
 * @param {string|null} reportId  the test this lane belongs to
 * @returns {string} plain-language reason, or '' when there is nothing useful to say
 */
export function queueReason(queue, reportId) {
  if (!queue || !(queue.running >= queue.maxParallel)) return '';
  const groups = queue.groups ?? {};
  let others = 0;
  let watch = 0;
  for (const [id, g] of Object.entries(groups)) {
    if (id === reportId || !g.running) continue;
    others += g.running;
    if (g.source === 'watch') watch += g.running;
  }
  if (others === 0) return `All ${queue.maxParallel} agents are busy with this test. The next task starts when one finishes.`;
  const busy = `${others} ${others === 1 ? 'agent' : 'agents'} busy`;
  return watch > 0 ? `${busy}: a Watch check is running` : `${busy}: another test is running`;
}
