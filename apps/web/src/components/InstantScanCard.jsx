// Instant Scan results as a ledger: what was measured, the value, and a badge saying whether it helps or hurts agents.
// Older reports lack the Scan v2 fields, so those rows only show when the scan measured them.
import { Badge, Ledger, Panel, Skeleton } from '../design/index.js';

const FRAMEWORKS = { nextjs: 'Next.js', shopify: 'Shopify', unknown: 'Not detected' };
const TONE_WORD = { good: ['pass', 'OK'], warn: ['warn', 'Check'], bad: ['fail', 'Problem'], info: ['neutral', 'Info'] };
const ratioTone = (bad, total) => (bad === 0 ? 'good' : total && bad / total > 0.2 ? 'bad' : 'warn');
const fileTone = (s) => (s === 'found' ? 'good' : s === 'missing' ? 'warn' : 'bad');
const fileText = (s) => (s === 'found' ? 'Found' : s === 'missing' ? 'Missing' : 'Could not check');

/** Rows [label, value, tone]. Pure, so it is easy to read and test. */
export function scanRows(scan) {
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const ctl = n(scan.totalButtonsAndLinks), imgs = n(scan.totalImages);
  const browserRan = ctl > 0 || imgs > 0;
  const unknown = ['Could not check', 'info'];
  const yesNo = (ok, yes, no, badTone = 'bad') => (!browserRan ? unknown : ok ? [yes, 'good'] : [no, badTone]);
  const rows = [
    ['Page text', `${n(scan.pageTextChars)} characters`, n(scan.pageTextChars) < 500 ? 'bad' : 'good'],
    ['Buttons and links without a name', ...(browserRan ? [`${n(scan.unlabelledButtons)} of ${ctl}`, ratioTone(n(scan.unlabelledButtons), ctl)] : unknown)],
    ['Images without alt text', ...(browserRan ? [`${n(scan.imagesWithoutAlt)} of ${imgs}`, ratioTone(n(scan.imagesWithoutAlt), imgs)] : unknown)],
    ['Price shown as text', ...yesNo(scan.priceAsText, 'Yes', 'No')],
    ['Pop-up covering the page', ...(!browserRan ? unknown : scan.overlayCoveringPage ? ['Yes, blocks the page', 'bad'] : ['No', 'good'])],
    ['Product data (schema.org)', ...yesNo(scan.productSchema, 'Found', 'Missing', 'warn')],
    ['robots.txt', fileText(scan.robotsTxt), fileTone(scan.robotsTxt)],
    ['sitemap', fileText(scan.sitemap), fileTone(scan.sitemap)],
  ];
  if (Array.isArray(scan.aiBlockedAgents) && scan.robotsTxt === 'found') {
    const b = scan.aiBlockedAgents;
    rows.push(['AI agents allowed by robots.txt', b.length ? `${b.length} blocked: ${b.join(', ')}` : 'All allowed', b.some((a) => /-User$/.test(a)) ? 'bad' : b.length ? 'warn' : 'good']);
  }
  if (typeof scan.cartLink === 'boolean' && browserRan) rows.push(['Link to the cart', scan.cartLink ? 'Found' : 'Missing', scan.cartLink ? 'good' : 'warn']);
  if (scan.llmsTxt) rows.push(['llms.txt', fileText(scan.llmsTxt), scan.llmsTxt === 'found' ? 'good' : 'info']);
  rows.push(['Framework', FRAMEWORKS[scan.framework] || 'Not detected', 'info']);
  return rows;
}

/** @param {{scan?: object|null, loading?: boolean}} props */
export default function InstantScanCard({ scan, loading }) {
  if (loading || !scan) return <Panel label="Instant Scan"><Skeleton rows={4} label="Scanning the page" /></Panel>;
  return (
    <Panel label="Instant Scan" actions={<span className="ar-mono ar-faint">Scanned in {Number(scan.seconds) || 0}s</span>} className="ar-scan-ledger">
      <Ledger
        caption="Instant Scan"
        columns={[{ key: 'what', label: 'Check' }, { key: 'value', label: 'Result' }, { key: 'tone', label: '', align: 'right' }]}
        rows={scanRows(scan).map(([what, value, tone], i) => ({
          id: `S${i + 1}`,
          cells: { what, value, tone: <Badge tone={TONE_WORD[tone][0]}>{TONE_WORD[tone][1]}</Badge> },
        }))}
      />
    </Panel>
  );
}
