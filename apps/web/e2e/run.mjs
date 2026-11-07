// Click tests: the built dashboard in real Chromium against the real server in replay mode (no credits, no network).
// Run: npm run test:e2e   (builds the dashboard, starts two servers on :4230/:4231, uses a temp data folder)
import path from 'node:path';
import { api, buildWeb, expect, harness, loadPlaywright, shotsDir, sleep, startServer, watchPage } from './lib.mjs';

const { chromium } = loadPlaywright();
buildWeb();

// fast: a full replay test takes ~5 s.  slow: lanes stay busy long enough to click Stop in the middle.
const [fast, slow] = await Promise.all([startServer({ port: 4230, speed: 30 }), startServer({ port: 4231, speed: 3 })]);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const t = harness();
const problemsAll = [];
let shotNo = 0;
const shot = (page, name) => page.screenshot({ path: path.join(shotsDir, `${String(++shotNo).padStart(2, '0')}-${name}.png`), fullPage: true });

/** New browser page with error watching. Every page must end with zero problems. */
async function newPage(base, { width = 1280, height = 900, label = 'page', colorScheme = 'light', init = null } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', colorScheme });
  const page = await context.newPage();
  if (init) await page.addInitScript(init);
  await page.addInitScript(() => {
    // Remember every lane chip text ever shown, to prove lanes go waiting -> running -> done.
    window.__chips = new Set();
    const scan = () => document.querySelectorAll('.ar-lane-chip').forEach((c) => window.__chips.add(c.textContent.trim()));
    new MutationObserver(scan).observe(document, { childList: true, subtree: true, characterData: true });
    setInterval(scan, 50);
  });
  const watcher = watchPage(page, label);
  page.setDefaultTimeout(20000);
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' });
  return { page, context, watcher };
}
const closeWithCheck = async (p, name) => {
  const problems = p.watcher.drain();
  problemsAll.push(...problems.map((x) => `${name}: ${x}`));
  await p.context.close();
  expect(problems.length === 0, `${problems.length} browser problem(s):\n${problems.join('\n')}`);
};
const hash = (page) => page.evaluate(() => location.hash);
const waitHash = (page, re) => page.waitForFunction((src) => new RegExp(src).test(location.hash), re.source);
const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const chipsSeen = (page) => page.evaluate(() => [...window.__chips]);
const reportDone = (page) => page.locator('.ar-report-score, .ar-stopped').first().waitFor({ timeout: 60000 });
const openTab = (page, name) => page.getByRole('tab', { name: new RegExp('^' + name) }).click();
const runButton = (page) => page.getByRole('button', { name: /^Run test$/ });
const typeUrl = async (page, url) => { await page.getByLabel('Website to test').fill(url); };
const clickTest = (page) => runButton(page).click();

try {
  console.log('Home page');
  let home = await newPage(fast.base, { label: 'home' });
  await t.step('landing loads with the headline, URL box and no errors', async () => {
    const { page } = home;
    await page.getByRole('heading', { level: 1, name: 'Can AI agents actually use your website?' }).waitFor();
    expect((await page.title()).length > 0, 'page has a title');
    await page.getByLabel('Website to test').waitFor();
    expect(await runButton(page).isDisabled(), 'Run test is disabled while the box is empty');
    await page.locator('.ar-hero-ledger').waitFor();
    await shot(page, 'home');
  }, { page: home.page });

  await t.step('landing: the URL box runs a test and opens its report in the app', async () => {
    const { page } = home;
    await typeUrl(page, 'nykaa.com');
    await clickTest(page);
    await waitHash(page, /#\/app\/test\/rep_/);
    await page.locator('.ar-lane').first().waitFor();
    await page.goto(fast.base + '/#/');
    await page.getByRole('heading', { level: 1 }).waitFor();
  }, { page: home.page });

  await t.step('landing links: Open app, Pricing (three plans, no invented prices), Docs', async () => {
    const { page } = home;
    await page.getByRole('link', { name: 'Open app' }).first().click();
    await waitHash(page, /^#\/app$/);
    await page.goto(fast.base + '/#/');
    await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Pricing' }).click();
    await waitHash(page, /^#\/pricing$/);
    for (const plan of ['Free', 'Watch', 'Team']) await page.getByRole('heading', { level: 2, name: plan, exact: true }).waitFor();
    const text = await page.locator('main').innerText();
    expect(!/₹\s?\d[\d,]*\s*(\/|per)\s*(mo|month)/i.test(text), 'no monthly price is invented');
    await shot(page, 'pricing');
    await page.getByRole('navigation', { name: 'Site' }).getByRole('link', { name: 'Docs' }).click();
    await waitHash(page, /^#\/docs\//);
    await page.goto(fast.base + '/#/');
  }, { page: home.page });

  await t.step('docs: every page in the nav opens with its heading; an unknown page says so and keeps the nav', async () => {
    const { page } = home;
    await page.goto(fast.base + '/#/docs');
    const nav = page.getByRole('navigation', { name: 'Docs' });
    await nav.waitFor();
    const links = await nav.getByRole('link').all();
    expect(links.length === 10, `ten docs pages, saw ${links.length}`);
    const names = [];
    for (let i = 0; i < links.length; i++) {
      const link = nav.getByRole('link').nth(i);
      const name = (await link.textContent()).trim();
      await link.click();
      await page.getByRole('heading', { level: 1, name, exact: true }).waitFor();
      expect(await link.getAttribute('aria-current') === 'page', `${name} is marked current`);
      names.push(name);
    }
    expect(names.includes('Findings reference') && names.includes('CLI'), `pages: ${names.join(', ')}`);
    await page.goto(fast.base + '/#/docs/findings');
    expect(await page.locator('.ar-doc-finding').count() >= 30, 'findings reference lists every finding type');
    await page.goto(fast.base + '/#/docs/nope');
    await page.getByText('This page does not exist').waitFor();
    await nav.waitFor();
    await shot(page, 'docs-not-found');
    await page.goto(fast.base + '/#/');
    await page.getByRole('heading', { level: 1 }).waitFor();
    expect(await page.title() === 'AgentReady', `leaving the docs resets the tab title (${await page.title()})`);
  }, { page: home.page });

  await t.step('theme toggle switches light and dark and remembers the choice', async () => {
    const { page } = home;
    const toggle = page.locator('.theme-toggle');
    const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const before = await theme(); const bgBefore = await bg();
    await toggle.click();
    await page.waitForFunction((b) => document.documentElement.getAttribute('data-theme') !== b, before);
    const after = await theme();
    expect(after !== before, 'theme changed');
    await sleep(700); // the circular reveal finishes
    expect((await bg()) !== bgBefore, 'background colour changed');
    await shot(page, `theme-${after}`);
    expect(await page.evaluate(() => localStorage.getItem('agentready_theme')) === after, 'choice saved');
    await page.reload();
    await page.getByRole('heading', { level: 1 }).waitFor();
    expect(await theme() === after, 'choice survives a reload');
    await toggle.click();
    await page.waitForFunction((b) => document.documentElement.getAttribute('data-theme') === b, before);
    await sleep(700);
  }, { page: home.page });

  await t.step('tabs Test / Watch switch pages; logo goes home', async () => {
    const { page } = home;
    await page.goto(fast.base + '/#/app');
    expect(await page.getByText('Recorded agent runs, no agent cost').isVisible(), 'replay strip is shown in the app');
    await page.getByRole('link', { name: 'Watch', exact: true }).click();
    await waitHash(page, /#\/app\/watch/);
    await page.getByRole('heading', { name: 'Watch a site' }).waitFor();
    expect(await page.getByRole('link', { name: 'Watch', exact: true }).getAttribute('aria-current') === 'page', 'Watch tab is marked current');
    await page.getByRole('link', { name: 'AgentReady home' }).first().click();
    await waitHash(page, /^#\/app$/);
    await page.getByRole('heading', { level: 1 }).waitFor();
  }, { page: home.page });

  await t.step('home: no browser errors', async () => { await closeWithCheck(home, 'home'); });

  console.log('Running a test');
  const run = await newPage(fast.base, { label: 'run' });
  await t.step('test a recorded site from the URL box: lanes go waiting → running → done, score appears', async () => {
    const { page } = run;
    await page.goto(fast.base + '/#/app');
    expect(await runButton(page).isDisabled(), 'Run test is disabled while the box is empty');
    await typeUrl(page, 'nykaa.com');
    await clickTest(page);
    await waitHash(page, /#\/app\/test\/rep_\d+_\d+_nykaa/);
    await page.locator('.ar-lane').first().waitFor();
    await page.getByRole('button', { name: 'Stop test' }).waitFor();
    await reportDone(page);
    expect(await page.locator('.ar-lane').count() === 4, 'four lanes');
    const chips = await chipsSeen(run.page);
    expect(chips.includes('Running'), `lanes showed Running (saw ${chips.join(', ')})`);
    expect(chips.some((c) => c === 'Waiting for an agent'), `lanes showed Waiting for an agent (saw ${chips.join(', ')})`);
    expect(chips.some((c) => /Passed|Failed/.test(c)), 'lanes ended Passed/Failed');
    const score = await page.locator('.ar-report-score').innerText();
    expect(Number(score) > 0, `score shown (${score})`);
    await page.getByRole('button', { name: 'Re-run' }).waitFor();
    await openTab(page, 'Scan');
    await page.locator('.ar-scan-ledger').waitFor();
    await openTab(page, 'Overview');
    await shot(page, 'nykaa-report');
  }, { page: run.page });

  await t.step('click a screenshot to open the viewer, then close it (click and Esc)', async () => {
    const { page } = run;
    await page.locator('.ar-lane-shot').first().click();
    const viewer = page.getByRole('dialog', { name: 'Screenshot' });
    await viewer.waitFor();
    await page.waitForFunction(() => { const i = document.querySelector('.shot-viewer img'); return i && i.complete && i.naturalWidth > 0; });
    await shot(page, 'screenshot-viewer');
    await viewer.click();
    await viewer.waitFor({ state: 'detached' });
    await page.locator('.ar-lane-shot').first().click();
    await viewer.waitFor();
    await page.keyboard.press('Escape');
    await viewer.waitFor({ state: 'detached' });
  }, { page: run.page });

  await t.step('Top fix "See details" jumps to its finding card', async () => {
    const { page } = run;
    const fixes = page.locator('.ar-topfix');
    const n = await fixes.count();
    expect(n >= 1 && n <= 3, `1-3 top fixes, saw ${n}`);
    await page.evaluate(() => window.scrollTo(0, 0));
    await fixes.first().click();
    await sleep(300);
    const box = await page.locator('#top-fix-1').boundingBox();
    expect(box && box.y >= -5 && box.y < 400, `finding card is scrolled into view (y=${box?.y})`);
    const text = await page.locator('#top-fix-1').textContent();
    for (const q of ['What happened?', 'Where exactly?', 'How bad is it?', 'How to fix it?']) expect(text.includes(q), `finding answers "${q}"`);
    await shot(page, 'finding');
  }, { page: run.page });

  await t.step('the finished test is in "Recent tests" and survives a refresh', async () => {
    const { page } = run;
    const id = (await hash(page)).split('/')[2];
    await page.reload();
    await page.locator('.ar-report-score').waitFor();
    expect((await hash(page)).includes(id), 'same report after refresh');
    await page.getByRole('link', { name: 'AgentReady home' }).first().click();
    await page.locator('.ar-recent tr', { hasText: 'nykaa' }).first().waitFor();
  }, { page: run.page });

  await t.step('an unknown report id shows a plain message', async () => {
    const { page } = run;
    await page.goto(fast.base + '/#/test/doesnotexist');
    await page.locator('.ar-error').waitFor();
    expect(/could not find that report/i.test(await page.locator('.ar-error').innerText()), 'plain "could not find" message');
    await page.goto(fast.base + '/#/test/bad%20id%20%3Cscript%3E');
    await page.locator('.ar-error').waitFor();
    await shot(page, 'unknown-report');
  }, { page: run.page });
  await t.step('run page: no browser errors', async () => { await closeWithCheck(run, 'run'); });

  console.log('Custom task, demo store');
  const demo = await newPage(fast.base, { label: 'demo' });
  await t.step('custom task with emoji: its lane shows the replay note, not an unrelated answer', async () => {
    const { page } = demo;
    await page.goto(fast.base + '/#/app');
    await typeUrl(page, 'https://www.nykaa.com');
    await page.getByRole('button', { name: '+ Add your own task' }).click();
    await page.getByLabel('Custom task').fill('Find the delivery charge for a ₹300 order 🚚');
    await clickTest(page);
    await waitHash(page, /#\/app\/test\/rep_/);
    await reportDone(page);
    const lane = page.locator('.ar-lane', { hasText: 'Your task' });
    await lane.waitFor();
    expect((await lane.innerText()).includes('🚚'), 'emoji shown in the lane title');
    expect(/Replay: this answer is from a recorded run, not your custom task/.test(await lane.innerText()), 'honest replay note');
    expect(!(await lane.innerText()).includes("Agent's answer"), 'no recorded answer shown as the result');
    expect(/Not run in replay mode/.test(await page.locator('.ar-task-ledger').innerText()), 'task ledger says the custom task was not run');
    await shot(page, 'custom-task');
  }, { page: demo.page });

  await t.step('demo store: "Try it on our demo store" opens the recorded flawed report', async () => {
    const { page } = demo;
    await page.goto(fast.base + '/#/test');
    await page.getByRole('button', { name: /demo store/ }).click();
    await waitHash(page, /#\/app\/test\/rep_demo_flaws_on/);
    await page.locator('.ar-report-score').waitFor();
    expect(await page.locator('.ar-report-score').innerText() === '91', 'recorded flawed store scores 91');
    await page.getByRole('button', { name: 'Apply fixes and re-test' }).waitFor();
    await shot(page, 'demo-flawed');
  }, { page: demo.page });

  await t.step('"Apply fixes and re-test" shows the before/after card', async () => {
    const { page } = demo;
    await page.getByRole('button', { name: 'Apply fixes and re-test' }).click();
    await waitHash(page, /#\/app\/test\/rep_demo_flaws_off\/rep_demo_flaws_on/);
    await page.locator('.ba-after').getByText('97/100').waitFor();
    expect(/91\/100/.test(await page.locator('.ba-before').innerText()), 'before is 91');
    expect(/\+6 points/.test(await page.locator('.demo-card').textContent()), '+6 points');
    await page.locator('.ba-before').click();
    await waitHash(page, /#\/app\/test\/rep_demo_flaws_on$/);
    await shot(page, 'demo-fixed');
  }, { page: demo.page });
  await t.step('demo page: no browser errors', async () => { await closeWithCheck(demo, 'demo'); });

  console.log('Invalid input');
  const bad = await newPage(fast.base, { label: 'bad' });
  await t.step('invalid addresses show plain messages and start nothing', async () => {
    const { page } = bad;
    await page.goto(fast.base + '/#/app');
    const before = (await api(fast.base, '/api/tests')).json.length;
    const cases = [
      ['ftp://nykaa.com', /http:\/\/ or https:\/\//],
      ['javascript:alert(1)', /http:\/\/ or https:\/\//],
      ['https://user:pass@nykaa.com', /user name and password/],
      ['not a url at all', /spaces|valid website/],
      ['x'.repeat(3000) + '.com', /too long/],
      ['flipkart.com', /replays real agent runs/],
    ];
    for (const [input, re] of cases) {
      await typeUrl(page, input);
      await clickTest(page);
      const err = page.locator('.ar-error');
      await err.waitFor();
      const text = await err.innerText();
      expect(re.test(text), `"${input.slice(0, 30)}" -> ${text}`);
      expect(!/TypeError|undefined|\[object|\bat \S+\.(js|mjs)|stack/i.test(text), 'no technical jargon');
      expect(await runButton(page).isEnabled(), 'button works again after an error');
    }
    await typeUrl(page, '   ');
    expect(await runButton(page).isDisabled(), 'blank box keeps the button disabled');
    const after = (await api(fast.base, '/api/tests')).json.length;
    expect(after === before, `no test was started (${before} -> ${after})`);
    await shot(page, 'invalid-url');
  }, { page: bad.page });
  await t.step('invalid input page: no browser errors', async () => { await closeWithCheck(bad, 'bad'); });

  console.log('Stop test');
  const stop = await newPage(slow.base, { label: 'stop' });
  await t.step('Stop test mid-run: lanes stop, no new runs start, the page says so', async () => {
    const { page } = stop;
    await page.goto(slow.base + '/#/app');
    await typeUrl(page, 'myntra.com');
    await clickTest(page);
    await waitHash(page, /#\/app\/test\/rep_/);
    await page.locator('.ar-lane-chip', { hasText: 'Running' }).first().waitFor();
    // the other two lanes wait, and the page says why
    await page.locator('.ar-lane-wait').first().waitFor({ timeout: 10000 });
    const why = await page.locator('.ar-lane-wait').first().innerText();
    expect(/All 2 agents are busy with this test/.test(why), `wait reason: ${why}`);
    await shot(page, 'stop-before');
    await page.getByRole('button', { name: 'Stop test' }).click();
    await page.locator('.ar-stopped').waitFor();
    expect(/Test stopped/.test(await page.locator('.ar-stopped').textContent()), 'stopped panel');
    const chips = await page.locator('.ar-lane-chip').allInnerTexts();
    expect(chips.length === 4 && chips.every((c) => c === 'Stopped'), `all lanes stopped: ${chips}`);
    expect(await page.locator('.ar-finding').count() === 0, 'no findings for a stopped test');
    expect(await page.locator('.ar-report-score').count() === 0, 'no score for a stopped test');
    await page.getByRole('button', { name: 'Re-run' }).waitFor();
    await shot(page, 'stop-after');
    // nothing new starts in the next seconds
    for (let i = 0; i < 3; i++) {
      await sleep(700);
      const q = (await api(slow.base, '/api/health')).json.queue;
      expect(q.running === 0 && q.queued === 0, `queue stays empty (running ${q.running}, queued ${q.queued})`);
    }
    const chipsLater = await page.locator('.ar-lane-chip').allInnerTexts();
    expect(chipsLater.every((c) => c === 'Stopped'), 'lanes did not restart');
    await page.reload();
    await page.locator('.ar-stopped').waitFor();
    expect((await page.locator('.ar-lane-chip').allInnerTexts()).every((c) => c === 'Stopped'), 'a refreshed page still shows the stop');
  }, { page: stop.page });

  await t.step('refresh mid-run keeps the live lanes on Overview, and Stop still works', async () => {
    const { page } = stop;
    await page.goto(slow.base + '/#/app');
    await typeUrl(page, 'nykaa.com');
    await clickTest(page);
    await waitHash(page, /#\/app\/test\/rep_/);
    await page.locator('.ar-lane-chip', { hasText: 'Running' }).first().waitFor();
    await page.reload();
    await page.locator('.ar-lane').first().waitFor();
    expect(await page.locator('.ar-lane').count() === 4, 'four lanes after the refresh');
    await page.getByRole('button', { name: 'Stop test' }).click();
    await page.locator('.ar-stopped').waitFor();
  }, { page: stop.page });

  await t.step('a waiting lane says a Watch check is using the agents, and a user test still goes first', async () => {
    const { page } = stop;
    const w = (await api(slow.base, '/api/watch', { method: 'POST', body: { url: 'https://www.nykaa.com', everyMinutes: 60 } })).json;
    const run = (await api(slow.base, `/api/watch/${w.id}/run-now`, { method: 'POST' })).json;
    for (let i = 0; i < 100; i++) { if ((await api(slow.base, '/api/health')).json.queue.bySource.watch?.running === 2) break; await sleep(100); }
    await page.goto(slow.base + '/#/app');
    await typeUrl(page, 'myntra.com');
    await clickTest(page);
    await waitHash(page, /#\/app\/test\/rep_/);
    const wait = page.locator('.ar-lane-wait').first();
    await wait.waitFor({ timeout: 15000 });
    const text = await wait.innerText();
    expect(/2 agents busy: a Watch check is running/.test(text), `wait reason: ${text}`);
    await shot(page, 'waiting-for-watch');
    await page.getByRole('button', { name: 'Stop test' }).click();
    await page.locator('.ar-stopped').waitFor();
    await api(slow.base, `/api/tests/${run.reportId}/cancel`, { method: 'POST' });
    await api(slow.base, `/api/watch/${w.id}`, { method: 'PATCH', body: { enabled: false } });
  }, { page: stop.page });
  await t.step('stop page: no browser errors', async () => { await closeWithCheck(stop, 'stop'); });

  console.log('Watch page');
  const watch = await newPage(fast.base, { label: 'watch' });
  await t.step('Watch: create a watch for each scope', async () => {
    const { page } = watch;
    await page.goto(fast.base + '/#/app');
    await page.getByRole('link', { name: 'Watch', exact: true }).click();
    await page.getByRole('heading', { name: 'Watch a site' }).waitFor();
    await page.getByLabel('Website to watch').fill(''); // the box is pre-filled with the demo store when nothing is watched yet
    expect(await page.getByRole('button', { name: 'Start watching' }).isDisabled(), 'button disabled with an empty box');
    await page.getByLabel('Website to watch').fill('https://agent-ready-demo.vercel.app/?flaws=off');
    await page.getByLabel('What to watch').selectOption('cart');
    await page.getByRole('button', { name: 'Start watching' }).click();
    await page.locator('.watch-card').first().waitFor();
    await page.getByLabel('Website to watch').fill('nykaa.com');
    await page.getByLabel('How often').selectOption('60');
    await page.getByLabel('What to watch').selectOption('all');
    await page.getByRole('button', { name: 'Start watching' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.watch-card').length === 2);
    const cards = await page.locator('.watch-card').allInnerTexts();
    expect(cards.some((c) => /Add to cart and read the total/.test(c) && !/Find the return policy/.test(c)), 'cart-only watch');
    expect(cards.some((c) => /Find the return policy.*Find customer support|Find customer support/.test(c.replace(/\n/g, ' '))), 'all-tasks watch');
    expect(cards.some((c) => /Every 1 h/.test(c)), 'hourly');
    await shot(page, 'watch-created');
  }, { page: watch.page });

  await t.step('Watch: bad address shows a plain message', async () => {
    const { page } = watch;
    await page.getByLabel('Website to watch').fill('ftp://x.com');
    await page.getByRole('button', { name: 'Start watching' }).click();
    await page.locator('.form-error').waitFor();
    expect(/http:\/\/ or https:\/\//.test(await page.locator('.form-error').innerText()), 'plain message');
    await page.getByLabel('Website to watch').fill('');
  }, { page: watch.page });

  await t.step('Watch: Run now shows live lanes, adds a history row that opens the report', async () => {
    const { page } = watch;
    const card = page.locator('.watch-card').first();
    await card.getByRole('button', { name: 'Run now' }).click();
    await card.locator('.ar-lane').first().waitFor();
    await card.locator('.history-row').first().waitFor({ timeout: 60000 });
    await card.getByText(/Check finished: \d+\/100/).waitFor();
    await card.getByRole('button', { name: 'Run now' }).waitFor();
    const row = card.locator('.history-row').first();
    expect(/All passed|Problem/.test(await row.textContent()), 'history row has a verdict');
    await shot(page, 'watch-run');
    await row.getByRole('link', { name: 'Open report' }).click();
    await waitHash(page, /#\/app\/test\/rep_/);
    await page.locator('.ar-report-score').waitFor();
    await page.goBack();
    await page.locator('.watch-card').first().waitFor();
  }, { page: watch.page });

  await t.step('Watch: Pause and Resume', async () => {
    const { page } = watch;
    const card = page.locator('.watch-card').first();
    await card.getByRole('button', { name: 'Pause' }).click();
    await card.getByText('Paused', { exact: true }).waitFor();
    expect((await api(fast.base, '/api/watch')).json.some((w) => !w.enabled), 'server saved the pause');
    await card.getByRole('button', { name: 'Resume' }).click();
    await card.getByText('Paused', { exact: true }).waitFor({ state: 'detached' });
    expect((await api(fast.base, '/api/watch')).json.every((w) => w.enabled), 'server saved the resume');
  }, { page: watch.page });
  await t.step('Watch page (fast): no browser errors', async () => { await closeWithCheck(watch, 'watch'); });

  const watchSlow = await newPage(slow.base, { label: 'watch-slow' });
  await t.step('Watch: Stop check and Pause while a check runs both cancel it', async () => {
    const { page } = watchSlow;
    await page.goto(slow.base + '/#/app/watch');
    await page.locator('.watch-card').first().waitFor(); // the watch left over from the earlier step
    const had = await page.locator('.watch-card').count();
    await page.getByLabel('Website to watch').fill('https://www.nykaa.com');
    await page.getByLabel('What to watch').selectOption('all');
    await page.getByRole('button', { name: 'Start watching' }).click();
    await page.waitForFunction((n) => document.querySelectorAll('.watch-card').length === n + 1, had);
    const card = page.locator('.watch-card').last();
    await card.getByRole('button', { name: 'Run now' }).click();
    await card.locator('.ar-lane-chip', { hasText: 'Running' }).first().waitFor();
    await card.getByRole('button', { name: 'Stop check' }).click();
    await card.getByText('Check stopped.').waitFor();
    const chips = await card.locator('.ar-lane-chip').allInnerTexts();
    expect(chips.every((c) => c === 'Stopped' || c === 'Passed') && chips.includes('Stopped'), `lanes stopped (a task that already finished keeps its result): ${chips}`);
    expect(await card.locator('.history-row').count() === 0, 'a stopped check leaves no history row');
    // pause during a run
    await card.getByRole('button', { name: 'Run now' }).click();
    await card.locator('.ar-lane-chip', { hasText: 'Running' }).first().waitFor();
    await card.getByRole('button', { name: 'Pause' }).click();
    await card.getByText('Check stopped.').waitFor();
    await card.getByText('Paused', { exact: true }).waitFor();
    for (let i = 0; i < 3; i++) {
      await sleep(500);
      const q = (await api(slow.base, '/api/health')).json.queue;
      expect(q.running === 0 && q.queued === 0, `nothing runs after the stop (running ${q.running})`);
    }
    await shot(page, 'watch-stopped');
  }, { page: watchSlow.page });
  await t.step('Watch page (slow): no browser errors', async () => { await closeWithCheck(watchSlow, 'watch-slow'); });

  console.log('Race and Leaderboard');
  const rl = await newPage(fast.base, { label: 'race-leaderboard' });
  await t.step('Race tab: a replay race of 3 recorded sites finishes and names a winner', async () => {
    const { page } = rl;
    await page.goto(fast.base + '/#/app');
    await page.getByRole('link', { name: 'Race', exact: true }).click();
    await waitHash(page, /#\/app\/race/);
    await page.getByRole('heading', { name: /^Race:/ }).waitFor();
    expect(await page.getByRole('button', { name: 'Start race' }).isDisabled(), 'Start is disabled with no sites');
    for (const name of ['Nykaa', 'Myntra', 'Demo store']) await page.getByRole('button', { name }).click();
    expect(await page.getByLabel('Website 3').inputValue() !== '', 'third site filled by the chip');
    await page.getByRole('button', { name: 'Start race' }).click();
    await waitHash(page, /#\/app\/race\/race_/);
    await page.locator('.race-lane').nth(2).waitFor();
    expect(await page.getByRole('button', { name: 'Stop race' }).isVisible(), 'Stop race button while racing');
    expect(await page.locator('.race-winner').count() === 0, 'no winner is named while sites are still running');
    await page.locator('.race-summary-win').waitFor({ timeout: 90000 });
    await page.locator('.race-winner').waitFor();
    expect(await page.locator('.race-winner').count() === 1, 'exactly one winner lane');
    expect(await page.locator('.race-summary-win').textContent().then((x) => /Winner/.test(x) && /steps/.test(x)), 'summary names the winner');
    expect(await page.locator('.race-lane .ar-lane').count() === 3, 'three lanes');
    expect(await noHScroll(page), 'race page fits');
    await shot(page, 'race-done');
    // a refresh keeps the finished race
    await page.reload();
    await page.locator('.race-summary-win').waitFor();
  }, { page: rl.page });
  await t.step('Race: an unrecorded site shows the server\'s plain message, and the page survives', async () => {
    const { page } = rl;
    await page.goto(fast.base + '/#/race');
    await page.getByLabel('Website 1').fill('nykaa.com');
    await page.getByLabel('Website 2').fill('shop.example.net');
    await page.getByRole('button', { name: 'Start race' }).click();
    await page.getByRole('alert').filter({ hasText: 'replays real agent runs' }).waitFor();
    expect(await page.getByRole('button', { name: 'Start race' }).isEnabled(), 'can try again');
  }, { page: rl.page });
  await t.step('Leaderboard tab: ranked rows, and a row opens its report', async () => {
    const { page } = rl;
    await page.getByRole('link', { name: 'Leaderboard', exact: true }).click();
    await waitHash(page, /#\/app\/leaderboard/);
    await page.locator('.lb-row').first().waitFor();
    const n = await page.locator('.lb-row').count();
    expect(n >= 3, `at least 3 rows (${n})`);
    const scores = await page.locator('.lb-score .chip').allInnerTexts();
    const nums = scores.map((x) => parseInt(x, 10));
    expect(nums.every((v, i) => i === 0 || nums[i - 1] >= v), `ranked by score: ${scores.join(' | ')}`);
    expect(scores.every((x) => /Ready|Partly ready|Not ready/.test(x)), 'score has a text label');
    expect((await page.locator('.lb-wall').allInnerTexts()).some((x) => /Blocks cloud AI agents/.test(x)), 'bot-wall status shown');
    await shot(page, 'leaderboard');
    await page.locator('.lb-row').first().getByRole('link', { name: /View report/ }).click();
    await waitHash(page, /#\/app\/test\/rep_/);
    await page.locator('.ar-report-score').waitFor();
    expect(await noHScroll(page), 'report fits');
  }, { page: rl.page });
  await t.step('Race and Leaderboard in dark theme', async () => {
    const { page } = rl;
    await page.goto(fast.base + '/#/leaderboard');
    await page.locator('.lb-row').first().waitFor();
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'dark'); });
    await sleep(300);
    const bg = await page.locator('.lb-row').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(bg !== 'rgb(255, 255, 255)', `row is not white in dark theme (${bg})`);
    await shot(page, 'leaderboard-dark');
    await page.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
  }, { page: rl.page });
  await t.step('Race: Stop race stops every site (slow replay)', async () => {
    const slowRace = await newPage(slow.base, { label: 'race-slow' });
    try {
      const { page } = slowRace;
      await page.goto(slow.base + '/#/race');
      await page.getByLabel('Website 1').fill('nykaa.com');
      await page.getByLabel('Website 2').fill('myntra.com');
      await page.getByRole('button', { name: 'Start race' }).click();
      await page.getByRole('button', { name: 'Stop race' }).click();
      await page.locator('.race-summary', { hasText: 'Race stopped' }).or(page.locator('.stopped-card')).first().waitFor({ timeout: 30000 });
      expect(await page.locator('.race-winner').count() === 0, 'a stopped race names no winner');
    } finally { await closeWithCheck(slowRace, 'race-slow'); }
  }, { page: rl.page });
  await t.step('Race and Leaderboard page: no browser errors', async () => { await closeWithCheck(rl, 'race-leaderboard'); });

  console.log('Feature flags');
  const off = await startServer({ port: 4232, speed: 30, env: { FEATURE_RACE: 'false', FEATURE_LEADERBOARD: 'false' } });
  try {
    const flagged = await newPage(off.base, { label: 'flags-off' });
    await t.step('with the features off, Race and Leaderboard tabs are hidden and their links land on Test', async () => {
      const { page } = flagged;
      await page.goto(off.base + '/#/app');
      await page.getByRole('link', { name: 'Watch', exact: true }).waitFor();
      expect(await page.getByRole('link', { name: 'Race', exact: true }).count() === 0, 'no Race tab');
      expect(await page.getByRole('link', { name: 'Leaderboard', exact: true }).count() === 0, 'no Leaderboard tab');
      await page.goto(off.base + '/#/race');
      await page.getByLabel('Website to test').waitFor();
      await closeWithCheck(flagged, 'flags-off');
    }, { page: flagged.page });
  } finally { await off.stop(); }

  console.log('Phone width (390 px)');
  const phone = await newPage(fast.base, { width: 390, height: 800, label: 'phone' });
  await t.step('no sideways scrolling on every page and every report tab at 390 px', async () => {
    const { page } = phone;
    await page.getByRole('heading', { level: 1 }).waitFor();
    expect(await noHScroll(page), 'home fits');
    await shot(page, 'phone-home');
    for (const h of ['#/pricing', '#/docs/cli', '#/docs/findings', '#/app', '#/app/watch', '#/app/race', '#/app/leaderboard',
      '#/app/test/rep_20261031_demo_myntra', '#/app/test/rep_demo_flaws_off/rep_demo_flaws_on']) {
      await page.goto(fast.base + '/' + h);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      await sleep(300);
      expect(await noHScroll(page), `${h} fits (scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)})`);
    }
    await page.goto(fast.base + '/#/app/test/rep_20261031_demo_nykaa');
    await page.locator('.ar-report-score').waitFor();
    for (const tab of ['Findings', 'Steps', 'History', 'Scan', 'Overview']) {
      await openTab(page, tab);
      await sleep(200);
      expect(await noHScroll(page), `report tab ${tab} fits`);
    }
    await shot(page, 'phone-report');
    // a live run on a phone
    await page.goto(fast.base + '/#/app');
    await typeUrl(page, 'nykaa.com');
    await clickTest(page);
    await page.locator('.ar-lane').first().waitFor();
    expect(await noHScroll(page), 'running page fits');
    await reportDone(page);
    expect(await noHScroll(page), 'finished page fits');
    await shot(page, 'phone-finished');
  }, { page: phone.page });

  await t.step('phone menu: opens the sidebar, Escape closes it and gives focus back to the menu button', async () => {
    const { page } = phone;
    await page.goto(fast.base + '/#/app');
    const menu = page.getByRole('button', { name: 'Open menu' });
    await page.locator('#ar-sidebar').waitFor({ state: 'attached' });
    expect(await page.locator('#ar-sidebar').evaluate((e) => e.inert === true), 'the closed drawer is out of keyboard and screen-reader reach');
    await menu.click();
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Watch' }).waitFor();
    expect(await page.locator('#ar-sidebar').evaluate((e) => !e.inert && e.contains(document.activeElement)), 'focus moves into the open drawer');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Open menu' }).waitFor();
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) === 'Open menu', 'focus is back on the menu button');
    await menu.click();
    await page.getByRole('navigation', { name: 'Workspace' }).getByRole('link', { name: 'Watch' }).click();
    await waitHash(page, /#\/app\/watch/);
    expect(await page.getByRole('button', { name: 'Open menu' }).isVisible(), 'the drawer closes after choosing a page');
  }, { page: phone.page });

  await t.step('a very long site address and a 500-character answer still fit at 390 px', async () => {
    const { page } = phone;
    const longUrl = 'https://a-very-long-store-name-for-testing-overflow-on-phones.example.co.in/';
    const up = await api(fast.base, '/api/reports', { method: 'POST', body: {
      id: 'rep_long_host_phone', url: longUrl, score: 52, testedAt: new Date().toISOString(), costRupees: 9, botWall: 'none', framework: 'unknown', instantScan: null,
      tasks: [{ taskId: 'find_price', goal: 'x', mode: 'lite', proxy: 'off', runId: null, status: 'passed', answer: 'Long answer '.repeat(42), blocker: null, stuckUrl: null,
        streamingUrl: null, steps: [], numSteps: 3, seconds: 20, points: 25, findings: [] }],
    } });
    expect(up.status === 201, `uploaded (${up.status})`);
    await page.goto(fast.base + '/#/app/test/rep_long_host_phone');
    await page.locator('.ar-report-score').waitFor();
    await sleep(300);
    expect(await noHScroll(page), `long address fits (scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)})`);
    await page.goto(fast.base + '/#/app');
    await page.locator('.ar-recent tr', { hasText: 'a-very-long-store-name' }).first().waitFor();
    expect(await noHScroll(page), 'recent tests ledger fits');
  }, { page: phone.page });
  await t.step('phone page: no browser errors', async () => { await closeWithCheck(phone, 'phone'); });

  console.log('Theme, keyboard, print');
  const noStore = await newPage(fast.base, { label: 'dark-no-storage', colorScheme: 'dark', init: () => {
    for (const k of ['getItem', 'setItem', 'removeItem']) Storage.prototype[k] = () => { throw new Error('storage blocked'); };
  } });
  await t.step('system dark theme with storage blocked (private window): dark, no errors, the toggle still works', async () => {
    const { page } = noStore;
    const theme = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    for (const h of ['#/', '#/app', '#/docs/scoring']) {
      await page.goto(fast.base + '/' + h);
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      expect(await theme() === 'dark', `${h} is dark (${await theme()})`);
    }
    await page.locator('.theme-toggle').first().click();
    await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'light');
    await closeWithCheck(noStore, 'dark-no-storage');
  }, { page: noStore.page });

  const kb = await newPage(fast.base, { label: 'keyboard' });
  await t.step('report tabs move with the arrow keys; Copy link and Replay are reachable', async () => {
    const { page } = kb;
    await page.goto(fast.base + '/#/app/test/rep_20261031_demo_nykaa');
    await page.locator('.ar-report-score').waitFor();
    await page.getByRole('tab', { name: 'Overview' }).focus();
    await page.keyboard.press('ArrowRight');
    expect(await page.getByRole('tab', { name: /^Findings/ }).getAttribute('aria-selected') === 'true', 'ArrowRight selects Findings');
    expect(await page.evaluate(() => document.activeElement?.getAttribute('role')) === 'tab', 'focus stays on the tabs');
    await page.keyboard.press('End');
    expect(await page.getByRole('tab', { name: 'Scan' }).getAttribute('aria-selected') === 'true', 'End selects the last tab');
    await page.keyboard.press('Home');
    expect(await page.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected') === 'true', 'Home selects the first tab');
    await page.getByRole('button', { name: 'Copy link' }).focus();
    expect(await page.evaluate(() => document.activeElement?.textContent) === 'Copy link', 'Copy link takes focus');
    await openTab(page, 'Steps');
    await page.getByRole('button', { name: 'Replay' }).first().focus();
    expect(await page.evaluate(() => document.activeElement?.textContent) === 'Replay', 'Replay takes focus');
  }, { page: kb.page });

  await t.step('a failed Re-run (server busy) keeps the report on screen and says why', async () => {
    const { page } = kb;
    await page.route('**/api/tests', (route) => (route.request().method() === 'POST'
      ? route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: '6 tests are already running. Please wait for one to finish (or stop one) and try again.' }) })
      : route.continue()));
    await page.getByRole('button', { name: 'Re-run' }).click();
    await page.getByRole('alert').filter({ hasText: 'already running' }).waitFor();
    expect(await page.locator('.ar-report-score').isVisible(), 'the report is still shown');
    expect(await page.getByText('could not find that report', { exact: false }).count() === 0, 'not mistaken for a missing report');
    await page.unroute('**/api/tests');
  }, { page: kb.page });

  await t.step('Save as PDF: the print layout shows every tab and hides the app frame and buttons', async () => {
    const { page } = kb;
    await openTab(page, 'Overview');
    await page.emulateMedia({ media: 'print' });
    const shown = await page.evaluate(() => [...document.querySelectorAll('[role=tabpanel]')].map((p) => getComputedStyle(p).display !== 'none'));
    expect(shown.length === 5 && shown.every(Boolean), `all five tab panels print (${shown})`);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ar-sidebar')).display) === 'none', 'sidebar hidden in print');
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ar-tabs')).display) === 'none', 'tab bar hidden in print');
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    const ink = await page.evaluate(() => getComputedStyle(document.querySelector('.ar-report-host')).color);
    const [r, g, b] = ink.match(/\d+/g).map(Number);
    expect(r + g + b < 200, `dark theme still prints dark ink on white paper (${ink})`);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    const pdf = await page.pdf({ format: 'A4' });
    expect(pdf.length > 20000, `a PDF was produced (${pdf.length} bytes)`);
    await page.emulateMedia({ media: 'screen' });
    await closeWithCheck(kb, 'keyboard');
  }, { page: kb.page });
} catch (err) {
  console.error('E2E aborted:', err);
  process.exitCode = 1;
} finally {
  await browser.close().catch(() => {});
  await Promise.all([fast.stop(), slow.stop()]);
}
const code = t.summary();
if (problemsAll.length) console.log(`\nBrowser problems seen:\n${problemsAll.join('\n')}`);
process.exit(process.exitCode || code);
