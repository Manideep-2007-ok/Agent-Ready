// Demo store before/after (ARCHITECTURE.md section 14). The store reads ?flaws=on|off, so "Apply fixes" means:
// re-test the same store at ?flaws=off. The new report's URL keeps the old one (#/test/<new>/<before>) to compare.
import { useEffect, useState } from 'react';
import { getReport } from '../api.js';

/** @typedef {import('@agentready/engine/types').SiteReport} SiteReport */

export const FLAWS = 'a pop-up covering the page, prices shown only as images, an unlabelled cart button and a hidden returns page';

const sameHost = (a, b) => {
  try { return new URL(a).host === new URL(b).host; } catch { return false; }
};
const flawsOn = (url) => {
  try { return new URL(url).searchParams.get('flaws') === 'on'; } catch { return false; }
};

/**
 * @param {{report: SiteReport|null, beforeId?: string|null, demoStoreUrl: string|null, url: string,
 *   busy: boolean, onApplyFixes: () => void}} props
 * report: the finished report (null while running); url: the address being tested.
 */
export default function DemoStoreCard({ report, beforeId, demoStoreUrl, url, busy, onApplyFixes }) {
  const [before, setBefore] = useState(null);

  useEffect(() => {
    setBefore(null);
    if (beforeId) getReport(beforeId).then(setBefore).catch(() => setBefore(null));
  }, [beforeId]);

  if (!demoStoreUrl || !sameHost(url, demoStoreUrl)) return null;

  // After "Apply fixes": show the jump from the flawed run to this one.
  if (before) {
    const diff = report ? report.score - before.score : null;
    return (
      <section className="card demo-card">
        <div className="before-after">
          <a href={`#/test/${encodeURIComponent(before.id)}`} className="ba-box ba-before">
            <span className="muted">Before fixes</span>
            <b>{before.score}/100</b>
          </a>
          <span className="ba-arrow" aria-hidden="true">→</span>
          <div className="ba-box ba-after">
            <span className="muted">After fixes</span>
            <b>{report ? `${report.score}/100` : 'Testing…'}</b>
          </div>
          {diff !== null && (
            <span className={`chip ${diff > 0 ? 'band-pass' : 'band-warn'}`}>
              {diff > 0 ? `+${diff} points` : diff === 0 ? 'No change' : `${diff} points`}
            </span>
          )}
        </div>
      </section>
    );
  }

  // A finished run on the flawed store: offer the one-click fix.
  if (report && flawsOn(report.url)) {
    return (
      <section className="card demo-card">
        <p>
          This is our demo store with four flaws switched on: {FLAWS}. Switch them off to see what fixing them does to
          the score.
        </p>
        <button type="button" onClick={onApplyFixes} disabled={busy}>
          {busy ? 'Starting…' : 'Apply fixes and re-test'}
        </button>
      </section>
    );
  }
  return null;
}
