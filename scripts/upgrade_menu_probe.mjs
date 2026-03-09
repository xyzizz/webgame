import fs from "fs";
import { chromium } from "playwright";

const round = process.argv[2] || "round";
const outDir = `output/web-game/${round}/upgrade-menu`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(220);

const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.keyboard.press("Enter");
await page.waitForTimeout(120);
await page.evaluate(() => window.orbDriftDebug?.setTech?.(6));
await page.evaluate(() => window.orbDriftDebug?.forceEndWave?.());
await page.waitForTimeout(120);

const state = await readState();
await page.screenshot({ path: `${outDir}/shot.png` });

const checks = {
  enteredUpgradeMode: state.mode === "upgrade",
 showsThreeChoices: Array.isArray(state.upgradesOffered) && state.upgradesOffered.length === 3,
  atLeastOneAffordable: state.upgradesOffered.some((item) => item.affordable),
};

const probe = {
  round,
  passed: Object.values(checks).every(Boolean),
  checks,
  sample: {
    mode: state.mode,
    level: state.level,
    tech: state.tech,
    upgradesOffered: state.upgradesOffered,
  },
};

await fs.promises.writeFile(`${outDir}/probe.json`, JSON.stringify(probe, null, 2));
await browser.close();
console.log(`upgrade menu probe captured for ${round}`);
