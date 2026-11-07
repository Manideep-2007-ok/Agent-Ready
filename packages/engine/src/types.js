// THE CONTRACT. Shared by engine, server, web and cli (JSDoc types, no build step).
// Change only with team agreement, and update docs/ARCHITECTURE.md + docs/DECISIONS.md in the same commit.
// Editors and coding agents read these @typedefs; import them with:
//   /** @typedef {import('@agentready/engine/types').SiteReport} SiteReport */

/**
 * shop: find_price, add_to_cart, find_returns, find_contact. saas: find_pricing_plans, reach_signup, find_docs, contact_sales.
 * content: search_topic, read_article, find_newsletter, find_author_contact. local: find_hours, find_location,
 * find_menu_or_services, reach_booking. 'custom' is the user's own task (scored separately, not in the 100).
 * @typedef {'find_price'|'add_to_cart'|'find_returns'|'find_contact'
 *   |'find_pricing_plans'|'reach_signup'|'find_docs'|'contact_sales'
 *   |'search_topic'|'read_article'|'find_newsletter'|'find_author_contact'
 *   |'find_hours'|'find_location'|'find_menu_or_services'|'reach_booking'|'custom'} TaskId
 */
/**
 * Task pack = the kind of site a test is written for (D40). Reports made before packs existed say 'shopping' (= 'shop').
 * @typedef {'shop'|'saas'|'content'|'local'} PackId
 */
/** @typedef {'lite'|'stealth'} BrowserMode */
/** @typedef {'off'|'IN'|'US'} ProxySetting */
/** @typedef {'queued'|'running'|'passed'|'failed'|'blocked'|'cancelled'} TaskStatus   cancelled = the test was stopped (final, never retried) */
/** @typedef {'none'|'blocks-cloud-agents'|'blocks-automation'|'site-broken'} BotWallVerdict */
/** @typedef {'web'|'cli'|'watch'|'ci'|'race'} ReportSource */
/** @typedef {'nextjs'|'shopify'|'unknown'} Framework */
/** @typedef {'critical'|'high'|'medium'|'low'} Severity */

/**
 * @typedef {'blocks-cloud-agents'|'blocks-automation'|'site-broken'|'needed-web-search'|'cart-not-found'
 *   |'price-not-found'|'returns-not-found'|'contact-not-found'|'too-many-steps'|'slow'|'popup-blocking'
 *   |'unlabelled-buttons'|'price-in-image'|'no-product-schema'|'wrong-quantity'|'currency-mismatch'
 *   |'pricing-not-found'|'signup-not-found'|'docs-not-found'|'sales-contact-not-found'
 *   |'search-not-found'|'article-not-readable'|'newsletter-not-found'|'author-contact-not-found'
 *   |'hours-not-found'|'location-not-found'|'menu-not-found'|'booking-not-found'
 *   |'no-cart-feedback'|'inconsistent-results'|'unconfirmed-claim'|'robots-blocks-ai-agents'|'no-cart-link'|'not-in-search'} FindingType
 */

/**
 * What the agent returns (asked for in GOAL_SUFFIX, see goals.js).
 * @typedef {Object} AgentAnswer
 * @property {boolean} success
 * @property {string|null} answer
 * @property {string|null} blocker
 * @property {string|null} stuck_url
 */

/**
 * @typedef {Object} Step
 * @property {string} id               TinyFish step id
 * @property {string} label            PROGRESS "purpose" or run step "action"
 * @property {number|null} seconds     step duration
 * @property {string} screenshotUrl    OUR proxy path: /api/shot/<runId>/<stepId>
 * @property {boolean} usedWebSearch   PROGRESS event had tinyfish_api === "search"
 * @property {string} [at]             ISO timestamp
 */

/**
 * @typedef {Object} ElementEvidence
 * @property {string} selector
 * @property {string} htmlSnippet
 * @property {string} text
 * @property {string|null} ariaLabel
 * @property {{x:number,y:number,width:number,height:number}|null} box
 */

/**
 * @typedef {Object} Finding
 * @property {FindingType} type
 * @property {TaskId} [taskId]
 * @property {Severity} severity
 * @property {string} text              what happened, plain English
 * @property {string} likelyCause       shown as "Likely cause" when inferred
 * @property {string} fix               short fix rule
 * @property {string} [standard]        e.g. "WCAG 4.1.2 Name, Role, Value"
 * @property {string} [frameworkExample]
 * @property {string} [passCheck]       e.g. "Add to cart passes in 5 steps or fewer"
 * @property {number} pointsIfFixed
 * @property {boolean} verified         backed by steps/screenshots
 * @property {string} [screenshotUrl]
 * @property {ElementEvidence} [element]
 */

/**
 * @typedef {Object} Attempt   one run inside the bot-wall cascade
 * @property {BrowserMode} mode
 * @property {ProxySetting} proxy
 * @property {string|null} runId
 * @property {boolean} passed
 * @property {number} [numSteps]
 * @property {string|null} [blocker]
 * @property {string} [screenshotUrl]
 */

/**
 * One run of a confirmed task (D41). runs[0] is the bot-wall cascade's result; the others are repeats with the same mode
 * and proxy. A repeat stopped by a Stop click is listed (its steps were billed) but not counted in the majority.
 * @typedef {Object} RepeatRun
 * @property {string|null} runId
 * @property {boolean} passed
 * @property {number} numSteps
 * @property {number} seconds
 * @property {string|null} blocker
 * @property {string|null} answer
 * @property {boolean} [stopped]
 */

/**
 * Claim check (D42): the page named in a passed task's answer, read with TinyFish Fetch, and whether it shows the facts
 * the agent reported. No ClaimCheck on a task = nothing to check, or the page could not be read.
 * @typedef {Object} ClaimCheck
 * @property {'confirmed'|'not-found'|'off-site'} status   off-site = the answer names a page on another website
 * @property {string} url
 * @property {{label:string, found:boolean}[]} facts
 */

/**
 * @typedef {Object} TaskResult
 * @property {TaskId} taskId
 * @property {string} goal
 * @property {BrowserMode} mode          mode of the attempt shown
 * @property {ProxySetting} proxy
 * @property {string|null} runId
 * @property {TaskStatus} status
 * @property {string|null} answer
 * @property {string|null} blocker
 * @property {string|null} stuckUrl
 * @property {string|null} streamingUrl
 * @property {Step[]} steps
 * @property {number} numSteps
 * @property {number} seconds
 * @property {number} points            0-25
 * @property {Finding[]} findings
 * @property {Attempt[]} [attempts]
 * @property {BotWallVerdict} [verdict]
 * @property {string} [replayNote]       replay mode only: why this (custom) task has no real answer
 * @property {RepeatRun[]} [runs]        confirmed tests only (D41): every run, the shown one decided by majority
 * @property {boolean} [flaky]           confirmed tests only: the runs disagreed
 * @property {{run:number, of:number}} [confirming]  live only: a repeat run is going
 * @property {ClaimCheck} [claim]        D42
 */

/**
 * @typedef {Object} InstantScan
 * @property {number} pageTextChars
 * @property {number} unlabelledButtons
 * @property {number} totalButtonsAndLinks
 * @property {number} imagesWithoutAlt
 * @property {number} totalImages
 * @property {boolean} priceAsText
 * @property {boolean} overlayCoveringPage
 * @property {boolean} productSchema
 * @property {'found'|'missing'|'error'} robotsTxt
 * @property {'found'|'missing'|'error'} sitemap
 * @property {Framework} framework
 * @property {number} seconds
 * @property {string[]} [schemaTypes]   schema.org @type names found in JSON-LD (used by detectPack)
 * @property {Record<string,number>} [keywordHits]  how often cart, pricing, signup, docs, article, newsletter, hours, booking and menu words appear (used by detectPack)
 * @property {string[]} [aiBlockedAgents]  AI agents that robots.txt tells to stay away from the whole site (Scan v2)
 * @property {'found'|'missing'|'error'} [llmsTxt]  /llms.txt (Scan v2)
 * @property {boolean} [cartLink]       a visible link or button to the cart on the home or product page (Scan v2)
 * @property {{topic:string, found:boolean, url:string|null}[]} [searchFindable]  P2-5: whether TinyFish Search, restricted to
 *   this site, finds the two key pages for its pack (absent when the search did not run)
 */

/**
 * @typedef {Object} SiteReport
 * @property {string} id                e.g. rep_20261101_1210_nykaa
 * @property {string} url
 * @property {ReportSource} source
 * @property {string} testedAt          ISO
 * @property {PackId} pack             kind of site tested (older reports say 'shopping' = shop; read it with normalisePack)
 * @property {string} [customText]      the custom task's text, when one was run
 * @property {boolean} [packDetected]    pack 'auto': true when the Instant Scan chose the pack, false when it could not read the page and shop was used
 * @property {boolean} [detectingPack]  pack 'auto': true while the Instant Scan is still choosing (no lanes yet); removed once chosen
 * @property {'running'|'complete'|'cancelled'} status   cancelled = stopped by the user (no score)
 * @property {number} score             0-100
 * @property {BotWallVerdict} botWall
 * @property {number} costRupees
 * @property {Framework} framework
 * @property {InstantScan|null} instantScan
 * @property {TaskResult[]} tasks
 * @property {Finding[]} topFixes       top 3: task findings + scanFindings, ranked as in D25
 * @property {Finding[]} [scanFindings]  Instant Scan findings (not part of the 100 score)
 * @property {boolean} [confirm]        each task was confirmed with repeat runs (D41)
 * @property {'user'|'budget'} [stopReason]  why a cancelled test stopped (budget = its cost limit, D43)
 * @property {number} [budgetRupees]    the cost limit the test ran under, if any
 */

/**
 * Server -> dashboard SSE messages. Sent as `data: <JSON>\n\n`.
 * @typedef {{type:'task-update',reportId:string,task:TaskResult}
 *   |{type:'step',reportId:string,taskId:TaskId,step:Step}
 *   |{type:'streaming-url',reportId:string,taskId:TaskId,url:string}
 *   |{type:'instant-scan',reportId:string,scan:InstantScan}
 *   |{type:'pack-detected',reportId:string,pack:PackId,detected:boolean}
 *   |{type:'report-complete',reportId:string,report:SiteReport}
 *   |{type:'watch-alert',watchId:string,message:string,lastGood:SiteReport|null,current:SiteReport}
 *   |{type:'watch-recovered',watchId:string,message:string,current:SiteReport}} LiveEvent
 */

/**
 * @typedef {Object} Watch
 * @property {string} id
 * @property {string} url
 * @property {TaskId[]} tasks
 * @property {PackId} [pack]            pack the tasks came from (older watches have none: shop)
 * @property {number} everyMinutes
 * @property {boolean} enabled
 * @property {string} createdAt
 * @property {string|null} lastGoodReportId
 * @property {boolean} failing
 * @property {string|null} [monitorId]  TinyFish Page Monitor on the watched page (P2-5; watches of 2 hours or more, with PUBLIC_BASE_URL)
 */

export const TASK_IDS = /** @type {const} */ ([
  'find_price', 'add_to_cart', 'find_returns', 'find_contact',
  'find_pricing_plans', 'reach_signup', 'find_docs', 'contact_sales',
  'search_topic', 'read_article', 'find_newsletter', 'find_author_contact',
  'find_hours', 'find_location', 'find_menu_or_services', 'reach_booking',
  'custom',
]);
export const FINDING_TYPES = /** @type {const} */ ([
  'blocks-cloud-agents', 'blocks-automation', 'site-broken', 'needed-web-search', 'cart-not-found',
  'price-not-found', 'returns-not-found', 'contact-not-found', 'too-many-steps', 'slow', 'popup-blocking',
  'unlabelled-buttons', 'price-in-image', 'no-product-schema', 'wrong-quantity', 'currency-mismatch',
  'pricing-not-found', 'signup-not-found', 'docs-not-found', 'sales-contact-not-found',
  'search-not-found', 'article-not-readable', 'newsletter-not-found', 'author-contact-not-found',
  'hours-not-found', 'location-not-found', 'menu-not-found', 'booking-not-found',
  'no-cart-feedback', 'inconsistent-results', 'unconfirmed-claim', 'robots-blocks-ai-agents', 'no-cart-link', 'not-in-search',
]);
export const PACK_ID_LIST = /** @type {const} */ (['shop', 'saas', 'content', 'local']);
