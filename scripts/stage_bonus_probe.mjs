import fs from "fs";
import { chromium } from "playwright";

const round = process.argv[2] || "round";
const outDir = `output/web-game/${round}/stage-bonus`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(220);
await page.keyboard.press("Enter");
await page.waitForTimeout(150);

const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.evaluate(() => {
  window.orbDriftDebug?.setSeed?.(909);
  window.orbDriftDebug?.setLevel?.(4);
});
await page.waitForTimeout(140);
const before = await readState();

const clearResult = await page.evaluate(() => window.orbDriftDebug?.forceClearSector?.());
await page.waitForTimeout(140);
const after = await readState();
await page.screenshot({ path: `${outDir}/shot-early.png` });
await page.waitForTimeout(1950);
const afterReveal = await readState();

const checks = {
  leveledToNextStage: before.level === 4 && after.level === 5,
  bonusScoreIncreased: after.stageBonusScore >= before.stageBonusScore + 3,
  totalScoreIncreased: after.totalScore >= before.totalScore + 3,
  stillPlaying: after.mode === "playing",
  bonusPersistsAfterTransition: afterReveal.stageBonusScore === after.stageBonusScore && afterReveal.mode === "playing",
};

const probe = {
  round,
  passed: Object.values(checks).every(Boolean),
  checks,
  clearResult,
  before: {
    level: before.level,
    stage: before.stage,
    totalScore: before.totalScore,
    stageBonusScore: before.stageBonusScore,
  },
  after: {
    level: after.level,
    stage: after.stage,
    totalScore: after.totalScore,
    stageBonusScore: after.stageBonusScore,
  },
  afterReveal: {
    level: afterReveal.level,
    stage: afterReveal.stage,
    totalScore: afterReveal.totalScore,
    stageBonusScore: afterReveal.stageBonusScore,
  },
};

await fs.promises.writeFile(`${outDir}/probe.json`, JSON.stringify(probe, null, 2));
await page.screenshot({ path: `${outDir}/shot.png` });

await browser.close();
console.log(`stage bonus probe captured for ${round}`);
