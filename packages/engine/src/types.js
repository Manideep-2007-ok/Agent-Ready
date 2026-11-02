// THE CONTRACT. Shared by engine, server, web and cli (JSDoc types, no build step).
// Change only with team agreement, and update docs/ARCHITECTURE.md + docs/DECISIONS.md in the same commit.
// Editors and coding agents read these @typedefs; import them with:
//   /** @typedef {import('@agentready/engine/types').SiteReport} SiteReport */

/** @typedef {'find_price'|'add_to_cart'|'find_returns'|'find_contact'|'custom'} TaskId */
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
 *   |'unlabelled-buttons'|'price-in-image'|'no-product-schema'|'wrong-quantity'|'currency-mismatch'} FindingType
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
 */

/**
 * @typedef {Object} SiteReport
 * @property {string} id                e.g. rep_20261101_1210_nykaa
 * @property {string} url
 * @property {ReportSource} source
 * @property {string} testedAt          ISO
 * @property {'shopping'} pack
 * @property {'running'|'complete'|'cancelled'} status   cancelled = stopped by the user (no score)
 * @property {number} score             0-100
 * @property {BotWallVerdict} botWall
 * @property {number} costRupees
 * @property {Framework} framework
 * @property {InstantScan|null} instantScan
 * @property {TaskResult[]} tasks
 * @property {Finding[]} topFixes       top 3: task findings + scanFindings, ranked as in D25
 * @property {Finding[]} [scanFindings]  Instant Scan findings (not part of the 100 score)
 */

/**
 * Server -> dashboard SSE messages. Sent as `data: <JSON>\n\n`.
 * @typedef {{type:'task-update',reportId:string,task:TaskResult}
 *   |{type:'step',reportId:string,taskId:TaskId,step:Step}
 *   |{type:'streaming-url',reportId:string,taskId:TaskId,url:string}
 *   |{type:'instant-scan',reportId:string,scan:InstantScan}
 *   |{type:'report-complete',reportId:string,report:SiteReport}
 *   |{type:'watch-alert',watchId:string,message:string,lastGood:SiteReport|null,current:SiteReport}
 *   |{type:'watch-recovered',watchId:string,message:string,current:SiteReport}} LiveEvent
 */

/**
 * @typedef {Object} Watch
 * @property {string} id
 * @property {string} url
 * @property {TaskId[]} tasks
 * @property {number} everyMinutes
 * @property {boolean} enabled
 * @property {string} createdAt
 * @property {string|null} lastGoodReportId
 * @property {boolean} failing
 */

export const TASK_IDS = /** @type {const} */ (['find_price', 'add_to_cart', 'find_returns', 'find_contact', 'custom']);
export const FINDING_TYPES = /** @type {const} */ ([
  'blocks-cloud-agents', 'blocks-automation', 'site-broken', 'needed-web-search', 'cart-not-found',
  'price-not-found', 'returns-not-found', 'contact-not-found', 'too-many-steps', 'slow', 'popup-blocking',
  'unlabelled-buttons', 'price-in-image', 'no-product-schema', 'wrong-quantity', 'currency-mismatch',
]);
