import fs from "fs";
import { chromium } from "playwright";

const round = process.argv[2] || "round";
const outDir = `output/web-game/${round}/natural-wave-clear`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(220);

const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));
const tap = async (code, hold = 170, settle = 40) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(hold);
  await page.keyboard.up(code);
  if (settle > 0) await page.waitForTimeout(settle);
};

await page.keyboard.press("Enter");
await page.waitForTimeout(130);
await page.evaluate(() => window.orbDriftDebug?.setSeed?.(1));
await page.keyboard.press("KeyR");
await page.waitForTimeout(120);

const samples = [];
const pattern = ["KeyD", "KeyS", "KeyA", "KeyW", "ArrowRight", "ArrowUp"];
let state = await readState();
for (let i = 0; i < 130; i += 1) {
  if (state.mode !== "playing") break;
  await tap(pattern[i % pattern.length], 180, 30);
  if (i % 2 === 0) {
    await page.keyboard.press("Space");
  }
  await page.waitForTimeout(60);
  state = await readState();
  if (i % 10 === 0 || state.mode !== "playing") {
    samples.push({
      i,
      mode: state.mode,
      level: state.level,
      waveTimer: state.waveTimer,
      hp: state.player.hp,
      tech: state.tech,
      enemies: state.enemies.length,
      shards: state.shards.length,
    });
  }
}

await page.screenshot({ path: `${outDir}/shot.png` });

const checks = {
  survivedToWaveBreak: state.mode === "upgrade",
  noForcedTransitionUsed: true,
  retainedPositiveHp: state.player.hp > 0,
  breakHasChoices: state.mode === "upgrade" && (state.upgradesOffered?.length ?? 0) === 3,
};

const probe = {
  round,
  passed: Object.values(checks).every(Boolean),
  checks,
  finalState: {
    mode: state.mode,
    level: state.level,
    hp: state.player.hp,
    waveTimer: state.waveTimer,
    tech: state.tech,
    options: state.upgradesOffered ?? [],
  },
  samples,
};

await fs.promises.writeFile(`${outDir}/probe.json`, JSON.stringify(probe, null, 2));

await browser.close();
console.log(`natural wave clear probe captured for ${round}`);
