import { H2 } from './parts.jsx';

export const title = 'Responsible testing';
export const lead = 'Agents act like a careful visitor. These are the rules every test follows.';

export default function ResponsibleTesting() {
  return (
    <>
      <H2 id="never">What agents never do</H2>
      <ul>
        <li>Log in, sign up, fill in personal details, pay or place an order.</li>
        <li>Submit sign-up, booking, sales or newsletter forms: they open them and report the fields.</li>
        <li>Touch customer data. Only public pages are visited.</li>
      </ul>
      <H2 id="your-site">Test your own site</H2>
      <p>Test sites you own or have permission to test. Proxy and stealth retries exist to show how your own bot protection treats AI agents, not to get around someone else's.</p>
      <H2 id="side-effects">Side effects to expect</H2>
      <ul>
        <li><b>Abandoned carts.</b> "Add to cart" leaves a cart in your store reports. Use a cheap test product, or test at a quiet hour.</li>
        <li><b>Visits in your analytics.</b> Each task is one short visit from a cloud server or a home address in India.</li>
      </ul>
      <H2 id="limits">Limits that protect you</H2>
      <ul>
        <li>Every agent run has a time cap, and every test has a cost limit.</li>
        <li>A stopped test cancels its agent runs at once; nothing queued for it starts.</li>
        <li>Watch checks run at most every 5 minutes, with at most 20 watches per server.</li>
      </ul>
      <H2 id="public-results">Publishing results</H2>
      <p>Results describe what our agents met on the day of a test, and they vary between runs. When you share results about a site that is not yours, say when it was tested and avoid claims about its owners' intentions.</p>
    </>
  );
}
