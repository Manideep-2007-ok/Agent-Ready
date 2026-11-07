import { CodeBlock } from '../../design/index.js';
import { H2, Note, Table } from './parts.jsx';

export const title = 'CLI';
export const lead = 'Test a site from your terminal, including one that only runs on your laptop.';

export default function Cli() {
  return (
    <>
      <H2 id="install">Run it</H2>
      <CodeBlock label="Terminal" code={'npx @agentready/cli http://localhost:3000\nnpx @agentready/cli https://your-store.com --no-tunnel'} />
      <p>It needs <code>TINYFISH_API_KEY</code> in the environment or in a <code>.env</code> file in the current folder. For a localhost address the CLI opens a Cloudflare quick tunnel (install <code>cloudflared</code> first) so the cloud agents can reach your laptop, and closes it when the test ends.</p>
      <H2 id="options">Options</H2>
      <Table head={['Option', 'What it does']} rows={[
        ['--pack P', 'auto (default: read the site and pick), shop, saas, content or local'],
        ['--tasks LIST', 'Task ids from any pack, comma separated; quick = the two key tasks; none = only --task'],
        ['--task TEXT', 'A task of your own, up to 300 characters, scored separately'],
        ['--confirm', 'Run each task again (a third time if they disagree) and keep the majority; about 2x cost'],
        ['--no-tunnel', 'Test the address as it is (for public sites)'],
        ['--no-scan', 'Skip the Instant Scan'],
        ['--min-score N', 'Exit with code 1 when the score is below N (for CI)'],
        ['--badge FILE', 'Write a score badge (SVG) after the run'],
        ['--json', 'Print the full report as JSON on stdout; progress goes to stderr'],
        ['--version', 'Print the version'],
      ]} />
      <H2 id="exit-codes">Exit codes</H2>
      <Table head={['Code', 'Meaning']} rows={[
        ['0', 'The test finished (and reached --min-score)'],
        ['1', 'Score below --min-score, or the test could not finish (including its cost limit)'],
        ['2', 'Usage or setup problem: unknown option, bad address, no key, no cloudflared'],
        ['130 / 143', 'Stopped with Ctrl+C / SIGTERM: in-flight agent runs are cancelled first'],
      ]} />
      <H2 id="upload">Send results to a dashboard</H2>
      <p>Set <code>AGENTREADY_SERVER=http://localhost:4000</code> and the CLI uploads its report and prints a link to it.</p>
      <Note>Each agent step costs about $0.016. A two-task quick run on a small site costs roughly ₹15 to ₹25.</Note>
    </>
  );
}
