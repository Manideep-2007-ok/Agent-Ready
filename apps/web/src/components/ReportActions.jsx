// What to do with a finished report: get the Detailed Fix Report (P3-2), copy a link to share it, or save it as a PDF
// (P3-3, the browser's print dialog with a print layout: no forms, no live views, every finding open).
import { useState } from 'react';
import { buildFixes } from '../api.js';

/**
 * @param {{report: import('@agentready/engine/types').SiteReport, onEnriched: (r:object)=>void}} props
 * onEnriched receives the report with the Detailed Fix Report written into its findings.
 */
export default function ReportActions({ report, onEnriched }) {
  const [state, setState] = useState('idle'); // idle | building | done | error
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const enriched = report.tasks.some((t) => (t.findings ?? []).some((f) => f.frameworkExample || f.element));

  const getFixes = async () => {
    setState('building');
    setError('');
    try {
      onEnriched(await buildFixes(report.id));
      setState('done');
    } catch (e) {
      setError(e.message);
      setState('error');
    }
  };
  const copy = async () => {
    const link = `${location.origin}${location.pathname}#/test/${encodeURIComponent(report.id)}`;
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt('Copy this link:', link); }
  };

  return (
    <section className="card report-actions no-print" aria-label="Report actions">
      <div>
        <h2>Share and fix</h2>
        <p className="muted">
          {enriched || state === 'done'
            ? 'The fix report is ready: each finding below now shows the page element, a code example for this site\'s framework and how to check the fix.'
            : 'The Detailed Fix Report opens the page where each agent got stuck, finds the element at fault and writes a fix for your framework.'}
        </p>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
      <div className="report-actions-buttons">
        <button type="button" onClick={getFixes} disabled={state === 'building'}>
          {state === 'building' ? 'Writing the fix report…' : enriched || state === 'done' ? 'Rebuild fix report' : 'Get detailed fix report'}
        </button>
        <button type="button" className="secondary" onClick={copy}>{copied ? 'Link copied' : 'Copy link'}</button>
        <button type="button" className="secondary" onClick={() => window.print()}>Save as PDF</button>
      </div>
    </section>
  );
}
