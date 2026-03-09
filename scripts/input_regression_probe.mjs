import fs from "fs";
import { chromium } from "playwright";

const round = process.argv[2] || "round";
const outDir = `output/web-game/${round}/input-regression`;
await fs.promises.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
await page.goto("http://127.0.0.1:5173", { waitUntil: "networkidle" });
await page.waitForTimeout(250);

const readState = async () => JSON.parse(await page.evaluate(() => window.render_game_to_text()));

const holdKeys = async (codes, holdMs = 220, settleMs = 80) => {
  for (const code of codes) {
    await page.keyboard.down(code);
  }
  await page.waitForTimeout(holdMs);
  for (const code of [...codes].reverse()) {
    await page.keyboard.up(code);
  }
  await page.waitForTimeout(settleMs);
};

const moved = (from, to, axis, threshold = 8) => {
  const delta = to.player[axis] - from.player[axis];
  return axis === "x" ? delta > threshold : delta < -threshold;
};

await page.keyboard.press("Enter");
await page.waitForTimeout(140);

const s0 = await readState();
await holdKeys(["ArrowRight"]);
const sArrow = await readState();

await holdKeys(["KeyA"]);
const sA = await readState();

await holdKeys(["KeyW"]);
const sW = await readState();

await holdKeys(["ArrowDown"]);
const sDown = await readState();

await page.keyboard.press("KeyA");
await page.waitForTimeout(90);
const sATap = await readState();

await page.keyboard.press("KeyP");
await page.waitForTimeout(120);
const sPause = await readState();

await holdKeys(["KeyD"]);
const sPauseMove = await readState();

await page.keyboard.press("KeyP");
await page.waitForTimeout(120);
const sResume = await readState();

await holdKeys(["KeyD"]);
const sResumeMove = await readState();

await page.keyboard.press("KeyR");
await page.waitForTimeout(150);
const sRestart = await readState();

await page.keyboard.press("KeyF");
await page.waitForTimeout(100);
const sAfterF = await readState();

await holdKeys(["ArrowUp", "KeyD"]);
const sMixed = await readState();

await page.keyboard.down("ArrowRight");
await page.waitForTimeout(130);
const sBlurBefore = await readState();
await page.evaluate(() => window.dispatchEvent(new Event("blur")));
await page.waitForTimeout(130);
const sBlurAfter = await readState();
await page.keyboard.up("ArrowRight");

const checks = {
  arrowMovement: sArrow.player.x > s0.player.x + 10,
  wasdLeftMovement: sA.player.x < sArrow.player.x - 10,
  wasdUpMovement: sW.player.y < sA.player.y - 8,
  arrowDownMovement: sDown.player.y > sW.player.y + 8,
  aDoesNotPause: sATap.mode === "playing",
  pPauseWorks: sPause.mode === "paused",
  pausedBlocksMovement:
    Math.abs(sPauseMove.player.x - sPause.player.x) < 2 && Math.abs(sPauseMove.player.y - sPause.player.y) < 2,
  pResumeWorks: sResume.mode === "playing",
  restartWorks:
    Math.abs(sRestart.player.x - 120) < 1.5 && Math.abs(sRestart.player.y - 270) < 1.5 && sRestart.mode === "playing",
  wasdAfterResumeWorks: sResumeMove.player.x > sResume.player.x + 8,
  inputStillWorksAfterFullscreenKey: sMixed.player.x > sAfterF.player.x + 5 && sMixed.player.y < sAfterF.player.y - 5,
  blurClearsHeldMovement:
    Math.abs(sBlurAfter.player.x - sBlurBefore.player.x) < 3 && Math.abs(sBlurAfter.player.y - sBlurBefore.player.y) < 3,
};

const probe = {
  round,
  mode: sMixed.mode,
  fullscreenAfterF: sAfterF.fullscreen,
  checks,
  passed: Object.values(checks).every(Boolean),
  samples: {
    start: s0.player,
    afterArrow: sArrow.player,
    afterA: sA.player,
    afterW: sW.player,
    paused: { mode: sPause.mode, player: sPause.player },
    pausedMoveAttempt: { mode: sPauseMove.mode, player: sPauseMove.player },
    resumed: { mode: sResume.mode, player: sResume.player },
    resumedMove: sResumeMove.player,
    restarted: { mode: sRestart.mode, player: sRestart.player },
    afterF: { fullscreen: sAfterF.fullscreen, player: sAfterF.player },
    mixed: sMixed.player,
    blurBefore: sBlurBefore.player,
    blurAfter: sBlurAfter.player,
  },
};

await fs.promises.writeFile(`${outDir}/probe.json`, JSON.stringify(probe, null, 2));
await page.screenshot({ path: `${outDir}/shot.png` });

await browser.close();
console.log(`input regression probe captured for ${round}`);
