// Leaderboard: recorded snapshot reports ranked by score. Every row opens its full report (#/app/test/<id>).
import { useEffect, useState } from 'react';
import { getLeaderboard } from '../../api.js';
import { href } from '../../routes.js';
import { Badge, EmptyState, Panel, Skeleton, scoreBand } from '../../design/index.js';

const WALL = {
  none: 'Open to AI agents',
  'blocks-cloud-agents': 'Blocks cloud AI agents',
  'blocks-automation': 'Blocks automated browsers',
  'site-broken': 'Agents could not use it',
};
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
      <p className="ar-muted ar-flush">Real agents tried everyday shopping tasks on these sites. Higher is easier for AI shoppers. These are saved snapshots, tested on the date shown.</p>
      {error && <p className="ar-error" role="alert">{error}</p>}
      {!error && rows === null && <Panel><Skeleton rows={4} label="Loading the leaderboard" /></Panel>}
      {!error && rows && rows.length === 0 && (
        <Panel><EmptyState title="No saved results yet" body="Test a site to see how it compares." /></Panel>
      )}
      {!error && rows && rows.length > 0 && (
        <ol className="lb-list ar-panel" aria-label="Sites ranked by score">
          {rows.map((r, i) => {
            const b = scoreBand(r.score);
            const host = hostOf(r.url);
            return (
              <li key={r.id} className="lb-row">
                <span className="lb-rank" aria-label={`Rank ${i + 1}`}>{i + 1}</span>
                <div className="lb-site">
                  <b>{host}</b>
                  <span className="ar-mono ar-faint">Tested {dateOf(r.testedAt)}</span>
                </div>
                <div className="lb-score">
                  <span className="lb-num">{r.score}</span><Badge tone={b.tone}>{b.label}</Badge>
                </div>
                <div className={`lb-wall${r.botWall && r.botWall !== 'none' ? ' lb-wall-bad' : ''}`}>{WALL[r.botWall] ?? WALL.none}</div>
                <a className="lb-open" href={href('app', 'test', r.id)} aria-label={`View report for ${host}`}>View report</a>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
