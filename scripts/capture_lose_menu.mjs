import { chromium } from 'playwright';
import fs from 'fs';

const round = process.argv[2] || 'round';
const outDir = `output/web-game/${round}/lose-menu`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' });
await page.click('#start-btn');
await page.waitForTimeout(5600);

const subtitle = await page.textContent('#menu-subtitle');
await fs.promises.writeFile(`${outDir}/subtitle.txt`, String(subtitle || '').trim());
await page.screenshot({ path: `${outDir}/shot.png` });

await browser.close();
console.log(`captured lose menu for ${round}`);
