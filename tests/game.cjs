// Run with Node and Playwright available: node tests/game.cjs
// Optionally set CHROMIUM_PATH to use a system Chromium installation.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');


(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(path.resolve(__dirname, '../index.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  try {
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
  });
  let checks = 0;
  try {
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.width < 900 });
      // Control animation timestamps to test refresh rates without wall-clock flakiness.
      await context.addInitScript(() => {
        let nextId = 0;
        const callbacks = new Map();
        window.requestAnimationFrame = callback => { callbacks.set(++nextId, callback); return nextId; };
        window.cancelAnimationFrame = id => callbacks.delete(id);
        window.advanceFrame = timestamp => {
          const pending = [...callbacks.values()]; callbacks.clear();
          for (const callback of pending) callback(timestamp);
        };
      });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      assert.equal(await page.locator('#status').textContent(), 'Ready');
      const layout = await page.evaluate(() => {
        const rect = canvas.getBoundingClientRect();
        return { width: document.documentElement.scrollWidth, viewport: innerWidth, ratio: rect.width / rect.height };
      });
      assert.ok(layout.width <= layout.viewport, JSON.stringify(layout));
      assert.ok(Math.abs(layout.ratio - 520 / 800) < 0.002);
      checks++;

      const timing = await page.evaluate(() => {
        const results = [];
        for (const hz of [30, 60, 120, 144]) {
          startGame(); advanceFrame(0);
          for (let i = 1; i <= Math.floor(hz / 2); i++) advanceFrame(i * 1000 / hz);
          results.push({ frame, y: bird.y, vy: bird.vy, x: pipes[0].x });
        }
        return results;
      });
      for (const result of timing) assert.deepEqual(result, timing[0]);
      assert.equal(timing[0].frame, 30); checks++;

      await page.locator('#startBtn').click();
      assert.equal(await page.evaluate(() => bird.vy), -7.6);
      await page.keyboard.press('p');
      assert.equal(await page.locator('#pauseBtn').textContent(), 'Resume');
      const pausedState = await page.evaluate(() => ({ frame, y: bird.y, speedSteps }));
      await page.evaluate(() => advanceFrame(10000));
      assert.deepEqual(await page.evaluate(() => ({ frame, y: bird.y, speedSteps })), pausedState);
      await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', repeat: true, bubbles: true })));
      assert.equal(await page.locator('#status').textContent(), 'Paused');
      await page.locator('#pauseBtn').click();
      assert.match(await page.locator('#status').textContent(), /^Playing/); checks++;

      assert.equal(await page.evaluate(() => {
        startGame(); speedSteps = 299;
        setPaused(true); setPaused(false);
        advanceFrame(50000); advanceFrame(50000 + STEP_MS);
        return baseSpeed;
      }), 3.15); checks++;

      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal(await page.locator('#status').textContent(), 'Paused');
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal(await page.locator('#status').textContent(), 'Paused'); checks++;

      const scoring = await page.evaluate(() => {
        startGame(); bird.y = 350; bird.vy = 0;
        pipes = [{ x: 37, top: 200, bottomY: 390, scored: false }];
        update(); const overlapping = score;
        pipes[0].x = 10; update(); const cleared = score;
        update(); return { overlapping, cleared, once: score };
      });
      assert.deepEqual(scoring, { overlapping: 0, cleared: 1, once: 1 }); checks++;
      assert.equal(await page.evaluate(() => {
        startGame(); bird.y = 18; bird.vy = -1;
        pipes = [{ x: 0, top: 200, bottomY: 390, scored: false }];
        update(); return gameOver && score === 0;
      }), true); checks++;

      assert.deepEqual(await page.evaluate(() => {
        resetBird(); bird.tilt = 0;
        const beak = birdBeak();
        return [
          birdHitsRect({ x: 137, y: 377, w: 10, h: 10 }, beak), // Square corner outside circular body.
          birdHitsRect({ x: 145, y: 355, w: 10, h: 10 }, beak), // Visible beak.
          birdHitsRect({ x: 130, y: 350, w: 10, h: 20 }, beak), // Body.
          birdHitsRect(pipeRects({ x: 141, top: 370, bottomY: 560 })[1], beak) // Extended cap.
        ];
      }), [false, true, true, true]); checks++;

      await page.evaluate(() => { startGame(); bird.y = HEIGHT - GROUND_H - bird.r; bird.vy = 1; update(); });
      assert.equal(await page.locator('#status').textContent(), 'Game Over');
      await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => score === 0 && !gameOver && bird.vy === FLAP), true);
      await page.evaluate(() => { bird.vy = 2; document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true })); });
      assert.equal(await page.evaluate(() => bird.vy), 2);
      await page.keyboard.press('Space'); assert.equal(await page.evaluate(() => bird.vy), -7.6); checks++;

      await page.evaluate(() => resetGame());
      if (viewport.width < 900) await page.locator('#game').tap();
      else await page.locator('#game').click();
      assert.equal(await page.evaluate(() => gameStarted && bird.vy === FLAP), true);
      assert.equal(await page.evaluate(() => { ctx.textAlign = 'right'; drawOverlay('Test', 'Test'); drawScore(); return ctx.textAlign; }), 'right');
      assert.deepEqual(errors, []); checks++;
      await context.close();
    }

    // Exercise the real browser animation loop as well as deterministic timestamps.
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport, hasTouch: viewport.width < 900 });
      await page.goto(url);
      if (viewport.width < 900) await page.locator('#game').tap();
      else await page.keyboard.press('Space');
      await page.waitForFunction(() => frame >= 3);
      await page.keyboard.press('p');
      const frozen = await page.evaluate(() => ({ frame, y: bird.y }));
      await page.waitForTimeout(100);
      assert.deepEqual(await page.evaluate(() => ({ frame, y: bird.y })), frozen);
      await page.locator('#pauseBtn').click();
      await page.waitForFunction(() => gameOver);
      await page.keyboard.press('Enter');
      await page.waitForFunction(() => gameStarted && frame >= 2);
      assert.equal(await page.evaluate(() => score), 0);
      checks++; await page.close();
    }

    for (const mode of ['read-error', 'write-error', 'invalid']) {
      const page = await browser.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(mode => {
        Storage.prototype.getItem = () => {
          if (mode === 'read-error') throw new DOMException('Blocked', 'SecurityError');
          return mode === 'invalid' ? 'NaN' : '0';
        };
        Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
      }, mode);
      await page.goto(url);
      assert.equal(await page.locator('#best').textContent(), '0');
      assert.deepEqual(await page.evaluate(() => {
        startGame(); bird.y = 350;
        pipes = [{ x: 0, top: 200, bottomY: 390, scored: false }];
        update(); return { score, best, gameOver };
      }), { score: 1, best: 1, gameOver: false });
      assert.deepEqual(errors, []); checks++; await page.close();
    }
    console.log(`PASS: ${checks} checks covering desktop, tablet, mobile, timing, scoring, collisions, controls, pause, storage, and drawing state.`);
  } finally { await browser.close(); }
  } finally { await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
