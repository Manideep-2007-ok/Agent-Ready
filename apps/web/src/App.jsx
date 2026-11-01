// Tab bar + hash routing (#/test/<reportId>[/<beforeId>], #/watch), so a refresh or a shared link opens the same
// view. No router library needed. Race and Leaderboard are not part of today's build, so they are not shown.
import { useEffect, useState } from 'react';
import TestPage from './pages/TestPage.jsx';
import WatchPage from './pages/WatchPage.jsx';
import { AnimatedThemeToggler } from '@/components/ui/animated-theme-toggler';
import PointerCursor from './components/PointerCursor.jsx';
import { getHealth } from './api.js';

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

/** Light/dark switch (Magic UI animated toggler: circular reveal). Fixed bottom-right; the choice is saved. */
function ThemeToggle() {
  const [theme, setTheme] = useState(readTheme);
  const onThemeChange = (next) => {
    document.documentElement.setAttribute('data-theme', next); // our CSS tokens; Tailwind also reads .dark
    try { localStorage.setItem('agentready_theme', next); } catch { /* ignore */ }
    setTheme(next);
  };
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return <AnimatedThemeToggler className="theme-toggle" theme={theme} onThemeChange={onThemeChange} aria-label={label} title={label} />;
}

/** Custom pointer only with a real mouse and when motion is welcome. */
function useFancyCursor() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const fine = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setOn(fine.matches && !calm.matches);
    update();
    fine.addEventListener('change', update); calm.addEventListener('change', update);
    return () => { fine.removeEventListener('change', update); calm.removeEventListener('change', update); };
  }, []);
  return on;
}

export default function App() {
  const [route, setRoute] = useState(readHash);
  const fancyCursor = useFancyCursor();
  // Replay mode (TINYFISH_MOCK=1, e.g. the public copy): say so plainly, so nobody mistakes a replay for a live test.
  const [replay, setReplay] = useState(false);
  useEffect(() => { getHealth().then((h) => setReplay(Boolean(h.mock))).catch(() => {}); }, []);

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
      {replay && (
        <div className="replay-banner" role="note">
          <b>Demo mode:</b> this copy replays real agent runs we recorded, so it costs nothing to try. Results for other
          sites are sample replays, not live tests. Live agents run from our laptop on stage.
        </div>
      )}
      <main className="page">
        {route.page === 'test' && <TestPage reportId={route.param} beforeId={route.extra} />}
        {route.page === 'watch' && <WatchPage />}
      </main>
      <ThemeToggle />
      {fancyCursor && <PointerCursor />}
    </>
  );
}
