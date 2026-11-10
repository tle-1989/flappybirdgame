// Browser integration checks with a simulated Supabase API (no live database).
// Run: CHROMIUM_PATH=/usr/bin/chromium node tests/leaderboard.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8')
    .replace("projectUrl: ''", "projectUrl: 'https://example.supabase.co'")
    .replace("publishableKey: ''", "publishableKey: 'sb_publishable_test'");
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  let rows = [
    { player_name: '<img src=x onerror="window.injected=true">', score: 9 },
    { player_name: 'Second', score: 4 },
    { player_name: 'Third', score: 2 }
  ];
  let failRead = false, failWrite = false, submissions = 0;
  const runIds = new Set();
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    await context.route('https://example.supabase.co/rest/v1/rpc/**', async route => {
      const name = route.request().url().split('/').pop();
      const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'apikey,content-type' };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      assert.equal(route.request().headers().apikey, 'sb_publishable_test');
      if ((name === 'get_top_scores' && failRead) || (name === 'submit_score' && failWrite)) {
        return route.fulfill({ status: 503, headers, body: '{}' });
      }
      if (name === 'submit_score') {
        const payload = route.request().postDataJSON(); submissions++;
        assert.match(payload.p_run_id, /^[0-9a-f-]{36}$/);
        assert.equal(payload.p_player_name, 'Ada Lovelace');
        assert.equal(payload.p_score, 5);
        if (!runIds.has(payload.p_run_id)) {
          runIds.add(payload.p_run_id);
          rows.push({ player_name: payload.p_player_name, score: payload.p_score });
        }
        return route.fulfill({ status: 204, headers });
      }
      return route.fulfill({ status: 200, headers, contentType: 'application/json', body: JSON.stringify([...rows].sort((a, b) => b.score - a.score).slice(0, 3)) });
    });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => document.querySelectorAll('#leaderboard li').length === 3);
    assert.equal(await page.locator('#leaderboard img').count(), 0);
    assert.equal(await page.evaluate(() => window.injected), undefined);
    assert.equal(await page.locator('#submitScoreBtn').isDisabled(), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

    await page.evaluate(() => { startGame(); score = 0; lose(); draw(); });
    assert.equal(await page.locator('#submitScoreBtn').isDisabled(), true);
    await page.evaluate(() => { startGame(); score = 5; lose(); draw(); });
    await page.locator('#playerName').fill('Ada');
    const frameBefore = await page.evaluate(() => frame);
    await page.locator('#playerName').press('End');
    await page.locator('#playerName').press('Space');
    await page.locator('#playerName').pressSequentially('Lovelace');
    assert.equal(await page.locator('#playerName').inputValue(), 'Ada Lovelace');
    assert.equal(await page.evaluate(() => frame), frameBefore);

    failWrite = true;
    await page.locator('#submitScoreBtn').click();
    await page.waitForFunction(() => document.querySelector('#submissionStatus').textContent.includes('Could not save'));
    assert.equal(await page.locator('#submitScoreBtn').isEnabled(), true);
    failWrite = false;
    await page.locator('#submitScoreBtn').click();
    await page.waitForFunction(() => document.querySelector('#submissionStatus').textContent === 'Score saved!');
    assert.equal(await page.locator('#submitScoreBtn').isDisabled(), true);
    assert.equal(submissions, 1);
    assert.equal(await page.locator('#leaderboard li').nth(1).innerText(), 'Ada Lovelace\n5');

    const other = await context.newPage(); await other.goto(url);
    await other.waitForFunction(() => document.querySelector('#leaderboard').textContent.includes('Ada Lovelace'));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#leaderboard').textContent.includes('Ada Lovelace'));
    failRead = true;
    await page.evaluate(() => loadLeaderboard());
    assert.match(await page.locator('#leaderboardStatus').textContent(), /Could not refresh/);
    assert.equal(await page.locator('#leaderboard li').count(), 3);
    await page.locator('#startBtn').click();
    await page.waitForFunction(() => frame > 2);
    assert.deepEqual(errors, []);
    console.log('PASS: leaderboard rendering, safe names, mobile fit, name typing, positive completed runs only, submission errors/retry, save/refresh, second browser page, reload, and read-failure fallback (simulated Supabase API).');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
