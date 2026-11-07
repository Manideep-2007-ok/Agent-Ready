// Shell for the public site and the docs: top bar (logo, Product, Pricing, Docs, GitHub, Open app, Run a free test)
// and a footer. Under 760 px the links fold into a menu.
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Button, Logo, ThemeToggle } from '../design/index.js';
import { href } from '../routes.js';

const GITHUB = 'https://github.com/Manideep-2007-ok/Agent-Ready';

/** On the landing page, jump to the hero URL box; elsewhere, go to the landing page (which focuses it). */
function runFreeTest(e) {
  const box = document.getElementById('hero-url');
  if (!box) return; // the link goes to #/
  e.preventDefault();
  box.scrollIntoView({ block: 'center' });
  box.focus();
}

/** @param {{active?:'product'|'pricing'|'docs', children:any, wide?:boolean}} props */
export default function SiteShell({ active, children }) {
  const [open, setOpen] = useState(false);
  const link = (key, to, label) => (
    <a href={to} className="ar-site-link" aria-current={active === key ? 'page' : undefined} onClick={() => setOpen(false)}>{label}</a>
  );
  return (
    <div className="ar-site">
      <header className="ar-site-bar">
        <div className="ar-site-bar-inner">
          <Logo size={24} href={href('site', 'landing')} />
          <nav aria-label="Site" className={`ar-site-nav${open ? ' is-open' : ''}`}>
            {link('product', href('site', 'landing'), 'Product')}
            {link('pricing', href('site', 'pricing'), 'Pricing')}
            {link('docs', href('docs', 'getting-started'), 'Docs')}
            <a href={GITHUB} className="ar-site-link" target="_blank" rel="noreferrer">GitHub</a>
          </nav>
          <div className="ar-site-actions">
            <ThemeToggle className="theme-toggle" />
            <Button as="a" href={href('app', 'tests')} size="sm" className="hide-phone">Open app</Button>
            <Button as="a" href={href('site', 'landing')} variant="primary" size="sm" onClick={runFreeTest}>Run a free test</Button>
            <button type="button" className="ar-btn ar-btn--ghost ar-btn--sm ar-icon-btn ar-site-menu" aria-expanded={open}
              aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((v) => !v)}>
              {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </header>
      <main className="ar-site-main">{children}</main>
      <footer className="ar-site-foot">
        <div className="ar-site-foot-inner">
          <div className="ar-site-foot-brand">
            <Logo size={22} />
            <p>Real AI agents try everyday tasks on your website and show you where they get stuck.</p>
          </div>
          <nav aria-label="Footer" className="ar-site-foot-cols">
            <div><span className="ar-label">Product</span><a href={href('app', 'tests')}>Open app</a><a href={href('site', 'pricing')}>Pricing</a><a href={href('app', 'watch')}>Watch</a></div>
            <div><span className="ar-label">Developers</span><a href={href('docs', 'cli')}>CLI</a><a href={href('docs', 'github-action')}>GitHub Action</a><a href={href('docs', 'api')}>API</a></div>
            <div><span className="ar-label">Project</span><a href={GITHUB} target="_blank" rel="noreferrer">GitHub</a><a href={href('docs', 'responsible-testing')}>Responsible testing</a><a href={`${GITHUB}/blob/main/LICENSE`} target="_blank" rel="noreferrer">MIT license</a></div>
          </nav>
        </div>
        <p className="ar-site-foot-note">Built on TinyFish web agents. Results describe what our agents met on the day of a test.</p>
      </footer>
    </div>
  );
}
