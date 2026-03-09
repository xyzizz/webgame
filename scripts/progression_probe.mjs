import fs from "fs";
import { chromium } from "playwright";

const round = process.argv[2] || "round";
const outDir = `output/web-game/${round}/progression`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(220);
await page.keyboard.press("Enter");
await page.waitForTimeout(160);

const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const setLevelAndRead = async (level) => {
  await page.evaluate((value) => window.orbDriftDebug?.setLevel(value), level);
  await page.waitForTimeout(140);
  return readState();
};

const l1 = await readState();
const l4 = await setLevelAndRead(4);
const l5 = await setLevelAndRead(5);
const l8 = await setLevelAndRead(8);
const l9 = await setLevelAndRead(9);

const approxEqual = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

const checks = {
  stageBoundaries:
    l1.stage === 1 && l4.stage === 1 && l5.stage === 2 && l8.stage === 2 && l9.stage === 3,
  speedIncreasesEveryStage:
    approxEqual(l1.enemySpeedScale, l4.enemySpeedScale) &&
    l5.enemySpeedScale > l4.enemySpeedScale &&
    approxEqual(l5.enemySpeedScale, l8.enemySpeedScale) &&
    l9.enemySpeedScale > l8.enemySpeedScale,
  enemyCountIncreasesEveryStage:
    l1.enemies.length === l4.enemies.length &&
    l5.enemies.length === l1.enemies.length + 1 &&
    l8.enemies.length === l5.enemies.length &&
    l9.enemies.length === l5.enemies.length + 1,
  countdownWithinStage: l1.levelsToNextStage === 3 && l4.levelsToNextStage === 0 && l5.levelsToNextStage === 3,
  entryShieldScalesByStage:
    l1.levelEntryShieldTotal >= l5.levelEntryShieldTotal &&
    l5.levelEntryShieldTotal >= l9.levelEntryShieldTotal &&
    l9.levelEntryShieldTotal >= 0.58,
};

const probe = {
  round,
  passed: Object.values(checks).every(Boolean),
  checks,
  samples: {
    level1: {
      level: l1.level,
      stage: l1.stage,
      speedScale: l1.enemySpeedScale,
      enemyCount: l1.enemies.length,
      levelsToNextStage: l1.levelsToNextStage,
      entryShield: l1.levelEntryShieldTotal,
    },
    level4: {
      level: l4.level,
      stage: l4.stage,
      speedScale: l4.enemySpeedScale,
      enemyCount: l4.enemies.length,
      levelsToNextStage: l4.levelsToNextStage,
      entryShield: l4.levelEntryShieldTotal,
    },
    level5: {
      level: l5.level,
      stage: l5.stage,
      speedScale: l5.enemySpeedScale,
      enemyCount: l5.enemies.length,
      levelsToNextStage: l5.levelsToNextStage,
      entryShield: l5.levelEntryShieldTotal,
    },
    level8: {
      level: l8.level,
      stage: l8.stage,
      speedScale: l8.enemySpeedScale,
      enemyCount: l8.enemies.length,
      levelsToNextStage: l8.levelsToNextStage,
      entryShield: l8.levelEntryShieldTotal,
    },
    level9: {
      level: l9.level,
      stage: l9.stage,
      speedScale: l9.enemySpeedScale,
      enemyCount: l9.enemies.length,
      levelsToNextStage: l9.levelsToNextStage,
      entryShield: l9.levelEntryShieldTotal,
    },
  },
};

await fs.promises.writeFile(`${outDir}/probe.json`, JSON.stringify(probe, null, 2));
await page.screenshot({ path: `${outDir}/shot.png` });

await browser.close();
console.log(`progression probe captured for ${round}`);
