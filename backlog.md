# Orb Drift Gameplay Productization Backlog (2026-03-09)

Status: `open` | `in_progress` | `fixed` | `deferred`

| ID | Type | Priority | Status | Notes |
| --- | --- | --- | --- | --- |
| PG-001 | Product | P0 | in_progress | Round 2 introduced seed-driven random enemy spawn; Round 12 added angular spread constraints + relaxed second-pass sampling to reduce unfair clustering while preserving variation. |
| PG-002 | Product | P0 | fixed | Round 3 switched shards to seed-based risk-aware placement; Round 13 added stage-adaptive risk targets + angle-separation bias to keep rewards contestable but reachable. |
| PG-003 | Product | P0 | in_progress | Round 4 switched to stage pacing (every 4 sectors +speed/+enemy); Round 14 changed speed growth to segmented ramp (early faster, late softer) and added stage delta feedback, still needs long-run tuning. |
| PG-004 | Product | P1 | in_progress | Round 5 added entry shield; Round 15 made shield duration stage-adaptive (`0.85` early, decays with stage with high-pressure compensation). Continue tuning late-stage fairness feel. |
| PG-005 | Product | P1 | fixed | Round 6 added explicit pressure explanation (stage, drones, speed, last-hit enemy) in lose summary and improved in-run threat readout. |
| PG-006 | Product | P2 | in_progress | Rounds 6-7 improved fail/reward readability; Rounds 19-20 added clean-sweep scoring loop and objective teaching. Remaining work is long-run retention tuning (streak/meta layer). |
| IN-001 | Input | P0 | fixed | `W/A/S/D` movement added and validated in Round 1 input regression probe. |
| IN-002 | Input | P0 | fixed | `A` pause conflict removed in Round 1; `A` is now left movement only. |
| IN-003 | Input | P1 | fixed | Round 11 added `clearInputState` on `blur/visibilitychange` and probe check `blurClearsHeldMovement`; no stuck-key movement observed. |
| IN-004 | Input | P1 | fixed | Menu/tutorial help text updated in Round 1 to Arrow/WASD + `P/R/F`. |
| FN-001 | Functional | P0 | fixed | Round 2 added reproducible seed support (`orbDriftDebug.setSeed/clearSeed/getSeed`) and state exposure (`runSeed`). |
| FN-002 | Functional | P1 | fixed | Validation workflow updated in Round 1 to include dedicated input regression probe and remove `A`-pause dependency. |
| FN-003 | Functional | P1 | fixed | Added dedicated randomness/fairness probe in Round 1 and validated against explicit multi-seed runs after Round 2 seed support landed. |
| FN-004 | Functional | P2 | fixed | Round 12 added `spawnDiagnostics` (`player/enemy/shard` distance metrics + enemy angle buckets) to `render_game_to_text`. |
| FN-005 | Functional | P1 | fixed | Added `scripts/progression_probe.mjs` in Round 4 and integrated it into `validate_round.sh`. |
| UX-001 | Visual | P1 | fixed | Round 4 HUD/menu now communicates stage rule and next stage countdown (`every 4 sectors`, `NEXT @ Sx`). |
| UX-002 | Visual | P2 | open | Controls teaching can be clearer: player should instantly know Arrow + WASD + `P/R/F`. |
| UX-003 | Visual | P3 | fixed | Round 16 rewrote lose summary into multiline cause/pressure/next-target blocks and reduced lose-state subtitle typography for compact readability. |
| UX-004 | Visual | P3 | fixed | Round 17 increased value-marker contrast/size, added stroke and high-value pulse ring, plus HUD legend for quick risk reading. |
| UX-005 | Visual | P2 | fixed | Rounds 18-19 introduced overlay priority sequencing and delayed stage-bonus reveal; transition messages no longer compete in same frame window. |
