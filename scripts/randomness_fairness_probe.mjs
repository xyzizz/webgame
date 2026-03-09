import fs from "fs";
import { chromium } from "playwright";

const round = process.argv[2] || "round";
const runs = Math.max(3, Math.min(12, Number(process.argv[3] || 6)));
const seedArg = process.argv[4] || "";
const explicitSeeds = seedArg.trim()
  ? seedArg
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value))
  : [];

const outDir = `output/web-game/${round}/randomness`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(220);

const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

const hasSeedSupport = await page.evaluate(() => typeof window.orbDriftDebug?.setSeed === "function");

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const calcMetrics = (state) => {
  const enemyDistances = state.enemies.map((enemy) => dist(state.player, enemy));
  const minPlayerEnemyDist = enemyDistances.length ? Math.min(...enemyDistances) : Infinity;

  let minEnemyEnemyDist = Infinity;
  for (let i = 0; i < state.enemies.length; i += 1) {
    for (let j = i + 1; j < state.enemies.length; j += 1) {
      minEnemyEnemyDist = Math.min(minEnemyEnemyDist, dist(state.enemies[i], state.enemies[j]));
    }
  }

  const shardPlayerDistances = state.shards.map((shard) => dist(state.player, shard));
  const nearestShardToPlayer = shardPlayerDistances.length ? Math.min(...shardPlayerDistances) : Infinity;

  const shardEnemyNearest = state.shards.map((shard) => {
    if (!state.enemies.length) return Infinity;
    return Math.min(...state.enemies.map((enemy) => dist(shard, enemy)));
  });
  const minShardEnemyDist = shardEnemyNearest.length ? Math.min(...shardEnemyNearest) : Infinity;

  const centroid = state.enemies.length
    ? {
        x: state.enemies.reduce((sum, enemy) => sum + enemy.x, 0) / state.enemies.length,
        y: state.enemies.reduce((sum, enemy) => sum + enemy.y, 0) / state.enemies.length,
      }
    : { x: 0, y: 0 };
  const enemySpread = state.enemies.length
    ? state.enemies.reduce((sum, enemy) => sum + dist(enemy, centroid), 0) / state.enemies.length
    : 0;

  const fairnessChecks = {
    noFaceSpawn: minPlayerEnemyDist >= 96,
    noHardCluster: minEnemyEnemyDist >= 64,
    shardNotFree: nearestShardToPlayer >= 70,
    shardReachable: nearestShardToPlayer <= 560,
    shardNotSuicide: minShardEnemyDist >= 54,
  };

  return {
    minPlayerEnemyDist: Number(minPlayerEnemyDist.toFixed(2)),
    minEnemyEnemyDist: Number(minEnemyEnemyDist.toFixed(2)),
    nearestShardToPlayer: Number(nearestShardToPlayer.toFixed(2)),
    minShardEnemyDist: Number(minShardEnemyDist.toFixed(2)),
    enemySpread: Number(enemySpread.toFixed(2)),
    fairnessChecks,
    fairnessPassed: Object.values(fairnessChecks).every(Boolean),
  };
};

const runRecords = [];
for (let i = 0; i < runs; i += 1) {
  const seed = explicitSeeds[i] ?? i + 1;
  if (hasSeedSupport) {
    await page.evaluate((value) => window.orbDriftDebug?.setSeed?.(value), seed);
  }

  if (i === 0) {
    await page.keyboard.press("Enter");
  } else {
    await page.keyboard.press("KeyR");
  }
  await page.waitForTimeout(120);

  const state = await readState();
  const metrics = calcMetrics(state);
  runRecords.push({
    run: i + 1,
    seed: hasSeedSupport ? seed : null,
    mode: state.mode,
    enemyLayout: state.enemies.map((enemy) => [enemy.x, enemy.y]),
    shardLayout: state.shards.map((shard) => [shard.x, shard.y]),
    enemyCount: state.enemies.length,
    shardCount: state.shards.length,
    metrics,
  });
}

const uniqueEnemyLayouts = new Set(runRecords.map((record) => JSON.stringify(record.enemyLayout))).size;
const uniqueShardLayouts = new Set(runRecords.map((record) => JSON.stringify(record.shardLayout))).size;
const fairnessPassRate = runRecords.filter((record) => record.metrics.fairnessPassed).length / runRecords.length;

const aggregate = {
  avgMinPlayerEnemyDist: Number(
    (runRecords.reduce((sum, record) => sum + record.metrics.minPlayerEnemyDist, 0) / runRecords.length).toFixed(2)
  ),
  avgMinEnemyEnemyDist: Number(
    (runRecords.reduce((sum, record) => sum + record.metrics.minEnemyEnemyDist, 0) / runRecords.length).toFixed(2)
  ),
  avgNearestShardToPlayer: Number(
    (runRecords.reduce((sum, record) => sum + record.metrics.nearestShardToPlayer, 0) / runRecords.length).toFixed(2)
  ),
  avgMinShardEnemyDist: Number(
    (runRecords.reduce((sum, record) => sum + record.metrics.minShardEnemyDist, 0) / runRecords.length).toFixed(2)
  ),
  avgEnemySpread: Number(
    (runRecords.reduce((sum, record) => sum + record.metrics.enemySpread, 0) / runRecords.length).toFixed(2)
  ),
};

const dimensions = {
  fairness: fairnessPassRate >= 0.8 ? "pass" : "needs_work",
  variation:
    uniqueEnemyLayouts >= Math.ceil(runRecords.length * 0.6) && uniqueShardLayouts >= Math.ceil(runRecords.length * 0.6)
      ? "pass"
      : "needs_work",
  readability: aggregate.avgMinEnemyEnemyDist >= 68 && aggregate.avgMinPlayerEnemyDist >= 102 ? "pass" : "needs_work",
  replayability:
    fairnessPassRate >= 0.8 &&
    uniqueEnemyLayouts >= Math.ceil(runRecords.length * 0.6) &&
    uniqueShardLayouts >= Math.ceil(runRecords.length * 0.6)
      ? "pass"
      : "needs_work",
};

const probe = {
  round,
  runs,
  hasSeedSupport,
  seedsUsed: hasSeedSupport ? runRecords.map((record) => record.seed) : [],
  uniqueEnemyLayouts,
  uniqueShardLayouts,
  fairnessPassRate: Number(fairnessPassRate.toFixed(2)),
  aggregate,
  dimensions,
  records: runRecords,
};

await fs.promises.writeFile(`${outDir}/probe.json`, JSON.stringify(probe, null, 2));
await page.screenshot({ path: `${outDir}/shot.png` });

await browser.close();
console.log(`randomness fairness probe captured for ${round}`);
