// The landing hero's product panel: a looping replay of our demo store's two real runs (flaws on, then flaws off).
// The address types in, agents run two at a time with their steps ticking up, then the score counts up and holds.
// Frames come from heroFrame (pure, tested). The loop pauses off screen; with reduced motion it shows the finished run.
import { useEffect, useRef, useState } from 'react';
import { Badge } from '../../design/index.js';
import { SCENARIOS, TIMING, finalFrame, heroFrame } from './heroDemo.js';
import { useInView, useReducedMotion } from './motion.jsx';

const BADGE = { waiting: ['wait', 'Waiting'], running: ['accent', 'Running'], passed: ['pass', 'Passed'] };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function HeroLedger() {
  const reduce = useReducedMotion();
  const [ref, inView] = useInView({ amount: 0.3 });
  const [f, setF] = useState(() => (reduce ? finalFrame(0) : heroFrame(0, 0)));
  const [fading, setFading] = useState(false);
  const idx = useRef(0);
  const at = useRef(0);
  const [restart, setRestart] = useState(0);

  useEffect(() => {
    if (reduce) { setF(finalFrame(idx.current)); setFading(false); return undefined; }
    if (!inView) return undefined;
    let raf = 0;
    let start = performance.now() - at.current;
    let last = null;
    const tick = (now) => {
      let t = now - start;
      if (t >= TIMING.end) { idx.current = (idx.current + 1) % SCENARIOS.length; start = now; t = 0; }
      at.current = t;
      const next = heroFrame(idx.current, t);
      if (!last || !same(next, last)) { last = next; setF(next); }
      setFading(t >= TIMING.end - 350);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, inView, restart]);

  const pick = (i) => {
    idx.current = i; at.current = 0;
    if (reduce) setF(finalFrame(i)); else { setF(heroFrame(i, 0)); setRestart((r) => r + 1); }
  };

  const sc = SCENARIOS[f.idx];
  const total = f.rows.reduce((a, r) => a + r.steps, 0);
  const typing = !reduce && f.typed < sc.url.length;
  return (
    <div ref={ref} className="ar-hero-ledger" role="group" aria-label="Animated example: our demo store tested with its flaws on, then off">
      <p className="sr-only">Our demo store with four flaws on scored 91 in 35 agent steps for ₹49; with the flaws fixed it scored 97 in 19 steps for ₹27.</p>
      <div className="ar-hero-ledger-head">
        <div className="ar-hero-tabs" role="group" aria-label="Example run">
          {SCENARIOS.map((s, i) => (
            <button key={s.tab} type="button" aria-pressed={f.idx === i} className="ar-hero-tab" onClick={() => pick(i)}>{s.tab}</button>
          ))}
        </div>
        <span className="ar-label">Example · 1 Nov 2026</span>
      </div>
      <div className={`ar-hero-body${fading ? ' is-fading' : ''}`} aria-hidden="true">
        <div className="ar-hero-url ar-mono">
          <span className="ar-faint">https://</span>{sc.url.slice(0, f.typed)}{typing && <span className="ar-caret" />}
        </div>
        <table>
          <thead><tr><th>ID</th><th>Task</th><th className="is-right">Steps</th><th className="is-right">Result</th></tr></thead>
          <tbody>
            {f.rows.map((r) => {
              const [tone, word] = BADGE[r.state];
              return (
                <tr key={r.id} className={`is-${r.state}`}>
                  <td className="ar-mono ar-faint">{r.id}</td>
                  <td>{r.task}{r.state === 'passed' && <span className="ar-mono ar-faint"> · {r.secs}s</span>}</td>
                  <td className="is-right ar-mono">{r.state === 'waiting' ? '' : r.steps}</td>
                  <td className="is-right"><Badge tone={tone}>{word}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className={`ar-hero-ledger-foot${f.score != null ? ' is-in' : ''}`}>
          <span className="ar-label">Score</span>
          <span className="ar-hero-score">{f.score ?? '··'}<span>/100</span></span>
          {f.verdict && <Badge tone={sc.band[0]}>{sc.band[1]}</Badge>}
          <span className="ar-mono ar-faint ar-hero-cost">{total} steps{f.verdict ? ` · ₹${sc.cost}` : ''}</span>
        </div>
        <p className="ar-hero-note ar-small ar-faint">{sc.note}</p>
      </div>
    </div>
  );
}
