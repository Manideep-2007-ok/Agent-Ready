// The landing hero's product panel: our demo store's real fixed run (1 Nov 2026, rep_demo_flaws_off) filling in row
// by row, then the score. Recorded data, no network. With reduced motion everything shows at once.
import { useEffect, useState } from 'react';
import { Badge } from '../../design/index.js';

const ROWS = [
  { id: 'T1', task: 'Find a product and its price', steps: 4, secs: 22 },
  { id: 'T2', task: 'Add to cart and read the total', steps: 7, secs: 22 },
  { id: 'T3', task: 'Find the return policy', steps: 5, secs: 16 },
  { id: 'T4', task: 'Find customer support', steps: 3, secs: 21 },
];
const calm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function HeroLedger() {
  const [shown, setShown] = useState(() => (calm() ? ROWS.length + 1 : 0));
  useEffect(() => {
    if (shown > ROWS.length) return undefined;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 500 : 650);
    return () => clearTimeout(t);
  }, [shown]);
  return (
    <div className="ar-hero-ledger" aria-label="Example result: our demo store, four tasks passed, score 97">
      <div className="ar-hero-ledger-head">
        <span className="ar-label">Report · agent-ready-demo.vercel.app</span>
        <span className="ar-label">Example</span>
      </div>
      <table>
        <thead><tr><th>ID</th><th>Task</th><th className="is-right">Steps</th><th className="is-right">Result</th></tr></thead>
        <tbody>
          {ROWS.map((r, i) => (
            <tr key={r.id} className={i < shown ? 'is-in' : ''}>
              <td className="ar-mono ar-faint">{r.id}</td>
              <td>{r.task}<span className="ar-mono ar-faint"> · {r.secs}s</span></td>
              <td className="is-right ar-mono">{i < shown ? r.steps : ''}</td>
              <td className="is-right">{i < shown ? <Badge tone="pass">Passed</Badge> : i === shown ? <Badge tone="accent">Running</Badge> : <Badge tone="wait">Waiting</Badge>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`ar-hero-ledger-foot${shown > ROWS.length ? ' is-in' : ''}`}>
        <span className="ar-label">Score</span>
        <span className="ar-hero-score">{shown > ROWS.length ? 97 : '··'}<span>/100</span></span>
        {shown > ROWS.length && <Badge tone="pass">Ready for AI agents</Badge>}
        <span className="ar-mono ar-faint ar-hero-cost">19 steps · ₹27</span>
      </div>
    </div>
  );
}
