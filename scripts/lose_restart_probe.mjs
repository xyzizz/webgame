import fs from "fs";
import { chromium } from "playwright";

const round = process.argv[2] || "round";
const outDir = `output/web-game/${round}/lose-restart`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(220);

const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

await page.keyboard.press("Enter");
await page.waitForTimeout(120);
await page.evaluate(() => window.orbDriftDebug?.setPlayerHp?.(1));
await page.waitForTimeout(100);

let loseState = await readState();
for (let i = 0; i < 60 && loseState.mode !== "lose"; i += 1) {
  await page.waitForTimeout(120);
  loseState = await readState();
}
await page.screenshot({ path: `${outDir}/shot-lose.png` });

await page.keyboard.press("KeyR");
await page.waitForTimeout(150);
const restartState = await readState();
await page.screenshot({ path: `${outDir}/shot-restart.png` });

const checks = {
  reachedLose: loseState.mode === "lose",
  restartReturnsPlaying: restartState.mode === "playing",
  restartResetsWave: restartState.level === 1 && restartState.stage === 1,
  restartResetsResources: restartState.tech === 0 && restartState.waveTech === 0,
  restartResetsPlayer:
    Math.abs(restartState.player.x - 120) < 1.5 &&
    Math.abs(restartState.player.y - 270) < 1.5 &&
    restartState.player.hp === restartState.player.maxHp,
};

const probe = {
  round,
  passed: Object.values(checks).every(Boolean),
  checks,
  loseState: {
    mode: loseState.mode,
    level: loseState.level,
    hp: loseState.player.hp,
    elapsed: loseState.elapsed,
    lastRun: loseState.lastRun,
  },
  restartState: {
    mode: restartState.mode,
    level: restartState.level,
    stage: restartState.stage,
    tech: restartState.tech,
    waveTech: restartState.waveTech,
    player: restartState.player,
  },
};

await fs.promises.writeFile(`${outDir}/probe.json`, JSON.stringify(probe, null, 2));

await browser.close();
console.log(`lose restart probe captured for ${round}`);
