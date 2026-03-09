(function initGame() {
  const canvas = document.getElementById("game-canvas");
  const ctx = canvas.getContext("2d");
  const menuPanel = document.getElementById("menu-panel");
  const menuKicker = document.getElementById("menu-kicker");
  const menuTitle = document.getElementById("menu-title");
  const menuSubtitle = document.getElementById("menu-subtitle");
  const startBtn = document.getElementById("start-btn");
  const controlsGrid = document.querySelector(".controls-grid");
  const touchControls = document.getElementById("touch-controls");
  const touchButtons = touchControls ? Array.from(touchControls.querySelectorAll("[data-code]")) : [];

  const world = { width: canvas.width, height: canvas.height };
  const keysDown = new Set();
  const pressedThisFrame = new Set();
  const FRAME_MS = 1000 / 60;

  const PLAYER_SPEED = 260;
  const MAX_PLAYER_HP = 5;
  const GOAL_SHARDS = 3;
  const MAX_LEVEL = 100;
  const LEVELS_PER_STAGE = 4;
  const EARLY_STAGE_SPEED_STEP = 0.14;
  const MID_STAGE_SPEED_STEP = 0.11;
  const LATE_STAGE_SPEED_STEP = 0.08;
  const MAX_ENEMIES = 9;
  const LEVEL_ENTRY_GRACE = 0.85;

  const ENEMY_ARCHETYPES = [
    { id: "E1", fallbackX: 300, fallbackY: 244, r: 15, speed: 95, hp: 1 },
    { id: "E2", fallbackX: 632, fallbackY: 314, r: 15, speed: 110, hp: 2 },
    { id: "E3", fallbackX: 838, fallbackY: 132, r: 15, speed: 124, hp: 2 },
    { id: "E4", fallbackX: 834, fallbackY: 418, r: 15, speed: 118, hp: 2 },
  ];

  const FALLBACK_SHARD_PATTERNS = [
    [
      { id: "S1", x: 220, y: 270, r: 8 },
      { id: "S2", x: 360, y: 270, r: 8 },
      { id: "S3", x: 540, y: 270, r: 8 },
    ],
    [
      { id: "S1", x: 240, y: 252, r: 8 },
      { id: "S2", x: 390, y: 286, r: 8 },
      { id: "S3", x: 560, y: 258, r: 8 },
    ],
    [
      { id: "S1", x: 210, y: 292, r: 8 },
      { id: "S2", x: 390, y: 244, r: 8 },
      { id: "S3", x: 570, y: 280, r: 8 },
    ],
  ];

  const BACKGROUND_POINTS = Array.from({ length: 52 }, (_, index) => {
    const seed = index + 1;
    return {
      x: (seed * 181) % world.width,
      y: (seed * 131) % world.height,
      radius: 1 + (seed % 4) * 0.55,
      phase: ((seed * 13) % 360) * (Math.PI / 180),
      speed: 0.12 + (seed % 5) * 0.05,
    };
  });

  const MAX_BASE_ENEMY_SPEED = Math.max(...ENEMY_ARCHETYPES.map((enemy) => enemy.speed));
  const MAX_ENEMY_SPEED_SCALE = PLAYER_SPEED / MAX_BASE_ENEMY_SPEED;
  const DESKTOP_CONTROL_CHIPS = [
    { key: "Arrows / WASD", label: "Drift" },
    { key: "Space", label: "Pulse" },
    { key: "P", label: "Pause" },
    { key: "R", label: "Restart" },
    { key: "F", label: "Fullscreen" },
  ];
  const TOUCH_CONTROL_CHIPS = [
    { key: "D-pad", label: "Drift" },
    { key: "PULSE", label: "Burst" },
    { key: "PAUSE", label: "Pause" },
    { key: "RESTART", label: "Retry" },
    { key: "Tap Btns", label: "Touch" },
  ];
  const ENEMY_SPAWN_MARGIN = 36;
  const ENEMY_PLAYER_SAFE_DIST = 170;
  const ENEMY_MIN_GAP = 92;
  const ENEMY_MIN_X_FROM_PLAYER = 132;
  const ENEMY_ANGLE_BUCKETS = 6;
  const SHARD_SPAWN_MARGIN = 34;
  const SHARD_MIN_GAP = 88;
  const SHARD_MIN_X_FROM_PLAYER = 78;
  const SHARD_MIN_PLAYER_DIST = 118;
  const SHARD_MAX_PLAYER_DIST = 560;
  const SHARD_ENEMY_MIN_DIST = 66;
  const SHARD_ENEMY_MAX_DIST = 280;
  const SHARD_RISK_TARGETS = [192, 138, 102];
  const SHARD_ANGLE_MIN_SEPARATION = 0.42;
  const DEFAULT_DEBUG_SEED = 20260309;

  function normalizeSeed(value) {
    if (!Number.isFinite(value)) return DEFAULT_DEBUG_SEED;
    return (Math.abs(Math.floor(value)) >>> 0) || 1;
  }

  function createRng(seed) {
    let stateSeed = normalizeSeed(seed);
    return () => {
      stateSeed = (Math.imul(stateSeed, 1664525) + 1013904223) >>> 0;
      return stateSeed / 4294967296;
    };
  }

  function mixSeed(base, salt) {
    let x = normalizeSeed(base ^ salt);
    x ^= x >>> 16;
    x = Math.imul(x, 2246822507);
    x ^= x >>> 13;
    x = Math.imul(x, 3266489909);
    x ^= x >>> 16;
    return normalizeSeed(x);
  }

  const state = {
    mode: "menu",
    level: 1,
    maxLevel: MAX_LEVEL,
    score: 0,
    totalScore: 0,
    goal: GOAL_SHARDS,
    elapsed: 0,
    levelBannerTimer: 0,
    levelEntryShield: 0,
    levelEntryShieldTotal: LEVEL_ENTRY_GRACE,
    damageFlash: 0,
    pickupBursts: [],
    clearFlash: 0,
    clearLevel: 0,
    stageBonusFlash: 0,
    stageBonusDelay: 0,
    stageBonusPoints: 0,
    stageBonusStage: 0,
    milestoneFlash: 0,
    milestoneLevel: 0,
    milestoneLabel: "",
    launchFlash: 0,
    damageTaken: 0,
    sectorDamageTaken: 0,
    stageBonusScore: 0,
    cleanSweepScore: 0,
    tutorialMoveHint: true,
    tutorialPulseHint: true,
    nearestEnemyDist: Infinity,
    bestLevel: 1,
    lastRun: null,
    lastHitEnemyId: null,
    spawnDiagnostics: null,
    runSeed: DEFAULT_DEBUG_SEED,
    seedOverride: null,
    player: makePlayer(),
    enemies: [],
    shards: [],
  };

  function makePlayer(hp = MAX_PLAYER_HP) {
    return {
      x: 120,
      y: world.height / 2,
      vx: 0,
      vy: 0,
      r: 16,
      speed: PLAYER_SPEED,
      hp,
      invuln: 0,
      pulseTimer: 0,
      pulseCooldown: 0,
    };
  }

  function getStageForLevel(level = state.level) {
    return Math.floor((Math.max(1, level) - 1) / LEVELS_PER_STAGE) + 1;
  }

  function getEnemyCountForLevel(level = state.level) {
    const stage = getStageForLevel(level);
    return Math.min(MAX_ENEMIES, ENEMY_ARCHETYPES.length + (stage - 1));
  }

  function getLevelsToNextStage(level = state.level) {
    const progressInStage = (Math.max(1, level) - 1) % LEVELS_PER_STAGE;
    return LEVELS_PER_STAGE - 1 - progressInStage;
  }

  function getPressureBand(level = state.level) {
    const stage = getStageForLevel(level);
    if (stage >= 6) return "CRITICAL";
    if (stage >= 4) return "SEVERE";
    if (stage >= 2) return "RISING";
    return "STEADY";
  }

  function getStageSpeedIncrement(stage) {
    if (stage <= 1) return 0;
    if (stage <= 4) return EARLY_STAGE_SPEED_STEP;
    if (stage <= 7) return MID_STAGE_SPEED_STEP;
    return LATE_STAGE_SPEED_STEP;
  }

  function getSpeedScaleForStage(stage) {
    let scale = 1;
    for (let s = 2; s <= stage; s += 1) {
      scale += getStageSpeedIncrement(s);
    }
    return Math.min(scale, MAX_ENEMY_SPEED_SCALE);
  }

  function getStageSpeedDelta(level = state.level) {
    const stage = getStageForLevel(level);
    if (stage <= 1) return 0;
    return Math.max(0, getSpeedScaleForStage(stage) - getSpeedScaleForStage(stage - 1));
  }

  function getSpeedScale(level = state.level) {
    return getSpeedScaleForStage(getStageForLevel(level));
  }

  function getNextMilestoneLevel(level) {
    if (level >= state.maxLevel) return state.maxLevel;
    const stage = getStageForLevel(level);
    const nextStageStart = stage * LEVELS_PER_STAGE + 1;
    return Math.min(state.maxLevel, nextStageStart);
  }

  function getEntryShieldDuration(level = state.level) {
    const stage = getStageForLevel(level);
    const softened = LEVEL_ENTRY_GRACE - Math.max(0, stage - 1) * 0.04;
    const pressureComp = getEnemyCountForLevel(level) >= 8 ? 0.05 : 0;
    return Math.max(0.58, Math.min(LEVEL_ENTRY_GRACE, softened + pressureComp));
  }

  function randomBetween(rng, min, max) {
    return min + rng() * (max - min);
  }

  function smallestAngleDiff(a, b) {
    const diff = Math.abs(a - b) % (Math.PI * 2);
    return diff > Math.PI ? Math.PI * 2 - diff : diff;
  }

  function getShardRiskTargets(level = state.level) {
    const stage = getStageForLevel(level);
    const safetyShift = Math.min(20, Math.max(0, stage - 1) * 5);
    return SHARD_RISK_TARGETS.map((dist, index) =>
      Math.min(SHARD_ENEMY_MAX_DIST - 14, dist + safetyShift - index * 2)
    );
  }

  function getShardDistanceBounds(level = state.level) {
    const stage = getStageForLevel(level);
    const lateStageTighten = Math.max(0, stage - 2) * 28;
    return {
      minPlayerDist: SHARD_MIN_PLAYER_DIST,
      maxPlayerDist: Math.max(390, SHARD_MAX_PLAYER_DIST - lateStageTighten),
    };
  }

  function createRuntimeSeed() {
    return normalizeSeed(Math.floor(Math.random() * 4294967295));
  }

  function makeLevelEnemyRng() {
    const levelSalt = Math.imul(state.level + 37, 2654435761);
    return createRng(mixSeed(state.runSeed, levelSalt));
  }

  function makeLevelShardRng() {
    const levelSalt = Math.imul(state.level + 79, 1597334677);
    return createRng(mixSeed(state.runSeed, levelSalt));
  }

  function pickEnemySpawn(rng, playerSpawn, existingEnemies, enemyRadius, totalEnemies) {
    const minX = Math.max(ENEMY_SPAWN_MARGIN + enemyRadius, playerSpawn.x + ENEMY_MIN_X_FROM_PLAYER);
    const maxX = world.width - ENEMY_SPAWN_MARGIN - enemyRadius;
    const minY = ENEMY_SPAWN_MARGIN + enemyRadius;
    const maxY = world.height - ENEMY_SPAWN_MARGIN - enemyRadius;

    for (let attempt = 0; attempt < 180; attempt += 1) {
      const candidate = {
        x: randomBetween(rng, minX, maxX),
        y: randomBetween(rng, minY, maxY),
      };
      const playerDist = Math.hypot(candidate.x - playerSpawn.x, candidate.y - playerSpawn.y);
      if (playerDist < ENEMY_PLAYER_SAFE_DIST + enemyRadius + playerSpawn.r) continue;

      const adaptiveGap = Math.max(72, ENEMY_MIN_GAP - Math.max(0, existingEnemies.length - 2) * 5);
      const hasGap = existingEnemies.every((enemy) => Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) >= adaptiveGap);
      if (!hasGap) continue;

      const bucketIndex = angleBucket(candidate, playerSpawn);
      const bucketCount = existingEnemies.reduce(
        (count, enemy) => count + (angleBucket(enemy, playerSpawn) === bucketIndex ? 1 : 0),
        0
      );
      const bucketLimit = totalEnemies <= ENEMY_ANGLE_BUCKETS ? 1 : 2;
      if (bucketCount >= bucketLimit) continue;

      return candidate;
    }

    // Fallback pass: keep safety distance + anti-cluster gap, but relax angle buckets
    // to avoid deterministic fallback positions that can create unfair hard clusters.
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const candidate = {
        x: randomBetween(rng, minX, maxX),
        y: randomBetween(rng, minY, maxY),
      };
      const playerDist = Math.hypot(candidate.x - playerSpawn.x, candidate.y - playerSpawn.y);
      if (playerDist < ENEMY_PLAYER_SAFE_DIST + enemyRadius + playerSpawn.r) continue;

      const adaptiveGap = Math.max(70, ENEMY_MIN_GAP - Math.max(0, existingEnemies.length - 2) * 6);
      const hasGap = existingEnemies.every((enemy) => Math.hypot(candidate.x - enemy.x, candidate.y - enemy.y) >= adaptiveGap);
      if (!hasGap) continue;
      return candidate;
    }

    return null;
  }

  function buildLevelEnemies() {
    const speedScale = getSpeedScale();
    const rng = makeLevelEnemyRng();
    const playerSpawn = makePlayer();
    const enemyCount = getEnemyCountForLevel();
    const spawned = [];

    for (let index = 0; index < enemyCount; index += 1) {
      const baseEnemy = ENEMY_ARCHETYPES[index % ENEMY_ARCHETYPES.length];
      const tier = Math.floor(index / ENEMY_ARCHETYPES.length);
      const fallbackAngle = (index / enemyCount) * Math.PI * 2;
      const fallbackRadius = 34 + tier * 20;
      const enemy = {
        id: `E${index + 1}`,
        fallbackX: Math.max(
          baseEnemy.r,
          Math.min(world.width - baseEnemy.r, baseEnemy.fallbackX + Math.cos(fallbackAngle) * fallbackRadius)
        ),
        fallbackY: Math.max(
          baseEnemy.r,
          Math.min(world.height - baseEnemy.r, baseEnemy.fallbackY + Math.sin(fallbackAngle) * fallbackRadius)
        ),
        r: baseEnemy.r,
        speed: baseEnemy.speed * Math.max(0.82, 1 - tier * 0.08),
        hp: Math.min(3, baseEnemy.hp + (tier > 0 ? 1 : 0)),
      };
      const point = pickEnemySpawn(rng, playerSpawn, spawned, enemy.r, enemyCount);
      spawned.push({
        id: enemy.id,
        x: point ? point.x : enemy.fallbackX,
        y: point ? point.y : enemy.fallbackY,
        vx: 0,
        vy: 0,
        r: enemy.r,
        speed: Math.min(PLAYER_SPEED, Math.round(enemy.speed * speedScale * 100) / 100),
        hp: enemy.hp,
      });
    }

    return spawned;
  }

  function nearestEnemyDistance(point, enemies) {
    if (!enemies.length) return Infinity;
    return enemies.reduce((min, enemy) => Math.min(min, Math.hypot(point.x - enemy.x, point.y - enemy.y)), Infinity);
  }

  function angleBucket(point, center, buckets = ENEMY_ANGLE_BUCKETS) {
    const angle = Math.atan2(point.y - center.y, point.x - center.x);
    const normalized = (angle + Math.PI) / (Math.PI * 2);
    return Math.floor(normalized * buckets) % buckets;
  }

  function buildSpawnDiagnostics(player, enemies, shards) {
    const playerEnemyMinDist = nearestEnemyDistance(player, enemies);
    const enemyAngleBuckets = Array.from({ length: ENEMY_ANGLE_BUCKETS }, () => 0);
    let enemyEnemyMinDist = Infinity;
    let enemyPairSum = 0;
    let enemyPairCount = 0;

    for (let i = 0; i < enemies.length; i += 1) {
      const enemy = enemies[i];
      enemyAngleBuckets[angleBucket(enemy, player)] += 1;
      for (let j = i + 1; j < enemies.length; j += 1) {
        const pairDist = Math.hypot(enemy.x - enemies[j].x, enemy.y - enemies[j].y);
        enemyEnemyMinDist = Math.min(enemyEnemyMinDist, pairDist);
        enemyPairSum += pairDist;
        enemyPairCount += 1;
      }
    }

    let nearestShardToPlayer = Infinity;
    let shardEnemyMinDist = Infinity;
    for (const shard of shards) {
      nearestShardToPlayer = Math.min(nearestShardToPlayer, Math.hypot(shard.x - player.x, shard.y - player.y));
      shardEnemyMinDist = Math.min(shardEnemyMinDist, nearestEnemyDistance(shard, enemies));
    }

    return {
      playerEnemyMinDist: Number((Number.isFinite(playerEnemyMinDist) ? playerEnemyMinDist : 0).toFixed(2)),
      enemyEnemyMinDist: Number((Number.isFinite(enemyEnemyMinDist) ? enemyEnemyMinDist : 0).toFixed(2)),
      enemySpread: Number((enemyPairCount > 0 ? enemyPairSum / enemyPairCount : 0).toFixed(2)),
      nearestShardToPlayer: Number((Number.isFinite(nearestShardToPlayer) ? nearestShardToPlayer : 0).toFixed(2)),
      shardEnemyMinDist: Number((Number.isFinite(shardEnemyMinDist) ? shardEnemyMinDist : 0).toFixed(2)),
      enemyAngleBuckets,
    };
  }

  function pickShardSpawn(rng, playerSpawn, enemies, existingShards, targetEnemyDist, distanceBounds) {
    const minX = Math.max(SHARD_SPAWN_MARGIN, playerSpawn.x + SHARD_MIN_X_FROM_PLAYER);
    const maxX = world.width - SHARD_SPAWN_MARGIN;
    const minY = SHARD_SPAWN_MARGIN;
    const maxY = world.height - SHARD_SPAWN_MARGIN;

    let best = null;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const candidate = {
        x: randomBetween(rng, minX, maxX),
        y: randomBetween(rng, minY, maxY),
      };
      const playerDist = Math.hypot(candidate.x - playerSpawn.x, candidate.y - playerSpawn.y);
      if (playerDist < distanceBounds.minPlayerDist || playerDist > distanceBounds.maxPlayerDist) continue;

      const shardGapOk = existingShards.every((shard) => Math.hypot(candidate.x - shard.x, candidate.y - shard.y) >= SHARD_MIN_GAP);
      if (!shardGapOk) continue;

      const enemyDist = nearestEnemyDistance(candidate, enemies);
      if (enemyDist < SHARD_ENEMY_MIN_DIST || enemyDist > SHARD_ENEMY_MAX_DIST) continue;

      const candidateAngle = Math.atan2(candidate.y - playerSpawn.y, candidate.x - playerSpawn.x);
      let anglePenalty = 0;
      for (const shard of existingShards) {
        const shardAngle = Math.atan2(shard.y - playerSpawn.y, shard.x - playerSpawn.x);
        const angleDiff = smallestAngleDiff(candidateAngle, shardAngle);
        if (angleDiff < SHARD_ANGLE_MIN_SEPARATION) {
          anglePenalty += (SHARD_ANGLE_MIN_SEPARATION - angleDiff) * 120;
        }
      }

      const score = Math.abs(enemyDist - targetEnemyDist) + Math.abs(playerDist - 250) * 0.22 + anglePenalty;
      if (!best || score < best.score) {
        best = { point: candidate, score };
      }
    }

    return best ? best.point : null;
  }

  function buildLevelShards(enemies) {
    const rng = makeLevelShardRng();
    const playerSpawn = makePlayer();
    const shards = [];
    const riskTargets = getShardRiskTargets(state.level);
    const distanceBounds = getShardDistanceBounds(state.level);

    for (let i = 0; i < GOAL_SHARDS; i += 1) {
      const targetEnemyDist = riskTargets[i % riskTargets.length];
      const candidate = pickShardSpawn(rng, playerSpawn, enemies, shards, targetEnemyDist, distanceBounds);
      if (!candidate) break;
      const value = targetEnemyDist <= 110 ? 3 : targetEnemyDist <= 150 ? 2 : 1;
      shards.push({ id: `S${i + 1}`, x: candidate.x, y: candidate.y, r: 8, value });
    }

    if (shards.length === GOAL_SHARDS) {
      return shards;
    }

    const pattern = FALLBACK_SHARD_PATTERNS[(state.level - 1) % FALLBACK_SHARD_PATTERNS.length];
    return pattern.map((shard, index) => ({ ...shard, value: Math.min(3, index + 1) }));
  }

  function spawnLevel(newRun) {
    state.score = 0;
    state.goal = GOAL_SHARDS;
    state.sectorDamageTaken = 0;
    state.enemies = buildLevelEnemies();
    state.shards = buildLevelShards(state.enemies);
    state.nearestEnemyDist = Infinity;

    if (newRun) {
      state.player = makePlayer();
      state.launchFlash = 0.95;
    } else {
      state.player = makePlayer(MAX_PLAYER_HP);
    }
    state.levelEntryShieldTotal = getEntryShieldDuration(state.level);
    state.levelEntryShield = state.levelEntryShieldTotal;
    state.spawnDiagnostics = buildSpawnDiagnostics(state.player, state.enemies, state.shards);

    state.levelBannerTimer = 1;
    const currentStage = getStageForLevel(state.level);
    const previousStage = getStageForLevel(Math.max(1, state.level - 1));
    if (!newRun && currentStage > previousStage) {
      state.milestoneFlash = 1.8;
      state.milestoneLevel = state.level;
      const drones = getEnemyCountForLevel(state.level);
      const speed = getSpeedScale(state.level).toFixed(2);
      const speedDelta = getStageSpeedDelta(state.level).toFixed(2);
      const band = getPressureBand(state.level);
      state.milestoneLabel = `Stage ${currentStage} ${band} · ${drones} Drones · x${speed} (Δ+${speedDelta})`;
    }
  }

  function showMenu(show) {
    menuPanel.classList.toggle("hidden", !show);
    syncTouchControls();
  }

  function hasTouchUi() {
    return window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 820;
  }

  function renderControlChips() {
    if (!controlsGrid) return;
    const chips = hasTouchUi() ? TOUCH_CONTROL_CHIPS : DESKTOP_CONTROL_CHIPS;
    controlsGrid.innerHTML = chips
      .map((chip) => `<div class="control-chip"><kbd>${chip.key}</kbd><span>${chip.label}</span></div>`)
      .join("");
  }

  function syncTouchControls() {
    if (!touchControls) return;
    const canPlay = state.mode === "playing" || state.mode === "paused";
    touchControls.classList.toggle("visible", hasTouchUi() && canPlay);
  }

  function setMenuVisualState(mode) {
    const bestSuffix = state.bestLevel > 1 ? ` Best sector: ${state.bestLevel}.` : "";
    const bonusSuffix = state.lastRun && state.lastRun.stageBonusScore > 0 ? ` (Stage bonus +${state.lastRun.stageBonusScore})` : "";
    const cleanSuffix = state.lastRun && state.lastRun.cleanSweepScore > 0 ? ` · Clean +${state.lastRun.cleanSweepScore}` : "";
    const summary = state.lastRun
      ? `Reached Sector ${state.lastRun.level} · ${state.lastRun.totalScore} pts${bonusSuffix}${cleanSuffix} · ${state.lastRun.elapsed.toFixed(1)}s`
      : "";
    if (mode === "win") {
      menuPanel.dataset.state = "win";
      menuKicker.textContent = "Run Complete";
      menuTitle.textContent = "Sector Chain Complete";
      menuSubtitle.textContent = summary ? `${summary}.${bestSuffix}` : `All sectors stabilized. Navigation lane secure.${bestSuffix}`;
      startBtn.textContent = "Run Again";
      return;
    }
    if (mode === "lose") {
      menuPanel.dataset.state = "lose";
      menuKicker.textContent = "Signal Lost";
      menuTitle.textContent = "Hull Breach";
      if (state.lastRun) {
        const nextTarget = Math.min(state.maxLevel, Math.max(2, state.lastRun.level + 1));
        const tip =
          state.lastRun.totalScore === 0
            ? "Tip: route to the safer shard first, then pulse when two drones stack."
            : "Tip: bank early shards, then pulse through pressure lanes.";
        const pressure = `Stage ${state.lastRun.stage} ${getPressureBand(state.lastRun.level)}, ${state.lastRun.enemyCount} drones, speed x${state.lastRun.speedScale.toFixed(2)}`;
        const causeLabel =
          state.lastRun.damageTaken >= MAX_PLAYER_HP
            ? "Sustained contact overload"
            : state.lastRun.speedScale >= 1.4
              ? "High-stage speed pressure"
              : "Close collision during route switch";
        const lastHit = state.lastRun.lastHitEnemyId ?? "Unknown";
        const cleanTag = state.lastRun.cleanSweepScore > 0 ? ` · Clean +${state.lastRun.cleanSweepScore}` : "";
        menuSubtitle.textContent =
          `Reached Sector ${state.lastRun.level} · ${state.lastRun.totalScore} pts${cleanTag} · ${state.lastRun.elapsed.toFixed(1)}s${bestSuffix}\n` +
          `Cause: ${causeLabel} (hits ${state.lastRun.damageTaken}, last ${lastHit})\n` +
          `Pressure: ${pressure}\n` +
          `Next target: Sector ${nextTarget}. ${tip}`;
        startBtn.textContent = `Retry S${nextTarget}`;
        return;
      } else {
        menuSubtitle.textContent = `Drone pressure broke the hull frame. Relaunch and retry.${bestSuffix}`;
      }
      startBtn.textContent = "Retry";
      return;
    }
    menuPanel.dataset.state = "menu";
    menuKicker.textContent = "Mission Brief";
    menuTitle.textContent = "Orb Drift";
    menuSubtitle.textContent = `Sweep 100 sectors. Every ${LEVELS_PER_STAGE} sectors: +enemy count and +drone speed.\nClean sector (no hits): +1 score.${bestSuffix}`;
    startBtn.textContent = "Launch";
  }

  function startGame() {
    state.mode = "playing";
    state.level = 1;
    state.totalScore = 0;
    state.elapsed = 0;
    state.damageTaken = 0;
    state.stageBonusScore = 0;
    state.cleanSweepScore = 0;
    state.lastHitEnemyId = null;
    state.runSeed = state.seedOverride ?? createRuntimeSeed();
    state.tutorialMoveHint = true;
    state.tutorialPulseHint = true;
    setMenuVisualState("menu");
    showMenu(false);
    spawnLevel(true);
    syncTouchControls();
  }

  function endRun(mode) {
    state.bestLevel = Math.max(state.bestLevel, state.level);
    state.lastRun = {
      mode,
      level: state.level,
      stage: getStageForLevel(state.level),
      enemyCount: state.enemies.length,
      speedScale: Number(getSpeedScale(state.level).toFixed(2)),
      totalScore: state.totalScore,
      stageBonusScore: state.stageBonusScore,
      cleanSweepScore: state.cleanSweepScore,
      elapsed: state.elapsed,
      damageTaken: state.damageTaken,
      lastHitEnemyId: state.lastHitEnemyId,
    };
    state.mode = mode;
    setMenuVisualState(mode);
    showMenu(true);
    syncTouchControls();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    document.documentElement.requestFullscreen().catch(() => {});
  }

  function keyToDirection() {
    let dx = 0;
    let dy = 0;
    if (keysDown.has("ArrowLeft") || keysDown.has("KeyA")) dx -= 1;
    if (keysDown.has("ArrowRight") || keysDown.has("KeyD")) dx += 1;
    if (keysDown.has("ArrowUp") || keysDown.has("KeyW")) dy -= 1;
    if (keysDown.has("ArrowDown") || keysDown.has("KeyS")) dy += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
    }

    return { dx, dy };
  }

  function clampEntity(entity) {
    entity.x = Math.max(entity.r, Math.min(world.width - entity.r, entity.x));
    entity.y = Math.max(entity.r, Math.min(world.height - entity.r, entity.y));
  }

  function applyPulseAttack() {
    const player = state.player;
    const radius = 120;

    for (const enemy of state.enemies) {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= radius) {
        enemy.hp -= 1;
        const push = 170;
        const nx = dist > 0 ? dx / dist : 1;
        const ny = dist > 0 ? dy / dist : 0;
        enemy.x += nx * push * 0.04;
        enemy.y += ny * push * 0.04;
      }
    }

    state.enemies = state.enemies.filter((enemy) => enemy.hp > 0);
  }

  function handleSectorClear() {
    if (state.sectorDamageTaken === 0) {
      state.totalScore += 1;
      state.cleanSweepScore += 1;
      state.pickupBursts.push({ x: state.player.x, y: Math.max(42, state.player.y - 28), value: 1, label: "Clean +1", timer: 0.72 });
    }
    state.clearFlash = 0.52;
    state.clearLevel = state.level;
    if (state.level % LEVELS_PER_STAGE === 0) {
      const clearedStage = getStageForLevel(state.level);
      const bonusPoints = 2 + clearedStage;
      state.totalScore += bonusPoints;
      state.stageBonusScore += bonusPoints;
      state.stageBonusFlash = 1.3;
      state.stageBonusDelay = 0.55;
      state.stageBonusPoints = bonusPoints;
      state.stageBonusStage = clearedStage;
    }
    if (state.level >= state.maxLevel) {
      endRun("win");
    } else {
      state.level += 1;
      spawnLevel(false);
    }
  }

  function updatePlaying(dt) {
    const player = state.player;
    state.elapsed += dt;
    state.levelBannerTimer = Math.max(0, state.levelBannerTimer - dt);
    state.levelEntryShield = Math.max(0, state.levelEntryShield - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.pulseTimer = Math.max(0, player.pulseTimer - dt);
    player.pulseCooldown = Math.max(0, player.pulseCooldown - dt);

    const dir = keyToDirection();
    player.vx = dir.dx * player.speed;
    player.vy = dir.dy * player.speed;
    if (state.tutorialMoveHint && (Math.abs(player.vx) > 0 || Math.abs(player.vy) > 0)) {
      state.tutorialMoveHint = false;
    }
    player.x += player.vx * dt;
    player.y += player.vy * dt;
    clampEntity(player);

    if (pressedThisFrame.has("Space") && player.pulseCooldown <= 0) {
      player.pulseCooldown = 0.7;
      player.pulseTimer = 0.2;
      applyPulseAttack();
    }
    if (state.tutorialPulseHint && (pressedThisFrame.has("Space") || player.pulseCooldown > 0)) {
      state.tutorialPulseHint = false;
    }

    let nearestEnemyDist = Infinity;
    for (const enemy of state.enemies) {
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const dist = Math.hypot(dx, dy) || 1;
      nearestEnemyDist = Math.min(nearestEnemyDist, dist);
      const nx = dx / dist;
      const ny = dy / dist;

      enemy.vx = nx * enemy.speed;
      enemy.vy = ny * enemy.speed;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      clampEntity(enemy);

      const collisionDist = Math.hypot(player.x - enemy.x, player.y - enemy.y);
      if (collisionDist <= enemy.r + player.r && player.invuln <= 0 && state.levelEntryShield <= 0) {
        player.hp -= 1;
        state.damageTaken += 1;
        state.sectorDamageTaken += 1;
        state.lastHitEnemyId = enemy.id;
        player.invuln = 0.95;
        state.damageFlash = 0.22;
      }
    }
    state.nearestEnemyDist = nearestEnemyDist;

    state.shards = state.shards.filter((shard) => {
      const dist = Math.hypot(shard.x - player.x, shard.y - player.y);
      if (dist <= shard.r + player.r) {
        const value = shard.value ?? 1;
        state.score += 1;
        state.totalScore += value;
        state.pickupBursts.push({ x: shard.x, y: shard.y, value, timer: 0.46 });
        return false;
      }
      return true;
    });

    if (state.score >= state.goal) {
      handleSectorClear();
      return;
    }

    if (player.hp <= 0) {
      endRun("lose");
    }
  }

  function update(dt) {
    state.damageFlash = Math.max(0, state.damageFlash - dt);
    state.clearFlash = Math.max(0, state.clearFlash - dt);
    state.stageBonusDelay = Math.max(0, state.stageBonusDelay - dt);
    if (state.stageBonusDelay <= 0 && state.milestoneFlash <= 0) {
      state.stageBonusFlash = Math.max(0, state.stageBonusFlash - dt);
    }
    state.milestoneFlash = Math.max(0, state.milestoneFlash - dt);
    state.launchFlash = Math.max(0, state.launchFlash - dt);
    state.pickupBursts = state.pickupBursts
      .map((burst) => ({ ...burst, timer: burst.timer - dt }))
      .filter((burst) => burst.timer > 0);
    if (state.mode === "playing") {
      updatePlaying(dt);
    }
    pressedThisFrame.clear();
  }

  function drawBackground() {
    const t = performance.now() * 0.001;
    const baseGradient = ctx.createLinearGradient(0, 0, world.width, world.height);
    baseGradient.addColorStop(0, "#eefcff");
    baseGradient.addColorStop(0.55, "#ddf5ff");
    baseGradient.addColorStop(1, "#fff1d6");
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, world.width, world.height);

    const hazeLeft = ctx.createRadialGradient(150, 120, 10, 150, 120, 320);
    hazeLeft.addColorStop(0, "rgba(255, 194, 126, 0.36)");
    hazeLeft.addColorStop(1, "rgba(255, 194, 126, 0)");
    ctx.fillStyle = hazeLeft;
    ctx.fillRect(0, 0, world.width, world.height);

    const hazeRight = ctx.createRadialGradient(780, 420, 20, 780, 420, 330);
    hazeRight.addColorStop(0, "rgba(81, 218, 255, 0.34)");
    hazeRight.addColorStop(1, "rgba(81, 218, 255, 0)");
    ctx.fillStyle = hazeRight;
    ctx.fillRect(0, 0, world.width, world.height);

    ctx.save();
    ctx.translate(world.width * 0.67, world.height * 0.54);
    for (let i = 0; i < 4; i += 1) {
      ctx.strokeStyle = `rgba(112, 178, 218, ${0.2 - i * 0.03})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 170 + i * 54, 62 + i * 22, 0.34, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#6cb3da";
    ctx.lineWidth = 1;
    const gridStep = 48;
    const xOffset = (t * 18) % gridStep;
    const yOffset = (t * 11) % gridStep;
    for (let x = -gridStep + xOffset; x <= world.width + gridStep; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, world.height);
      ctx.stroke();
    }
    for (let y = -gridStep + yOffset; y <= world.height + gridStep; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(world.width, y);
      ctx.stroke();
    }
    ctx.restore();

    const sweepX = ((t * 130) % (world.width + 360)) - 180;
    const sweep = ctx.createLinearGradient(sweepX - 170, 0, sweepX + 170, 0);
    sweep.addColorStop(0, "rgba(120, 223, 255, 0)");
    sweep.addColorStop(0.5, "rgba(120, 223, 255, 0.18)");
    sweep.addColorStop(1, "rgba(120, 223, 255, 0)");
    ctx.fillStyle = sweep;
    ctx.fillRect(0, 0, world.width, world.height);

    ctx.save();
    for (const point of BACKGROUND_POINTS) {
      const glow = 0.25 + Math.sin(t * point.speed + point.phase) * 0.14;
      ctx.globalAlpha = glow;
      ctx.fillStyle = "#f6fdff";
      ctx.beginPath();
      ctx.arc(point.x, point.y, point.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawShards() {
    const t = performance.now() * 0.001;
    for (const shard of state.shards) {
      const value = shard.value ?? 1;
      const styleByValue =
        value >= 3
          ? { fill: "#ff9e67", glow: "rgba(255, 167, 118, 0.82)", core: "rgba(255, 247, 222, 0.9)" }
          : value === 2
            ? { fill: "#ffd16b", glow: "rgba(255, 218, 135, 0.78)", core: "rgba(255, 250, 231, 0.9)" }
            : { fill: "#34d8ff", glow: "rgba(74, 213, 255, 0.7)", core: "rgba(244, 255, 255, 0.82)" };
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(t * 0.9);
      ctx.shadowColor = styleByValue.glow;
      ctx.shadowBlur = 18;
      ctx.fillStyle = styleByValue.fill;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(11, 0);
      ctx.lineTo(0, 12);
      ctx.lineTo(-11, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = styleByValue.core;
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(8, 31, 58, 0.92)";
      ctx.font = value >= 3 ? "800 13px 'Avenir Next', 'Trebuchet MS', sans-serif" : "800 12px 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.strokeStyle = "rgba(8, 28, 52, 0.88)";
      ctx.lineWidth = 3.2;
      ctx.strokeText(String(value), shard.x, shard.y + 4);
      ctx.fillStyle = value >= 3 ? "rgba(255, 244, 225, 0.98)" : value === 2 ? "rgba(255, 247, 228, 0.96)" : "rgba(231, 252, 255, 0.96)";
      ctx.fillText(String(value), shard.x, shard.y + 4);

      if (value >= 3) {
        const pulse = (Math.sin(t * 7 + shard.x * 0.02 + shard.y * 0.02) + 1) * 0.5;
        ctx.save();
        ctx.strokeStyle = `rgba(255, 184, 125, ${0.32 + pulse * 0.32})`;
        ctx.lineWidth = 1.9;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(shard.x, shard.y, 17.5 + pulse * 2.8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  function drawEnemies() {
    for (const enemy of state.enemies) {
      const enemyGradient = ctx.createLinearGradient(enemy.x - enemy.r, enemy.y - enemy.r, enemy.x + enemy.r, enemy.y + enemy.r);
      enemyGradient.addColorStop(0, "#ffbf9a");
      enemyGradient.addColorStop(0.55, "#ff6d9a");
      enemyGradient.addColorStop(1, "#dd467e");
      ctx.save();
      ctx.shadowColor = "rgba(255, 92, 150, 0.46)";
      ctx.shadowBlur = 15;
      ctx.fillStyle = enemyGradient;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(114, 31, 70, 0.45)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(enemy.x, enemy.y, enemy.r - 0.6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#fff4fa";
      ctx.font = "700 12px 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(enemy.hp), enemy.x, enemy.y + 4);
    }
  }

  function drawPlayer() {
    const player = state.player;
    const t = performance.now() * 0.001;
    const visible = player.invuln <= 0 || Math.floor(player.invuln * 15) % 2 === 0;
    if (visible) {
      const playerGradient = ctx.createLinearGradient(player.x - player.r, player.y - player.r, player.x + player.r, player.y + player.r);
      playerGradient.addColorStop(0, "#7af8ea");
      playerGradient.addColorStop(0.5, "#50d7ff");
      playerGradient.addColorStop(1, "#2b95ff");
      ctx.save();
      ctx.shadowColor = "rgba(79, 223, 255, 0.52)";
      ctx.shadowBlur = 16;
      ctx.fillStyle = playerGradient;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(16, 68, 113, 0.46)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r - 0.8, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(221, 248, 255, 0.75)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r - 5, -0.5, 0.8);
      ctx.stroke();
    }

    if (state.levelEntryShield > 0) {
      const shieldBase = Math.max(0.01, state.levelEntryShieldTotal || LEVEL_ENTRY_GRACE);
      const shieldRatio = Math.min(1, state.levelEntryShield / shieldBase);
      ctx.strokeStyle = `rgba(140, 255, 230, ${0.28 + shieldRatio * 0.36})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 11 + shieldRatio * 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (player.pulseTimer > 0) {
      const ratio = player.pulseTimer / 0.2;
      ctx.strokeStyle = `rgba(73, 189, 255, ${0.24 + ratio * 0.56})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 120 * (1 - ratio * 0.18), 0, Math.PI * 2);
      ctx.stroke();
    } else if (player.pulseCooldown <= 0) {
      const alpha = 0.15 + ((Math.sin(t * 6) + 1) * 0.5) * 0.18;
      ctx.strokeStyle = `rgba(126, 238, 255, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x, player.y, player.r + 7, 0, Math.PI * 2);
      ctx.stroke();

      const rangeAlpha = state.nearestEnemyDist < 170 ? 0.28 : 0.16;
      ctx.save();
      ctx.setLineDash([8, 7]);
      ctx.strokeStyle = `rgba(116, 211, 255, ${rangeAlpha})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 120, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawRoundedPanel(x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawHudModule(x, y, width, label, value, accentColor) {
    ctx.fillStyle = "rgba(9, 25, 48, 0.58)";
    drawRoundedPanel(x, y, width, 56, 11);
    ctx.fill();

    ctx.strokeStyle = accentColor;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.5;
    drawRoundedPanel(x, y, width, 56, 11);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(210, 236, 255, 0.88)";
    ctx.font = "700 11px 'Avenir Next', 'Trebuchet MS', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(label, x + 11, y + 19);

    ctx.fillStyle = "#f5fcff";
    ctx.font = "700 23px 'Avenir Next Condensed', 'Avenir Next', 'Trebuchet MS', sans-serif";
    ctx.fillText(value, x + 11, y + 45);

    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.7;
    ctx.fillRect(x + width - 7, y + 11, 2, 34);
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    if (state.mode !== "playing" && state.mode !== "paused") {
      return;
    }

    const player = state.player;
    const baseX = 16;
    const baseY = 14;
    const hpAccent = player.hp <= 2 ? "rgba(255, 138, 162, 0.95)" : "rgba(104, 236, 255, 0.92)";
    const modules = [
      { label: "HP", value: `${player.hp}/${MAX_PLAYER_HP}`, width: 122, accent: hpAccent },
      { label: "LEVEL", value: `${state.level}/${state.maxLevel}`, width: 166, accent: "rgba(99, 175, 255, 0.92)" },
      { label: "SHARDS", value: `${state.score}/${state.goal}`, width: 152, accent: "rgba(95, 241, 227, 0.9)" },
      {
        label: "THREAT / DRONES",
        value: `x${getSpeedScale().toFixed(2)} · ${state.enemies.length}`,
        width: 178,
        accent: "rgba(255, 188, 112, 0.92)",
      },
    ];

    let x = baseX;
    for (const module of modules) {
      drawHudModule(x, baseY, module.width, module.label, module.value, module.accent);
      x += module.width + 10;
    }

    const pulsePanelX = world.width - 252;
    ctx.fillStyle = "rgba(9, 25, 48, 0.58)";
    drawRoundedPanel(pulsePanelX, baseY, 236, 56, 11);
    ctx.fill();

    ctx.strokeStyle = "rgba(106, 190, 243, 0.48)";
    ctx.lineWidth = 1.4;
    drawRoundedPanel(pulsePanelX, baseY, 236, 56, 11);
    ctx.stroke();

    const pulseText = player.pulseCooldown <= 0 ? "READY" : `${player.pulseCooldown.toFixed(1)}s`;
    ctx.fillStyle = "rgba(210, 236, 255, 0.86)";
    ctx.font = "700 11px 'Avenir Next', 'Trebuchet MS', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("PULSE", pulsePanelX + 13, baseY + 19);
    ctx.fillText("TIME", pulsePanelX + 126, baseY + 19);

    ctx.font = "700 20px 'Avenir Next Condensed', 'Avenir Next', 'Trebuchet MS', sans-serif";
    ctx.fillStyle = player.pulseCooldown <= 0 ? "#94f0ff" : "#f8f4ff";
    ctx.fillText(pulseText, pulsePanelX + 13, baseY + 44);

    ctx.fillStyle = "#f8fcff";
    ctx.fillText(`${state.elapsed.toFixed(1)}s`, pulsePanelX + 126, baseY + 44);

    const cooldownProgress = Math.max(0, Math.min(1, 1 - player.pulseCooldown / 0.7));
    const barX = pulsePanelX + 13;
    const barY = baseY + 48;
    const barW = 208;
    ctx.fillStyle = "rgba(41, 76, 106, 0.55)";
    ctx.fillRect(barX, barY, barW, 4);
    ctx.fillStyle = player.pulseCooldown <= 0 ? "#8ff4ff" : "#7db9ff";
    ctx.fillRect(barX, barY, barW * cooldownProgress, 4);

    ctx.font = "700 11px 'Avenir Next', 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "rgba(236, 248, 255, 0.98)";
    ctx.fillText(`TOTAL SCORE ${state.totalScore}`, baseX + 4, baseY + 72);
    ctx.fillStyle = "rgba(191, 231, 249, 0.95)";
    ctx.fillText(`CLEAN SWEEP +${state.cleanSweepScore}`, baseX + 4, baseY + 88);
    ctx.fillStyle = "rgba(196, 232, 250, 0.93)";
    ctx.fillText("VALUE LEGEND 1 COOL · 2 WARM · 3 HOT", baseX + 176, baseY + 88);

    const stage = getStageForLevel(state.level);
    const nextMilestone = getNextMilestoneLevel(state.level);
    const levelsToNextStage = getLevelsToNextStage(state.level);
    drawRoundedPanel(baseX + 176, baseY + 59, 248, 16, 6);
    ctx.fillStyle = "rgba(8, 28, 50, 0.46)";
    ctx.fill();
    ctx.strokeStyle = "rgba(88, 176, 224, 0.54)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(149, 240, 255, 0.98)";
    const stageText =
      state.level >= state.maxLevel
        ? `STAGE ${stage} ${getPressureBand(state.level)} · FINAL SECTOR`
        : `STAGE ${stage} ${getPressureBand(state.level)} · NEXT @ S${nextMilestone} (${levelsToNextStage} TO GO)`;
    ctx.fillText(stageText, baseX + 184, baseY + 72);

    const remainingShards = Math.max(0, state.goal - state.score);
    const cleanActive = state.sectorDamageTaken === 0;
    const objectiveX = 16;
    const objectiveY = world.height - 62;
    const objectiveW = 420;
    const objectiveH = 40;
    ctx.fillStyle = "rgba(9, 25, 48, 0.55)";
    drawRoundedPanel(objectiveX, objectiveY, objectiveW, objectiveH, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(103, 195, 239, 0.52)";
    ctx.lineWidth = 1.2;
    drawRoundedPanel(objectiveX, objectiveY, objectiveW, objectiveH, 10);
    ctx.stroke();

    const progressX = objectiveX + 9;
    const progressY = objectiveY + objectiveH - 8;
    const progressW = objectiveW - 18;
    ctx.fillStyle = "rgba(40, 71, 99, 0.58)";
    ctx.fillRect(progressX, progressY, progressW, 3);
    ctx.fillStyle = "#67e6f6";
    ctx.fillRect(progressX, progressY, progressW * (state.score / state.goal), 3);

    ctx.fillStyle = "#edf8ff";
    ctx.font = "700 12px 'Avenir Next', 'Trebuchet MS', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Objective: ${remainingShards} shard${remainingShards === 1 ? "" : "s"} to clear sector`, objectiveX + 10, objectiveY + 16);
    ctx.fillStyle = cleanActive ? "rgba(180, 248, 228, 0.98)" : "rgba(255, 195, 156, 0.94)";
    ctx.font = "700 11px 'Avenir Next', 'Trebuchet MS', sans-serif";
    ctx.fillText(cleanActive ? "Clean bonus armed (+1)" : "Clean bonus lost this sector", objectiveX + 10, objectiveY + 31);

    if (state.levelEntryShield > 0) {
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(164, 248, 232, 0.98)";
      ctx.fillText(`Entry Shield ${state.levelEntryShield.toFixed(1)}s`, objectiveX + objectiveW - 10, objectiveY + 16);
    }
    ctx.textAlign = "left";

    if (state.nearestEnemyDist < 165) {
      const warningX = world.width - 282;
      const warningY = world.height - 48;
      drawRoundedPanel(warningX, warningY, 266, 26, 9);
      ctx.fillStyle = state.nearestEnemyDist < 110 ? "rgba(107, 20, 39, 0.64)" : "rgba(114, 70, 16, 0.56)";
      ctx.fill();
      ctx.strokeStyle = state.nearestEnemyDist < 110 ? "rgba(255, 132, 157, 0.82)" : "rgba(255, 197, 125, 0.78)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.fillStyle = "#f7fbff";
      ctx.font = "700 11px 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.fillText(`PROXIMITY ALERT · ${Math.round(state.nearestEnemyDist)}px`, warningX + 10, warningY + 17);
    }

    if (state.mode === "paused") {
      ctx.fillStyle = "rgba(8, 23, 43, 0.45)";
      ctx.fillRect(0, 0, world.width, world.height);

      ctx.fillStyle = "rgba(13, 34, 61, 0.76)";
      drawRoundedPanel(world.width / 2 - 184, world.height / 2 - 60, 368, 120, 16);
      ctx.fill();

      ctx.strokeStyle = "rgba(108, 193, 236, 0.7)";
      ctx.lineWidth = 1.8;
      drawRoundedPanel(world.width / 2 - 184, world.height / 2 - 60, 368, 120, 16);
      ctx.stroke();

      ctx.fillStyle = "#eaf8ff";
      ctx.textAlign = "center";
      ctx.font = "700 41px 'Avenir Next Condensed', 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.fillText("PAUSED", world.width / 2, world.height / 2 - 6);

      ctx.font = "700 15px 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.fillStyle = "rgba(206, 233, 255, 0.92)";
      ctx.fillText("Press P to resume", world.width / 2, world.height / 2 + 28);
    }

    if (state.mode === "playing" && state.levelBannerTimer > 0) {
      const alpha = Math.min(1, state.levelBannerTimer * 1.4);
      ctx.fillStyle = `rgba(12, 30, 56, ${0.5 * alpha})`;
      drawRoundedPanel(world.width / 2 - 132, 86, 264, 46, 12);
      ctx.fill();

      ctx.strokeStyle = `rgba(111, 209, 244, ${0.75 * alpha})`;
      ctx.lineWidth = 1.4;
      drawRoundedPanel(world.width / 2 - 132, 86, 264, 46, 12);
      ctx.stroke();

      ctx.fillStyle = `rgba(237, 248, 255, ${alpha})`;
      ctx.font = "700 24px 'Avenir Next Condensed', 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Sector ${state.level}`, world.width / 2, 117);
    }
  }

  function drawOverlayText() {
    if (state.mode === "menu") {
      ctx.fillStyle = "rgba(9, 28, 50, 0.2)";
      ctx.fillRect(0, 0, world.width, world.height);

      ctx.save();
      ctx.strokeStyle = "rgba(110, 204, 242, 0.4)";
      ctx.lineWidth = 1.4;
      const centerX = world.width * 0.73;
      const centerY = world.height * 0.58;
      for (let i = 0; i < 4; i += 1) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, 42 + i * 26, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(centerX - 132, centerY);
      ctx.lineTo(centerX + 132, centerY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(centerX, centerY - 132);
      ctx.lineTo(centerX, centerY + 132);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (state.mode === "win") {
      const wash = ctx.createRadialGradient(world.width * 0.62, world.height * 0.5, 40, world.width * 0.62, world.height * 0.5, 420);
      wash.addColorStop(0, "rgba(129, 238, 166, 0.26)");
      wash.addColorStop(0.66, "rgba(120, 212, 255, 0.18)");
      wash.addColorStop(1, "rgba(9, 25, 44, 0.2)");
      ctx.fillStyle = wash;
      ctx.fillRect(0, 0, world.width, world.height);

      ctx.save();
      ctx.strokeStyle = "rgba(255, 219, 138, 0.32)";
      ctx.lineWidth = 2;
      const cx = world.width * 0.62;
      const cy = world.height * 0.5;
      for (let i = 0; i < 12; i += 1) {
        const angle = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * 60, cy + Math.sin(angle) * 60);
        ctx.lineTo(cx + Math.cos(angle) * 132, cy + Math.sin(angle) * 132);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (state.mode === "lose") {
      ctx.fillStyle = "rgba(58, 10, 32, 0.44)";
      ctx.fillRect(0, 0, world.width, world.height);

      const vignette = ctx.createRadialGradient(world.width * 0.5, world.height * 0.52, 120, world.width * 0.5, world.height * 0.52, world.width * 0.78);
      vignette.addColorStop(0, "rgba(255, 106, 143, 0.08)");
      vignette.addColorStop(1, "rgba(49, 8, 22, 0.5)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, world.width, world.height);

      ctx.save();
      ctx.strokeStyle = "rgba(255, 131, 146, 0.3)";
      ctx.lineWidth = 2;
      for (let x = -world.height; x <= world.width; x += 44) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + world.height * 0.9, world.height);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawFeedbackLayers() {
    const showMilestone = state.milestoneFlash > 0;
    const showStageBonus = !showMilestone && state.stageBonusFlash > 0 && state.stageBonusDelay <= 0;
    const showClearText = state.clearFlash > 0 && !showMilestone && !showStageBonus;
    const hasStagePriorityOverlay = showMilestone || showStageBonus || showClearText;

    if (state.damageFlash <= 0) {
      // continue for pickup bursts
    } else {
      const alpha = Math.min(0.28, state.damageFlash * 0.9);
      const hurtGradient = ctx.createRadialGradient(world.width / 2, world.height / 2, 40, world.width / 2, world.height / 2, world.width * 0.8);
      hurtGradient.addColorStop(0, `rgba(255, 96, 125, ${alpha * 0.15})`);
      hurtGradient.addColorStop(1, `rgba(255, 64, 106, ${alpha})`);
      ctx.fillStyle = hurtGradient;
      ctx.fillRect(0, 0, world.width, world.height);

      ctx.strokeStyle = `rgba(255, 173, 193, ${alpha + 0.16})`;
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, world.width - 8, world.height - 8);
    }

    for (const burst of state.pickupBursts) {
      const ratio = burst.timer / 0.46;
      const radius = 22 + (1 - ratio) * 34;
      const alpha = Math.max(0, ratio * 0.8);
      ctx.strokeStyle = `rgba(117, 240, 255, ${alpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(burst.x, burst.y, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = `rgba(221, 251, 255, ${alpha})`;
      ctx.font = "700 14px 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      const bonus = burst.value ?? 1;
      const label = burst.label ?? `+${bonus}`;
      ctx.fillText(label, burst.x, burst.y - 24 - (1 - ratio) * 16);
    }

    if (showClearText) {
      const ratio = state.clearFlash / 0.52;
      const alpha = Math.min(0.24, ratio * 0.24);
      const sweep = ctx.createLinearGradient(0, 0, world.width, world.height);
      sweep.addColorStop(0, `rgba(96, 247, 220, ${alpha})`);
      sweep.addColorStop(1, `rgba(113, 200, 255, ${alpha * 0.86})`);
      ctx.fillStyle = sweep;
      ctx.fillRect(0, 0, world.width, world.height);

      ctx.fillStyle = `rgba(229, 255, 251, ${Math.min(1, ratio * 1.4)})`;
      ctx.font = "700 28px 'Avenir Next Condensed', 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Sector ${state.clearLevel} Cleared`, world.width / 2, world.height * 0.42);
    } else if (state.clearFlash > 0) {
      const ratio = state.clearFlash / 0.52;
      const alpha = Math.min(0.08, ratio * 0.08);
      const sweep = ctx.createLinearGradient(0, 0, world.width, world.height);
      sweep.addColorStop(0, `rgba(96, 247, 220, ${alpha})`);
      sweep.addColorStop(1, `rgba(113, 200, 255, ${alpha * 0.8})`);
      ctx.fillStyle = sweep;
      ctx.fillRect(0, 0, world.width, world.height);
    }

    if (showStageBonus) {
      const ratio = state.stageBonusFlash / 1.3;
      drawRoundedPanel(world.width / 2 - 176, world.height * 0.47, 352, 48, 12);
      ctx.fillStyle = `rgba(29, 47, 27, ${0.42 * ratio})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(148, 246, 146, ${0.64 * ratio})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = `rgba(227, 255, 213, ${Math.min(1, ratio * 1.1)})`;
      ctx.font = "700 22px 'Avenir Next Condensed', 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`Stage ${state.stageBonusStage} Bonus +${state.stageBonusPoints}`, world.width / 2, world.height * 0.47 + 31);
    }

    if (showMilestone) {
      const ratio = state.milestoneFlash / 1.8;
      ctx.fillStyle = `rgba(255, 215, 128, ${0.1 * ratio})`;
      ctx.fillRect(0, 0, world.width, world.height);
      ctx.fillStyle = `rgba(255, 244, 206, ${Math.min(1, ratio * 1.3)})`;
      ctx.font = "700 34px 'Avenir Next Condensed', 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.milestoneLabel || `Milestone Sector ${state.milestoneLevel}`, world.width / 2, world.height * 0.33);
    }

    if (state.mode === "playing" && state.launchFlash > 0 && !hasStagePriorityOverlay) {
      const ratio = state.launchFlash / 0.95;
      const alpha = Math.min(1, ratio * 1.2);
      const sweep = ctx.createLinearGradient(0, 0, world.width, 0);
      sweep.addColorStop(0, `rgba(87, 218, 255, ${0.16 * alpha})`);
      sweep.addColorStop(0.5, `rgba(122, 172, 255, ${0.11 * alpha})`);
      sweep.addColorStop(1, "rgba(122, 172, 255, 0)");
      ctx.fillStyle = sweep;
      ctx.fillRect(0, 0, world.width, world.height);

      drawRoundedPanel(world.width / 2 - 194, world.height * 0.37 - 34, 388, 76, 14);
      ctx.fillStyle = `rgba(8, 27, 50, ${0.24 * alpha})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(122, 217, 247, ${0.46 * alpha})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = `rgba(233, 247, 255, ${alpha})`;
      ctx.font = "700 28px 'Avenir Next Condensed', 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Launch Vector Locked", world.width / 2, world.height * 0.37);

      ctx.font = "700 14px 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.fillStyle = `rgba(222, 243, 255, ${0.9 * alpha})`;
      ctx.fillText(`Collect ${state.goal} shards to clear Sector ${state.level}`, world.width / 2, world.height * 0.37 + 26);
    }

    if (state.mode === "playing" && state.level === 1 && state.elapsed < 14 && state.nearestEnemyDist >= 165 && !hasStagePriorityOverlay) {
      const tips = [];
      if (state.tutorialMoveHint) {
        tips.push(hasTouchUi() ? "Use D-pad to drift through shards" : "Use Arrow keys or WASD to drift through shards");
      }
      if (state.tutorialPulseHint) {
        tips.push(hasTouchUi() ? "Tap PULSE when drones close in" : "Press Space when drones close in");
      }
      if (state.totalScore === 0) {
        tips.push("Warmer shards are worth more score");
      }
      if (tips.length > 0) {
        const boxW = 342;
        const boxH = 26 + tips.length * 18;
        const boxX = world.width - boxW - 16;
        const boxY = world.height - boxH - 18;
        drawRoundedPanel(boxX, boxY, boxW, boxH, 11);
        ctx.fillStyle = "rgba(8, 27, 49, 0.58)";
        ctx.fill();
        ctx.strokeStyle = "rgba(106, 201, 244, 0.6)";
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = "rgba(229, 246, 255, 0.95)";
        ctx.font = "700 12px 'Avenir Next', 'Trebuchet MS', sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("COMBAT TIPS", boxX + 12, boxY + 16);
        ctx.font = "700 11px 'Avenir Next', 'Trebuchet MS', sans-serif";
        for (let i = 0; i < tips.length; i += 1) {
          ctx.fillText(`• ${tips[i]}`, boxX + 12, boxY + 34 + i * 16);
        }
      }
    }

    if (state.mode === "playing" && state.nearestEnemyDist < 115) {
      const pressure = Math.max(0, (115 - state.nearestEnemyDist) / 115);
      const ringAlpha = 0.12 + pressure * 0.28;
      const radius = state.player.r + 20 + pressure * 18;
      ctx.strokeStyle = `rgba(255, 135, 154, ${ringAlpha})`;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.arc(state.player.x, state.player.y, radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (state.mode === "playing" && state.player.hp <= 2) {
      const urgency = (3 - state.player.hp) / 2;
      const pulse = (Math.sin(performance.now() * 0.01) + 1) * 0.5;
      const alpha = Math.min(0.26, 0.1 + urgency * 0.12 + pulse * 0.06);
      const edge = ctx.createRadialGradient(world.width / 2, world.height / 2, world.height * 0.18, world.width / 2, world.height / 2, world.width * 0.72);
      edge.addColorStop(0, "rgba(255, 98, 132, 0)");
      edge.addColorStop(1, `rgba(255, 79, 120, ${alpha})`);
      ctx.fillStyle = edge;
      ctx.fillRect(0, 0, world.width, world.height);
    }
  }

  function render() {
    drawBackground();
    drawShards();
    drawEnemies();
    drawPlayer();
    drawHud();
    drawOverlayText();
    drawFeedbackLayers();
  }

  function resizeCanvasCss() {
    const isMobile = window.matchMedia("(max-width: 820px)").matches;
    const horizontalPadding = isMobile ? 20 : 44;
    const verticalPadding = isMobile ? 20 : 44;
    const touchReserve = isMobile && hasTouchUi() && (state.mode === "playing" || state.mode === "paused") ? 184 : 0;
    const availW = Math.max(280, window.innerWidth - horizontalPadding);
    const availH = Math.max(200, window.innerHeight - verticalPadding - touchReserve);

    // Keep the canvas centered and fully visible: scale down for small viewports,
    // but do not upscale past the native 960x540 art size.
    const scale = Math.min(availW / world.width, availH / world.height, 1);
    const targetW = Math.floor(world.width * scale);
    const targetH = Math.floor(world.height * scale);

    canvas.style.width = `${targetW}px`;
    canvas.style.height = `${targetH}px`;
  }

  function handleGameplayHotkeys(code) {
    if (code === "KeyP") {
      if (state.mode === "playing") {
        state.mode = "paused";
      } else if (state.mode === "paused") {
        state.mode = "playing";
      }
      syncTouchControls();
    }

    if (code === "KeyR" && (state.mode === "playing" || state.mode === "paused" || state.mode === "win" || state.mode === "lose")) {
      startGame();
    }

    if (code === "Enter" && (state.mode === "menu" || state.mode === "win" || state.mode === "lose")) {
      startGame();
    }
  }

  function clearInputState() {
    keysDown.clear();
    pressedThisFrame.clear();
    for (const button of touchButtons) {
      button.classList.remove("active");
    }
  }

  window.addEventListener("keydown", (event) => {
    if (!keysDown.has(event.code)) {
      pressedThisFrame.add(event.code);
    }
    keysDown.add(event.code);

    if (event.code === "Escape" && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }

    if (event.code === "KeyF") {
      toggleFullscreen();
    }

    handleGameplayHotkeys(event.code);

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD", "Space"].includes(event.code)) {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    keysDown.delete(event.code);
  });

  window.addEventListener("blur", clearInputState);
  window.addEventListener("pointerup", () => {
    for (const button of touchButtons) {
      button.classList.remove("active");
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") {
      clearInputState();
    }
  });

  window.addEventListener("resize", () => {
    resizeCanvasCss();
    renderControlChips();
    syncTouchControls();
  });
  window.addEventListener("orientationchange", () => {
    resizeCanvasCss();
    renderControlChips();
    syncTouchControls();
  });
  document.addEventListener("fullscreenchange", resizeCanvasCss);
  startBtn.addEventListener("click", startGame);

  for (const button of touchButtons) {
    const code = button.dataset.code;
    const tapOnly = button.dataset.tap === "1";
    if (!code) continue;

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      button.classList.add("active");
      if (!keysDown.has(code)) {
        pressedThisFrame.add(code);
      }
      keysDown.add(code);
      if (tapOnly) {
        keysDown.delete(code);
      }
      handleGameplayHotkeys(code);
    });

    const release = () => {
      button.classList.remove("active");
      keysDown.delete(code);
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("pointerleave", release);
  }

  function gameLoop(now) {
    if (!gameLoop.lastNow) gameLoop.lastNow = now;
    const dt = Math.min(0.05, (now - gameLoop.lastNow) / 1000);
    gameLoop.lastNow = now;

    if (state.mode === "playing") {
      update(dt);
    } else {
      pressedThisFrame.clear();
    }

    render();
    window.requestAnimationFrame(gameLoop);
  }

  function advanceTime(ms) {
    const total = Math.max(FRAME_MS, Number(ms) || FRAME_MS);
    const steps = Math.max(1, Math.round(total / FRAME_MS));
    const dt = total / steps / 1000;

    for (let i = 0; i < steps; i += 1) {
      if (state.mode === "playing") {
        update(dt);
      } else {
        pressedThisFrame.clear();
      }
    }

    render();
    return Promise.resolve();
  }

  function renderGameToText() {
    const payload = {
      coordinateSystem: "origin top-left; +x right; +y down; units pixels",
      mode: state.mode,
      world: { width: world.width, height: world.height },
      level: state.level,
      maxLevel: state.maxLevel,
      stage: getStageForLevel(state.level),
      pressureBand: getPressureBand(state.level),
      levelsPerStage: LEVELS_PER_STAGE,
      levelsToNextStage: getLevelsToNextStage(state.level),
      enemyCountTarget: getEnemyCountForLevel(state.level),
      runSeed: state.runSeed,
      seedLocked: state.seedOverride !== null,
      enemySpeedScale: Number(getSpeedScale().toFixed(2)),
      player: {
        x: Number(state.player.x.toFixed(2)),
        y: Number(state.player.y.toFixed(2)),
        vx: Number(state.player.vx.toFixed(2)),
        vy: Number(state.player.vy.toFixed(2)),
        r: state.player.r,
        hp: state.player.hp,
        invuln: Number(state.player.invuln.toFixed(2)),
        pulseCooldown: Number(state.player.pulseCooldown.toFixed(2)),
        pulseActive: state.player.pulseTimer > 0,
      },
      enemies: state.enemies.map((enemy) => ({
        id: enemy.id,
        x: Number(enemy.x.toFixed(2)),
        y: Number(enemy.y.toFixed(2)),
        vx: Number(enemy.vx.toFixed(2)),
        vy: Number(enemy.vy.toFixed(2)),
        r: enemy.r,
        hp: enemy.hp,
        speed: Number(enemy.speed.toFixed(2)),
      })),
      shards: state.shards.map((shard) => ({
        id: shard.id,
        x: Number(shard.x.toFixed(2)),
        y: Number(shard.y.toFixed(2)),
        r: shard.r,
        value: shard.value ?? 1,
      })),
      score: state.score,
      totalScore: state.totalScore,
      stageBonusScore: state.stageBonusScore,
      cleanSweepScore: state.cleanSweepScore,
      sectorDamageTaken: state.sectorDamageTaken,
      goal: state.goal,
      elapsed: Number(state.elapsed.toFixed(2)),
      levelEntryShield: Number(state.levelEntryShield.toFixed(2)),
      levelEntryShieldTotal: Number(state.levelEntryShieldTotal.toFixed(2)),
      spawnDiagnostics: state.spawnDiagnostics,
      fullscreen: Boolean(document.fullscreenElement),
      paused: state.mode === "paused",
      lastHitEnemyId: state.lastHitEnemyId,
      lastRun: state.lastRun
        ? {
            mode: state.lastRun.mode,
            level: state.lastRun.level,
            stage: state.lastRun.stage,
            enemyCount: state.lastRun.enemyCount,
            speedScale: state.lastRun.speedScale,
            totalScore: state.lastRun.totalScore,
            stageBonusScore: state.lastRun.stageBonusScore,
            cleanSweepScore: state.lastRun.cleanSweepScore ?? 0,
            elapsed: Number(state.lastRun.elapsed.toFixed(2)),
            damageTaken: state.lastRun.damageTaken,
            lastHitEnemyId: state.lastRun.lastHitEnemyId,
          }
        : null,
    };

    return JSON.stringify(payload);
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = advanceTime;
  window.orbDriftDebug = {
    setSeed: (seed) => {
      state.seedOverride = normalizeSeed(Number(seed));
      return state.seedOverride;
    },
    clearSeed: () => {
      state.seedOverride = null;
      return true;
    },
    getSeed: () => state.runSeed,
    forceWin: () => endRun("win"),
    forceLose: () => endRun("lose"),
    setPlayerHp: (hp) => {
      const value = Math.max(0, Math.min(MAX_PLAYER_HP, Math.round(Number(hp) || 0)));
      state.player.hp = value;
    },
    setLevel: (level) => {
      if (state.mode !== "playing" && state.mode !== "paused") return;
      state.level = Math.max(1, Math.min(state.maxLevel, Math.round(Number(level) || 1)));
      spawnLevel(false);
    },
    forceClearSector: () => {
      if (state.mode !== "playing" && state.mode !== "paused") return null;
      state.score = state.goal;
      handleSectorClear();
      return {
        level: state.level,
        totalScore: state.totalScore,
        stageBonusScore: state.stageBonusScore,
        cleanSweepScore: state.cleanSweepScore,
      };
    },
  };

  resizeCanvasCss();
  renderControlChips();
  syncTouchControls();
  render();
  window.requestAnimationFrame(gameLoop);
})();
