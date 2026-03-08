import { chromium } from 'playwright';
import fs from 'fs';

const round = process.argv[2] || 'round';
const outDir = `output/web-game/${round}/mobile-resize`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(220);

await page.dispatchEvent('.touch-btn--right', 'pointerdown', { pointerType: 'touch', isPrimary: true, bubbles: true });
await page.waitForTimeout(260);
await page.dispatchEvent('.touch-btn--right', 'pointerup', { pointerType: 'touch', isPrimary: true, bubbles: true });
await page.waitForTimeout(80);

await page.setViewportSize({ width: 430, height: 932 });
await page.waitForTimeout(220);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(220);

const probe = await page.evaluate(() => {
  const canvas = document.getElementById('game-canvas');
  const touch = document.getElementById('touch-controls');
  return {
    mode: JSON.parse(window.render_game_to_text()).mode,
    canvasWidth: canvas?.style.width,
    canvasHeight: canvas?.style.height,
    touchVisible: touch?.classList.contains('visible'),
  };
});

await fs.promises.writeFile(`${outDir}/probe.json`, JSON.stringify(probe, null, 2));
await page.screenshot({ path: `${outDir}/shot.png` });

await browser.close();
console.log(`captured mobile resize probe for ${round}`);
