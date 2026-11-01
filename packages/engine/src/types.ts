// THE CONTRACT. Shared by engine, server, web, cli.
// Change only with team agreement, and update docs/ARCHITECTURE.md in the same commit.

export type TaskId = 'find_price' | 'add_to_cart' | 'find_returns' | 'find_contact' | 'custom';
export type BrowserMode = 'lite' | 'stealth';
export type ProxySetting = 'off' | 'IN' | 'US';
export type TaskStatus = 'queued' | 'running' | 'passed' | 'failed' | 'blocked';
export type BotWallVerdict = 'none' | 'blocks-cloud-agents' | 'blocks-automation' | 'site-broken';
export type ReportSource = 'web' | 'cli' | 'watch' | 'ci' | 'race';
export type Framework = 'nextjs' | 'shopify' | 'unknown';
export type Severity = 'critical' | 'high' | 'medium' | 'low';

export type FindingType =
  | 'blocks-cloud-agents'
  | 'blocks-automation'
  | 'site-broken'
  | 'needed-web-search'
  | 'cart-not-found'
  | 'price-not-found'
  | 'returns-not-found'
  | 'contact-not-found'
  | 'too-many-steps'
  | 'slow'
  | 'popup-blocking'
  | 'unlabelled-buttons'
  | 'price-in-image'
  | 'no-product-schema';

/** What the agent returns (asked for in GOAL_SUFFIX). */
export interface AgentAnswer {
  success: boolean;
  answer: string | null;
  blocker: string | null;
  stuck_url: string | null;
}

export interface Step {
  id: string;              // TinyFish step id
  label: string;           // PROGRESS "purpose" / run step "action"
  seconds: number | null;  // step duration
  screenshotUrl: string;   // OUR proxy: /api/shot/<runId>/<stepId>
  usedWebSearch: boolean;  // PROGRESS event had tinyfish_api === "search"
  at?: string;             // ISO timestamp
}

export interface ElementEvidence {
  selector: string;
  htmlSnippet: string;
  text: string;
  ariaLabel: string | null;
  box: { x: number; y: number; width: number; height: number } | null;
}

export interface Finding {
  type: FindingType;
  taskId?: TaskId;
  severity: Severity;
  text: string;            // what happened, plain English
  likelyCause: string;     // labelled "likely cause" in UI when inferred
  fix: string;             // short fix rule
  standard?: string;       // e.g. "WCAG 4.1.2 Name, Role, Value"
  frameworkExample?: string;
  passCheck?: string;      // e.g. "Add to cart passes in 5 steps or fewer"
  pointsIfFixed: number;
  verified: boolean;       // backed by steps/screenshots
  screenshotUrl?: string;
  element?: ElementEvidence;
}

export interface TaskResult {
  taskId: TaskId;
  goal: string;
  mode: BrowserMode;
  proxy: ProxySetting;
  runId: string | null;
  status: TaskStatus;
  answer: string | null;
  blocker: string | null;
  stuckUrl: string | null;
  streamingUrl: string | null;
  steps: Step[];
  numSteps: number;
  seconds: number;
  points: number;
  findings: Finding[];
  attempts?: { mode: BrowserMode; proxy: ProxySetting; runId: string | null; passed: boolean }[]; // bot-wall cascade
}

export interface InstantScan {
  pageTextChars: number;
  unlabelledButtons: number;
  totalButtonsAndLinks: number;
  imagesWithoutAlt: number;
  totalImages: number;
  priceAsText: boolean;
  overlayCoveringPage: boolean;
  productSchema: boolean;
  robotsTxt: 'found' | 'missing' | 'error';
  sitemap: 'found' | 'missing' | 'error';
  framework: Framework;
  seconds: number;
}

export interface SiteReport {
  id: string;              // e.g. rep_20261101_1210_nykaa
  url: string;
  source: ReportSource;
  testedAt: string;        // ISO
  pack: 'shopping';
  status: 'running' | 'complete';
  score: number;           // 0-100
  botWall: BotWallVerdict;
  costRupees: number;
  framework: Framework;
  instantScan: InstantScan | null;
  tasks: TaskResult[];
  topFixes: Finding[];     // top 3 by pointsIfFixed
}

/** Server -> dashboard SSE messages. */
export type LiveEvent =
  | { type: 'task-update'; reportId: string; task: TaskResult }
  | { type: 'step'; reportId: string; taskId: TaskId; step: Step }
  | { type: 'streaming-url'; reportId: string; taskId: TaskId; url: string }
  | { type: 'instant-scan'; reportId: string; scan: InstantScan }
  | { type: 'report-complete'; reportId: string; report: SiteReport }
  | { type: 'watch-alert'; watchId: string; message: string; lastGood: SiteReport | null; current: SiteReport }
  | { type: 'watch-recovered'; watchId: string; message: string; current: SiteReport };

export interface Watch {
  id: string;
  url: string;
  tasks: TaskId[];
  everyMinutes: number;
  enabled: boolean;
  createdAt: string;
  lastGoodReportId: string | null;
  failing: boolean;
}
