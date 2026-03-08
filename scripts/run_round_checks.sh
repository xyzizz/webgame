#!/bin/zsh
set -euo pipefail
round="${1:?round id required}"
out="output/web-game/${round}"
scenarios=(movement_collect pause_resume level_speedup lose_state)
for scenario in "${scenarios[@]}"; do
  node "/Users/lilithgames/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js" \
    --url http://127.0.0.1:5173 \
    --actions-file "test-actions/${scenario}.json" \
    --iterations 1 \
    --pause-ms 220 \
    --screenshot-dir "${out}/${scenario}"
done
