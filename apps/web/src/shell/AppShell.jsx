// Workbench shell for the app (#/app/...): sidebar with the workspace pages and resources, a page header, the replay
// strip, and under 900 px a top bar whose menu button opens the sidebar as a drawer (Escape closes it).
import { useEffect, useRef, useState } from 'react';
import { BookOpen, ExternalLink, FlaskConical, Menu, Radar, Swords, Tag, Trophy, X } from 'lucide-react';
import { Logo, ThemeToggle } from '../design/index.js';
import { href } from '../routes.js';

const WORKSPACE = [
  { page: 'tests', label: 'Tests', Icon: FlaskConical, match: ['tests', 'test'] },
  { page: 'watch', label: 'Watch', Icon: Radar },
  { page: 'race', label: 'Race', Icon: Swords, feature: 'RACE' },
  { page: 'leaderboard', label: 'Leaderboard', Icon: Trophy, feature: 'LEADERBOARD' },
];
const GITHUB = 'https://github.com/Manideep-2007-ok/Agent-Ready';

function Sidebar({ page, features, version, onNavigate }) {
  const shown = WORKSPACE.filter((w) => !w.feature || features?.[w.feature] === true);
  return (
    <div className="ar-sidebar-inner">
      <div className="ar-sidebar-logo"><Logo size={24} href={href('app', 'tests')} /></div>
      <nav aria-label="Workspace" className="ar-nav">
        <span className="ar-label ar-nav-group">Workspace</span>
        {shown.map(({ page: p, label, Icon, match = [p] }) => (
          <a key={p} href={href('app', p)} className="ar-nav-link" aria-current={match.includes(page) ? 'page' : undefined} onClick={onNavigate}>
            <Icon size={16} aria-hidden="true" />{label}
          </a>
        ))}
      </nav>
      <nav aria-label="Resources" className="ar-nav">
        <span className="ar-label ar-nav-group">Resources</span>
        <a href={href('docs', 'getting-started')} className="ar-nav-link" onClick={onNavigate}><BookOpen size={16} aria-hidden="true" />Docs</a>
        <a href={href('site', 'pricing')} className="ar-nav-link" onClick={onNavigate}><Tag size={16} aria-hidden="true" />Pricing</a>
        <a href={GITHUB} className="ar-nav-link" target="_blank" rel="noreferrer"><ExternalLink size={16} aria-hidden="true" />GitHub</a>
      </nav>
      <div className="ar-sidebar-foot">
        <span className="ar-label">{version ? `v${version}` : ''}</span>
        <ThemeToggle className="theme-toggle" />
      </div>
    </div>
  );
}

/**
 * @param {{page:string, features:object|null, replay:boolean, version?:string, title?:any, crumbs?:any, actions?:any, children:any}} props
 */
export default function AppShell({ page, features, replay, version, title, crumbs, actions, children }) {
  const [open, setOpen] = useState(false);
  const menuButton = useRef(null);
  const aside = useRef(null);
  // Under 900 px the sidebar is a drawer: while closed it is inert (no Tab stops, hidden from screen readers).
  const [narrow, setNarrow] = useState(() => window.matchMedia?.('(max-width: 900px)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(max-width: 900px)');
    if (!mq) return undefined;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // Opening the drawer moves focus to its first link.
  useEffect(() => { if (open) aside.current?.querySelector('a, button')?.focus(); }, [open]);
  const close = () => { setOpen(false); menuButton.current?.focus(); };
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { setOpen(false); }, [page]);

  return (
    <div className="ar-app">
      <header className="ar-topbar">
        <Logo size={22} href={href('app', 'tests')} />
        <button ref={menuButton} type="button" className="ar-btn ar-btn--ghost ar-btn--sm ar-icon-btn" aria-expanded={open}
          aria-controls="ar-sidebar" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((v) => !v)}>
          {open ? <X size={18} aria-hidden="true" /> : <Menu size={18} aria-hidden="true" />}
        </button>
      </header>
      {open && <div className="ar-scrim" onClick={close} aria-hidden="true" />}
      <aside id="ar-sidebar" ref={aside} className={`ar-sidebar${open ? ' is-open' : ''}`} inert={narrow && !open ? '' : undefined}>
        <Sidebar page={page} features={features} version={version} onNavigate={() => setOpen(false)} />
      </aside>
      <div className="ar-main">
        {replay && (
          <div className="ar-replay" role="note">
            <span className="ar-label">Replay mode</span> Recorded agent runs, no agent cost. Sites without a recording cannot be tested here.
          </div>
        )}
        {(title || actions || crumbs) && (
          <div className="ar-pagehead">
            <div className="ar-pagehead-text">
              {crumbs && <div className="ar-crumbs">{crumbs}</div>}
              {title && <h1>{title}</h1>}
            </div>
            {actions && <div className="ar-pagehead-actions">{actions}</div>}
          </div>
        )}
        <main className="ar-content">{children}</main>
      </div>
    </div>
  );
}
