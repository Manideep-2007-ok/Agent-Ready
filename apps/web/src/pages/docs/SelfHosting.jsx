import { CodeBlock } from '../../design/index.js';
import { H2, Note, Table } from './parts.jsx';

export const title = 'Self-hosting and settings';
export const lead = 'Run the server and dashboard on your own machine. Settings come from environment variables or a .env file.';

export default function SelfHosting() {
  return (
    <>
      <H2 id="run">Run it</H2>
      <CodeBlock label="Terminal" code={'npm install\ncp .env.example .env     # add TINYFISH_API_KEY\nnpm run build -w @agentready/web\nnpm start                # dashboard and API on http://localhost:4000'} />
      <p>The server starts without a <code>.env</code> file. Reports, watches and screenshots are stored as JSON files under <code>data/</code>.</p>
      <H2 id="settings">Settings</H2>
      <Table head={['Variable', 'Example', 'What it does']} mono={[0, 1]} rows={[
        ['TINYFISH_API_KEY', 'sk-tinyfish-…', 'Key for real agent runs (server and CLI only)'],
        ['TINYFISH_MOCK', '1', 'Replay mode: recorded runs, no cost'],
        ['TINYFISH_MAX_PARALLEL', '2', 'Agent runs at once (your TinyFish plan limit)'],
        ['TINYFISH_MAX_DURATION_SECONDS', '150', 'Time cap for one agent run'],
        ['BUDGET_PER_TEST_RUPEES', '300', 'A test stops when its agents have spent this much (0 = no limit)'],
        ['BUDGET_PER_DAY_RUPEES', '1000', 'New tests are refused once today’s spend reaches this (empty = no limit)'],
        ['ALERT_WEBHOOK_URL', 'https://hooks.slack.com/…', 'Slack or Discord webhook for Watch alerts'],
        ['PUBLIC_BASE_URL', 'https://…trycloudflare.com', 'Public address for TinyFish webhooks (optional)'],
        ['LLM_PROVIDER / LLM_API_KEY', 'gemini / …', 'AI write-ups in the Detailed Fix Report; templates without'],
        ['DEMO_STORE_URL', 'https://agent-ready-demo.vercel.app', 'Shows the demo store buttons'],
        ['PORT / HOST', '4000 / 127.0.0.1', 'Where the server listens'],
        ['RATE_LIMIT_PER_MIN / MAX_ACTIVE_TESTS', '10 / 6', 'Request limits'],
        ['FEATURE_RACE, FEATURE_WATCH, …', 'true', 'Turn a feature off without touching code'],
        ['LOG_LEVEL', 'silent', 'Turn the JSON log lines off'],
      ]} />
      <Note>Never put the TinyFish key in frontend code or commit .env. Screenshots reach the browser through the server, so the key stays on the server.</Note>
    </>
  );
}
