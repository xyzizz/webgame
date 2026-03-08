import { chromium } from 'playwright';

const round = process.argv[2] || 'round';
const outBase = `output/web-game/${round}`;

const browser = await chromium.launch({ headless: true });

const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 } });
const desktopPage = await desktop.newPage();
await desktopPage.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await desktopPage.waitForTimeout(350);
await desktopPage.screenshot({ path: `${outBase}/desktop-viewport.png` });
await desktop.close();

const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
});
const mobilePage = await mobile.newPage();
await mobilePage.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await mobilePage.waitForTimeout(350);
await mobilePage.screenshot({ path: `${outBase}/mobile-viewport.png` });
await mobile.close();

await browser.close();
console.log(`Captured viewports for ${round}`);
