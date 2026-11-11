// Run: CHROMIUM_PATH=/usr/bin/chromium node tests/parallax.cjs
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
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion });
      await page.addInitScript(() => { window.requestAnimationFrame = () => 1; window.cancelAnimationFrame = () => {}; });
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const result = await page.evaluate(() => {
        startGame(); drawBackground();
        const cache = landscape;
        const original = ctx.drawImage.bind(ctx);
        const positions = () => {
          const result = {};
          ctx.drawImage = (image, x, ...args) => {
            const layer = landscape.find(layer => layer.image === image);
            if (!(layer.name in result)) result[layer.name] = x;
            original(image, x, ...args);
          };
          drawBackground(); ctx.drawImage = original; return result;
        };
        const before = positions(); const pipeX = pipes[0].x;
        update(); const after = positions();
        const pipeDelta = pipes[0].x - pipeX;
        setPaused(true); const distance = scrollDistance;
        loop(1000); loop(2000);
        const pausedDistance = scrollDistance;
        setPaused(false); lose(); const crashDistance = scrollDistance;
        animateCrash(0); animateCrash(500);
        const afterCrash = scrollDistance;
        // Render across multiple wraps and ensure no transparent gaps at the ground edge.
        const coverage = [];
        for (const offset of [519.5, 520, 520.5, 1039.5, 1040, 1040.5, 1000000]) {
          scrollDistance = offset; drawBackground();
          coverage.push([...ctx.getImageData(0, 1420, 1040, 1).data].filter((_, i) => i % 4 === 3).every(alpha => alpha === 255));
        }
        const cacheRetained = cache === landscape;
        startGame();
        return { before, after, pipeDelta, distance, pausedDistance, crashDistance, afterCrash, coverage, cacheRetained, reset: scrollDistance };
      });
      const delta = name => result.after[name] - result.before[name];
      assert.ok(Math.abs(delta('ground') - result.pipeDelta) < 1e-9);
      assert.equal(delta('sky'), 0);
      if (reducedMotion === 'reduce') {
        for (const name of ['clouds', 'mountains', 'water', 'shore']) assert.equal(delta(name), 0);
      } else {
        const speeds = ['clouds', 'mountains', 'water', 'shore', 'ground'].map(name => Math.abs(delta(name)));
        assert.ok(speeds.every((speed, i) => speed > 0 && (!i || speed > speeds[i - 1])));
      }
      assert.equal(result.distance, result.pausedDistance);
      assert.equal(result.crashDistance, result.afterCrash);
      assert.ok(result.coverage.every(Boolean));
      assert.equal(result.cacheRetained, true); assert.equal(result.reset, 0);
      await page.close();
    }
    console.log('PASS: rendered ground/pipe speed match, increasing depth speeds, stationary sky, pause/crash freeze, restart reset, cached layers, wrap coverage, and reduced-motion behavior.');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
