// Docs pages in reading order (redesign spec 5.7). Each module exports title, lead and a default component.
import * as GettingStarted from './GettingStarted.jsx';
import * as Scoring from './Scoring.jsx';
import * as Findings from './Findings.jsx';
import * as TaskPacks from './TaskPacks.jsx';
import * as Cli from './Cli.jsx';
import * as GithubAction from './GithubAction.jsx';
import * as Api from './Api.jsx';
import * as Watch from './Watch.jsx';
import * as SelfHosting from './SelfHosting.jsx';
import * as ResponsibleTesting from './ResponsibleTesting.jsx';

export const DOC_GROUPS = [
  { label: 'Start', pages: [['getting-started', GettingStarted], ['scoring', Scoring], ['findings', Findings], ['task-packs', TaskPacks]] },
  { label: 'Developers', pages: [['cli', Cli], ['github-action', GithubAction], ['api', Api]] },
  { label: 'Running it', pages: [['watch', Watch], ['self-hosting', SelfHosting], ['responsible-testing', ResponsibleTesting]] },
];
export const DOCS = Object.fromEntries(DOC_GROUPS.flatMap((g) => g.pages));
