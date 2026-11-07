// Questions store owners ask, answered in plain words (from the team's research Q&A, rewritten for the public site).
const QA = [
  ['Will your agents buy things or mess up my store?', 'No. Agents never log in, sign up, pay or place an order. "Add to cart" leaves an abandoned cart in your store reports, so test a cheap product or test at a quiet hour.'],
  ['How is this different from an "agent readiness" checker?', 'Checkers read your files: robots.txt, markup, sitemaps. We do that too in the Instant Scan, and then real agents try real tasks on your site and show where they get stuck.'],
  ['Can an agent be wrong?', 'Yes. That is why every finding is backed by the steps and screenshots, the page an agent names is read again to check its answer, and Confirm results runs each task again.'],
  ['What does a test cost?', 'Agents are billed per step by TinyFish. A four-task test on a small store usually costs ₹20 to ₹50; large stores take more steps. Every test has a cost limit.'],
  ['Do you test sites we do not own?', 'Public pages only, no logins and no customer data. Please test your own site, or one you have permission to test.'],
];

export default function Faq() {
  return (
    <section className="ar-faq" aria-labelledby="faq-title">
      <h2 id="faq-title">Things store owners ask</h2>
      <div className="ar-faq-list">
        {QA.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
