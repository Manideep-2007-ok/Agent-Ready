// Detailed Fix Report (ARCHITECTURE section 9): evidence, framework, AI write-up, templates.
// Every text names a SITE cause. Never blame the agent (DECISIONS D22).
import { chromium } from 'playwright-core';
import { config } from './config.js';
import { createBrowserSession, closeBrowserSession } from './tinyfish.js';
import { FINDING_TYPES } from './types.js';

/** @typedef {import('./types.js').Finding} Finding */
/** @typedef {import('./types.js').SiteReport} SiteReport */
/** @typedef {import('./types.js').Framework} Framework */
/** @typedef {import('./types.js').ElementEvidence} ElementEvidence */

const BOT_STANDARD = 'Bot protection allowlisting for verified AI agents';
const botFix =
  'Ask your security team or bot-protection vendor (Cloudflare, Akamai, etc.) to allow verified AI agents on product, cart, policy and contact pages, and to stop serving error pages to cloud-hosted browsers.';

/** @type {Record<string, {likelyCause:string, fix:string, standard:string, passCheck:string, frameworkExamples?:Record<string,string>}>} */
export const FIX_TEMPLATES = {
  'blocks-cloud-agents': {
    likelyCause: 'Your bot protection treats visitors from cloud-server addresses as hostile and shows an error page instead of the site.',
    fix: botFix,
    standard: BOT_STANDARD,
    passCheck: 'The same task passes on the first attempt, without a proxy, in a normal cloud browser.',
    frameworkExamples: {
      nextjs: 'In your CDN/WAF rules (Cloudflare, Vercel Firewall), add an allow rule for verified-bot or AI-agent traffic ahead of the challenge rule.',
      shopify: 'Shopify bot protection is managed by Shopify; if you front the store with Cloudflare, add a skip rule for verified AI agents in WAF custom rules.',
      unknown: 'In your WAF/CDN dashboard, add an allow or skip rule for verified AI agent traffic ahead of the challenge or block rule.',
    },
  },
  'blocks-automation': {
    likelyCause: 'Your bot protection blocks automated browsers even when they come from a normal residential address.',
    fix: botFix,
    standard: BOT_STANDARD,
    passCheck: 'The task passes with a standard browser profile and no stealth mode.',
    frameworkExamples: {
      nextjs: 'Relax the browser-fingerprint challenge for verified agents in your WAF, or serve a signed-agent allowlist.',
      shopify: 'Review third-party bot-protection apps installed on the store and whitelist verified AI agents.',
      unknown: 'Review fingerprint and JavaScript-challenge rules in your bot protection and allow verified AI agents.',
    },
  },
  'site-broken': {
    likelyCause: 'The page failed to load or showed an error or blank page even after changing network identity, so the site itself is not serving content.',
    fix: 'Open the stuck URL in a clean browser, check server logs and uptime monitoring for errors at the time of the test, and make sure the page returns real content.',
    standard: 'Availability: pages must return HTTP 200 with real content',
    passCheck: 'The stuck page loads with product or policy content on the first attempt.',
  },
  'needed-web-search': {
    likelyCause: 'The page the visitor needs is not reachable from your navigation, so visitors have to search the wider web to find it.',
    fix: 'Link the page directly from the header or footer with a clear label, and list it in your sitemap.xml.',
    standard: 'Sitemaps protocol and clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'The page is found by following site links only, without any web search.',
    frameworkExamples: {
      nextjs: 'Add the link to your shared footer component and export the route from app/sitemap.js.',
      shopify: 'Add the page to Online Store > Navigation > Footer menu.',
      unknown: 'Add a footer link with the page name (for example "Returns") on every page.',
    },
  },
  'cart-not-found': {
    likelyCause: 'The Add to cart control or the cart page is hard to find or identify: it may be an icon without a text label, or covered by another element.',
    fix: 'Give the add-to-cart button visible text or an aria-label, keep it free of overlays, and make the cart total readable as text on the cart page.',
    standard: 'WCAG 4.1.2 Name, Role, Value',
    passCheck: 'Add to cart and reading the cart total passes in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<button type="button" aria-label="Add to cart" onClick={add}>Add to cart</button>',
      shopify: 'In your theme, make sure the product form submit uses {{ "products.product.add_to_cart" | t }} as visible text.',
      unknown: '<button type="button" aria-label="Add to cart">Add to cart</button>',
    },
  },
  'price-not-found': {
    likelyCause: 'The price is not available as text on the page (for example it is drawn inside an image), or it is hidden behind a pop-up.',
    fix: 'Render prices as real text near the product name and expose them in schema.org Product/Offer markup.',
    standard: 'WCAG 1.1.1 Non-text Content; schema.org Product',
    passCheck: 'A product name and price are found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<span itemProp="price" content="499">₹499</span> inside an element with itemType="https://schema.org/Offer".',
      shopify: 'Use {{ product.price | money }} in the theme as text, never as an image.',
      unknown: '<span class="price">₹499</span> instead of <img src="price.png">.',
    },
  },
  'returns-not-found': {
    likelyCause: 'The return policy is buried several clicks deep or not linked from the footer, so visitors cannot reach it directly.',
    fix: 'Add a "Returns" or "Refund policy" link to the footer of every page.',
    standard: 'Clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'The return policy is found in 5 steps or fewer, without web search.',
    frameworkExamples: {
      nextjs: 'Add <Link href="/returns">Returns</Link> to your Footer component.',
      shopify: 'Online Store > Navigation > Footer menu > add "Refund policy".',
      unknown: '<a href="/returns">Returns</a> in the footer.',
    },
  },
  'contact-not-found': {
    likelyCause: 'There is no obvious Contact or Support link in the header or footer, or it opens only inside a hidden chat widget.',
    fix: 'Add a plain "Contact us" link with an email, phone number or form page to the header or footer.',
    standard: 'Clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'A support contact is found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: 'Add <Link href="/contact">Contact us</Link> to your Footer component.',
      shopify: 'Online Store > Navigation > Footer menu > add the Contact page.',
      unknown: '<a href="/contact">Contact us</a> in the footer.',
    },
  },
  'too-many-steps': {
    likelyCause: 'The path to this page takes many clicks because of nested menus or an unclear layout.',
    fix: 'Shorten the path: link the key page from the home page or footer and use clear link labels.',
    standard: 'Clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'The task finishes in 5 steps or fewer.',
  },
  slow: {
    likelyCause: 'Pages load slowly or the flow needs many page loads, often because of heavy scripts, banners or third-party widgets.',
    fix: 'Defer third-party scripts, compress images and avoid blocking banners on key pages.',
    standard: 'Web performance (Core Web Vitals)',
    passCheck: 'The task finishes in under 90 seconds.',
  },
  'popup-blocking': {
    likelyCause: 'A full-page pop-up or banner covers the content and has no easy close control.',
    fix: 'Give every pop-up a labelled close button, let it be dismissed with Escape, and do not cover the whole page on first load.',
    standard: 'WCAG 2.1.2 No Keyboard Trap; WCAG 4.1.2 Name, Role, Value',
    passCheck: 'The page content is reachable without dismissing a pop-up, or the pop-up closes with one click.',
    frameworkExamples: {
      nextjs: '<button aria-label="Close" onClick={close}>×</button> inside the modal, and close on keydown Escape.',
      shopify: 'In your pop-up app settings, enable a visible close button and delay display until after the first interaction.',
      unknown: '<button aria-label="Close dialog">×</button>',
    },
  },
  'unlabelled-buttons': {
    likelyCause: 'Many buttons and links are icons with no text or aria-label, so nothing tells a visitor (or an agent) what they do.',
    fix: 'Add visible text or an aria-label to every icon-only button and link.',
    standard: 'WCAG 4.1.2 Name, Role, Value',
    passCheck: 'No button or link on the page is left without a name.',
    frameworkExamples: {
      nextjs: '<button aria-label="Add to cart"><CartIcon aria-hidden="true" /></button>',
      shopify: 'In the theme, add aria-label="{{ "general.cart" | t }}" to icon-only links in header and product cards.',
      unknown: '<button aria-label="Add to cart"><svg aria-hidden="true">...</svg></button>',
    },
  },
  'price-in-image': {
    likelyCause: 'The price appears only inside an image, so it has no text a screen reader or an agent can read.',
    fix: 'Show the price as real text and, if an image must be used, add matching alt text.',
    standard: 'WCAG 1.1.1 Non-text Content',
    passCheck: 'The price is found as text in the page, in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<p>₹499</p> instead of <Image src="/price.png" />.',
      shopify: 'Use {{ product.price | money }} as text in the product template.',
      unknown: '<span class="price">₹499</span>',
    },
  },
  'wrong-quantity': {
    likelyCause: 'Add to cart may add more than one unit (a quantity box that starts above 1, or no clear "added" message so a second click looks necessary), so the cart total is for more than the one product asked for.',
    fix: 'Start the quantity at 1, add exactly one unit per click, and confirm "Added to cart" in text next to the button.',
    standard: 'WCAG 3.3.1 Error Identification and clear status messages (WCAG 4.1.3)',
    passCheck: 'One click on Add to cart gives a cart with exactly one unit and the total of one product.',
    frameworkExamples: {
      nextjs: '<input type="number" min="1" defaultValue={1} aria-label="Quantity" /> and a <p role="status">Added to cart</p> after the click.',
      shopify: 'In the product form, keep the quantity input value="1" and show the cart notification after adding.',
      unknown: '<input type="number" min="1" value="1" aria-label="Quantity"> and <p role="status">Added to cart</p>',
    },
  },
  'currency-mismatch': {
    likelyCause: 'The page shows prices in more than one currency, or does not say which currency a price is in (for example a hidden dollar price in the page data), so the price an agent reads may not be the one shoppers see.',
    fix: 'Show one currency per market, write the currency symbol next to every price and set offers.priceCurrency in schema.org markup.',
    standard: 'schema.org Offer priceCurrency; WCAG 1.3.1 Info and Relationships',
    passCheck: 'The price an agent reports matches the price shown on the page, in the same currency.',
    frameworkExamples: {
      nextjs: '<span itemProp="price" content="499">₹499</span><meta itemProp="priceCurrency" content="INR" />',
      shopify: 'Use {{ product.price | money_with_currency }} so the currency is always written out.',
      unknown: '<span class="price">₹499</span> <meta itemprop="priceCurrency" content="INR">',
    },
  },
  'no-cart-feedback': {
    likelyCause: 'After a click on Add to cart nothing visible changes in the page text (no "Added to cart" message, no cart count update), so the click looks like it did nothing and gets repeated.',
    fix: 'Show "Added to cart" as text next to the button, update the cart count, and announce both with role="status".',
    standard: 'WCAG 4.1.3 Status Messages',
    passCheck: 'Add to cart passes with one press of the button.',
    frameworkExamples: {
      nextjs: '<p role="status" aria-live="polite">{added ? "Added to cart" : ""}</p> next to the button.',
      shopify: "Turn on the theme's cart notification (or cart drawer) so adding shows a visible confirmation.",
      unknown: '<p role="status" aria-live="polite">Added to cart</p>',
    },
  },
  'inconsistent-results': {
    likelyCause: 'The page does not behave the same on every visit: a pop-up or banner that shows only sometimes, an A/B test, slow scripts, or a location or stock prompt.',
    fix: 'Make the path for this task the same on every visit: no randomly timed pop-ups, and the key buttons and text present when the page first loads.',
    standard: 'WCAG 3.2.3 Consistent Navigation',
    passCheck: 'Three runs in a row give the same result.',
  },
  'unconfirmed-claim': {
    likelyCause: 'The information the agent reported is not in the text of the page it named: it may be drawn in an image, loaded by a script later, or shown only after a click.',
    fix: 'Write the key facts (prices, return days, contact details) as plain text in the page itself.',
    standard: 'WCAG 1.1.1 Non-text Content',
    passCheck: 'The page the agent names shows the same facts as text.',
  },
  'robots-blocks-ai-agents': {
    likelyCause: 'robots.txt has a "Disallow: /" rule that applies to AI agents (by name, or through "User-agent: *"), so well-behaved assistants are told not to open any page.',
    fix: 'Allow the AI agents you want to serve: give them their own group in robots.txt (for example "User-agent: ChatGPT-User" with "Allow: /") and keep Disallow rules for private paths only.',
    standard: 'Robots Exclusion Protocol (RFC 9309)',
    passCheck: 'robots.txt lets the AI assistants you want to serve open the shop pages.',
    frameworkExamples: {
      nextjs: 'app/robots.js: export default () => ({ rules: [{ userAgent: "ChatGPT-User", allow: "/" }, { userAgent: "*", disallow: "/account" }] })',
      shopify: 'Edit robots.txt.liquid and add a group: User-agent: ChatGPT-User / Allow: /',
      unknown: 'User-agent: ChatGPT-User\nAllow: /\n\nUser-agent: *\nDisallow: /account',
    },
  },
  'no-cart-link': {
    likelyCause: 'The header has no link to the cart, or the cart is an icon with no text, label or cart address in its link.',
    fix: 'Add a "Cart" link with visible text (or an aria-label) to the header of every page, pointing to the cart page.',
    standard: 'WCAG 2.4.4 Link Purpose; WCAG 4.1.2 Name, Role, Value',
    passCheck: 'A link named "Cart" is found on the home page.',
    frameworkExamples: {
      nextjs: '<Link href="/cart" aria-label={`Cart, ${count} items`}><CartIcon aria-hidden="true" /> Cart</Link>',
      shopify: 'In the header section keep the cart link text: <a href="{{ routes.cart_url }}">{{ "general.cart" | t }}</a>',
      unknown: '<a href="/cart">Cart (2)</a>',
    },
  },
  'not-in-search': {
    likelyCause: 'The page may be missing from sitemap.xml, blocked by robots.txt or a noindex tag, reachable only through a script, or named in words people do not search for.',
    fix: 'List the page in sitemap.xml, let search engines index it (no noindex), link it from the footer with plain words ("Returns", "Pricing", "Opening hours"), and use those words in its title.',
    standard: 'Sitemaps protocol; clear page titles (WCAG 2.4.2 Page Titled)',
    passCheck: 'Searching the site for the topic finds the page.',
    frameworkExamples: {
      nextjs: 'app/sitemap.js: export default () => [{ url: "https://your-site.com/returns" }]; and export const metadata = { title: "Returns and refunds" }',
      shopify: 'Shopify adds policy pages to sitemap.xml once they are linked from a menu: Online Store -> Navigation -> Footer menu -> add "Refund policy".',
      unknown: '<url><loc>https://your-site.com/returns</loc></url>  <!-- in sitemap.xml -->\n<title>Returns and refunds</title>',
    },
  },
  'no-product-schema': {
    likelyCause: 'The product page has no schema.org Product/Offer markup, so machines must guess the name and price from the layout.',
    fix: 'Add JSON-LD Product markup with name, image, offers.price and offers.priceCurrency.',
    standard: 'schema.org Product',
    passCheck: 'Google Rich Results Test shows a valid Product on the page.',
    frameworkExamples: {
      nextjs: '<script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify({"@context":"https://schema.org","@type":"Product",name,offers:{"@type":"Offer",price,priceCurrency:"INR"}})}} />',
      shopify: 'Most themes output it with {{ product | structured_data }} in the product template.',
      unknown: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Product","name":"...","offers":{"@type":"Offer","price":"499","priceCurrency":"INR"}}</script>',
    },
  },
  // ---- saas / content / local packs (D40) ----
  'pricing-not-found': {
    likelyCause: 'There is probably no plain "Pricing" link in the header or footer, or the plans are drawn as images, load only after a script runs, or are shown only after a form is filled in.',
    fix: 'Add a "Pricing" link to the header and footer, and show each plan name and price as plain text on that page.',
    standard: 'Clear navigation labels (WCAG 2.4.5 Multiple Ways); WCAG 1.1.1 Non-text Content',
    passCheck: 'The plan names and prices are found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: 'Add <Link href="/pricing">Pricing</Link> to your Header and Footer components, and render each plan as <h3>Pro</h3><p>₹999 / month</p>.',
      shopify: 'Online Store > Navigation > Main menu > add the Pricing page.',
      unknown: '<a href="/pricing">Pricing</a> in the header, and <p class="price">₹999 / month</p> as text on the page.',
    },
  },
  'signup-not-found': {
    likelyCause: 'The sign-up button may be an icon or an unclear label ("Get going"), or the form may open only inside a script-driven pop-up that covers the page.',
    fix: 'Label the main call to action in plain words ("Sign up", "Start free trial") and link it to a page with a real form whose fields have labels.',
    standard: 'WCAG 2.4.4 Link Purpose; WCAG 3.3.2 Labels or Instructions',
    passCheck: 'The sign-up form and the names of its fields are found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<Link href="/signup">Start free trial</Link> leading to a page with <label htmlFor="email">Work email</label><input id="email" />.',
      unknown: '<a href="/signup">Start free trial</a> and <label for="email">Work email</label><input id="email" type="email">.',
    },
  },
  'docs-not-found': {
    likelyCause: 'There may be no "Docs", "API" or "Help" link in the header or footer, or the documentation lives on a separate address that nothing on the main site links to.',
    fix: 'Link the docs or help center from the header and footer with a plain label, and list it in sitemap.xml.',
    standard: 'Sitemaps protocol and clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'The docs or help center is found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: 'Add <Link href="https://docs.example.com">Docs</Link> to your Header and Footer components and export it from app/sitemap.js.',
      unknown: '<a href="/docs">Docs</a> in the header and footer of every page.',
    },
  },
  'sales-contact-not-found': {
    likelyCause: 'There may be no visible "Contact sales" or "Book a demo" link, or the only option is a form behind a login or a chat widget that does not load for every visitor.',
    fix: 'Add a "Contact sales" or "Book a demo" link to the header and footer that opens a page with a form or an email address in plain text.',
    standard: 'Clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'A sales contact or demo booking is found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: 'Add <Link href="/contact-sales">Contact sales</Link> to your Header component.',
      unknown: '<a href="/contact-sales">Contact sales</a> in the header and footer.',
    },
  },
  'search-not-found': {
    likelyCause: 'The site may have no search box, a search that returns nothing unless a script runs, or menus whose topics are not named in plain words.',
    fix: 'Add a visible search box and topic links in the header, and make search results ordinary links to articles.',
    standard: 'WCAG 2.4.5 Multiple Ways; WCAG 3.2.4 Consistent Identification',
    passCheck: 'An article on the main topic is found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<form action="/search" role="search"><label htmlFor="q">Search</label><input id="q" name="q" /></form> in your Header component.',
      unknown: '<form action="/search" role="search"><label for="q">Search</label><input id="q" name="q"></form>',
    },
  },
  'article-not-readable': {
    likelyCause: 'The article text may load only after a script runs, sit behind a pop-up or subscribe prompt, or lack a clear title, author and date.',
    fix: 'Put the article text in the page itself, give it one heading, add schema.org Article data (headline, author, datePublished) and keep pop-ups off the first screen.',
    standard: 'schema.org Article; WCAG 1.3.1 Info and Relationships',
    passCheck: 'An article opens with its title, author and date readable in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify({"@context":"https://schema.org","@type":"Article",headline,author:{"@type":"Person",name:author},datePublished})}} />',
      unknown: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"...","author":{"@type":"Person","name":"..."},"datePublished":"2026-11-01"}</script>',
    },
  },
  'newsletter-not-found': {
    likelyCause: 'The subscribe form may appear only in a timed pop-up, or sit in the footer without a label that says what it is.',
    fix: 'Add a visible "Subscribe" form or link to the footer of every page, with a labelled email field.',
    standard: 'WCAG 3.3.2 Labels or Instructions',
    passCheck: 'The newsletter form is found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<form action="/subscribe"><label htmlFor="nl">Email for our newsletter</label><input id="nl" type="email" /><button>Subscribe</button></form> in your Footer component.',
      unknown: '<form action="/subscribe"><label for="nl">Email for our newsletter</label><input id="nl" type="email"><button>Subscribe</button></form>',
    },
  },
  'author-contact-not-found': {
    likelyCause: 'There may be no "About" or "Contact" link, or the byline may not link to an author page with an email address or profile.',
    fix: 'Link every byline to an author page, and add "About" and "Contact" links to the footer with an email address or a form.',
    standard: 'Clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'A way to contact the author or the team is found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: 'Add <Link href="/contact">Contact the editors</Link> to your Footer component and link the byline to /authors/<name>.',
      unknown: '<a href="/contact">Contact the editors</a> in the footer.',
    },
  },
  'hours-not-found': {
    likelyCause: 'The opening hours may be drawn inside an image, shown only inside a map widget, or left off the pages visitors reach first.',
    fix: 'Write the opening hours as plain text in the footer and on the contact page, and add them to LocalBusiness markup.',
    standard: 'schema.org LocalBusiness openingHours; WCAG 1.1.1 Non-text Content',
    passCheck: 'The opening hours are found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify({"@context":"https://schema.org","@type":"Restaurant",name,openingHours:["Mo-Su 11:00-23:00"]})}} />',
      unknown: '<script type="application/ld+json">{"@context":"https://schema.org","@type":"LocalBusiness","name":"...","openingHours":["Mo-Fr 09:00-18:00"]}</script> and the same hours as text in the footer.',
    },
  },
  'location-not-found': {
    likelyCause: 'The address may be drawn inside an image or shown only inside an embedded map, with no text and no link.',
    fix: 'Write the full address as plain text on the contact page and in the footer, link to the map, and add the address to LocalBusiness markup.',
    standard: 'schema.org LocalBusiness address; WCAG 1.1.1 Non-text Content',
    passCheck: 'The address and a map link are found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<address>12 MG Road, Bengaluru 560001 · <a href="https://maps.google.com/?q=12+MG+Road+Bengaluru">Map</a></address> in your Footer component.',
      unknown: '<address>12 MG Road, Bengaluru 560001 · <a href="https://maps.google.com/?q=12+MG+Road+Bengaluru">Map</a></address>',
    },
  },
  'menu-not-found': {
    likelyCause: 'The menu may be a PDF or a photo, or the services page may not be linked from the header.',
    fix: 'Publish the menu or the services as a page of plain text with prices, and link it from the header.',
    standard: 'WCAG 1.1.1 Non-text Content; Clear navigation labels (WCAG 2.4.5 Multiple Ways)',
    passCheck: 'The menu or the services are found, with prices, in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: 'Render the menu as <ul><li>Masala dosa · ₹120</li></ul> on /menu and link it with <Link href="/menu">Menu</Link>.',
      unknown: '<ul><li>Masala dosa · ₹120</li></ul> on /menu, and <a href="/menu">Menu</a> in the header.',
    },
  },
  'booking-not-found': {
    likelyCause: 'The booking button may be an icon or an unclear label, or the form may sit inside a third-party widget that does not load for visitors without a script.',
    fix: 'Add a "Book now" or "Reserve a table" link to the header and make the booking form a normal page with labelled fields.',
    standard: 'WCAG 2.4.4 Link Purpose; WCAG 3.3.2 Labels or Instructions',
    passCheck: 'The booking form and the names of its fields are found in 5 steps or fewer.',
    frameworkExamples: {
      nextjs: '<Link href="/book">Reserve a table</Link> leading to a page with labelled name, date and party-size fields.',
      unknown: '<a href="/book">Reserve a table</a> leading to a form with <label for="date">Date</label><input id="date" type="date">.',
    },
  },
};

// Safety net: every contract type must have a template.
for (const t of FINDING_TYPES) if (!FIX_TEMPLATES[t]) throw new Error('Missing fix template: ' + t);

/**
 * Detect the site framework from a Playwright page. Never throws.
 * @param {import('playwright-core').Page} page
 * @returns {Promise<Framework>}
 */
export async function detectFramework(page) {
  try {
    return await page.evaluate(() => {
      if (document.querySelector('script#__NEXT_DATA__') || self.__next_f) return 'nextjs';
      if (window.Shopify) return 'shopify';
      return 'unknown';
    });
  } catch {
    return 'unknown';
  }
}

// Keywords by finding type, used to find the most relevant element on the stuck page.
const KEYWORDS = {
  'cart-not-found': ['cart', 'bag', 'basket', 'add to'],
  'price-not-found': ['price', '₹', 'rs.', 'buy'],
  'price-in-image': ['price', '₹', 'rs.'],
  'returns-not-found': ['return', 'refund'],
  'contact-not-found': ['contact', 'support', 'help'],
  'pricing-not-found': ['pricing', 'plans', 'price'],
  'signup-not-found': ['sign up', 'signup', 'trial', 'get started'],
  'docs-not-found': ['docs', 'documentation', 'api', 'help'],
  'sales-contact-not-found': ['sales', 'demo', 'contact'],
  'search-not-found': ['search', 'topics', 'articles'],
  'article-not-readable': ['read', 'article', 'post'],
  'newsletter-not-found': ['newsletter', 'subscribe'],
  'author-contact-not-found': ['contact', 'about', 'author'],
  'hours-not-found': ['hours', 'open'],
  'location-not-found': ['address', 'location', 'map', 'directions'],
  'menu-not-found': ['menu', 'services', 'price'],
  'booking-not-found': ['book', 'reserve', 'appointment'],
  'unlabelled-buttons': ['cart', 'add'],
  'popup-blocking': ['close', 'dismiss', 'accept'],
  'no-cart-feedback': ['add to cart', 'cart'],
  'no-cart-link': ['cart', 'bag', 'basket'],
  'not-in-search': ['return', 'contact', 'pricing', 'docs', 'hours'],
};

/**
 * Open the stuck page in a Browser API session and capture the most relevant element.
 * Time-boxed, never throws. Returns null evidence in mock mode or on any failure.
 * @param {string} stuckUrl
 * @param {{type:string}} finding
 * @returns {Promise<{element: ElementEvidence|null, framework: Framework}>}
 */
export async function captureEvidence(stuckUrl, finding) {
  const empty = { element: null, framework: /** @type {Framework} */ ('unknown') };
  if (config.mock || !stuckUrl) return empty;
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve(empty), 25000); });
  try {
    return await Promise.race([doCapture(stuckUrl, finding, empty), timeout]);
  } catch {
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

async function doCapture(stuckUrl, finding, empty) {
  let session = null;
  let browser = null;
  try {
    session = await createBrowserSession({ url: stuckUrl, countryCode: 'IN' });
    browser = await chromium.connectOverCDP(session.cdpUrl);
    const context = browser.contexts()[0] || (await browser.newContext());
    const page = context.pages()[0] || (await context.newPage());
    await page.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(3000);
    const framework = await detectFramework(page);
    const words = KEYWORDS[finding.type] || ['cart', 'return', 'contact'];
    const element = await page.evaluate((kw) => {
      const nodes = [...document.querySelectorAll('button, a, [role=button], input[type=submit]')];
      const textOf = (el) => (el.innerText || el.value || '').trim();
      const scoreOf = (el) => {
        const hay = (textOf(el) + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.title || '') + ' ' + (el.className || '') + ' ' + (el.id || '')).toLowerCase();
        return kw.some((w) => hay.includes(w)) ? 1 : 0;
      };
      const el = nodes.find(scoreOf);
      if (!el) return null;
      const cssPath = (n) => {
        if (n.id) return '#' + n.id;
        const parts = [];
        while (n && n.nodeType === 1 && parts.length < 4) {
          let s = n.tagName.toLowerCase();
          if (n.classList.length) s += '.' + [...n.classList].slice(0, 2).join('.');
          parts.unshift(s);
          n = n.parentElement;
        }
        return parts.join(' > ');
      };
      const r = el.getBoundingClientRect();
      return {
        selector: cssPath(el),
        htmlSnippet: el.outerHTML.slice(0, 400),
        text: textOf(el).slice(0, 120),
        ariaLabel: el.getAttribute('aria-label'),
        box: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) },
      };
    }, words);
    return { element, framework };
  } catch {
    return empty;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (session?.sessionId) await closeBrowserSession(session.sessionId).catch(() => {});
  }
}

const BLAMES_AGENT = /\b(agent|bot|ai)\b[^.]{0,40}\b(got |was |is |became )?(confused|struggled|failed to understand|made a mistake|mistaken)/i;

/**
 * One AI call per finding. Returns {rootCause, standard, fixRule, frameworkExample, passCheck} or null.
 * Never throws, never exposes the key.
 * @param {Finding} finding
 * @param {ElementEvidence|null} evidence
 * @param {Framework} framework
 */
export async function writeUpWithAI(finding, evidence, framework) {
  const provider = config.llmProvider;
  const key = config.llmApiKey;
  if (!key || !['gemini', 'anthropic', 'openai'].includes(provider)) return null;
  const prompt =
    'You are a web accessibility and e-commerce expert writing a fix note for a site owner.\n' +
    'RULE: name a cause on the SITE. Never blame the agent or say it got confused.\n' +
    `Finding type: ${finding.type}\nWhat happened: ${finding.text}\nTask: ${finding.taskId || 'n/a'}\n` +
    `Framework: ${framework}\nElement evidence: ${evidence ? JSON.stringify(evidence) : 'none'}\n` +
    'Reply with JSON only: {"rootCause": "...", "standard": "...", "fixRule": "...", "frameworkExample": "...", "passCheck": "..."}. ' +
    'Each value is a short plain-language string (frameworkExample may be a code snippet).';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10000);
  try {
    let res, text;
    if (provider === 'gemini') {
      // Key goes in a header, not the URL, so it can never show up in a logged URL or error.
      res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
          method: 'POST', signal: ctl.signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
        },
      );
      if (!res.ok) return null;
      text = (await res.json())?.candidates?.[0]?.content?.parts?.[0]?.text;
    } else if (provider === 'anthropic') {
      res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 600, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) return null;
      text = (await res.json())?.content?.[0]?.text;
    } else {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'gpt-4o-mini', response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
      });
      if (!res.ok) return null;
      text = (await res.json())?.choices?.[0]?.message?.content;
    }
    if (typeof text !== 'string') return null;
    const m = text.match(/\{[\s\S]*\}/);
    const obj = JSON.parse(m ? m[0] : text);
    for (const k of ['rootCause', 'standard', 'fixRule', 'frameworkExample', 'passCheck']) {
      if (typeof obj?.[k] !== 'string' || !obj[k].trim()) return null;
    }
    // D22: findings must name a site cause. If the AI blames the agent, use the template instead.
    if (BLAMES_AGENT.test(obj.rootCause)) return null;
    return obj;
  } catch {
    return null; // timeout, network, bad JSON: caller uses the template
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Enrich one finding. Template values fill any gap.
 * @returns {Promise<Finding>}
 */
async function enrichFinding(finding, ctx) {
  const tpl = FIX_TEMPLATES[finding.type] || {};
  const taskCtx = finding.taskId ? ctx.byTask.get(finding.taskId) : null;
  const evidence = taskCtx?.element || null;
  const framework = ctx.framework;
  // One AI call per (task, type): the same finding also appears in topFixes, and scan findings of one type share a call.
  const aiKey = `${finding.taskId || ''}|${finding.type}`;
  if (ctx.useAI && !ctx.aiCache.has(aiKey)) ctx.aiCache.set(aiKey, writeUpWithAI(finding, evidence, framework));
  const ai = ctx.useAI ? await ctx.aiCache.get(aiKey) : null;
  const example = tpl.frameworkExamples?.[framework] || tpl.frameworkExamples?.unknown;
  /** @type {Finding} */
  const out = {
    ...finding,
    likelyCause: ai?.rootCause || tpl.likelyCause || finding.likelyCause,
    fix: ai?.fixRule || tpl.fix || finding.fix,
    standard: ai?.standard || tpl.standard || finding.standard,
    frameworkExample: ai?.frameworkExample || example || finding.frameworkExample,
    passCheck: ai?.passCheck || tpl.passCheck || finding.passCheck,
  };
  if (evidence) out.element = evidence;
  return out;
}

/**
 * Build the Detailed Fix Report. Does not mutate the input.
 * @param {SiteReport} siteReport
 * @param {{useAI?: boolean}} [opts]
 * @returns {Promise<SiteReport>}
 */
export async function buildFixReport(siteReport, { useAI = true } = {}) {
  const report = structuredClone(siteReport);

  // Capture evidence once per stuckUrl, at most 4 captures in total.
  const urls = [...new Set(report.tasks.filter((t) => t.stuckUrl && t.findings?.length).map((t) => t.stuckUrl))].slice(0, 4);
  const captured = new Map();
  await Promise.all(urls.map(async (u) => {
    const task = report.tasks.find((t) => t.stuckUrl === u);
    const f = task.findings[0];
    captured.set(u, await captureEvidence(u, f));
  }));
  const byTask = new Map();
  let framework = report.framework && report.framework !== 'unknown' ? report.framework : 'unknown';
  for (const t of report.tasks) {
    const c = t.stuckUrl ? captured.get(t.stuckUrl) : null;
    if (c) {
      byTask.set(t.taskId, c);
      if (framework === 'unknown' && c.framework !== 'unknown') framework = c.framework;
    }
  }
  report.framework = framework;
  const ctx = { byTask, framework, useAI, aiCache: new Map() };

  // Enrich in small batches so AI calls stay bounded (duplicates share one AI call through ctx.aiCache).
  const enrichAll = async (list) => {
    const out = [];
    for (let i = 0; i < list.length; i += 4) out.push(...(await Promise.all(list.slice(i, i + 4).map((f) => enrichFinding(f, ctx)))));
    return out;
  };
  for (const t of report.tasks) t.findings = await enrichAll(t.findings || []);
  report.topFixes = await enrichAll(report.topFixes || []);
  // Instant Scan findings (optional): no stuckUrl, so no evidence capture; same template/AI path.
  if (Array.isArray(report.scanFindings)) report.scanFindings = await enrichAll(report.scanFindings);
  return report;
}
