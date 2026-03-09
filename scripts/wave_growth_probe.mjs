import fs from "fs";
import { chromium } from "playwright";

const round = process.argv[2] || "round";
const outDir = `output/web-game/${round}/wave-growth`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(220);

const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

const hold = async (code, ms) => {
  await page.keyboard.down(code);
  await page.waitForTimeout(ms);
  await page.keyboard.up(code);
};

const playBurst = async () => {
  await hold("KeyD", 420);
  await hold("KeyW", 260);
  await page.keyboard.press("Space");
  await hold("KeyS", 280);
  await hold("ArrowRight", 380);
  await page.keyboard.press("Space");
  await hold("ArrowUp", 260);
};

const pickPreferredOption = (options) => {
  const priority = ["thruster", "capacitor", "resonator", "overdrive", "alloy", "salvage", "patch"];
  for (const id of priority) {
    const found = options.find((item) => item.id === id);
    if (found) return found;
  }
  return options[0];
};

const growthEffectCheck = (before, after, picked) => {
  if (!picked) return false;
  if (picked.id === "thruster") return after.player.speed > before.player.speed;
  if (picked.id === "capacitor") return after.player.pulseCooldownMax < before.player.pulseCooldownMax;
  if (picked.id === "resonator") return after.player.pulseRadius > before.player.pulseRadius;
  if (picked.id === "overdrive") return after.player.pulseDamage > before.player.pulseDamage;
  if (picked.id === "alloy") return after.player.maxHp > before.player.maxHp;
  if (picked.id === "salvage") return after.build.salvage > before.build.salvage;
  if (picked.id === "patch") return after.player.hp >= before.player.hp;
  return false;
};

await page.keyboard.press("Enter");
await page.waitForTimeout(130);
await page.evaluate(() => window.orbDriftDebug?.setSeed?.(20260309));
await page.waitForTimeout(80);

const start = await readState();
await playBurst();
await page.waitForTimeout(500);
const afterBurst = await readState();

const runUpgradeCycle = async () => {
  const beforeForce = await readState();
  await page.evaluate(() => window.orbDriftDebug?.setTech?.(99));
  const forceResult = await page.evaluate(() => window.orbDriftDebug?.forceEndWave?.());
  await page.waitForTimeout(120);
  const inUpgrade = await readState();
  const picked = pickPreferredOption(inUpgrade.upgradesOffered || []);
  const digit = Math.max(1, Math.min(3, (picked?.index ?? 0) + 1));
  await page.keyboard.press(`Digit${digit}`);
  await page.waitForTimeout(140);
  const afterPick = await readState();
  return { beforeForce, forceResult, inUpgrade, picked, afterPick };
};

const cycle1 = await runUpgradeCycle();
await page.screenshot({ path: `${outDir}/shot-upgrade-1.png` });
const cycle2 = await runUpgradeCycle();
const cycle3 = await runUpgradeCycle();
await page.screenshot({ path: `${outDir}/shot-wave-4.png` });
const finalState = await readState();

const checks = {
  canStartRun: start.mode === "playing" && start.level === 1,
  realPlayBurstRan: afterBurst.elapsed > start.elapsed + 1.8 && afterBurst.mode === "playing",
  enemySpawned: start.enemies.length >= 2 && afterBurst.enemies.length >= 1,
  rewardSpawned: start.shards.length >= 1 && afterBurst.goal >= 1,
  waveEndEntersUpgrade:
    cycle1.inUpgrade.mode === "upgrade" && cycle2.inUpgrade.mode === "upgrade" && cycle3.inUpgrade.mode === "upgrade",
  upgradeChoiceReturnsToPlaying:
    cycle1.afterPick.mode === "playing" && cycle2.afterPick.mode === "playing" && cycle3.afterPick.mode === "playing",
  reachedMultipleWaves: cycle3.afterPick.level >= 4,
  growthClearlyAffectsNextWave:
    growthEffectCheck(cycle1.beforeForce, cycle1.afterPick, cycle1.picked) ||
    growthEffectCheck(cycle2.beforeForce, cycle2.afterPick, cycle2.picked) ||
    growthEffectCheck(cycle3.beforeForce, cycle3.afterPick, cycle3.picked),
  stageRuleVisibleAtNWave:
    start.levelsPerStage === 3 &&
    cycle3.afterPick.stage >= 2 &&
    cycle3.afterPick.enemyCountTarget > start.enemyCountTarget &&
    cycle3.afterPick.enemySpeedScale > start.enemySpeedScale,
};

const probe = {
  round,
  passed: Object.values(checks).every(Boolean),
  checks,
  samples: {
    start: {
      mode: start.mode,
      level: start.level,
      stage: start.stage,
      enemyCountTarget: start.enemyCountTarget,
      enemySpeedScale: start.enemySpeedScale,
      waveDuration: start.waveDuration,
      waveTimer: start.waveTimer,
      player: start.player,
    },
    afterBurst: {
      mode: afterBurst.mode,
      elapsed: afterBurst.elapsed,
      waveTimer: afterBurst.waveTimer,
      enemies: afterBurst.enemies.length,
      shards: afterBurst.shards.length,
      tech: afterBurst.tech,
    },
    cycle1: {
      forceResult: cycle1.forceResult,
      picked: cycle1.picked,
      inUpgrade: {
        mode: cycle1.inUpgrade.mode,
        level: cycle1.inUpgrade.level,
        options: cycle1.inUpgrade.upgradesOffered,
      },
      afterPick: {
        mode: cycle1.afterPick.mode,
        level: cycle1.afterPick.level,
        player: cycle1.afterPick.player,
        build: cycle1.afterPick.build,
      },
    },
    cycle2: {
      picked: cycle2.picked,
      afterPick: {
        mode: cycle2.afterPick.mode,
        level: cycle2.afterPick.level,
        player: cycle2.afterPick.player,
        build: cycle2.afterPick.build,
      },
    },
    cycle3: {
      picked: cycle3.picked,
      afterPick: {
        mode: cycle3.afterPick.mode,
        level: cycle3.afterPick.level,
        stage: cycle3.afterPick.stage,
        enemyCountTarget: cycle3.afterPick.enemyCountTarget,
        enemySpeedScale: cycle3.afterPick.enemySpeedScale,
        player: cycle3.afterPick.player,
        build: cycle3.afterPick.build,
      },
    },
    finalState: {
      mode: finalState.mode,
      level: finalState.level,
      stage: finalState.stage,
      tech: finalState.tech,
      enemyCountTarget: finalState.enemyCountTarget,
      enemySpeedScale: finalState.enemySpeedScale,
    },
  },
};

await fs.promises.writeFile(`${outDir}/probe.json`, JSON.stringify(probe, null, 2));
await page.screenshot({ path: `${outDir}/shot-final.png` });

await browser.close();
console.log(`wave growth probe captured for ${round}`);
