import { CodeBlock } from '../../design/index.js';
import { H2, Note, Table } from './parts.jsx';

export const title = 'GitHub Action';
export const lead = 'Test the preview of every pull request and get one comment with the score, the failed tasks and the fixes.';

const YAML = `name: AgentReady
on:
  pull_request:
    types: [labeled, synchronize, reopened]
jobs:
  agentready:
    if: contains(github.event.pull_request.labels.*.name, 'agentready')
    runs-on: ubuntu-latest
    permissions: { contents: read, pull-requests: write }
    steps:
      - uses: Manideep-2007-ok/Agent-Ready@v1
        with:
          url: https://your-preview.example.com
          tinyfish-api-key: \${{ secrets.TINYFISH_API_KEY }}
          min-score: 80`;

export default function GithubAction() {
  return (
    <>
      <H2 id="setup">Set it up</H2>
      <ol>
        <li>Add your TinyFish key as the repository secret <code>TINYFISH_API_KEY</code>.</li>
        <li>Add the workflow below. Gating on a label keeps cost under control: every run uses real agent steps.</li>
        <li>Put the label <code>agentready</code> on a pull request.</li>
      </ol>
      <CodeBlock label=".github/workflows/agentready.yml" code={YAML} />
      <H2 id="inputs">Inputs</H2>
      <Table head={['Input', 'Default', 'What it does']} mono={[0, 1]} rows={[
        ['url', '—', 'Public address to test; a preview deployment works (cloud agents cannot reach localhost)'],
        ['tinyfish-api-key', '—', 'From a repository secret, never as plain text'],
        ['pack', 'auto', 'auto, shop, saas, content or local'],
        ['tasks', 'quick', 'Task ids, quick (two key tasks) or none'],
        ['task', '', 'A task of your own, scored separately'],
        ['min-score', '0', 'Fail the job below this score; 0 reports only'],
        ['comment', 'true', 'Post or update one PR comment'],
        ['cli-version', '', 'A version from npm; empty builds the CLI from the action source'],
      ]} />
      <H2 id="outputs">Outputs</H2>
      <p><code>score</code> (empty when the test could not finish) and <code>passed</code> (true when the score reached <code>min-score</code>). The report JSON, the badge and the comment are uploaded as the artifact <code>agentready-report</code>.</p>
      <Note>A cancelled job sends the CLI a stop signal, so its agent runs are cancelled on TinyFish and stop costing money.</Note>
    </>
  );
}
