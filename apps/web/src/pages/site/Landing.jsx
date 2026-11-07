// Public landing page (#/): what AgentReady does, shown with real product panels and our own demo store's numbers.
// Never names a third-party company (public wording rule). Redesign spec 5.5.
import { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Badge, Button, CodeBlock, Field } from '../../design/index.js';
import { startTest } from '../../api.js';
import { navigate } from '../../nav.js';
import { href } from '../../routes.js';
import HeroLedger from './HeroLedger.jsx';
import FeatureRow from './FeatureRow.jsx';
import Faq from './Faq.jsx';

function HeroForm() {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { reportId } = await startTest(url.trim(), '', { pack: 'auto' });
      navigate('test', reportId);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  return (
    <form className="ar-hero-form" onSubmit={submit}>
      <div className="ar-hero-form-row">
        <Field label="Website to test">
          <input id="hero-url" className="ar-input ar-input--lg" type="text" inputMode="url" placeholder="your-store.com"
            value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
        </Field>
        <Button variant="primary" type="submit" disabled={busy || !url.trim()} loading={busy}>Run test</Button>
      </div>
      {error && <p className="ar-error" role="alert">{error}</p>}
    </form>
  );
}

const TICKS = ['Real agents, live in your browser', 'A score with the exact fixes', 'Works on localhost and in CI'];

const FIX_PANEL = (
  <div className="ar-mock">
    <div className="ar-mock-head"><span className="ar-label">Findings · demo store</span><span className="ar-label">3 of 7</span></div>
    {[
      ['F1', 'A pop-up covers most of the page', 'fail', 'High'],
      ['F2', 'Prices are drawn as images, not text', 'fail', 'High'],
      ['F3', 'Return policy is 10 steps deep', 'warn', 'Medium'],
    ].map(([id, t, tone, w]) => (
      <div className="ar-mock-row" key={id}><span className="ar-mono ar-faint">{id}</span><span>{t}</span><Badge tone={tone}>{w}</Badge></div>
    ))}
    <div className="ar-mock-detail">
      <span className="ar-label">How to fix it</span>
      <p>Give every pop-up a labelled close button and do not cover the whole page on first load.</p>
      <span className="ar-mono ar-faint">WCAG 2.1.2 · checked again on the next run</span>
    </div>
  </div>
);

const WATCH_PANEL = (
  <div className="ar-mock">
    <div className="ar-mock-head"><span className="ar-label">Watch · every 20 min</span><Badge tone="fail">Alert</Badge></div>
    {[
      ['13:20', 'Add to cart', 'pass', 'Passed', '7 steps'],
      ['13:40', 'Add to cart', 'pass', 'Passed', '7 steps'],
      ['14:00', 'Add to cart', 'fail', 'Failed', '"Something went wrong"'],
    ].map(([t, task, tone, w, note]) => (
      <div className="ar-mock-row" key={t}><span className="ar-mono ar-faint">{t}</span><span>{task} <span className="ar-faint">· {note}</span></span><Badge tone={tone}>{w}</Badge></div>
    ))}
    <div className="ar-mock-alert">
      <span className="ar-label">Sent to Slack</span>
      <p>AI shoppers can't add to cart on your store since 14:00. Last good: 13:40 (7 steps).</p>
    </div>
  </div>
);

const SCORE_PANEL = (
  <div className="ar-mock">
    <div className="ar-mock-head"><span className="ar-label">Live · 4 agents</span><Badge tone="accent">Running</Badge></div>
    {[
      ['T1', 'Find a product and its price', 'pass', 'Passed', '4'],
      ['T2', 'Add to cart and read the total', 'accent', 'Running', '5'],
      ['T3', 'Find the return policy', 'wait', 'Blocked → retry', '2'],
      ['T4', 'Find customer support', 'pass', 'Passed', '3'],
    ].map(([id, t, tone, w, steps]) => (
      <div className="ar-mock-row" key={id}><span className="ar-mono ar-faint">{id}</span><span>{t} <span className="ar-mono ar-faint">· {steps} steps</span></span><Badge tone={tone}>{w}</Badge></div>
    ))}
    <div className="ar-mock-detail">
      <span className="ar-label">Bot-wall check</span>
      <p>Blocked from a cloud server? The agent tries again from an Indian home address, then with a stealth browser.</p>
    </div>
  </div>
);

const CLI = 'npx @agentready/cli http://localhost:3000';
const ACTION = `- uses: Manideep-2007-ok/Agent-Ready@v1
  with:
    url: https://your-preview.example.com
    tinyfish-api-key: \${{ secrets.TINYFISH_API_KEY }}
    min-score: 80`;

export default function Landing() {
  return (
    <div className="ar-landing">
      <section className="ar-hero">
        <div className="ar-hero-copy">
          <span className="ar-label ar-eyebrow">For online stores and the teams who build them</span>
          <h1>Can AI agents actually use your website?</h1>
          <p className="ar-hero-sub">
            AI agents are starting to shop for people. AgentReady sends real web agents to find a price, add to cart,
            find your return policy and reach support, live, then shows exactly where they got stuck and how to fix it.
          </p>
          <HeroForm />
          <ul className="ar-ticks">{TICKS.map((t) => <li key={t}><Check size={16} aria-hidden="true" />{t}</li>)}</ul>
        </div>
        <HeroLedger />
      </section>

      <section className="ar-strip" aria-label="How agents arrive">
        <span className="ar-label">Agents arrive as</span>
        <span className="ar-mono">a cloud server</span><span className="ar-strip-dot" aria-hidden="true" />
        <span className="ar-mono">an Indian home address</span><span className="ar-strip-dot" aria-hidden="true" />
        <span className="ar-mono">a stealth browser</span>
      </section>

      <div className="ar-features">
        <FeatureRow eyebrow="01 · Test" title="Four everyday tasks, real agents, a score out of 100."
          points={['Agents work in parallel; watch each one live with a screenshot of every step.', 'Plain rules, same score every time: passed, steps, time, workarounds.', 'Bot protection is tested too: we show who your security lets in.']}
          panel={SCORE_PANEL} />
        <FeatureRow flip eyebrow="02 · Fix" title="Every problem names the page, the cause and the fix."
          points={['The exact step and screenshot where an agent got stuck.', 'A likely cause on your site, the web standard, and a code example for your framework.', 'A pass check, so you know the fix worked.']}
          panel={FIX_PANEL} />
        <FeatureRow eyebrow="03 · Watch" title="Know the day AI shoppers can no longer buy."
          points={['Agents re-test your live site on a schedule.', 'An alert in Slack or Discord when a task breaks, and when it recovers.', 'A failing check is re-run before anyone is woken up.']}
          panel={WATCH_PANEL} />
      </div>

      <section className="ar-dev" aria-labelledby="dev-title">
        <div className="ar-dev-copy">
          <span className="ar-label ar-eyebrow">Developers</span>
          <h2 id="dev-title">Test before you ship.</h2>
          <p>Run it against localhost through a secure tunnel, or on every pull request with the GitHub Action. The score comes back as a comment and a badge.</p>
          <a href={href('docs', 'cli')} className="ar-link-arrow">Read the CLI docs <ArrowRight size={16} aria-hidden="true" /></a>
        </div>
        <div className="ar-dev-code">
          <CodeBlock label="Terminal" code={CLI} />
          <CodeBlock label="GitHub Action" code={ACTION} />
        </div>
      </section>

      <section className="ar-results" aria-labelledby="results-title">
        <span className="ar-label ar-eyebrow">Results · our demo store · 1 Nov 2026</span>
        <h2 id="results-title">Four small fixes, half the work for agents.</h2>
        <div className="ar-results-grid">
          {[['Agent steps', '35', '19'], ['Agent cost', '₹49', '₹27'], ['Score', '91', '97']].map(([l, a, b]) => (
            <div className="ar-result" key={l}>
              <span className="ar-label">{l}</span>
              <span className="ar-result-nums"><span className="ar-result-before">{a}</span><ArrowRight size={18} aria-hidden="true" /><span>{b}</span></span>
            </div>
          ))}
        </div>
        <p className="ar-faint ar-small">A pop-up, prices drawn as images, an icon-only cart button and a buried returns page, switched off. The agents still finished every task with the flaws on; a pass/fail checker would have seen nothing wrong.</p>
      </section>

      <Faq />

      <section className="ar-cta">
        <h2>See your site through an AI agent's eyes.</h2>
        <div className="ar-cta-actions">
          <Button as="a" href={href('app', 'tests')} variant="primary">Run a free test</Button>
          <Button as="a" href={href('docs', 'getting-started')}>Read the docs</Button>
        </div>
      </section>
    </div>
  );
}
