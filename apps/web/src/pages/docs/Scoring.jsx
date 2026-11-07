import { href } from '../../routes.js';
import { H2, Note, Table } from './parts.jsx';

export const title = 'How scoring works';
export const lead = 'Plain rules, the same result every time. AI writes explanations for fixes; it never decides the score.';

export default function Scoring() {
  return (
    <>
      <H2 id="points">Points per task</H2>
      <p>Each task is worth up to 25 points; four tasks make 100. With fewer tasks the total is scaled to 100.</p>
      <Table head={['Rule', 'Points']} mono={[1]} rows={[
        ['Task passed', '+15'],
        ['Steps: 5 or fewer / 6 to 10 / more than 10', '+6 / +3 / 0'],
        ['Time: under 90 s / under 180 s / longer', '+4 / +2 / 0'],
        ['The agent needed a web search to find the page', '−5'],
        ['Passed only through a proxy or a stealth browser', 'task capped at 5'],
      ]} />
      <p>Bands: 80 and above is <b>Ready for AI agents</b>, 50 to 79 <b>Partly ready</b>, under 50 <b>Not ready</b>.</p>
      <H2 id="bot-wall">Bot-wall check</H2>
      <p>AI agents usually arrive from cloud servers. When a task looks blocked, it is tried again:</p>
      <Table head={['Attempt', 'How the agent arrives', 'If it passes here']} mono={[0]} rows={[
        ['1', 'Cloud server, normal browser', 'No bot wall'],
        ['2', 'Indian home address (proxy)', 'The site blocks cloud AI agents'],
        ['3', 'Indian home address, stealth browser', 'The site blocks automated browsers'],
        ['—', 'Blocked every time', 'Agents could not use the site'],
      ]} />
      <p>A normal failure (the agent could not find the page) is not retried. If the agent spent five or more steps on the site from a home address, a "Something went wrong" page counts as the site failing, not as a wall.</p>
      <H2 id="confirm">Confirm results</H2>
      <p>Agents can vary between runs. With Confirm results each task runs a second time with the same setup; if the two disagree, a third run decides. The majority sets the result and a disagreement is reported as <b>inconsistent results</b>. Blocked tasks are not repeated.</p>
      <H2 id="answer-checks">Answer checks</H2>
      <p>A task can pass with a doubtful answer. These never change points; they become findings:</p>
      <ul>
        <li>The cart answer states a quantity above one.</li>
        <li>A dollar price is reported on a site that shows rupees.</li>
        <li>The agent pressed Add to cart more than once, or read the price from a picture.</li>
        <li>The page the agent named does not show what it reported (the page is read again with TinyFish Fetch).</li>
      </ul>
      <H2 id="cost">Cost</H2>
      <p>Agent cost is every step of every attempt and repeat run, at $0.016 per step (about ₹1.41). Every test has a cost limit; see <a href={href('docs', 'self-hosting')}>settings</a>.</p>
      <Note>Instant Scan findings (pop-ups, unlabelled buttons, prices in images) are not part of the 100, but they can be in the Top 3 fixes.</Note>
    </>
  );
}
