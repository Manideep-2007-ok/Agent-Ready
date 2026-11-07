// The 404 page: an address nobody knows (#/foo, #/app/nope). The address stays as typed, so it can be checked or
// corrected; the page says so in plain words and offers the likely next pages. Used by the site and the app shells.
import { useEffect } from 'react';
import { Button } from '../design/index.js';
import { href } from '../routes.js';

const PLACES = {
  site: [
    ['Home', href('site', 'landing'), 'What AgentReady does and a box to test a site'],
    ['Run a test', href('app', 'tests'), 'Start a test or open a recent one'],
    ['Docs', href('docs', 'getting-started'), 'Getting started, the CLI, findings and more'],
    ['Pricing', href('site', 'pricing'), 'Free while in beta'],
  ],
  app: [
    ['Tests', href('app', 'tests'), 'Start a test or open a recent one'],
    ['Watch', href('app', 'watch'), 'Scheduled re-tests and alerts'],
    ['Docs', href('docs', 'getting-started'), 'How every page of the app works'],
  ],
};

/** @param {{area?:'site'|'app'}} props */
export default function NotFound({ area = 'site' }) {
  useEffect(() => {
    document.title = 'Page not found · AgentReady';
    return () => { document.title = 'AgentReady'; };
  }, []);
  const address = decodeSafe(window.location.hash || '#/');
  const [main, ...rest] = PLACES[area];
  return (
    <section className="ar-notfound" aria-labelledby="notfound-title">
      <span className="ar-label ar-eyebrow">404 · Page not found</span>
      <h1 id="notfound-title">This page does not exist.</h1>
      <p className="ar-notfound-lead">
        Nothing lives at <code className="ar-notfound-address">{address}</code>. The link may be old or mistyped.
      </p>
      <Button as="a" href={main[1]} variant="primary">{area === 'app' ? 'Back to tests' : 'Go to the home page'}</Button>
      <ol className="ar-notfound-places" aria-label="Pages you may want">
        {[main, ...rest].map(([name, to, note], i) => (
          <li key={name}>
            <span className="ar-notfound-no" aria-hidden="true">{String(i + 1).padStart(2, '0')}</span>
            <a href={to}>{name}</a>
            <span className="ar-notfound-note">{note}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function decodeSafe(s) { try { return decodeURIComponent(s); } catch { return s; } }
