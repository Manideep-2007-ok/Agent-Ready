// Three areas on hash routes (routes.js): the public site (#/, #/pricing), docs (#/docs/<slug>) and the app
// (#/app/...). Old dashboard links redirect with location.replace, so Back never loops. No router library.
import { useEffect, useState } from 'react';
import TestPage from './pages/TestPage.jsx';
import TestsHome from './pages/app/TestsHome.jsx';
import ReportPage from './pages/app/ReportPage.jsx';
import WatchPage from './pages/WatchPage.jsx';
import RacePage from './pages/RacePage.jsx';
import LeaderboardPage from './pages/LeaderboardPage.jsx';
import AppShell from './shell/AppShell.jsx';
import SiteShell from './shell/SiteShell.jsx';
import { EmptyState, ToastProvider } from './design/index.js';
import { parseHash, redirectFor } from './routes.js';
import { getHealth } from './api.js';

const FLAGGED = { race: 'RACE', leaderboard: 'LEADERBOARD' };

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
      title={page === 'tests' ? 'Tests' : null}>
      {page === 'tests' && <TestsHome />}
      {page === 'test' && <ReportPage key={route.id} id={route.id} beforeId={route.extra} />}
      {page === 'watch' && <WatchPage />}
      {page === 'race' && <RacePage raceId={route.id} />}
      {page === 'leaderboard' && <LeaderboardPage />}
    </AppShell>
  );
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [health, setHealth] = useState(null);
  useEffect(() => { getHealth().then(setHealth).catch(() => setHealth({ features: {} })); }, []);
  useEffect(() => {
    // The hash is only used for pages, so a new hash is a new page: start it at the top, not at the old scroll depth.
    const onChange = () => { setRoute(readRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return (
    <ToastProvider>
      {route.area === 'app' && <AppArea route={route} health={health} />}
      {route.area === 'site' && (
        <SiteShell active={route.page === 'pricing' ? 'pricing' : 'product'}>
          <div className="ar-site-temp"><TestPage reportId={null} /></div>
        </SiteShell>
      )}
      {route.area === 'docs' && (
        <SiteShell active="docs">
          <div className="ar-site-temp"><EmptyState title="Docs are on their way" body="The documentation pages are being written." /></div>
        </SiteShell>
      )}
    </ToastProvider>
  );
}
