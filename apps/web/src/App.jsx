// Tab bar + hash routing (#/test/<reportId>[/<beforeId>], #/watch), so a refresh or a shared link opens the same
// view. No router library needed. Race and Leaderboard are not part of today's build, so they are not shown.
import { useEffect, useState } from 'react';
import TestPage from './pages/TestPage.jsx';
import WatchPage from './pages/WatchPage.jsx';

const TABS = [
  { id: 'test', label: 'Test' },
  { id: 'watch', label: 'Watch' },
];

function readHash() {
  const [page = 'test', param = null, extra = null] = window.location.hash.replace(/^#\/?/, '').split('/');
  const decode = (part) => (part ? decodeURIComponent(part) : null);
  return { page: TABS.some((t) => t.id === page) ? page : 'test', param: decode(param), extra: decode(extra) };
}

const readTheme = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

/** Light/dark switch, fixed bottom-right. The choice is saved (storage may be blocked, so it is wrapped). */
function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('agentready_theme', next); } catch { /* ignore */ }
    setTheme(next);
  };
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" className="theme-toggle" onClick={flip} aria-label={label} title={label}>
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" fill="currentColor" />
          <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}

export default function App() {
  const [route, setRoute] = useState(readHash);

  useEffect(() => {
    const onChange = () => setRoute(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <a className="logo" href="#/test">AgentReady</a>
          <span className="tagline">Can AI agents actually use your website?</span>
        </div>
        <nav className="tabs" aria-label="Pages">
          {TABS.map((tab) => (
            <a key={tab.id} href={`#/${tab.id}`} className={route.page === tab.id ? 'tab active' : 'tab'}
              aria-current={route.page === tab.id ? 'page' : undefined}>
              {tab.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="page">
        {route.page === 'test' && <TestPage reportId={route.param} beforeId={route.extra} />}
        {route.page === 'watch' && <WatchPage />}
      </main>
      <ThemeToggle />
    </>
  );
}
