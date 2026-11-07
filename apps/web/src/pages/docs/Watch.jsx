import { href } from '../../routes.js';
import { CodeBlock } from '../../design/index.js';
import { H2, Note } from './parts.jsx';

export const title = 'Watch and alerts';
export const lead = 'Agents re-test your live site on a schedule and tell you the day AI shoppers can no longer do a task.';

export default function Watch() {
  return (
    <>
      <H2 id="how">How a watch works</H2>
      <ol>
        <li>Add a site in <a href={href('app', 'watch')}>Watch</a> and pick how often (10 minutes to once a day) and what to check: Add to cart alone, or all four tasks.</li>
        <li>Each check is a normal test. It is compared with the last check where every watched task passed.</li>
        <li>If a task went from pass to fail, needed many more steps, hit a new serious problem or met a bot wall, the failing task runs once more right away. Only a second failure sends an alert.</li>
        <li>When the task works again you get a recovery message.</li>
      </ol>
      <H2 id="alerts">Alerts</H2>
      <p>Set <code>ALERT_WEBHOOK_URL</code> to a Slack or Discord incoming webhook. A message looks like this:</p>
      <CodeBlock label="Alert" code={"🔴 AgentReady: AI shoppers can't add to cart on your-store.com since 14:00.\nLast good: 13:40 (7 steps). Now: \"Something went wrong\". Report: http://localhost:4000/#/app/test/rep_..."} />
      <H2 id="cost">Cost</H2>
      <p>A check that only watches Add to cart costs about ₹10; all four tasks about ₹40. A watch every 20 minutes runs 72 checks a day, so choose the schedule with that in mind. A person's own test always goes ahead of a waiting watch check.</p>
      <Note>Pausing a watch, or pressing Stop check, cancels the check that is running. A stopped check leaves no history row and sends no alert.</Note>
    </>
  );
}
