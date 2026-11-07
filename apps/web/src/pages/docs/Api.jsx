import { H2, Note, Table } from './parts.jsx';

export const title = 'API';
export const lead = 'The dashboard is built on a small JSON API. Everything it does, you can do too.';

export default function Api() {
  return (
    <>
      <Note>The server listens on 127.0.0.1:4000 by default and refuses requests from other websites. Endpoints that start agents are rate limited (10 a minute per client).</Note>
      <H2 id="tests">Tests</H2>
      <Table head={['Method and path', 'Body or query', 'Returns']} mono={[0, 1]} rows={[
        ['POST /api/tests', '{url, pack?, tasks?, customTask?, confirm?}', '{reportId}; the test runs in the background'],
        ['GET /api/tests/:id', '', 'The report'],
        ['GET /api/tests/:id/events', '', 'Live updates (server-sent events); the first messages replay what already happened'],
        ['POST /api/tests/:id/cancel', '', 'Stops a running test; idempotent'],
        ['GET /api/tests', '', 'Recent reports'],
        ['GET /api/estimate', '?tasks=4&confirm=1', 'Cost range in rupees and the limits a test runs under'],
        ['GET /api/sites/history', '?url=', 'Every finished test of one site, oldest first'],
        ['POST /api/reports/:id/fixes', '', 'The report with the Detailed Fix Report added'],
        ['POST /api/instant-scan', '{url}', 'Instant Scan only'],
        ['GET /api/badge/:id.svg', '', 'A score badge for a README'],
      ]} />
      <H2 id="watch">Watch</H2>
      <Table head={['Method and path', 'Body', 'Returns']} mono={[0, 1]} rows={[
        ['GET /api/watch', '', 'Every watch'],
        ['POST /api/watch', '{url, everyMinutes, tasks}', 'The new watch (5 to 1440 minutes, at most 20 watches)'],
        ['POST /api/watch/:id/run-now', '', '{reportId} of the check'],
        ['PATCH /api/watch/:id', '{enabled?, everyMinutes?}', 'The watch; pausing also stops a running check'],
        ['GET /api/watch/:id/history', '', 'Past checks'],
      ]} />
      <H2 id="other">Other</H2>
      <Table head={['Method and path', 'Returns']} mono={[0]} rows={[
        ['GET /api/health', 'Version, replay mode, feature flags, agent queue and spending limits'],
        ['POST /api/race', 'Starts one task on 2 or 3 sites at once'],
        ['GET /api/leaderboard', 'Saved reports ranked by score'],
      ]} />
      <H2 id="errors">Errors</H2>
      <p>Errors are JSON <code>{'{"error": "plain message"}'}</code> with a 4xx or 5xx status. <code>429</code> means a rate limit, too many tests at once, or today's budget is spent.</p>
    </>
  );
}
