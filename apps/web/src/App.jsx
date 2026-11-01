// Tab bar + hash routing (#/test/<reportId>, #/race, #/watch, #/leaderboard), so a refresh or a shared link
// opens the same view. No router library needed for four pages.
import { useEffect, useState } from 'react';
import TestPage from './pages/TestPage.jsx';

const TABS = [
  { id: 'test', label: 'Test' },
  { id: 'watch', label: 'Watch' },
  { id: 'race', label: 'Race' },
  { id: 'leaderboard', label: 'Leaderboard' },
];

function readHash() {
  const [page = 'test', param = null] = window.location.hash.replace(/^#\/?/, '').split('/');
  return { page: TABS.some((t) => t.id === page) ? page : 'test', param: param ? decodeURIComponent(param) : null };
}

function ComingSoon({ name }) {
  return <section className="card muted">{name} is being built next.</section>;
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
          AgentReady <span className="tagline">Can AI agents actually use your website?</span>
        </div>
        <nav className="tabs">
          {TABS.map((tab) => (
            <a key={tab.id} href={`#/${tab.id}`} className={route.page === tab.id ? 'tab active' : 'tab'}>
              {tab.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="page">
        {route.page === 'test' && <TestPage reportId={route.param} />}
        {route.page === 'watch' && <ComingSoon name="Watch" />}
        {route.page === 'race' && <ComingSoon name="Race Mode" />}
        {route.page === 'leaderboard' && <ComingSoon name="The leaderboard" />}
      </main>
    </>
  );
}
