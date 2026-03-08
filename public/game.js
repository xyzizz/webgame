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
  const ENEMY_SPEED_STEP = 0.09;

  const BASE_ENEMIES = [
    { id: "E1", x: 300, y: 244, r: 15, speed: 95, hp: 1 },
    { id: "E2", x: 632, y: 314, r: 15, speed: 110, hp: 2 },
    { id: "E3", x: 838, y: 132, r: 15, speed: 124, hp: 2 },
    { id: "E4", x: 834, y: 418, r: 15, speed: 118, hp: 2 },
  ];

  const SHARD_PATTERNS = [
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

  const MAX_BASE_ENEMY_SPEED = Math.max(...BASE_ENEMIES.map((enemy) => enemy.speed));
  const MAX_ENEMY_SPEED_SCALE = PLAYER_SPEED / MAX_BASE_ENEMY_SPEED;
  const DESKTOP_CONTROL_CHIPS = [
    { key: "Arrows", label: "Drift" },
    { key: "Space", label: "Pulse" },
    { key: "P / A", label: "Pause" },
    { key: "R / B", label: "Restart" },
    { key: "F", label: "Fullscreen" },
  ];
  const TOUCH_CONTROL_CHIPS = [
    { key: "D-pad", label: "Drift" },
    { key: "PULSE", label: "Burst" },
    { key: "PAUSE", label: "Pause" },
    { key: "RESTART", label: "Retry" },
    { key: "Tap Btns", label: "Touch" },
  ];

  const state = {
    mode: "menu",
    level: 1,
    maxLevel: MAX_LEVEL,
    score: 0,
    totalScore: 0,
    goal: GOAL_SHARDS,
    elapsed: 0,
    levelBannerTimer: 0,
    damageFlash: 0,
    pickupBursts: [],
    clearFlash: 0,
    clearLevel: 0,
    milestoneFlash: 0,
    milestoneLevel: 0,
    milestoneLabel: "",
    launchFlash: 0,
    damageTaken: 0,
    tutorialMoveHint: true,
    tutorialPulseHint: true,
    nearestEnemyDist: Infinity,
    bestLevel: 1,
    lastRun: null,
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

  function getSpeedScale() {
    const scaled = 1 + (state.level - 1) * ENEMY_SPEED_STEP;
    return Math.min(scaled, MAX_ENEMY_SPEED_SCALE);
  }

  function getNextMilestoneLevel(level) {
    if (level >= state.maxLevel) return state.maxLevel;
    if (level < 2) return Math.min(state.maxLevel, 2);
    if (level % 10 === 0) return Math.min(state.maxLevel, level + 10);
    return Math.min(state.maxLevel, Math.ceil(level / 10) * 10);
  }

  function buildLevelEnemies() {
    const speedScale = getSpeedScale();
    return BASE_ENEMIES.map((enemy) => ({
      id: enemy.id,
      x: enemy.x,
      y: enemy.y,
      vx: 0,
      vy: 0,
      r: enemy.r,
      speed: Math.min(PLAYER_SPEED, Math.round(enemy.speed * speedScale * 100) / 100),
      hp: enemy.hp,
    }));
  }

  function buildLevelShards() {
    const pattern = SHARD_PATTERNS[(state.level - 1) % SHARD_PATTERNS.length];
    return pattern.map((shard) => ({ ...shard }));
  }

  function spawnLevel(newRun) {
    state.score = 0;
    state.goal = GOAL_SHARDS;
    state.enemies = buildLevelEnemies();
    state.shards = buildLevelShards();
    state.nearestEnemyDist = Infinity;

    if (newRun) {
      state.player = makePlayer();
      state.launchFlash = 0.95;
    } else {
      state.player = makePlayer(MAX_PLAYER_HP);
    }

    state.levelBannerTimer = 1;
    if (!newRun && (state.level === 2 || state.level % 10 === 0)) {
      state.milestoneFlash = 1.8;
      state.milestoneLevel = state.level;
      state.milestoneLabel = state.level === 2 ? "Checkpoint Sector 2" : `Milestone Sector ${state.level}`;
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
    const summary = state.lastRun ? `Reached Sector ${state.lastRun.level} · ${state.lastRun.totalScore} shards · ${state.lastRun.elapsed.toFixed(1)}s` : "";
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
        const tip = state.lastRun.totalScore === 0 ? "Tip: pulse when drones stack on your lane." : "Tip: chain shards early, then pulse through pressure.";
        menuSubtitle.textContent = `${summary}. Impacts taken: ${state.lastRun.damageTaken}. Next target: Sector ${nextTarget}. ${tip}${bestSuffix}`;
      } else {
        menuSubtitle.textContent = `Drone pressure broke the hull frame. Relaunch and retry.${bestSuffix}`;
      }
      startBtn.textContent = "Retry";
      return;
    }
    menuPanel.dataset.state = "menu";
    menuKicker.textContent = "Mission Brief";
    menuTitle.textContent = "Orb Drift";
    menuSubtitle.textContent = `Sweep 100 sectors. Threat rises every clear.${bestSuffix}`;
    startBtn.textContent = "Launch";
  }

  function startGame() {
    state.mode = "playing";
    state.level = 1;
    state.totalScore = 0;
    state.elapsed = 0;
    state.damageTaken = 0;
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
      totalScore: state.totalScore,
      elapsed: state.elapsed,
      damageTaken: state.damageTaken,
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
    if (keysDown.has("ArrowLeft")) dx -= 1;
    if (keysDown.has("ArrowRight")) dx += 1;
    if (keysDown.has("ArrowUp")) dy -= 1;
    if (keysDown.has("ArrowDown")) dy += 1;

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

  function updatePlaying(dt) {
    const player = state.player;
    state.elapsed += dt;
    state.levelBannerTimer = Math.max(0, state.levelBannerTimer - dt);
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
      if (collisionDist <= enemy.r + player.r && player.invuln <= 0) {
        player.hp -= 1;
        state.damageTaken += 1;
        player.invuln = 0.95;
        state.damageFlash = 0.22;
      }
    }
    state.nearestEnemyDist = nearestEnemyDist;

    state.shards = state.shards.filter((shard) => {
      const dist = Math.hypot(shard.x - player.x, shard.y - player.y);
      if (dist <= shard.r + player.r) {
        state.score += 1;
        state.totalScore += 1;
        state.pickupBursts.push({ x: shard.x, y: shard.y, timer: 0.46 });
        return false;
      }
      return true;
    });

    if (state.score >= state.goal) {
      state.clearFlash = 0.52;
      state.clearLevel = state.level;
      if (state.level >= state.maxLevel) {
        endRun("win");
      } else {
        state.level += 1;
        spawnLevel(false);
      }
      return;
    }

    if (player.hp <= 0) {
      endRun("lose");
    }
  }

  function update(dt) {
    state.damageFlash = Math.max(0, state.damageFlash - dt);
    state.clearFlash = Math.max(0, state.clearFlash - dt);
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
      ctx.save();
      ctx.translate(shard.x, shard.y);
      ctx.rotate(t * 0.9);
      ctx.shadowColor = "rgba(74, 213, 255, 0.7)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "#34d8ff";
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(11, 0);
      ctx.lineTo(0, 12);
      ctx.lineTo(-11, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(244, 255, 255, 0.82)";
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
      { label: "THREAT", value: `x${getSpeedScale().toFixed(2)}`, width: 152, accent: "rgba(255, 188, 112, 0.92)" },
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
    ctx.fillText(`TOTAL SHARDS ${state.totalScore}`, baseX + 4, baseY + 72);

    const nextMilestone = getNextMilestoneLevel(state.level);
    const sectorsToMilestone = Math.max(0, nextMilestone - state.level);
    drawRoundedPanel(baseX + 176, baseY + 59, 248, 16, 6);
    ctx.fillStyle = "rgba(8, 28, 50, 0.46)";
    ctx.fill();
    ctx.strokeStyle = "rgba(88, 176, 224, 0.54)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(149, 240, 255, 0.98)";
    ctx.fillText(`MILESTONE S${nextMilestone} · ${sectorsToMilestone} TO GO`, baseX + 184, baseY + 72);

    const remainingShards = Math.max(0, state.goal - state.score);
    const objectiveX = 16;
    const objectiveY = world.height - 52;
    const objectiveW = 420;
    const objectiveH = 30;
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
    ctx.fillText(`Objective: collect ${remainingShards} more shard${remainingShards === 1 ? "" : "s"} to clear this sector`, objectiveX + 10, objectiveY + 19);

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
      ctx.fillText("Press P / A to resume", world.width / 2, world.height / 2 + 28);
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
      ctx.fillText("+1", burst.x, burst.y - 24 - (1 - ratio) * 16);
    }

    if (state.clearFlash > 0) {
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
    }

    if (state.milestoneFlash > 0) {
      const ratio = state.milestoneFlash / 1.8;
      ctx.fillStyle = `rgba(255, 215, 128, ${0.1 * ratio})`;
      ctx.fillRect(0, 0, world.width, world.height);
      ctx.fillStyle = `rgba(255, 244, 206, ${Math.min(1, ratio * 1.3)})`;
      ctx.font = "700 34px 'Avenir Next Condensed', 'Avenir Next', 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.milestoneLabel || `Milestone Sector ${state.milestoneLevel}`, world.width / 2, world.height * 0.33);
    }

    if (state.mode === "playing" && state.launchFlash > 0) {
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

    if (state.mode === "playing" && state.level === 1 && state.elapsed < 14 && state.nearestEnemyDist >= 165) {
      const tips = [];
      if (state.tutorialMoveHint) {
        tips.push(hasTouchUi() ? "Use D-pad to drift through shards" : "Use Arrow keys to drift through shards");
      }
      if (state.tutorialPulseHint) {
        tips.push(hasTouchUi() ? "Tap PULSE when drones close in" : "Press Space when drones close in");
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
    if (code === "KeyP" || code === "KeyA") {
      if (state.mode === "playing") {
        state.mode = "paused";
      } else if (state.mode === "paused") {
        state.mode = "playing";
      }
      syncTouchControls();
    }

    if (
      (code === "KeyR" || code === "KeyB") &&
      (state.mode === "playing" || state.mode === "paused" || state.mode === "win" || state.mode === "lose")
    ) {
      startGame();
    }

    if (code === "Enter" && (state.mode === "menu" || state.mode === "win" || state.mode === "lose")) {
      startGame();
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

    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) {
      event.preventDefault();
    }
  });

  window.addEventListener("keyup", (event) => {
    keysDown.delete(event.code);
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
      })),
      score: state.score,
      totalScore: state.totalScore,
      goal: state.goal,
      elapsed: Number(state.elapsed.toFixed(2)),
      fullscreen: Boolean(document.fullscreenElement),
      paused: state.mode === "paused",
    };

    return JSON.stringify(payload);
  }

  window.render_game_to_text = renderGameToText;
  window.advanceTime = advanceTime;
  window.orbDriftDebug = {
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
  };

  resizeCanvasCss();
  renderControlChips();
  syncTouchControls();
  render();
  window.requestAnimationFrame(gameLoop);
})();
