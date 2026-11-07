import { CodeBlock } from '../../design/index.js';
import { href } from '../../routes.js';
import { H2, Note } from './parts.jsx';

export const title = 'Getting started';
export const lead = 'AgentReady sends real TinyFish web agents to your website to do what a shopper does, then scores the result and tells you what to fix.';

export default function GettingStarted() {
  return (
    <>
      <H2 id="first-test">Run your first test</H2>
      <ol>
        <li>Open the <a href={href('app', 'tests')}>app</a> and type your website.</li>
        <li>Pick the kind of site, or leave <b>Detect it for me</b>: the Instant Scan reads your page and chooses the tasks.</li>
        <li>Press <b>Run test</b>. Four agents start at once; you can watch each one live.</li>
        <li>When they finish you get a score out of 100, the Top 3 fixes, every finding with its screenshot, and a step-by-step replay.</li>
      </ol>
      <Note>Tick <b>Confirm results</b> to run each task again and keep the majority. It costs about twice as much and makes a score you can share.</Note>
      <H2 id="what-you-get">What a report contains</H2>
      <ul>
        <li><b>Overview</b>: score, bot-wall result, Top 3 fixes, a ledger of the tasks and the live agent runs.</li>
        <li><b>Findings</b>: each problem answers what happened, where, why it breaks agents, how bad it is, how to fix it and how to check the fix. The Detailed Fix Report adds the page element and a code example for your framework.</li>
        <li><b>Steps</b>: every step each agent took, with a screenshot, and a Replay button.</li>
        <li><b>History</b>: the score of this site over time and what changed since the last test.</li>
        <li><b>Scan</b>: the Instant Scan: pop-ups, unlabelled buttons, prices drawn as images, product data, robots.txt rules for AI agents.</li>
      </ul>
      <H2 id="run-it-yourself">Run AgentReady yourself</H2>
      <p>You need Node 20.19 or later. Without a TinyFish key it runs in replay mode: recorded agent runs, no cost.</p>
      <CodeBlock label="Terminal" code={'git clone https://github.com/Manideep-2007-ok/Agent-Ready\ncd Agent-Ready\nnpm install\nnpm run build -w @agentready/web\nnpm start            # http://localhost:4000'} />
      <p>For live agents, copy <code>.env.example</code> to <code>.env</code>, set <code>TINYFISH_API_KEY</code> and remove <code>TINYFISH_MOCK=1</code>. See <a href={href('docs', 'self-hosting')}>Self-hosting and settings</a>.</p>
    </>
  );
}
