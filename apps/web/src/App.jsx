// Three areas on hash routes (routes.js): the public site (#/, #/pricing), docs (#/docs/<slug>) and the app
// (#/app/...). Old dashboard links redirect with location.replace, so Back never loops. An unknown address shows the
// 404 page in its area and keeps the address. No router library.
import { useEffect, useState } from 'react';
import TestsHome from './pages/app/TestsHome.jsx';
import ReportPage from './pages/app/ReportPage.jsx';
import WatchPage from './pages/app/WatchPage.jsx';
import RacePage from './pages/app/RacePage.jsx';
import LeaderboardPage from './pages/app/LeaderboardPage.jsx';
import Landing from './pages/site/Landing.jsx';
import Pricing from './pages/site/Pricing.jsx';
import DocsPage from './pages/docs/DocsPage.jsx';
import NotFound from './pages/NotFound.jsx';
import AppShell from './shell/AppShell.jsx';
import SiteShell from './shell/SiteShell.jsx';
import { RouteProgress, ToastProvider, progress, runTransition } from './design/index.js';
import { parseHash, redirectFor } from './routes.js';
import { getHealth } from './api.js';

const FLAGGED = { race: 'RACE', leaderboard: 'LEADERBOARD' };
// Tab titles; docs and the 404 page set their own.
const TITLES = { tests: 'Tests', test: 'Report', watch: 'Watch', race: 'Race', leaderboard: 'Leaderboard', pricing: 'Pricing' };
const titleFor = (route) => (route.area === 'docs' || route.page === 'not-found' ? null
  : TITLES[route.page] ? `${TITLES[route.page]} · AgentReady` : 'AgentReady');

function readRoute() {
  const to = redirectFor(window.location.hash);
  if (to) { window.location.replace(to); return parseHash(to); }
  return parseHash(window.location.hash);
}

function AppArea({ route, health }) {
  const features = health?.features ?? null;
  // A page whose feature is off shows the Tests home (unknown until /api/health answers: keep the page).
  const off = FLAGGED[route.page] && features && features[FLAGGED[route.page]] !== true;
  const page = off ? 'tests' : route.page;
  return (
    <AppShell page={page} features={features} replay={Boolean(health?.mock)} version={health?.version}
      title={{ tests: 'Tests', watch: 'Watch', race: 'Race', leaderboard: 'Leaderboard' }[page] ?? null}>
      {page === 'tests' && <TestsHome />}
      {page === 'test' && <ReportPage key={route.id} id={route.id} beforeId={route.extra} />}
      {page === 'watch' && <WatchPage />}
      {page === 'race' && <RacePage raceId={route.id} />}
      {page === 'leaderboard' && <LeaderboardPage />}
      {page === 'not-found' && <NotFound area="app" />}
    </AppShell>
  );
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [health, setHealth] = useState(null);
  useEffect(() => { getHealth().then(setHealth).catch(() => setHealth({ features: {} })); }, []);
  useEffect(() => {
    // The hash is only used for pages, so a new hash is a new page: the loading bar sweeps, the content crossfades (the
    // sidebar and top bars stay put), the page starts at the top, and keyboard focus moves to it, not to <body>.
    const onChange = () => {
      progress.sweep();
      runTransition(() => setRoute(readRoute()));
      window.scrollTo(0, 0);
      requestAnimationFrame(() => document.getElementById('main')?.focus({ preventScroll: true }));
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  useEffect(() => { const t = titleFor(route); if (t) document.title = t; }, [route]);

  return (
    <ToastProvider>
      <RouteProgress />
      {route.area === 'app' && <AppArea route={route} health={health} />}
      {route.area === 'site' && (
        <SiteShell active={{ pricing: 'pricing', landing: 'product' }[route.page] ?? null}>
          {route.page === 'pricing' ? <Pricing /> : route.page === 'not-found' ? <NotFound area="site" /> : <Landing />}
        </SiteShell>
      )}
      {route.area === 'docs' && (
        <SiteShell active="docs">
          <DocsPage slug={route.page} />
        </SiteShell>
      )}
    </ToastProvider>
  );
}
