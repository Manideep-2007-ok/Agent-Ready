// Test page: URL box -> live lanes -> score -> findings. The report id lives in the URL (#/test/<id>), so a refresh,
// a shared link or a saved demo report (e.g. #/test/rep_20261031_demo_nykaa) opens straight into the result.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BellRing, Gauge, MonitorPlay, ScanSearch, ShieldAlert, Terminal, Wrench } from 'lucide-react';
import { LineShadowText } from '@/components/ui/line-shadow-text';
import { BentoCard, BentoGrid } from '@/components/ui/bento-grid';
import { IconCloud } from '@/components/ui/icon-cloud';
import { Confetti } from '@/components/ui/confetti';
import { ComicText } from '@/components/ui/comic-text';
import { cancelTest, getHealth, getReport, listReports, setDemoFlaws, startTest, useLiveEvents, useQueueNote } from '../api.js';
import { navigate } from '../nav.js';
import Lane from '../components/Lane.jsx';
import InstantScanCard from '../components/InstantScanCard.jsx';
import FindingCard from '../components/FindingCard.jsx';
import ShotViewer from '../components/ShotViewer.jsx';
import ScoreCard from '../components/ScoreCard.jsx';
import DemoStoreCard from '../components/DemoStoreCard.jsx';

// The globe (WebGL) loads lazily so the dashboard opens fast.
const Globe = lazy(() => import('@/components/ui/globe').then((m) => ({ default: m.Globe })));

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const findingKey = (f) => `${f.type}|${f.taskId ?? ''}`;

function TestForm({ busy, onStart, onDemo }) {
  const [url, setUrl] = useState('');
  const [customTask, setCustomTask] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    if (url.trim()) onStart(url.trim(), showCustom ? customTask.trim() : '');
  };

  return (
    <form className="card test-form" onSubmit={submit}>
      <div className="row">
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Website to test, e.g. nykaa.com"
          aria-label="Website to test"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !url.trim()}>{busy ? 'Testing…' : 'Test my site'}</button>
      </div>
      {showCustom && (
        <input
          type="text"
          value={customTask}
          onChange={(e) => setCustomTask(e.target.value)}
          placeholder="Your own task, e.g. find the delivery charge for a ₹300 order"
          aria-label="Custom task"
          maxLength={300}
          disabled={busy}
        />
      )}
      <div className="form-links">
        {!showCustom && (
          <button type="button" className="link-button" onClick={() => setShowCustom(true)} disabled={busy}>
            + Add your own task
          </button>
        )}
        {onDemo && (
          <button type="button" className="link-button" onClick={onDemo} disabled={busy}>
            Try it on our demo store (with flaws)
          </button>
        )}
      </div>
    </form>
  );
}

const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';
const prefersCalm = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Spinning dotted globe; orange markers = cities of sites we tested (Bengaluru, Mumbai, Delhi) plus a few hubs. */
function HeroGlobe() {
  const dark = isDark();
  const config = {
    width: 800, height: 800, onRender: () => {}, devicePixelRatio: 2, phi: 0, theta: 0.25,
    dark: dark ? 1 : 0, diffuse: dark ? 1.2 : 0.4, mapSamples: 16000, mapBrightness: dark ? 3 : 1.2,
    baseColor: dark ? [0.3, 0.3, 0.32] : [1, 1, 1], markerColor: [1, 0.48, 0.1], glowColor: dark ? [0.15, 0.15, 0.18] : [1, 1, 1],
    markers: [
      { location: [12.9716, 77.5946], size: 0.1 }, { location: [19.076, 72.8777], size: 0.08 },
      { location: [28.6139, 77.209], size: 0.07 }, { location: [37.7749, -122.4194], size: 0.05 },
      { location: [51.5072, -0.1276], size: 0.04 }, { location: [1.3521, 103.8198], size: 0.04 },
    ],
  };
  return (
    <div className="hero-globe" aria-hidden="true">
      <Suspense fallback={null}><Globe key={dark ? 'd' : 'l'} config={config} className="absolute inset-0 mx-auto aspect-square w-full max-w-[520px]" /></Suspense>
    </div>
  );
}

/** Landing hero (no test open): the question, the URL box, a live globe, and how it works. */
function Hero({ children }) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-main">
        <span className="hero-burst">Real TinyFish web agents, live</span>
        <h1 id="hero-title">
          Can an AI agent <LineShadowText className="hero-shadow" shadowColor="var(--accent)">actually</LineShadowText> use your website?
        </h1>
        <p className="hero-sub">
          Real TinyFish web agents try four everyday tasks on your site, live: find a price, add to cart, find the
          return policy, contact support. You get a score, the exact step where they got stuck, and the fixes.
        </p>
        {children}
      </div>
      <HeroGlobe />
      <ol className="how">
        <li><b>1</b>Drop your URL</li>
        <li><b>2</b>Agents try your site, live</li>
        <li><b>3</b>Get a score and the top fixes</li>
      </ol>
    </section>
  );
}

/** Real findings from today's runs; each opens its report. */
function Facts() {
  return (
    <section className="hero-facts" aria-label="What our agents found">
      <a className="fact fact-orange" href="#/test/rep_20261031_demo_myntra">
        <b>Blocked</b>
        <span>Myntra turns away AI agents from cloud servers. They only got in through an Indian home address.</span>
      </a>
      <a className="fact fact-yellow" href="#/test/rep_demo_flaws_off/rep_demo_flaws_on">
        <b>35 → 19 steps</b>
        <span>Fixing four flaws on our demo store nearly halved the agent's work and cost.</span>
      </a>
      <a className="fact fact-paper" href="#/watch">
        <b>Alert in 6 min</b>
        <span>We broke our demo store's cart. Watch's agents caught it and posted to Slack 6 minutes later.</span>
      </a>
    </section>
  );
}

const Tint = ({ tone }) => <div className={`bento-bg bento-bg-${tone}`} aria-hidden="true" />;

const FEATURES = [
  { Icon: MonitorPlay, name: 'Live agent lanes', tone: 'blue', className: 'col-span-3 lg:col-span-2 bg-card dark:bg-card', href: '#/test',
    description: 'Four real TinyFish agents work in parallel. Watch every step, the live browser and a screenshot of each step.' },
  { Icon: Gauge, name: 'Score out of 100', tone: 'green', className: 'col-span-3 lg:col-span-1 bg-card dark:bg-card', href: '#/test/rep_20261031_demo_nykaa',
    description: 'Plain rules, same result every time: passed, steps, time, and any workaround needed.' },
  { Icon: ShieldAlert, name: 'Bot-wall check', tone: 'red', className: 'col-span-3 lg:col-span-1 bg-card dark:bg-card', href: '#/test/rep_20261031_demo_myntra',
    description: 'Blocked? We retry with an Indian home address, then stealth, to show who your security lets in.' },
  { Icon: Wrench, name: 'Top 3 fixes', tone: 'amber', className: 'col-span-3 lg:col-span-1 bg-card dark:bg-card', href: '#/test/rep_demo_flaws_on',
    description: 'Each problem names the page, the likely cause, the web standard and how to check it is fixed.' },
  { Icon: ScanSearch, name: 'Instant Scan', tone: 'blue', className: 'col-span-3 lg:col-span-1 bg-card dark:bg-card', href: '#/test/rep_demo_flaws_on',
    description: 'In seconds: pop-ups, unlabelled buttons, prices drawn as images, missing product data.' },
  { Icon: BellRing, name: 'Watch + Slack alerts', tone: 'green', className: 'col-span-3 lg:col-span-2 bg-card dark:bg-card', href: '#/watch',
    description: 'Agents re-test your live site on a schedule and post to Slack the moment a task breaks, and when it recovers.' },
  { Icon: Terminal, name: 'CLI for localhost', tone: 'amber', className: 'col-span-3 lg:col-span-1 bg-card dark:bg-card', href: '#/test',
    description: 'npx agentready localhost:3000 tests a site before it ships, through a secure tunnel.' },
];

/** Feature grid under the hero (Magic UI bento grid). */
function Features() {
  return (
    <section className="features" aria-labelledby="features-title">
      <h2 id="features-title">What you get</h2>
      <BentoGrid className="auto-rows-[15rem] gap-4">
        {FEATURES.map(({ tone, ...f }) => (
          <BentoCard key={f.name} {...f} cta="See it" background={<Tint tone={tone} />} />
        ))}
      </BentoGrid>
    </section>
  );
}

const AGENT_LOGOS = ['claude', 'anthropic', 'perplexity', 'googlegemini', 'google', 'githubcopilot', 'meta', 'apple', 'mistralai', 'huggingface', 'shopify', 'cloudflare', 'googlechrome', 'safari', 'firefoxbrowser', 'brave', 'arc', 'duckduckgo', 'opera', 'vercel']
  .map((slug) => `https://cdn.simpleicons.org/${slug}`);

/** The agents and platforms already visiting sites (Magic UI icon cloud). */
function AgentCloud() {
  return (
    <section className="card agent-cloud" aria-labelledby="cloud-title">
      <div className="agent-cloud-text">
        <h2 id="cloud-title">These agents are coming to your site</h2>
        <p className="muted">
          ChatGPT, Claude, Perplexity, Gemini and browser agents are starting to shop and book for people. If they get
          stuck or blocked, the sale is lost and you never see it. AgentReady shows you what they see.
        </p>
      </div>
      <div className="agent-cloud-orb"><IconCloud images={AGENT_LOGOS} showControl={false} /></div>
    </section>
  );
}

/**
 * Celebration for an agent-ready site (score 90+): Magic UI confetti + a comic "AGENT-READY!" burst, once per report.
 * Skipped with reduced motion.
 */
function Celebrate({ report }) {
  const confettiRef = useRef(null);
  const [show, setShow] = useState(false);
  const done = useRef(null);
  useEffect(() => {
    if (!report || report.score < 90 || done.current === report.id || prefersCalm()) return undefined;
    done.current = report.id;
    setShow(true);
    const colors = ['#0071e3', '#34c759', '#ff9f0a', '#ffffff'];
    confettiRef.current?.fire({ particleCount: 140, spread: 80, origin: { y: 0.35 }, colors });
    return undefined;
  }, [report]);
  // Hide the burst after 2.6 s, and right away when another report opens.
  useEffect(() => {
    if (!show) return undefined;
    const t = setTimeout(() => setShow(false), 2600);
    return () => clearTimeout(t);
  }, [show]);
  useEffect(() => { if (report?.id !== done.current) setShow(false); }, [report]);
  return (
    <>
      <Confetti ref={confettiRef} manualstart className="celebrate-canvas" />
      {show && (
        <div className="celebrate-burst" role="status" aria-live="polite">
          <ComicText fontSize={4.5}>AGENT-READY!</ComicText>
        </div>
      )}
    </>
  );
}

/** Shown while the test runs; ScoreCard takes over once the report is complete. Stop test cancels the agents. */
function Progress({ url, tasks, connection, onStop, stopping }) {
  const finished = tasks.filter((t) => ['passed', 'failed', 'blocked', 'cancelled'].includes(t.status)).length;
  return (
    <section className="card">
      <div className="progress">
        <span className="big">{stopping ? 'Stopping…' : 'Testing…'}</span>
        <span>{url}</span>
        <span className="muted">{tasks.length ? `${finished} of ${tasks.length} tasks finished` : 'Starting the agents'}</span>
        {connection === 'lost' && <span className="muted">Connection dropped, reconnecting…</span>}
        <button type="button" className="secondary stop-test" onClick={onStop} disabled={stopping}>
          {stopping ? 'Stopping…' : 'Stop test'}
        </button>
      </div>
    </section>
  );
}

/** Shown instead of the score when a test was stopped: half a test says nothing about the site. */
function StoppedCard({ report }) {
  const done = report.tasks.filter((t) => ['passed', 'failed', 'blocked'].includes(t.status)).length;
  return (
    <section className="card stopped-card" role="status">
      <div className="progress">
        <span className="big">Test stopped</span>
        <span className="muted">
          {done} of {report.tasks.length} tasks had finished. No score is given for a stopped test. Agent cost so far ≈ ₹{report.costRupees}.
        </span>
      </div>
    </section>
  );
}

/**
 * The same finding on several tasks (e.g. one bot wall that blocked all four) becomes one card: one fix covers
 * them all. Points add up, since fixing it gives every one of those tasks its points back.
 */
function groupFindings(findings) {
  const groups = new Map();
  for (const f of findings) {
    const key = `${f.type}|${f.text}`;
    const group = groups.get(key);
    if (!group) groups.set(key, { ...f, taskIds: f.taskId ? [f.taskId] : [], members: [f] });
    else {
      if (f.taskId && !group.taskIds.includes(f.taskId)) group.taskIds.push(f.taskId);
      group.pointsIfFixed = (group.pointsIfFixed ?? 0) + (f.pointsIfFixed ?? 0);
      group.screenshotUrl ??= f.screenshotUrl;
      group.members.push(f);
    }
  }
  return [...groups.values()];
}

/** Task findings and Instant Scan findings (D25), grouped, most serious first; the Top 3 are marked. */
function Findings({ report, onShotClick }) {
  const groups = groupFindings([...report.tasks.flatMap((t) => t.findings ?? []), ...(report.scanFindings ?? [])]).sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9) || (b.pointsIfFixed ?? 0) - (a.pointsIfFixed ?? 0),
  );
  const ranks = new Map((report.topFixes ?? []).map((f, i) => [findingKey(f), i + 1]));
  const rankOf = (group) => group.members.map((f) => ranks.get(findingKey(f))).find(Boolean);
  const totalTasks = report.tasks.filter((t) => t.taskId !== 'custom').length;
  if (!groups.length) return <section className="card">No problems found: AI agents could do every task.</section>;
  return (
    <section className="findings">
      <h2>What to fix ({groups.length})</h2>
      {groups.map((g, i) => (
        <FindingCard key={`${findingKey(g)}-${i}`} finding={g} taskIds={g.taskIds} totalTasks={totalTasks} rank={rankOf(g)} onShotClick={onShotClick} />
      ))}
    </section>
  );
}

const hostOf = (url) => { try { return new URL(url).hostname; } catch { return url; } };

function RecentReports() {
  const [reports, setReports] = useState([]);
  useEffect(() => {
    listReports().then(setReports).catch(() => setReports([]));
  }, []);
  if (!reports.length) return null;
  return (
    <section className="card">
      <h2>Recent tests</h2>
      <div className="recent">
        {reports.slice(0, 8).map((r) => (
          <a key={r.id} href={`#/test/${encodeURIComponent(r.id)}`}>
            {hostOf(r.url)} · {r.status === 'complete' ? `${r.score}/100` : r.status === 'cancelled' ? 'stopped' : 'running'}
          </a>
        ))}
      </div>
    </section>
  );
}

export default function TestPage({ reportId, beforeId }) {
  const live = useLiveEvents(reportId);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [shot, setShot] = useState(null);
  const [demoStoreUrl, setDemoStoreUrl] = useState(null);
  const [stopping, setStopping] = useState(false);
  const jumpToFix = (rank) => document.getElementById(`top-fix-${rank}`)?.scrollIntoView({ block: 'start' });

  // The address being tested, for the progress line (the live stream only carries it at the end).
  useEffect(() => {
    setUrl('');
    setError('');
    setStopping(false);
    if (reportId) getReport(reportId).then((r) => setUrl(r.url)).catch((e) => setError(e.message));
  }, [reportId]);

  useEffect(() => {
    getHealth().then((h) => setDemoStoreUrl(h.demoStoreUrl ?? null)).catch(() => setDemoStoreUrl(null));
  }, []);

  /** Starts a test and opens it; `getUrl` may first ask the server for the address (demo store). */
  const begin = async (getUrl, customTask, from) => {
    setError('');
    setStarting(true);
    try {
      const { reportId: id } = await startTest(await getUrl(), customTask);
      navigate('test', id, from);
    } catch (e) {
      setError(e.message);
    } finally {
      setStarting(false);
    }
  };
  const onStart = (siteUrl, customTask) => begin(() => siteUrl, customTask);
  const onDemo = () => begin(async () => (await setDemoFlaws(true)).url);
  // Re-test the same store with its flaws off, remembering this report to show the before/after.
  const onApplyFixes = () => begin(async () => (await setDemoFlaws(false)).url, '', reportId);

  const tasks = Object.values(live.tasks);
  const running = Boolean(reportId) && live.connection !== 'done' && !error;
  const waitReason = useQueueNote(reportId, running && tasks.some((t) => t.status === 'queued'));
  // Stop test: the server cancels the agent runs and drops queued tasks; the stream then ends with a 'cancelled' report.
  const onStop = async () => {
    setStopping(true);
    try { await cancelTest(reportId); } catch (e) { setError(e.message); setStopping(false); }
  };
  const stopped = live.report?.status === 'cancelled';

  const form = <TestForm busy={starting || running} onStart={onStart} onDemo={demoStoreUrl ? onDemo : null} />;

  return (
    <>
      {reportId ? form : <Hero>{form}</Hero>}
      {!reportId && <Facts />}
      {error && <section className="card error">{error}</section>}
      {reportId && !error && (
        <>
          <DemoStoreCard
            report={live.report}
            beforeId={beforeId}
            demoStoreUrl={demoStoreUrl}
            url={live.report?.url || url}
            busy={starting}
            onApplyFixes={onApplyFixes}
          />
          {live.report ? (stopped ? <StoppedCard report={live.report} /> : <ScoreCard report={live.report} onJump={jumpToFix} />)
            : <Progress url={url} tasks={tasks} connection={live.connection} onStop={onStop} stopping={stopping} />}
          {/* While agents run, their lanes come first (side by side); the scan card follows. After, the scan leads. */}
          {live.report && live.scan && <InstantScanCard scan={live.scan} loading={false} />}
          <section className={`lanes${tasks.length >= 4 ? ' lanes-4' : ''}`} aria-label="Agents">
            {tasks.map((task) => <Lane key={task.taskId} task={task} onShotClick={setShot} waitReason={waitReason} />)}
          </section>
          {!live.report && <InstantScanCard scan={live.scan} loading={!live.scan} />}
          {live.report && !stopped && <Findings report={live.report} onShotClick={setShot} />}
        </>
      )}
      {!reportId && <Features />}
      {!reportId && <AgentCloud />}
      {!reportId && <RecentReports />}
      {reportId && <Celebrate report={live.report} />}
      <ShotViewer url={shot} onClose={() => setShot(null)} />
    </>
  );
}
