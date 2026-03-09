#!/bin/zsh
set -euo pipefail
round="${1:?round id required}"
out="output/web-game/${round}"

scripts/run_round_checks.sh "${round}"
node scripts/capture_round_viewports.mjs "${round}"
node scripts/mobile_touch_probe.mjs "${round}"
node scripts/input_regression_probe.mjs "${round}"
node scripts/randomness_fairness_probe.mjs "${round}"
node scripts/progression_probe.mjs "${round}"
node scripts/stage_bonus_probe.mjs "${round}"

if [[ "${2:-}" == "with-win" ]]; then
  node "/Users/lilithgames/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js" \
    --url http://127.0.0.1:5173 \
    --actions-file "test-actions/win_state.json" \
    --iterations 1 \
    --pause-ms 220 \
    --screenshot-dir "${out}/win_state"
fi
