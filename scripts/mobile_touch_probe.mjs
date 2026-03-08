import { chromium } from 'playwright';
import fs from 'fs';

const round = process.argv[2] || 'round';
const outDir = `output/web-game/${round}/mobile-touch`;
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
await page.waitForTimeout(300);

await page.click('#start-btn');
await page.waitForTimeout(220);

const press = async (selector, hold = 220) => {
  await page.dispatchEvent(selector, 'pointerdown', { pointerType: 'touch', isPrimary: true, bubbles: true });
  await page.waitForTimeout(hold);
  await page.dispatchEvent(selector, 'pointerup', { pointerType: 'touch', isPrimary: true, bubbles: true });
};

await press('.touch-btn--right', 380);
await page.waitForTimeout(120);
await press('[data-code="Space"]', 80);
await page.waitForTimeout(120);
await press('[data-code="KeyP"]', 80);
await page.waitForTimeout(140);
await press('[data-code="KeyP"]', 80);
await page.waitForTimeout(120);

const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
await fs.promises.writeFile(`${outDir}/state.json`, JSON.stringify(state, null, 2));
await page.screenshot({ path: `${outDir}/shot.png` });

await context.close();
await browser.close();
console.log(`mobile touch probe captured for ${round}`);
