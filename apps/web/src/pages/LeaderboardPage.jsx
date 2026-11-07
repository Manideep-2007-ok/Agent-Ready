// Leaderboard: recorded snapshot reports ranked by score. Every row opens its full report (#/test/<id>).
import { useEffect, useState } from 'react';
import { getLeaderboard } from '../api.js';

const WALL = {
  none: 'Open to AI agents',
  'blocks-cloud-agents': 'Blocks cloud AI agents',
  'blocks-automation': 'Blocks automated browsers',
  'site-broken': 'Agents could not use it',
};
/** Score bands with text, never colour alone (same bands as the score card). */
const band = (s) => (s >= 80 ? { cls: 'pass', label: 'Ready' } : s >= 50 ? { cls: 'warn', label: 'Partly ready' } : { cls: 'fail', label: 'Not ready' });
const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };
const dateOf = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { getLeaderboard().then(setRows).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <section className="card">
        <h2>Leaderboard</h2>
        <p className="muted">Real agents tried everyday shopping tasks on these sites. Higher is easier for AI shoppers. These are saved snapshots, tested on the date shown.</p>
      </section>
      {error && <section className="card error" role="alert">{error}</section>}
      {!error && rows === null && <section className="card muted" role="status">Loading the leaderboard…</section>}
      {!error && rows && rows.length === 0 && (
        <section className="card muted" role="status">No saved results yet. Test a site to see how it compares.</section>
      )}
      {!error && rows && rows.length > 0 && (
        <ol className="lb-list" aria-label="Sites ranked by score">
          {rows.map((r, i) => {
            const b = band(r.score);
            const host = hostOf(r.url);
            return (
              <li key={r.id} className="card lb-row">
                <span className="lb-rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
                <div className="lb-site">
                  <b>{host}</b>
                  <span className="muted">Tested {dateOf(r.testedAt)}</span>
                </div>
                <div className="lb-score">
                  <span className={`chip band-${b.cls}`}>{r.score}/100 · {b.label}</span>
                </div>
                <div className={`lb-wall${r.botWall && r.botWall !== 'none' ? ' lb-wall-bad' : ''}`}>{WALL[r.botWall] ?? WALL.none}</div>
                <a className="lb-open" href={`#/app/test/${encodeURIComponent(r.id)}`} aria-label={`View report for ${host}`}>View report</a>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
