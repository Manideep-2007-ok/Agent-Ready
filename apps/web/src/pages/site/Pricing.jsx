// Pricing (#/pricing): free during the beta. Plans are described by what they include, no invented prices; the cost
// of a test is explained in agent steps, with today's estimate from the server. Redesign spec 5.6.
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Badge, Button } from '../../design/index.js';
import { getEstimate } from '../../api.js';
import { href } from '../../routes.js';

const PLANS = [
  { name: 'Free', tag: 'Free in beta', blurb: 'See how AI agents do on your site today.', cta: ['Run a free test', href('app', 'tests'), 'primary'],
    items: ['Instant Scan of your home and product pages', 'A full four-task test with live agents', 'Score, findings and the Detailed Fix Report', 'The CLI for sites on your laptop'] },
  { name: 'Watch', tag: 'Early access', blurb: 'Know the day AI shoppers can no longer buy.', cta: ['Set up a watch', href('app', 'watch')],
    items: ['Scheduled re-tests of your live site', 'Slack or Discord alerts, and when it recovers', 'History and what changed between runs', 'A failing check is confirmed before it alerts'] },
  { name: 'Team', tag: 'Talk to us', blurb: 'For agencies and teams with several sites.', cta: ['Contact us', 'https://github.com/Manideep-2007-ok/Agent-Ready/issues'],
    items: ['The GitHub Action on every pull request', 'API access', 'Several sites in one place', 'Help with bot-protection rules'] },
];

export default function Pricing() {
  const [estimate, setEstimate] = useState(null);
  useEffect(() => { getEstimate(4, false).then(setEstimate).catch(() => {}); }, []);
  return (
    <div className="ar-pricing">
      <header className="ar-pricing-head">
        <span className="ar-label ar-eyebrow">Pricing</span>
        <h1>Free while we are in beta.</h1>
        <p>Every plan uses real agents, so the only real cost is the agent steps a test takes. Paid plans will be announced before anything is charged.</p>
      </header>
      <div className="ar-plans">
        {PLANS.map((p) => (
          <section key={p.name} className={`ar-plan${p.name === 'Free' ? ' is-main' : ''}`} aria-labelledby={`plan-${p.name}`}>
            <div className="ar-plan-top">
              <h2 id={`plan-${p.name}`}>{p.name}</h2>
              <Badge tone={p.name === 'Free' ? 'accent' : 'neutral'}>{p.tag}</Badge>
            </div>
            <p className="ar-muted">{p.blurb}</p>
            <ul>{p.items.map((i) => <li key={i}><Check size={16} aria-hidden="true" />{i}</li>)}</ul>
            <Button as="a" href={p.cta[1]} variant={p.cta[2] ?? 'secondary'} {...(p.cta[1].startsWith('http') ? { target: '_blank', rel: 'noreferrer' } : {})}>{p.cta[0]}</Button>
          </section>
        ))}
      </div>
      <section className="ar-cost" aria-labelledby="cost-title">
        <h2 id="cost-title">What a test costs</h2>
        <p>
          Agents are billed per step (each click, scroll or page they read) at about ₹{(Math.round((estimate?.rupeesPerStep ?? 1.408) * 10) / 10).toFixed(1)} a step.
          {estimate && !estimate.mock
            ? ` A full four-task test usually costs ₹${estimate.lowRupees} to ₹${estimate.highRupees}; a site that blocks agents can take up to ₹${estimate.worstRupees} because we retry from a home address and in a stealth browser.`
            : ' On our demo store a full four-task test cost ₹27 with its flaws fixed and ₹49 with them on; large stores take more steps.'}
          {estimate?.budget?.perTestRupees ? ` Every test stops at ₹${estimate.budget.perTestRupees}, so a run can never surprise you.` : ''}
        </p>
        <p className="ar-muted">Confirm results runs each task again (a third time if the two disagree), so it costs about twice as much.</p>
      </section>
    </div>
  );
}
