import { chromium } from 'playwright';
import fs from 'fs';

const round = process.argv[2] || 'round';
const targetLevel = Math.max(1, Math.round(Number(process.argv[3] || 1)));
const outDir = `output/web-game/${round}/debug-win`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(200);
await page.evaluate((lvl) => {
  if (lvl > 1) {
    window.orbDriftDebug?.setLevel(lvl);
  }
  window.orbDriftDebug?.forceWin();
}, targetLevel);
await page.waitForTimeout(120);

const state = await page.evaluate(() => window.render_game_to_text());
const subtitle = await page.textContent('#menu-subtitle');
await fs.promises.writeFile(`${outDir}/state.json`, state);
await fs.promises.writeFile(`${outDir}/subtitle.txt`, String(subtitle || '').trim());
await page.screenshot({ path: `${outDir}/shot.png` });

await browser.close();
console.log(`captured debug win for ${round}`);
