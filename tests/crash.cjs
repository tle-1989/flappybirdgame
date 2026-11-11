// Run with Node/Playwright: CHROMIUM_PATH=/usr/bin/chromium node tests/crash.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8').replace(/projectUrl: '[^']*'/, "projectUrl: ''");
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(html); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion });
      await context.addInitScript(() => {
        let id = 0; const callbacks = new Map();
        window.requestAnimationFrame = callback => { callbacks.set(++id, callback); return id; };
        window.cancelAnimationFrame = id => callbacks.delete(id);
        window.advanceFrame = time => { const pending = [...callbacks.values()]; callbacks.clear(); pending.forEach(callback => callback(time)); };
        window.pendingFrames = () => callbacks.size;
      });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const state = await page.evaluate(() => {
        startGame(); score = 3; bird.y = HEIGHT - GROUND_H - bird.r; bird.vy = 1; update(); draw();
        const initial = crash; lose();
        return { gameOver, score, completed: completedRun.score, count: crash.particles.length, repeated: crash === initial, frame, elapsed: crash.elapsed, pending: pendingFrames() };
      });
      assert.equal(state.gameOver, true); assert.equal(state.score, 3); assert.equal(state.completed, 3);
      assert.equal(state.count, 28); assert.equal(state.repeated, true);
      if (reducedMotion === 'reduce') {
        assert.equal(state.elapsed, 750); assert.equal(state.pending, 0);
      } else {
        assert.equal(state.pending, 1);
        await page.evaluate(() => { advanceFrame(100); advanceFrame(350); });
        assert.equal(await page.evaluate(() => crash.elapsed), 250);
        assert.equal(await page.evaluate(() => frame), state.frame);
        assert.equal(await page.evaluate(() => ctx.globalAlpha), 1);
        if (process.env.CRASH_SCREENSHOT) await page.screenshot({ path: process.env.CRASH_SCREENSHOT });
        await page.evaluate(() => advanceFrame(850));
        assert.equal(await page.evaluate(() => crash.elapsed), 750);
        assert.equal(await page.evaluate(() => pendingFrames()), 0);
      }
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => crash === null && !gameOver && gameStarted && pendingFrames() === 1), true);
      // Also restart while the effect is still active, before its normal cleanup.
      await page.evaluate(() => { lose(); startGame(); advanceFrame(1000); advanceFrame(1000 + STEP_MS); });
      assert.equal(await page.evaluate(() => crash === null && !gameOver && frame === 1 && pendingFrames() === 1), true);
      await page.evaluate(() => { lose(); resetGame(); });
      assert.equal(await page.evaluate(() => crash === null && !gameOver && pendingFrames() === 0), true);
      assert.deepEqual(errors, []); await context.close();
    }
    console.log('PASS: collision explosion, flame particles, unchanged final score, duplicate-loss guard, frozen physics, finite animation, drawing-state restoration, immediate restart/reset cleanup, and reduced-motion behavior.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
