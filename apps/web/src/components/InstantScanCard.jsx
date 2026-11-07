import './InstantScanCard.css';

const FRAMEWORKS = { nextjs: 'Next.js', shopify: 'Shopify', unknown: 'Not detected' };

function Row({ label, value, tone }) {
  return (
    <li className="ar-scan-row">
      <span>{label}</span>
      <span className={`ar-scan-pill ar-scan-pill--${tone}`}>{value}</span>
    </li>
  );
}

const ratioTone = (bad, total) => (bad === 0 ? 'good' : total && bad / total > 0.2 ? 'bad' : 'warn');
const fileTone = (s) => (s === 'found' ? 'good' : s === 'missing' ? 'warn' : 'bad');
const fileText = (s) => (s === 'found' ? 'Found' : s === 'missing' ? 'Missing' : 'Could not check');

/**
 * Quick page audit card.
 * @param {{scan?: object|null, loading?: boolean}} props
 */
export default function InstantScanCard({ scan, loading }) {
  if (loading || !scan) {
    return (
      <section className="ar-scan" aria-busy="true" aria-label="Instant Scan">
        <h3 className="ar-scan-title">Scanning page…</h3>
        <div className="ar-scan-skel" /><div className="ar-scan-skel" /><div className="ar-scan-skel" />
      </section>
    );
  }
  const n = (v) => (Number.isFinite(v) ? v : 0);
  const textChars = n(scan.pageTextChars), unl = n(scan.unlabelledButtons), ctl = n(scan.totalButtonsAndLinks);
  const noAlt = n(scan.imagesWithoutAlt), imgs = n(scan.totalImages);
  // If the browser check could not open the page, every browser number is 0: say so instead of showing red "No".
  const browserRan = ctl > 0 || imgs > 0;
  const unknown = ['Could not check', 'info'];
  const yesNo = (ok, yes, no, badTone = 'bad') => (!browserRan ? unknown : ok ? [yes, 'good'] : [no, badTone]);
  const price = yesNo(scan.priceAsText, 'Yes', 'No');
  const popup = !browserRan ? unknown : scan.overlayCoveringPage ? ['Yes, blocks the page', 'bad'] : ['No', 'good'];
  const schema = yesNo(scan.productSchema, 'Found', 'Missing', 'warn');
  return (
    <section className="ar-scan" aria-label="Instant Scan">
      <h3 className="ar-scan-title">Instant Scan</h3>
      <ul className="ar-scan-list">
        <Row label="Page text" value={`${textChars} characters`} tone={textChars < 500 ? 'bad' : 'good'} />
        <Row label="Buttons and links without a name" value={browserRan ? `${unl} of ${ctl}` : unknown[0]} tone={browserRan ? ratioTone(unl, ctl) : 'info'} />
        <Row label="Images without alt text" value={browserRan ? `${noAlt} of ${imgs}` : unknown[0]} tone={browserRan ? ratioTone(noAlt, imgs) : 'info'} />
        <Row label="Price shown as text" value={price[0]} tone={price[1]} />
        <Row label="Pop-up covering the page" value={popup[0]} tone={popup[1]} />
        <Row label="Product data (schema.org)" value={schema[0]} tone={schema[1]} />
        <Row label="robots.txt" value={fileText(scan.robotsTxt)} tone={fileTone(scan.robotsTxt)} />
        <Row label="sitemap" value={fileText(scan.sitemap)} tone={fileTone(scan.sitemap)} />
        {/* Scan v2 fields; older reports have none, so the rows only show when the scan measured them. */}
        {Array.isArray(scan.aiBlockedAgents) && scan.robotsTxt === 'found' && (
          <Row label="AI agents allowed by robots.txt" value={scan.aiBlockedAgents.length ? `${scan.aiBlockedAgents.length} blocked` : 'All allowed'}
            tone={scan.aiBlockedAgents.some((a) => /-User$/.test(a)) ? 'bad' : scan.aiBlockedAgents.length ? 'warn' : 'good'} />
        )}
        {typeof scan.cartLink === 'boolean' && browserRan && (
          <Row label="Link to the cart" value={scan.cartLink ? 'Found' : 'Missing'} tone={scan.cartLink ? 'good' : 'warn'} />
        )}
        {scan.llmsTxt && <Row label="llms.txt" value={fileText(scan.llmsTxt)} tone={scan.llmsTxt === 'found' ? 'good' : 'info'} />}
        <Row label="Framework" value={FRAMEWORKS[scan.framework] || 'Not detected'} tone="info" />
      </ul>
      <div className="ar-scan-foot">Scanned in {n(scan.seconds)}s</div>
    </section>
  );
}
